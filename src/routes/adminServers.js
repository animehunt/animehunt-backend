/* ================================================
   adminServers.js — Streaming Server Management
   Auth handled by adminAuth middleware in index.js
   NO local verifyAdmin here
================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ================= HELPERS ================= */

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

function format(s) {
  return {
    id:         s.id,
    name:       s.name,
    anime:      s.anime,
    anime_id:   s.anime_id,
    episode_id: s.episode_id || "",
    season:     s.season,
    episode:    s.episode,
    embed:      s.embed,
    url:        s.embed,
    type:       s.type,
    priority:   s.priority,
    active:     !!s.active,
    verified:   !!s.verified,
    fail_count: s.fail_count || 0,
    last_check: s.last_check,
    last_used:  s.last_used,
    created_at: s.created_at,
    updated_at: s.updated_at
  }
}

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body || typeof body !== "object") return "Invalid request body"
  if (!body.name?.trim())  return "Server name required"
  if (!body.anime?.trim()) return "Anime name required"
  if (!body.embed?.trim()) return "Embed URL required"
  try { new URL(body.embed) } catch { return "Invalid embed URL" }
  return null
}

/* ================= SYNC TO REPLICAS ================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    promises.push(
      fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify(buildTursoPayload(action, data))
      }).catch(e => console.error("Turso sync:", e))
    )
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    promises.push(
      syncSupabase(env, action, data)
        .catch(e => console.error("Supabase sync:", e))
    )
  }

  return Promise.all(promises)
}

function buildTursoPayload(action, data) {
  if (action === "insert") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql: `INSERT OR REPLACE INTO servers (
            id,name,anime,anime_id,episode_id,season,episode,embed,type,
            priority,active,verified,fail_count,last_check,last_used,
            created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: String(data.id) },
            { type:"text",    value: String(data.name) },
            { type:"text",    value: String(data.anime) },
            { type:"text",    value: String(data.anime_id || "") },
            { type:"text",    value: String(data.episode_id || "") },
            { type:"integer", value: String(data.season) },
            { type:"integer", value: String(data.episode) },
            { type:"text",    value: String(data.embed) },
            { type:"text",    value: String(data.type) },
            { type:"integer", value: String(data.priority) },
            { type:"integer", value: String(data.active) },
            { type:"integer", value: String(data.verified) },
            { type:"integer", value: String(data.fail_count) },
            { type:"text",    value: String(data.last_check || "") },
            { type:"text",    value: String(data.last_used || "") },
            { type:"text",    value: String(data.created_at) },
            { type:"text",    value: String(data.updated_at) }
          ]
        }
      }]
    }
  }
  if (action === "delete") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql:  "DELETE FROM servers WHERE id=?",
          args: [{ type:"text", value: String(data.id) }]
        }
      }]
    }
  }
  return { requests: [] }
}

async function syncSupabase(env, action, data) {
  const base    = `${env.SUPABASE_URL}/rest/v1/servers`
  const headers = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates"
  }
  if (action === "insert") {
    const res = await fetch(base, { method:"POST", headers, body: JSON.stringify(data) })
    if (!res.ok) console.error("Supabase servers insert failed:", res.status, await res.text())
  }
  if (action === "delete") {
    const res = await fetch(`${base}?id=eq.${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: { ...headers, Prefer: undefined }
    })
    if (!res.ok) console.error("Supabase servers delete failed:", res.status, await res.text())
  }
}

/* ✅ FIX (audit ISSUE-026, adminServers.js instance): removed dead
   duplicate routes GET /servers/public/:animeId/:season/:episode and its
   legacy variant. This file is only mounted under adminRoutes (see
   index.js), so these were only ever reachable at
   /api/admin/servers/public/... — behind admin auth, never actually
   serving the public watch page. public.js already correctly and
   independently serves the real public version at
   /api/public/servers/:episodeId, using a newer, cleaner episode_id-based
   lookup rather than this file's older (animeId, season, episode)
   composite-key approach. */

/* ================= STATS ================= */
/* ROUTE ORDER FIX: must be registered BEFORE /servers/:id
   otherwise Hono matches "stats" as the :id param */

