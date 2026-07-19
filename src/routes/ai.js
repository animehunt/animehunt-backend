/* ================================================
   ai.js — AI Brain Engine Control (Self-Contained)
   Auth handled by adminAuth middleware in index.js
   All automation logic lives HERE — no external deps
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ================================================
   ENSURE TABLES — creates ALL tables engines need
================================================ */

async function ensureTables(db) {
  try {
    /* --- AI System Tables --- */
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_state (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        paused      INTEGER DEFAULT 0,
        last_run    TEXT,
        run_count   INTEGER DEFAULT 0,
        updated_at  TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_settings (
        engine   TEXT NOT NULL,
        setting  TEXT NOT NULL,
        value    INTEGER DEFAULT 0,
        PRIMARY KEY (engine, setting)
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT,
        message    TEXT,
        data       TEXT,
        created_at TEXT
      )
    `).run()

    /* --- Engine-dependent tables (safe CREATE IF NOT EXISTS) --- */
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS servers (
        id         TEXT PRIMARY KEY,
        name       TEXT,
        url        TEXT,
        active     INTEGER DEFAULT 1,
        fail_count INTEGER DEFAULT 0,
        priority   INTEGER DEFAULT 5,
        updated_at TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS banners (
        id         TEXT PRIMARY KEY,
        title      TEXT,
        image      TEXT,
        page       TEXT DEFAULT 'home',
        active     INTEGER DEFAULT 0,
        priority   INTEGER DEFAULT 5,
        created_at TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_settings (
        id          INTEGER PRIMARY KEY DEFAULT 1,
        tpl_anime   TEXT DEFAULT '{title} Hindi Dubbed – Watch Online | AnimeHunt',
        canonical   TEXT DEFAULT 'https://animehunt.in',
        auto_sitemap INTEGER DEFAULT 0
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_meta (
        id         TEXT PRIMARY KEY,
        type       TEXT,
        meta_title TEXT,
        meta_desc  TEXT,
        keywords   TEXT,
        og_image   TEXT,
        schema_json TEXT,
        updated_at TEXT
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

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS deploy_state (
        id           INTEGER PRIMARY KEY DEFAULT 1,
        last_deploy  TEXT,
        updated_at   TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS downloads (
        id         TEXT PRIMARY KEY,
        episode_id TEXT,
        quality    TEXT,
        url        TEXT,
        active     INTEGER DEFAULT 1,
        created_at TEXT
      )
    `).run()

    /* Ensure ai_state row exists */
    const row = await db.prepare(
      "SELECT id FROM ai_state WHERE id=1"
    ).first()

    if (!row) {
      await db.prepare(`
        INSERT INTO ai_state (id, paused, run_count, updated_at)
        VALUES (1, 0, 0, ?)
      `).bind(now()).run()
    }

    /* Ensure seo_settings row exists */
    const seoRow = await db.prepare(
      "SELECT id FROM seo_settings WHERE id=1"
    ).first()
    if (!seoRow) {
      await db.prepare(`
        INSERT INTO seo_settings (id, tpl_anime, canonical, auto_sitemap)
        VALUES (1, '{title} Hindi Dubbed – Watch Online | AnimeHunt', 'https://animehunt.in', 0)
      `).run()
    }

    /* Ensure deploy_state row exists */
    const deployRow = await db.prepare(
      "SELECT id FROM deploy_state WHERE id=1"
    ).first()
    if (!deployRow) {
      await db.prepare(`
        INSERT INTO deploy_state (id, last_deploy, updated_at)
        VALUES (1, NULL, ?)
      `).bind(now()).run()
    }

  } catch (err) {
    console.error("ai ensureTables:", err)
  }
}

/* ================================================
   HELPERS
================================================ */

async function getSettingsMap(db) {
  try {
    const { results } = await db.prepare(
      "SELECT engine, setting, value FROM ai_settings"
    ).all()

    const map = {}
    for (const r of results) {
      if (!map[r.engine]) map[r.engine] = {}
      map[r.engine][r.setting] = !!r.value
    }
    return map
  } catch {
    return {}
  }
}

