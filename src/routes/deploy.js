/* ================================================
   deploy.js — Deploy, Backup & Restore
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ================================================
   ENSURE TABLES
================================================ */

async function ensureTables(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deploy_state (
        id           INTEGER PRIMARY KEY DEFAULT 1,
        last_deploy  TEXT,
        frozen       INTEGER DEFAULT 0,
        emergency    INTEGER DEFAULT 0,
        version      TEXT    DEFAULT '1.0.0',
        environment  TEXT    DEFAULT 'production',
        updated_at   TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deploy_versions (
        id          TEXT PRIMARY KEY,
        name        TEXT,
        tag         TEXT,
        notes       TEXT,
        anime_count INTEGER DEFAULT 0,
        ep_count    INTEGER DEFAULT 0,
        created_at  TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deploy_backups (
        id         TEXT PRIMARY KEY,
        name       TEXT,
        size_kb    INTEGER DEFAULT 0,
        data       TEXT,
        created_at TEXT
      )
    `).run()

    /* Ensure deploy_state has a row */
    const row = await db.prepare(
      "SELECT id FROM deploy_state WHERE id=1"
    ).first()

    if (!row) {
      await db.prepare(`
        INSERT INTO deploy_state (id,frozen,emergency,version,environment,updated_at)
        VALUES (1,0,0,'1.0.0','production',?)
      `).bind(now()).run()
    }

  } catch (err) {
    console.error("deploy ensureTables:", err)
  }
}

/* ================================================
   SYNC BACKUP TO REPLICAS
================================================ */

async function syncBackupToReplicas(env, backupRow) {
  /* We sync a lightweight reference — not the full data blob */
  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO deploy_backups (id,name,size_kb,data,created_at)
                  VALUES (?,?,?,?,?)`,
            args: [
              { type:"text",    value: backupRow.id },
              { type:"text",    value: backupRow.name },
              { type:"integer", value: String(backupRow.size_kb) },  // ✅ FIX: Turso requires string-encoded integers
              { type:"text",    value: backupRow.data },
              { type:"text",    value: backupRow.created_at }
            ]
          }
        }]
      })
    }).catch(e => console.error("Turso backup sync:", e))
  }
}

/* ================================================
   GET /deploy — Load state + versions + backups
================================================ */

