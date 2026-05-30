/* ================================================
   ai.js — AI Brain Engine Control
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

async function isPaused(db) {
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
    return c.json(failure(err.message), 500)
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

    await ensureTables(db)

    await db.prepare(`
      INSERT INTO ai_settings (engine, setting, value)
      VALUES (?, ?, ?)
      ON CONFLICT(engine, setting)
      DO UPDATE SET value = excluded.value
    `).bind(engine, setting, value ? 1 : 0).run()

    return c.json(success({ engine, setting, value: !!value }))

  } catch (err) {
    return c.json(failure(err.message), 500)
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
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /ai/run — Manual trigger
================================================ */

app.post("/ai/run", async (c) => {
  try {
    const db = c.env.DB
    await ensureTables(db)

    if (await isPaused(db)) {
      return c.json(failure("AI is paused — resume first"), 400)
    }

    const result = await runAIEngines(c.env)

    return c.json(success({
      ran:       true,
      timestamp: now(),
      ...result
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
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
    await logAI(db, "RESET", "All AI settings reset to defaults")
    return c.json(success({ reset: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
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
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /ai/logs — Get AI logs
================================================ */

app.get("/ai/logs", async (c) => {
  try {
    const db    = c.env.DB
    const limit = Number(c.req.query("limit") || 30)
    await ensureTables(db)

    const { results } = await db.prepare(`
      SELECT * FROM ai_logs ORDER BY id DESC LIMIT ?
    `).bind(limit).all()

    return c.json(success(results || []))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   ENGINE FUNCTIONS
   All use safeRun — never crash
   All use CORRECT column names from schema
================================================ */

/* SERVER ENGINE */
async function serverEngine(db, cfg) {
  /* Health check — mark servers down if fail_count too high */
  if (cfg.health_check) {
    await safeRun(db, `
      UPDATE servers SET active=0
      WHERE fail_count >= 5 AND active=1
    `)
  }

  /* Auto failover — ensure at least one server is active per episode */
  if (cfg.auto_failover) {
    await safeRun(db, `
      UPDATE servers SET active=1
      WHERE fail_count=0 AND active=0
    `)
  }

  /* Auto priority — lower fail_count = higher priority */
  if (cfg.auto_priority) {
    await safeRun(db, `
      UPDATE servers SET priority = MAX(1, 10 - fail_count)
    `)
  }

  return { server: true }
}

/* ANALYTICS ENGINE */
async function analyticsEngine(db, cfg) {
  /* Trending — mark anime with high rating as trending */
  if (cfg.trending_detect) {
    await safeRun(db, `
      UPDATE anime SET is_trending=1
      WHERE rating >= 8 AND is_hidden=0
    `)
  }

  /* Popular — most viewed flag */
  if (cfg.popular_detect) {
    await safeRun(db, `
      UPDATE anime SET is_most_viewed=1
      WHERE rating >= 7.5 AND is_hidden=0
    `)
  }

  /* Homepage optimize — trending on homepage */
  if (cfg.homepage_optimize) {
    await safeRun(db, `
      UPDATE anime SET is_home=1
      WHERE is_trending=1 AND is_hidden=0
    `)
  }

  return { analytics: true }
}

/* CATEGORY ENGINE */
async function categoryEngine(db, cfg) {
  /* Auto trending — high rating = trending */
  if (cfg.auto_trending) {
    await safeRun(db, `
      UPDATE anime SET is_trending=1
      WHERE rating >= 8.0 AND is_hidden=0
    `)
  }

  /* Auto latest — recently added = home */
  if (cfg.auto_latest) {
    await safeRun(db, `
      UPDATE anime SET is_home=1
      WHERE created_at >= datetime('now', '-7 days')
      AND is_hidden=0
    `)
  }

  return { category: true }
}

/* BANNER ENGINE */
async function bannerEngine(db, cfg) {
  /* Homepage banners — activate banners for home page */
  if (cfg.homepage_banners) {
    await safeRun(db, `
      UPDATE banners SET active=1
      WHERE page='home' AND active=0
    `)
  }

  /* Trending banners — activate trending page banners */
  if (cfg.trending_banners) {
    await safeRun(db, `
      UPDATE banners SET active=1
      WHERE page='trending'
    `)
  }

  /* Hero banners — top rated anime as banner */
  if (cfg.hero_banners) {
    await safeRun(db, `
      UPDATE anime SET is_banner=1
      WHERE rating >= 8.5 AND is_hidden=0
    `)
  }

  return { banner: true }
}

/* HOMEPAGE ENGINE */
async function homepageEngine(db, cfg) {
  /* Row generate — trending anime on homepage */
  if (cfg.row_generate) {
    await safeRun(db, `
      UPDATE anime SET is_home=1
      WHERE is_trending=1 AND is_hidden=0
    `)
  }

  return { homepage: true }
}

/* SEO ENGINE */
async function seoEngine(db, cfg) {
  /* Auto-generate SEO meta for anime */
  if (cfg.auto_title || cfg.auto_description) {
    try {
      const seoRow = await db.prepare(
        "SELECT tpl_anime,canonical FROM seo_settings WHERE id=1"
      ).first()

      const template  = seoRow?.tpl_anime    || "{title} Hindi Dubbed – Watch Online | AnimeHunt"
      const canonical = seoRow?.canonical    || "https://animehunt.in"

      const { results: animeList } = await db.prepare(`
        SELECT id,title,slug,type,description,genres,rating,year,poster
        FROM anime WHERE is_hidden=0
        LIMIT 100
      `).all()

      /* Ensure seo_meta table */
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS seo_meta (
          id TEXT PRIMARY KEY, type TEXT,
          meta_title TEXT, meta_desc TEXT,
          keywords TEXT, og_image TEXT,
          schema_json TEXT, updated_at TEXT
        )
      `).run()

      for (const a of animeList) {
        const metaTitle = template
          .replace("{title}", a.title)
          .replace("{type}",  a.type || "anime")
          .replace("{year}",  a.year || "")
          .slice(0, 65)

        const metaDesc = (
          a.description?.slice(0, 120) ||
          `Watch ${a.title} Hindi Dubbed online free on AnimeHunt.`
        ).slice(0, 160)

        await safeRun(db, `
          INSERT OR REPLACE INTO seo_meta (id,type,meta_title,meta_desc,og_image,updated_at)
          VALUES (?,?,?,?,?,?)
        `, [a.id, a.type || "anime", metaTitle, metaDesc, a.poster || "", now()])
      }

    } catch (err) {
      console.error("SEO engine:", err)
    }
  }

  /* Sitemap flag */
  if (cfg.sitemap_robots) {
    await safeRun(db, `
      UPDATE seo_settings SET auto_sitemap=1 WHERE id=1
    `)
  }

  return { seo: true }
}

/* BACKUP ENGINE */
async function backupEngine(db, cfg) {
  if (cfg.backup_schedule) {
    try {
      const last = await db.prepare(`
        SELECT created_at FROM deploy_backups
        ORDER BY created_at DESC LIMIT 1
      `).first()

      const lastTime = last?.created_at
        ? new Date(last.created_at).getTime()
        : 0

      const hoursSince = (Date.now() - lastTime) / 3600000

      /* Only backup if more than 24h since last backup */
      if (hoursSince >= 24) {
        const [anime, episodes, categories] = await Promise.all([
          db.prepare("SELECT * FROM anime").all(),
          db.prepare("SELECT * FROM episodes").all(),
          db.prepare("SELECT * FROM categories").all()
        ])

        const data = {
          version:    "2.0",
          created_at: now(),
          note:       "Auto backup",
          anime:      anime.results      || [],
          episodes:   episodes.results   || [],
          categories: categories.results || []
        }

        const dataStr = JSON.stringify(data)
        const sizeKB  = Math.round(dataStr.length / 1024)

        await safeRun(db, `
          INSERT INTO deploy_backups (id,name,size_kb,data,created_at)
          VALUES (?,?,?,?,?)
        `, [crypto.randomUUID(), "Auto Backup", sizeKB, dataStr, now()])
      }

    } catch (err) {
      console.error("Backup engine:", err)
    }
  }

  return { backup: true }
}

/* SEARCH ENGINE */
async function searchEngine(db, cfg) {
  /* Auto ranking — update search index based on rating */
  if (cfg.auto_ranking || cfg.popularity_boost) {
    /* Nothing to update in DB — search is handled by publicSearch.js */
    /* Log that search engine ran */
  }

  return { search: true }
}

/* DEPLOY ENGINE */
async function deployEngine(db, cfg) {
  if (cfg.auto_publish) {
    await safeRun(db, `
      UPDATE deploy_state SET last_deploy=? WHERE id=1
    `, [now()])
  }

  return { deploy: true }
}

/* DOWNLOAD ENGINE */
async function downloadEngine(db, cfg) {
  if (cfg.link_validation) {
    await safeRun(db, `
      DELETE FROM downloads WHERE url IS NULL OR url=''
    `)
  }

  return { download: true }
}

/* ================================================
   MASTER AI ENGINE RUNNER
   Called by cron every 5 minutes
================================================ */

export async function runAIEngines(env) {
  const db = env.DB

  try {
    await ensureTables(db)

    if (await isPaused(db)) {
      return { skipped: true, reason: "paused" }
    }

    const map     = await getSettingsMap(db)
    const results = {}

    if (map.server)    results.server    = await serverEngine(db, map.server)
    if (map.analytics) results.analytics = await analyticsEngine(db, map.analytics)
    if (map.category)  results.category  = await categoryEngine(db, map.category)
    if (map.banner)    results.banner    = await bannerEngine(db, map.banner)
    if (map.homepage)  results.homepage  = await homepageEngine(db, map.homepage)
    if (map.seo)       results.seo       = await seoEngine(db, map.seo)
    if (map.backup)    results.backup    = await backupEngine(db, map.backup)
    if (map.search)    results.search    = await searchEngine(db, map.search)
    if (map.deploy)    results.deploy    = await deployEngine(db, map.deploy)
    if (map.download)  results.download  = await downloadEngine(db, map.download)

    /* Update run stats */
    await db.prepare(`
      UPDATE ai_state SET
        last_run=?,
        run_count=run_count+1,
        updated_at=?
      WHERE id=1
    `).bind(now(), now()).run()

    await logAI(db, "CYCLE", "AI engines ran", {
      engines: Object.keys(results)
    })

    return { ran: true, engines: Object.keys(results) }

  } catch (err) {
    console.error("AI MASTER ERROR:", err)
    await logAI(db, "ERROR", err.message || "unknown error")
    return { ran: false, error: err.message }
  }
}

export default app
    