async function isPausedState(db) {
  try {
    const s = await db.prepare(
      "SELECT paused FROM ai_state WHERE id=1"
    ).first()
    return !!s?.paused
  } catch {
    return false
  }
}

async function logAI(db, type, msg, data = {}) {
  try {
    await db.prepare(`
      INSERT INTO ai_logs (type, message, data, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(type, msg, JSON.stringify(data), now()).run()
  } catch {}
}

/* ================================================
   SAFE DB EXEC — never crash whole engine
================================================ */

async function safeRun(db, sql, binds = []) {
  try {
    if (binds.length) {
      await db.prepare(sql).bind(...binds).run()
    } else {
      await db.prepare(sql).run()
    }
    return true
  } catch (err) {
    console.error("AI safeRun:", sql, err.message)
    return false
  }
}

/* Safe query — returns results or empty array */
async function safeAll(db, sql, binds = []) {
  try {
    const stmt = binds.length
      ? db.prepare(sql).bind(...binds)
      : db.prepare(sql)
    const { results } = await stmt.all()
    return results || []
  } catch (err) {
    console.error("AI safeAll:", sql, err.message)
    return []
  }
}

/* Safe first row — returns row or null */
async function safeFirst(db, sql, binds = []) {
  try {
    const stmt = binds.length
      ? db.prepare(sql).bind(...binds)
      : db.prepare(sql)
    return await stmt.first()
  } catch (err) {
    console.error("AI safeFirst:", sql, err.message)
    return null
  }
}

/* ================================================
   GET /ai
================================================ */

app.get("/ai", async (c) => {
  try {
    const db = c.env.DB
    await ensureTables(db)

    const state   = await db.prepare("SELECT * FROM ai_state WHERE id=1").first()
    const engines = await getSettingsMap(db)

    /* Recent logs */
    const { results: logs } = await db.prepare(`
      SELECT type,message,created_at FROM ai_logs
      ORDER BY id DESC LIMIT 10
    `).all()

    return c.json(success({
      paused:   !!state?.paused,
      lastRun:  state?.last_run  || null,
      runCount: state?.run_count || 0,
      engines,
      logs: logs || []
    }))

  } catch (err) {
    return c.json(failure(err.message || "Internal error"), 500)
  }
})

/* ================================================
   PATCH /ai — Update single setting
================================================ */

app.patch("/ai", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    const { engine, setting, value } = body

    if (!engine || !setting) {
      return c.json(failure("engine and setting required"), 400)
    }

    /* Validate engine name to prevent injection */
    const validEngines = [
      "server","analytics","category","banner","seo",
      "homepage","backup","search","deploy","download"
    ]
    if (!validEngines.includes(engine)) {
      return c.json(failure(`Invalid engine: ${engine}`), 400)
    }

    await ensureTables(db)

    await db.prepare(`
      INSERT INTO ai_settings (engine, setting, value)
      VALUES (?, ?, ?)
      ON CONFLICT(engine, setting)
      DO UPDATE SET value = excluded.value
    `).bind(engine, setting, value ? 1 : 0).run()

    return c.json(success({ engine, setting, value: !!value }))

  } catch (err) {
    return c.json(failure(err.message || "Update failed"), 500)
  }
})

/* ================================================
   PATCH /ai/pause — Toggle pause
================================================ */

app.patch("/ai/pause", async (c) => {
  try {
    const db  = c.env.DB
    await ensureTables(db)
    const s   = await db.prepare("SELECT paused FROM ai_state WHERE id=1").first()
    const next = s?.paused ? 0 : 1

    await db.prepare(
      "UPDATE ai_state SET paused=?, updated_at=? WHERE id=1"
    ).bind(next, now()).run()

    await logAI(db, next ? "PAUSED" : "RESUMED", `AI engines ${next ? "paused" : "resumed"}`)

    return c.json(success({ paused: !!next }))

  } catch (err) {
    return c.json(failure(err.message || "Toggle failed"), 500)
  }
})

/* ================================================
   POST /ai/run — Manual trigger (rate-limited)
================================================ */

/* Simple in-memory rate limit: min 60s between manual runs */
let lastManualRun = 0

app.post("/ai/run", async (c) => {
  try {
    const db = c.env.DB
    await ensureTables(db)

    if (await isPausedState(db)) {
      return c.json(failure("AI is paused — resume first"), 400)
    }

    /* ✅ Rate limit: prevent spam-clicking "Run Now" */
    const elapsed = Date.now() - lastManualRun
    if (elapsed < 60000) {
      const waitSec = Math.ceil((60000 - elapsed) / 1000)
      return c.json(failure(`Please wait ${waitSec}s before next manual run`), 429)
    }
    lastManualRun = Date.now()

    const result = await runAIEngines(c.env)

    return c.json(success({
      ran:       true,
      timestamp: now(),
      ...result
    }))

  } catch (err) {
    return c.json(failure(err.message || "Run failed"), 500)
  }
})

/* ================================================
   POST /ai/reset — Reset all settings to defaults
================================================ */

app.post("/ai/reset", async (c) => {
  try {
    const db = c.env.DB
    await ensureTables(db)
    await db.prepare("DELETE FROM ai_settings").run()

    /* ✅ Also reset ai_state counters */
    await db.prepare(`
      UPDATE ai_state SET
        paused = 0,
        run_count = 0,
        updated_at = ?
      WHERE id = 1
    `).bind(now()).run()

    await logAI(db, "RESET", "All AI settings reset to defaults")
    return c.json(success({ reset: true }))
  } catch (err) {
    return c.json(failure(err.message || "Reset failed"), 500)
  }
})

/* ================================================
   DELETE /ai/logs — Clear AI logs
================================================ */

app.delete("/ai/logs", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM ai_logs").run()
    return c.json(success({ cleared: true }))
  } catch (err) {
    return c.json(failure(err.message || "Clear failed"), 500)
  }
})

/* ================================================
   GET /ai/logs — Get AI logs
================================================ */

app.get("/ai/logs", async (c) => {
  try {
    const db    = c.env.DB
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 30), 1), 200)
    await ensureTables(db)

    const { results } = await db.prepare(`
      SELECT * FROM ai_logs ORDER BY id DESC LIMIT ?
    `).bind(limit).all()

    return c.json(success(results || []))
  } catch (err) {
    return c.json(failure(err.message || "Fetch failed"), 500)
  }
})

/* ================================================
   ENGINE FUNCTIONS
   All use safeRun/safeAll/safeFirst — never crash
   All wrapped in try-catch individually
   Engine errors are logged but don't stop others
================================================ */

/* SERVER ENGINE */
async function serverEngine(db, cfg) {
  const changes = {}

  /* Health check — mark servers down if fail_count too high */
  if (cfg.health_check) {
    const ok = await safeRun(db, `
      UPDATE servers SET active=0
      WHERE fail_count >= 5 AND active=1
    `)
    changes.health_check = ok ? "ran" : "skipped"
  }

  /* Auto failover — activate healthy servers ONLY when no active server exists */
  if (cfg.auto_failover) {
    /* ✅ FIX: Only activate if there are zero healthy active servers */
    const activeHealthy = await safeFirst(db, `
      SELECT COUNT(*) as cnt FROM servers WHERE active=1 AND fail_count < 5
    `)

    if (activeHealthy && activeHealthy.cnt === 0) {
      const ok = await safeRun(db, `
        UPDATE servers SET active=1
        WHERE fail_count = 0 AND active=0
        LIMIT 1
      `)
      changes.auto_failover = ok ? "activated_fallback" : "skipped"
    } else {
      changes.auto_failover = "no_action_needed"
    }
  }

  /* Auto priority — lower fail_count = higher priority */
  if (cfg.auto_priority) {
    const ok = await safeRun(db, `
      UPDATE servers SET priority = MAX(1, 10 - fail_count)
    `)
    changes.auto_priority = ok ? "ran" : "skipped"
  }

  /* Always reset fail_count for active healthy servers over time */
  await safeRun(db, `
    UPDATE servers SET fail_count = MAX(0, fail_count - 1)
    WHERE active=1 AND fail_count > 0
  `)

  return { server: true, changes }
}

/* ANALYTICS ENGINE */
async function analyticsEngine(db, cfg) {
  const changes = {}

  /* Trending — mark anime with high rating as trending */
  if (cfg.trending_detect) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_trending=1
      WHERE rating >= 8 AND is_hidden=0 AND (is_trending IS NULL OR is_trending=0)
    `)
    changes.trending_detect = ok ? "ran" : "skipped"
  }

  /* Popular — most viewed flag */
  if (cfg.popular_detect) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_most_viewed=1
      WHERE rating >= 7.5 AND is_hidden=0 AND (is_most_viewed IS NULL OR is_most_viewed=0)
    `)
    changes.popular_detect = ok ? "ran" : "skipped"
  }

  /* Homepage optimize — trending on homepage */
  if (cfg.homepage_optimize) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_home=1
      WHERE is_trending=1 AND is_hidden=0 AND (is_home IS NULL OR is_home=0)
    `)
    changes.homepage_optimize = ok ? "ran" : "skipped"
  }

  return { analytics: true, changes }
}