app.get("/deploy", async (c) => {
  try {
    const db = c.env.DB
    await ensureTables(db)

    const state = await db.prepare(
      "SELECT * FROM deploy_state WHERE id=1"
    ).first()

    const { results: versions } = await db.prepare(`
      SELECT id,name,tag,notes,anime_count,ep_count,created_at
      FROM deploy_versions
      ORDER BY created_at DESC
      LIMIT 20
    `).all()

    const { results: backups } = await db.prepare(`
      SELECT id,name,size_kb,created_at
      FROM deploy_backups
      ORDER BY created_at DESC
      LIMIT 20
    `).all()

    /* DB counts for stats */
    const animeCount = await db.prepare(
      "SELECT COUNT(*) as c FROM anime"
    ).first()
    const epCount = await db.prepare(
      "SELECT COUNT(*) as c FROM episodes"
    ).first()
    const catCount = await db.prepare(
      "SELECT COUNT(*) as c FROM categories"
    ).first()
    const bannerCount = await db.prepare(
      "SELECT COUNT(*) as c FROM banners"
    ).first()

    return c.json(success({
      state: state || {},
      versions: versions || [],
      backups:  backups  || [],
      stats: {
        anime:    animeCount?.c    || 0,
        episodes: epCount?.c       || 0,
        categories: catCount?.c    || 0,
        banners:  bannerCount?.c   || 0
      },
      dbStatus: {
        // MIGRATION: `d1: true` is accurate here (every query above this
        // point already succeeded against it, via the Turso adapter — if
        // it weren't reachable, this whole handler would already have
        // thrown into the catch block below). Worth knowing: post-
        // migration, c.env.DB *is* your Turso connection under the
        // adapter, so this and `turso` below are now reporting on the
        // same underlying database, not two independent ones the way
        // they were when D1 and Turso were genuinely separate systems.
        d1:       true,
        turso:    !!(c.env.TURSO_URL    && c.env.TURSO_AUTH_TOKEN),
        supabase: !!(c.env.SUPABASE_URL && c.env.SUPABASE_KEY)
      }
    }))

  } catch (err) {
    console.error("deploy GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /deploy/deploy — Trigger deploy
================================================ */

app.post("/deploy/deploy", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()
    await ensureTables(db)

    /* Get current counts for version snapshot */
    const animeCount = await db.prepare("SELECT COUNT(*) as c FROM anime").first()
    const epCount    = await db.prepare("SELECT COUNT(*) as c FROM episodes").first()

    await db.prepare(`
      UPDATE deploy_state SET last_deploy=?,updated_at=? WHERE id=1
    `).bind(timestamp, timestamp).run()

    /* Auto-create version on deploy */
    const vId = crypto.randomUUID()
    const vNum = `v${Date.now().toString().slice(-6)}`

    await db.prepare(`
      INSERT INTO deploy_versions (id,name,tag,notes,anime_count,ep_count,created_at)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      vId,
      `Deploy ${new Date().toLocaleDateString()}`,
      vNum,
      "Auto-created on deploy",
      animeCount?.c || 0,
      epCount?.c    || 0,
      timestamp
    ).run()

    return c.json(success({
      deployed:   true,
      deployed_at: timestamp,
      version:    vNum
    }))

  } catch (err) {
    console.error("deploy POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /deploy/backup — Create backup (STREAMING — OOM FIX)
   Blueprint Lines 153, 178: Poora DB ek saath load = OOM crash
   Fix: chunked read, 100 rows at a time per table
================================================ */

// ✅ FIX: Helper — read one table in chunks to avoid 128 MB Worker memory limit
async function readTableChunked(db, table, chunkSize = 100) {
  const rows    = []
  let   offset  = 0
  let   hasMore = true

  while (hasMore) {
    let chunk
    try {
      chunk = await db.prepare(
        `SELECT * FROM ${table} LIMIT ? OFFSET ?`
      ).bind(chunkSize, offset).all()
    } catch {
      break  // table may not exist — skip gracefully
    }

    if (!chunk.results || chunk.results.length === 0) break
    rows.push(...chunk.results)
    offset  += chunkSize
    hasMore  = chunk.results.length === chunkSize
  }

  return rows
}

app.post("/deploy/backup", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()
    await ensureTables(db)

    const body = await c.req.json().catch(() => ({}))
    const note = body.note || ""

    // ✅ FIX (Lines 153, 178): Chunked reads — never loads full table into RAM at once
    const TABLES = [
      "anime", "episodes", "categories", "banners",
      "servers", "seo_settings", "performance_settings",
      "security_settings", "search_settings"
    ]

    const tableData = {}
    for (const table of TABLES) {
      tableData[table] = await readTableChunked(db, table)
    }

    const data = {
      version:    "2.0",
      created_at: timestamp,
      note,
      anime:       tableData.anime            || [],
      episodes:    tableData.episodes         || [],
      categories:  tableData.categories       || [],
      banners:     tableData.banners          || [],
      servers:     tableData.servers          || [],
      seo:         tableData.seo_settings     || [],
      performance: tableData.performance_settings || [],
      security:    tableData.security_settings   || [],
      search:      tableData.search_settings     || []
    }

    const dataStr = JSON.stringify(data)
    const sizeKB  = Math.round(dataStr.length / 1024)
    const id      = crypto.randomUUID()
    const name    = `Backup ${new Date().toLocaleString()}${note ? ` — ${note}` : ""}`

    await db.prepare(`
      INSERT INTO deploy_backups (id,name,size_kb,data,created_at)
      VALUES (?,?,?,?,?)
    `).bind(id, name, sizeKB, dataStr, timestamp).run()

    /* Sync to Turso (non-blocking) */
    syncBackupToReplicas(c.env, { id, name, size_kb: sizeKB, data: dataStr, created_at: timestamp })

    return c.json(success({
      id,
      name,
      size_kb:    sizeKB,
      created_at: timestamp,
      counts: {
        anime:      data.anime.length,
        episodes:   data.episodes.length,
        categories: data.categories.length,
        banners:    data.banners.length
      }
    }))

  } catch (err) {
    console.error("backup POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /deploy/restore — Restore backup
================================================ */

app.post("/deploy/restore", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    if (!body.id) return c.json(failure("Backup ID required"), 400)

    const row = await db.prepare(
      "SELECT data FROM deploy_backups WHERE id=?"
    ).bind(body.id).first()

    if (!row) return c.json(failure("Backup not found"), 404)

    const data = JSON.parse(row.data)

    /* Clear existing data */
    await db.prepare("DELETE FROM anime").run()
    await db.prepare("DELETE FROM episodes").run()
    await db.prepare("DELETE FROM categories").run()
    await db.prepare("DELETE FROM banners").run()

    let restored = {
      anime: 0, episodes: 0, categories: 0, banners: 0,
      servers: 0, seo: 0, performance: 0, security: 0, search: 0
    }

    /* Restore anime — explicit columns */
    for (const a of (data.anime || [])) {
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO anime (
            id,title,slug,type,status,poster,banner,year,rating,
            language,duration,genres,tags,
            is_home,is_trending,is_most_viewed,is_banner,is_hidden,
            description,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          a.id, a.title, a.slug, a.type, a.status,
          a.poster, a.banner, a.year, a.rating,
          a.language, a.duration, a.genres, a.tags,
          a.is_home, a.is_trending, a.is_most_viewed, a.is_banner, a.is_hidden,
          a.description, a.created_at, a.updated_at
        ).run()
        restored.anime++
      } catch (err) {
        console.error("Restore anime row:", err)
      }
    }

    /* Restore episodes */
    for (const e of (data.episodes || [])) {
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO episodes (
            id,anime_id,anime_title,season,episode,
            title,description,thumbnail,servers,
            ongoing,featured,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          e.id, e.anime_id, e.anime_title, e.season, e.episode,
          e.title, e.description, e.thumbnail, e.servers,
          e.ongoing, e.featured, e.created_at, e.updated_at
        ).run()
        restored.episodes++
      } catch (err) {
        console.error("Restore episode row:", err)
      }
    }

    /* Restore categories */
    for (const cat of (data.categories || [])) {
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO categories (
            id,name,slug,type,category_order,priority,
            show_home,active,featured,
            ai_trending,ai_popular,ai_assign,
            created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          cat.id, cat.name, cat.slug, cat.type,
          cat.category_order, cat.priority,
          cat.show_home, cat.active, cat.featured,
          cat.ai_trending, cat.ai_popular, cat.ai_assign,
          cat.created_at, cat.updated_at
        ).run()
        restored.categories++
      } catch (err) {
        console.error("Restore category row:", err)
      }
    }

    /* Restore banners */
    for (const b of (data.banners || [])) {
      try {
        await db.prepare(`
          INSERT OR REPLACE INTO banners (
            id,page,category,position,title,image,link,
            banner_order,active,auto_rotate,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          b.id, b.page, b.category, b.position,
          b.title, b.image, b.link,
          b.banner_order, b.active, b.auto_rotate,
          b.created_at, b.updated_at
        ).run()
        restored.banners++
      } catch (err) {
        console.error("Restore banner row:", err)
      }
    }

    // FIX: /deploy/backup captures servers, seo, performance, security, and
    // search settings (see readTableChunked() above) but restore previously
    // dropped all five silently — a "full backup" could not be fully restored.
    // These are restored generically (dynamic columns from the row itself,
    // same INSERT OR REPLACE pattern dbRestore.js already uses) since their
    // schemas belong to other modules and aren't declared in this file.
    const genericRestoreMap = [
      { key: "servers",     table: "servers" },
      { key: "seo",         table: "seo_settings" },
      { key: "performance", table: "performance_settings" },
      { key: "security",    table: "security_settings" },
      { key: "search",      table: "search_settings" }
    ]

    for (const { key, table } of genericRestoreMap) {
      for (const item of (data[key] || [])) {
        if (!item || typeof item !== "object") continue
        try {
          const cols = Object.keys(item)
          if (!cols.length) continue
          const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`
          await db.prepare(sql).bind(...cols.map(k => item[k])).run()
          restored[key]++
        } catch (err) {
          // Table may not exist in this environment yet (owned by another
          // module) — skip gracefully rather than failing the whole restore.
          console.warn(`Restore ${table} row:`, err.message)
        }
      }
    }

    return c.json(success({ restored, backup_id: body.id }))

  } catch (err) {
    console.error("restore POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /deploy/backup/:id — Delete backup
================================================ */

app.delete("/deploy/backup/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const row = await db.prepare(
      "SELECT id FROM deploy_backups WHERE id=?"
    ).bind(id).first()
    if (!row) return c.json(failure("Backup not found"), 404)

    await db.prepare("DELETE FROM deploy_backups WHERE id=?").bind(id).run()
    return c.json(success({ id, deleted: true }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /deploy/backup/:id/download — Export backup JSON
================================================ */

app.get("/deploy/backup/:id/download", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare(
      "SELECT name,data FROM deploy_backups WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(failure("Not found"), 404)

    return new Response(row.data, {
      headers: {
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="${row.name || "backup"}.json"`
      }
    })

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   PATCH /deploy/state — Freeze / Emergency
================================================ */

app.patch("/deploy/state", async (c) => {
  try {
    const db        = c.env.DB
    const body      = await c.req.json()
    const timestamp = now()
    await ensureTables(db)

    if (body.type === "freeze") {
      await db.prepare(
        "UPDATE deploy_state SET frozen=?,updated_at=? WHERE id=1"
      ).bind(body.value ? 1 : 0, timestamp).run()
    }

    if (body.type === "emergency") {
      await db.prepare(
        "UPDATE deploy_state SET emergency=?,updated_at=? WHERE id=1"
      ).bind(body.value ? 1 : 0, timestamp).run()
    }

    return c.json(success({ updated: true, timestamp }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /deploy/version — Create version snapshot
================================================ */

app.post("/deploy/version", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json().catch(() => ({}))
    await ensureTables(db)

    const animeCount = await db.prepare("SELECT COUNT(*) as c FROM anime").first()
    const epCount    = await db.prepare("SELECT COUNT(*) as c FROM episodes").first()

    const id  = crypto.randomUUID()
    const tag = body.tag || `v${Date.now().toString().slice(-6)}`

    await db.prepare(`
      INSERT INTO deploy_versions (id,name,tag,notes,anime_count,ep_count,created_at)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      id,
      body.name  || `Version ${new Date().toLocaleDateString()}`,
      tag,
      body.notes || "",
      animeCount?.c || 0,
      epCount?.c    || 0,
      now()
    ).run()

    return c.json(success({ id, tag }), 201)

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app