app.get("/servers/stats", async (c) => {
  try {
    const db = c.env.DB

    const total   = await db.prepare("SELECT COUNT(*) as c FROM servers").first()
    const active  = await db.prepare("SELECT COUNT(*) as c FROM servers WHERE active=1").first()
    const verify  = await db.prepare("SELECT COUNT(*) as c FROM servers WHERE verified=1").first()
    const failed  = await db.prepare("SELECT COUNT(*) as c FROM servers WHERE fail_count>=5").first()

    const topAnime = await db.prepare(`
      SELECT anime, COUNT(*) as count
      FROM servers GROUP BY anime
      ORDER BY count DESC LIMIT 5
    `).all()

    return c.json(success({
      total:    total?.c   || 0,
      active:   active?.c  || 0,
      verified: verify?.c  || 0,
      failed:   failed?.c  || 0,
      topAnime: topAnime.results || []
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= BULK DELETE ================= */
/* ROUTE ORDER FIX: must be registered BEFORE /servers/:id
   otherwise Hono matches "bulk-delete" as the :id param and DELETE /:id fires instead.
   Supports two payload shapes used across the app:
     { ids: ["id1","id2",...] }         — explicit id list
     { filter: "inactive" }             — delete all inactive servers (used by CMS "Delete All Inactive") */

app.delete("/servers/bulk-delete", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    let ids = []

    if (Array.isArray(body?.ids) && body.ids.length) {
      ids = body.ids
    } else if (body?.filter === "inactive") {
      const { results } = await db.prepare(
        "SELECT id FROM servers WHERE active=0"
      ).all()
      ids = results.map(r => r.id)
    } else if (body?.filter === "failed") {
      const { results } = await db.prepare(
        "SELECT id FROM servers WHERE fail_count>=5"
      ).all()
      ids = results.map(r => r.id)
    }

    if (!ids.length) {
      return c.json(success({ deleted: 0 }))
    }

    /* Use db.batch() instead of sequential loop —
       avoids hitting Cloudflare Workers 50 subrequest limit on large deletes */
    const stmts = ids.map(id =>
      db.prepare("DELETE FROM servers WHERE id=?").bind(id)
    )
    await db.batch(stmts)

    const syncAll = Promise.all(ids.map(id => syncToReplicas(c.env, "delete", { id })))
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncAll)
    } else {
      syncAll.catch(() => {})
    }

    return c.json(success({ deleted: ids.length }))

  } catch (err) {
    console.error("servers bulk-delete:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= AUTO HEALTH CHECK ================= */
/* ROUTE ORDER FIX: must be registered BEFORE /servers/:id */
/* Called by cron or manually — checks if embed URLs respond */

app.post("/servers/health-check", async (c) => {
  try {
    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT id, embed FROM servers WHERE active=1
      ORDER BY fail_count ASC
      LIMIT 20
    `).all()

    // ✅ FIX (audit ISSUE-027): this loop previously awaited each fetch
    // sequentially — worst case ~100s (20 servers × 5s timeout each).
    // nginx.conf.example doesn't set proxy_read_timeout, so nginx's
    // default (60s) could return a 504 to the admin's browser well before
    // the backend finished, even though the backend kept running and
    // completed the DB updates regardless — a confusing "it failed" when
    // it actually succeeded silently in the background. Running checks
    // concurrently brings worst case down to ~5s.
    async function checkOne(server) {
      try {
        /* HEAD request — just check if URL responds */
        const res = await fetch(server.embed, {
          method:  "HEAD",
          signal:  AbortSignal.timeout(5000)
        })

        if (res.ok || res.status === 405) {
          /* 405 = method not allowed but server is alive */
          await db.prepare(`
            UPDATE servers SET verified=1,fail_count=0,last_check=? WHERE id=?
          `).bind(now(), server.id).run()
          return { ok: true }
        } else {
          await db.prepare(`
            UPDATE servers SET verified=0,fail_count=fail_count+1,last_check=? WHERE id=?
          `).bind(now(), server.id).run()
          return { ok: false }
        }
      } catch {
        await db.prepare(`
          UPDATE servers SET fail_count=fail_count+1,last_check=? WHERE id=?
        `).bind(now(), server.id).run()
        return { ok: false }
      } finally {
        /* Auto-disable after 5 consecutive failures */
        const row = await db.prepare(
          "SELECT fail_count FROM servers WHERE id=?"
        ).bind(server.id).first()

        if (row?.fail_count >= 5) {
          await db.prepare(
            "UPDATE servers SET active=0 WHERE id=?"
          ).bind(server.id).run()
        }
      }
    }

    const outcomes = await Promise.all(results.map(checkOne))
    const failed   = outcomes.filter(o => !o.ok).length
    const checked  = outcomes.length

    return c.json(success({ checked, failed, healthy: checked - failed }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= CREATE ================= */

app.post("/servers", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const id        = crypto.randomUUID()
    const timestamp = now()

    const row = {
      id,
      name:       body.name.trim(),
      anime:      body.anime.trim(),
      anime_id:   body.anime_id   || "",
      episode_id: body.episode_id || "",
      season:     Number(body.season   || 1),
      episode:    Number(body.episode  || 1),
      embed:      body.embed.trim(),
      type:       body.type       || "iframe",
      priority:   Number(body.priority || 99),
      active:     body.active !== false ? 1 : 0,
      verified:   0,
      fail_count: 0,
      last_check: "",
      last_used:  "",
      created_at: timestamp,
      updated_at: timestamp
    }

    await db.prepare(`
      INSERT INTO servers (
        id,name,anime,anime_id,episode_id,season,episode,embed,type,
        priority,active,verified,fail_count,last_check,last_used,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.name, row.anime, row.anime_id, row.episode_id,
      row.season, row.episode, row.embed, row.type,
      row.priority, row.active, row.verified,
      row.fail_count, row.last_check, row.last_used,
      row.created_at, row.updated_at
    ).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id }), 201)

  } catch (err) {
    console.error("servers POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ALL (ADMIN) ================= */

app.get("/servers", async (c) => {
  try {
    const db      = c.env.DB
    const search  = c.req.query("q")       || ""
    const animeId = c.req.query("anime_id") || ""
    const season  = c.req.query("season")   || ""
    const episode = c.req.query("episode")  || ""
    const active  = c.req.query("active")   || ""
    const limit   = Math.min(500, Math.max(1, Number(c.req.query("limit")  || 500)))
    const offset  = Math.max(0, Number(c.req.query("offset") || 0))

    let where    = "WHERE 1=1"
    const params = []

    if (search)  {
      where += " AND (anime LIKE ? OR name LIKE ? OR embed LIKE ?)"
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (animeId) { where += " AND (anime_id=? OR anime=?)"; params.push(animeId, animeId) }
    if (season)  { where += " AND season=?";   params.push(Number(season)) }
    if (episode) { where += " AND episode=?";  params.push(Number(episode)) }
    if (active !== "") { where += " AND active=?"; params.push(Number(active)) }

    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM servers ${where}`
    ).bind(...params).first()

    const { results } = await db.prepare(`
      SELECT * FROM servers
      ${where}
      ORDER BY priority ASC, created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data:    results.map(format),
      total:   countRow?.total || 0,
      limit,
      offset
    })

  } catch (err) {
    console.error("servers GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ONE ================= */

app.get("/servers/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT * FROM servers WHERE id=?").bind(id).first()
    if (!row) return c.json(failure("Server not found"), 404)
    return c.json(success(format(row)))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= UPDATE ================= */

app.put("/servers/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    // ✅ FIX (audit ISSUE-028): expanded SELECT to include verified/
    // fail_count/last_check/last_used — needed below to preserve them in
    // the replica sync instead of hardcoding resets.
    const existing = await db.prepare(
      "SELECT id, created_at, verified, fail_count, last_check, last_used FROM servers WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Server not found"), 404)

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const timestamp = now()
    const row = {
      id,
      name:       body.name.trim(),
      anime:      body.anime.trim(),
      anime_id:   body.anime_id   || "",
      episode_id: body.episode_id || "",
      season:     Number(body.season   || 1),
      episode:    Number(body.episode  || 1),
      embed:      body.embed.trim(),
      type:       body.type       || "iframe",
      priority:   Number(body.priority || 99),
      active:     bool(body.active),
      updated_at: timestamp
    }

    await db.prepare(`
      UPDATE servers SET
        name=?,anime=?,anime_id=?,episode_id=?,season=?,episode=?,
        embed=?,type=?,priority=?,active=?,updated_at=?
      WHERE id=?
    `).bind(
      row.name, row.anime, row.anime_id, row.episode_id,
      row.season, row.episode,
      row.embed, row.type, row.priority,
      row.active, row.updated_at, id
    ).run()

    // ✅ FIX (audit ISSUE-028): the primary DB UPDATE above correctly
    // preserves verified/fail_count/last_check/last_used (they're not in
    // the SET clause) — but the replica sync was hardcoding them back to
    // 0/"" on every edit, meaning primary and replicas permanently
    // disagreed on these 4 fields for any server that was ever edited.
    // That would cause dbRestore.js's /db/reconcile and /db/checksums to
    // perpetually flag the row as out-of-sync, since there's no "correct"
    // side to resolve to. Preserving existing.* here keeps replicas
    // consistent with what the primary DB actually has.
    const replicaRow = {
      ...row,
      verified:   existing.verified   ?? 0,
      fail_count: existing.fail_count ?? 0,
      last_check: existing.last_check || "",
      last_used:  existing.last_used  || "",
      created_at: existing.created_at || timestamp
    }

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", replicaRow))
    } else {
      syncToReplicas(c.env, "insert", replicaRow)
    }

    return c.json(success({ id }))

  } catch (err) {
    console.error("servers PUT:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= TOGGLE ACTIVE ================= */

app.patch("/servers/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT id,active FROM servers WHERE id=?").bind(id).first()
    if (!row) return c.json(failure("Not found"), 404)

    const newVal = row.active ? 0 : 1
    await db.prepare("UPDATE servers SET active=?,updated_at=? WHERE id=?")
      .bind(newVal, now(), id).run()

    return c.json(success({ id, active: !!newVal }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= DELETE ================= */

app.delete("/servers/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare("SELECT id FROM servers WHERE id=?").bind(id).first()
    if (!existing) return c.json(failure("Server not found"), 404)

    await db.prepare("DELETE FROM servers WHERE id=?").bind(id).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "delete", { id }))
    } else {
      syncToReplicas(c.env, "delete", { id })
    }

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("servers DELETE:", err)
    return c.json(failure(err.message), 500)
  }
})

export default app