/* CATEGORY ENGINE */
async function categoryEngine(db, cfg) {
  const changes = {}

  /* Auto trending — high rating = trending */
  if (cfg.auto_trending) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_trending=1
      WHERE rating >= 8.0 AND is_hidden=0 AND (is_trending IS NULL OR is_trending=0)
    `)
    changes.auto_trending = ok ? "ran" : "skipped"
  }

  /* Auto latest — recently added = home */
  if (cfg.auto_latest) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_home=1
      WHERE created_at >= datetime('now', '-7 days')
      AND is_hidden=0 AND (is_home IS NULL OR is_home=0)
    `)
    changes.auto_latest = ok ? "ran" : "skipped"
  }

  return { category: true, changes }
}

/* BANNER ENGINE */
async function bannerEngine(db, cfg) {
  const changes = {}

  /* Homepage banners — activate banners for home page */
  if (cfg.homepage_banners) {
    const ok = await safeRun(db, `
      UPDATE banners SET active=1
      WHERE page='home' AND active=0
    `)
    changes.homepage_banners = ok ? "ran" : "skipped"
  }

  /* Trending banners — activate trending page banners */
  if (cfg.trending_banners) {
    const ok = await safeRun(db, `
      UPDATE banners SET active=1
      WHERE page='trending' AND active=0
    `)
    changes.trending_banners = ok ? "ran" : "skipped"
  }

  /* Hero banners — top rated anime as banner */
  if (cfg.hero_banners) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_banner=1
      WHERE rating >= 8.5 AND is_hidden=0 AND (is_banner IS NULL OR is_banner=0)
    `)
    changes.hero_banners = ok ? "ran" : "skipped"
  }

  return { banner: true, changes }
}

/* HOMEPAGE ENGINE */
async function homepageEngine(db, cfg) {
  const changes = {}

  /* Row generate — trending anime on homepage */
  if (cfg.row_generate) {
    const ok = await safeRun(db, `
      UPDATE anime SET is_home=1
      WHERE is_trending=1 AND is_hidden=0 AND (is_home IS NULL OR is_home=0)
    `)
    changes.row_generate = ok ? "ran" : "skipped"
  }

  /* ✅ NEW: Also remove hidden anime from homepage */
  await safeRun(db, `
    UPDATE anime SET is_home=0
    WHERE is_hidden=1 AND is_home=1
  `)

  return { homepage: true, changes }
}

/* SEO ENGINE */
async function seoEngine(db, cfg) {
  const changes = {}

  /* Auto-generate SEO meta for anime */
  if (cfg.auto_title || cfg.auto_description) {
    try {
      const seoRow = await safeFirst(db,
        "SELECT tpl_anime,canonical FROM seo_settings WHERE id=1"
      )

      const template  = seoRow?.tpl_anime  || "{title} Hindi Dubbed – Watch Online | AnimeHunt"
      const canonical = seoRow?.canonical   || "https://animehunt.in"

      const animeList = await safeAll(db, `
        SELECT id,title,slug,type,description,genres,rating,year,poster
        FROM anime WHERE is_hidden=0
        LIMIT 100
      `)

      for (const a of animeList) {
        /* ✅ FIX: Use replaceAll to replace ALL occurrences of each placeholder */
        let metaTitle = template
          .replaceAll("{title}", a.title || "")
          .replaceAll("{type}",  a.type  || "anime")
          .replaceAll("{year}",  a.year  || "")
          .replaceAll("{slug}",  a.slug  || "")
        metaTitle = metaTitle.slice(0, 65)

        let metaDesc = a.description?.slice(0, 120) || `Watch ${a.title} Hindi Dubbed online free on AnimeHunt.`
        metaDesc = metaDesc.slice(0, 160)

        await safeRun(db, `
          INSERT OR REPLACE INTO seo_meta (id,type,meta_title,meta_desc,og_image,updated_at)
          VALUES (?,?,?,?,?,?)
        `, [a.id, a.type || "anime", metaTitle, metaDesc, a.poster || "", now()])
      }

      changes.seo_generated = animeList.length

    } catch (err) {
      console.error("SEO engine:", err)
      changes.seo_error = err.message
    }
  }

  /* Sitemap flag */
  if (cfg.sitemap_robots) {
    const ok = await safeRun(db, `
      UPDATE seo_settings SET auto_sitemap=1 WHERE id=1
    `)
    changes.sitemap_robots = ok ? "enabled" : "skipped"
  }

  return { seo: true, changes }
}

/* BACKUP ENGINE */
async function backupEngine(db, cfg) {
  const changes = {}

  if (cfg.backup_schedule) {
    try {
      const last = await safeFirst(db, `
        SELECT created_at FROM deploy_backups
        ORDER BY created_at DESC LIMIT 1
      `)

      const lastTime = last?.created_at
        ? new Date(last.created_at).getTime()
        : 0

      const hoursSince = (Date.now() - lastTime) / 3600000

      /* Only backup if more than 24h since last backup */
      if (hoursSince >= 24) {
        const [anime, episodes, categories] = await Promise.all([
          safeAll(db, "SELECT * FROM anime"),
          safeAll(db, "SELECT * FROM episodes"),
          safeAll(db, "SELECT * FROM categories")
        ])

        const data = {
          version:    "2.0",
          created_at: now(),
          note:       "Auto backup",
          anime:      anime      || [],
          episodes:   episodes   || [],
          categories: categories || []
        }

        const dataStr = JSON.stringify(data)
        const sizeKB  = Math.round(dataStr.length / 1024)

        /* ✅ FIX: Skip backup if data is too large (>10MB) to prevent DB bloat */
        if (sizeKB > 10240) {
          changes.backup = "skipped_too_large"
          changes.size_kb = sizeKB
          console.warn(`Backup skipped: ${sizeKB}KB exceeds 10MB limit`)
        } else {
          const ok = await safeRun(db, `
            INSERT INTO deploy_backups (id,name,size_kb,data,created_at)
            VALUES (?,?,?,?,?)
          `, [crypto.randomUUID(), "Auto Backup", sizeKB, dataStr, now()])

          if (ok) {
            changes.backup = "created"
            changes.size_kb = sizeKB

            /* ✅ NEW: Auto-cleanup old backups — keep only latest 5 */
            await safeRun(db, `
              DELETE FROM deploy_backups
              WHERE id NOT IN (
                SELECT id FROM deploy_backups
                ORDER BY created_at DESC LIMIT 5
              )
            `)
          } else {
            changes.backup = "failed"
          }
        }
      } else {
        changes.backup = "skipped_recent"
        changes.hours_since_last = Math.round(hoursSince)
      }

    } catch (err) {
      console.error("Backup engine:", err)
      changes.backup_error = err.message
    }
  }

  return { backup: true, changes }
}

/* SEARCH ENGINE — ✅ Now actually does useful work */
async function searchEngine(db, cfg) {
  const changes = {}

  if (cfg.auto_ranking) {
    /* Update a search_weight column based on rating + trending status */
    /* Higher rating + trending = higher search weight */
    const ok = await safeRun(db, `
      UPDATE anime SET search_weight = (
        CASE
          WHEN rating >= 9 THEN 100
          WHEN rating >= 8 THEN 80
          WHEN rating >= 7 THEN 60
          WHEN rating >= 6 THEN 40
          ELSE 20
        END
      ) + (CASE WHEN is_trending=1 THEN 15 ELSE 0 END)
      WHERE is_hidden=0
    `)
    changes.auto_ranking = ok ? "weights_updated" : "skipped"
  }

  if (cfg.popularity_boost) {
    /* Boost trending anime even higher */
    const ok = await safeRun(db, `
      UPDATE anime SET search_weight = search_weight + 25
      WHERE is_trending=1 AND is_hidden=0
    `)
    changes.popularity_boost = ok ? "boosted" : "skipped"
  }

  return { search: true, changes }
}

/* DEPLOY ENGINE */
async function deployEngine(db, cfg) {
  const changes = {}

  if (cfg.auto_publish) {
    const ok = await safeRun(db, `
      UPDATE deploy_state SET last_deploy=?, updated_at=? WHERE id=1
    `, [now(), now()])
    changes.auto_publish = ok ? "deployed" : "skipped"
  }

  return { deploy: true, changes }
}

/* DOWNLOAD ENGINE */
async function downloadEngine(db, cfg) {
  const changes = {}

  if (cfg.link_validation) {
    /* Remove entries with null/empty URLs */
    const ok = await safeRun(db, `
      DELETE FROM downloads WHERE url IS NULL OR url='' OR TRIM(url)=''
    `)
    changes.link_validation = ok ? "cleaned" : "skipped"

    /* ✅ NEW: Also deactivate downloads pointing to obviously dead domains */
    await safeRun(db, `
      UPDATE downloads SET active=0
      WHERE url LIKE '%example.com%' OR url LIKE '%localhost%' OR url LIKE '%127.0.0.1%'
    `)
  }

  return { download: true, changes }
}

/* ================================================
   MASTER AI ENGINE RUNNER
   Called by cron every 5 minutes
   ✅ Each engine runs independently — one failure
      doesn't stop others
================================================ */

export async function runAIEngines(env) {
  const db = env.DB

  try {
    await ensureTables(db)

    if (await isPausedState(db)) {
      return { skipped: true, reason: "paused" }
    }

    const map     = await getSettingsMap(db)
    const results = {}
    const errors  = []

    /* ✅ FIX: Each engine is wrapped in its own try-catch so one failure
       doesn't prevent other engines from running */
    const engineList = [
      { key: "server",    fn: serverEngine,    cfg: map.server },
      { key: "analytics", fn: analyticsEngine,  cfg: map.analytics },
      { key: "category",  fn: categoryEngine,   cfg: map.category },
      { key: "banner",    fn: bannerEngine,     cfg: map.banner },
      { key: "homepage",  fn: homepageEngine,   cfg: map.homepage },
      { key: "seo",       fn: seoEngine,        cfg: map.seo },
      { key: "backup",    fn: backupEngine,     cfg: map.backup },
      { key: "search",    fn: searchEngine,     cfg: map.search },
      { key: "deploy",    fn: deployEngine,     cfg: map.deploy },
      { key: "download",  fn: downloadEngine,   cfg: map.download },
    ]

    for (const { key, fn, cfg } of engineList) {
      if (!cfg) continue /* engine not configured — skip */

      try {
        results[key] = await fn(db, cfg)
      } catch (err) {
        console.error(`AI engine [${key}] error:`, err)
        results[key] = { error: err.message || "Unknown engine error" }
        errors.push({ engine: key, error: err.message })
      }
    }

    /* Update run stats */
    try {
      await db.prepare(`
        UPDATE ai_state SET
          last_run=?,
          run_count=run_count+1,
          updated_at=?
        WHERE id=1
      `).bind(now(), now()).run()
    } catch (err) {
      console.error("AI state update failed:", err)
    }

    const ranEngines = Object.keys(results)

    await logAI(db, "CYCLE", `AI engines ran (${ranEngines.length})`, {
      engines: ranEngines,
      errors: errors.length ? errors : undefined
    })

    return {
      ran: true,
      engines: ranEngines,
      errors: errors.length ? errors : undefined
    }

  } catch (err) {
    console.error("AI MASTER ERROR:", err)
    try {
      await logAI(db, "ERROR", err.message || "unknown error")
    } catch {}
    return { ran: false, error: err.message }
  }
}

export default app


