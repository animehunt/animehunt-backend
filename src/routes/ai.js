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
    // ✅ FIX (audit CONFIRMED-6): this only defined 7 of servers' real 17
    // columns (confirmed against schema.sql and adminServers.js's own
    // matching definition) and was missing anime/anime_id/episode_id/
    // season/episode/embed/type/verified/last_check/last_used/created_at
    // entirely -- embed is NOT NULL on the real table. Same lazy-init race
    // as ISSUE-015 (deploy_state): if AI Brain is visited before Servers
    // on a fresh DB, this narrower table wins permanently (CREATE TABLE IF
    // NOT EXISTS is a no-op against an existing table), and every later
    // adminServers.js write fails with "no such column". Matching the
    // full definition here removes the race.
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS servers (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        anime      TEXT NOT NULL,
        anime_id   TEXT DEFAULT '',
        episode_id TEXT DEFAULT '',
        season     INTEGER NOT NULL DEFAULT 1,
        episode    INTEGER NOT NULL DEFAULT 1,
        embed      TEXT NOT NULL,
        type       TEXT NOT NULL DEFAULT 'iframe'
                   CHECK (type IN ('iframe','m3u8','mp4','dash')),
        priority   INTEGER NOT NULL DEFAULT 99,
        active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        verified   INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
        fail_count INTEGER NOT NULL DEFAULT 0,
        last_check TEXT DEFAULT '',
        last_used  TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (anime_id)   REFERENCES anime(id)    ON DELETE CASCADE,
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
      )
    `).run()

    // ✅ FIX (audit CONFIRMED-6): this only defined 7 of banners' real 15
    // columns (confirmed against schema.sql and banners.js's own matching
    // definition), missing link/category/position/banner_order/
    // auto_rotate/updated_at entirely -- and critically missing
    // trailer_url/trailer_autoplay/trailer_muted, a fully working, tested
    // feature elsewhere in this codebase (banners.js POST /banners/:id/
    // trailer). Same lazy-init race as the servers fix above: if this
    // narrower table won on a fresh DB, that feature's writes would fail
    // with "no such column: trailer_url". Matching the full definition
    // here removes the race.
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS banners (
        id                TEXT PRIMARY KEY,
        page              TEXT NOT NULL DEFAULT 'home'
                            CHECK (page IN ('home','anime','cartoon','series','movies','search','episode','download','category')),
        category          TEXT DEFAULT '',
        position          TEXT NOT NULL DEFAULT 'hero'
                            CHECK (position IN ('hero','top','middle','bottom')),
        title             TEXT NOT NULL,
        image             TEXT NOT NULL,
        link              TEXT DEFAULT '',
        banner_order      INTEGER NOT NULL DEFAULT 1,
        active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
        auto_rotate       INTEGER NOT NULL DEFAULT 0 CHECK (auto_rotate IN (0,1)),
        trailer_url       TEXT DEFAULT NULL,
        trailer_autoplay  INTEGER NOT NULL DEFAULT 0 CHECK (trailer_autoplay IN (0,1)),
        trailer_muted     INTEGER NOT NULL DEFAULT 1 CHECK (trailer_muted IN (0,1)),
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run()

    // ✅ FIX (audit, same race-condition class as ISSUE-015's deploy_state
    // fix above): this only defined 4 of seo_settings' real 30 columns
    // (confirmed against schema.sql and seoAdmin.js's own matching
    // definition). ensureTables() here runs lazily per-request just like
    // deploy_state's did — if an admin visits AI Brain before ever
    // opening SEO Settings on a fresh DB, this narrower CREATE TABLE
    // would win, and seoAdmin.js's later "UPDATE seo_settings SET
    // site_title=?, site_desc=?, ..." would then fail with "no such
    // column: site_title". Matching the full definition here removes
    // the race entirely, the same way the deploy_state fix already did.
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_settings (
        id               INTEGER PRIMARY KEY DEFAULT 1,
        site_title       TEXT,
        site_desc        TEXT,
        site_keywords    TEXT,
        canonical        TEXT DEFAULT 'https://animehunt.in',
        indexing         TEXT DEFAULT 'index',
        home_title       TEXT,
        home_desc        TEXT,
        home_keywords    TEXT,
        home_og          TEXT,
        tpl_anime        TEXT DEFAULT '{title} Hindi Dubbed – Watch Online | AnimeHunt',
        tpl_category     TEXT,
        tpl_episode      TEXT,
        tpl_search       TEXT,
        tpl_movie        TEXT,
        tpl_cartoon      TEXT,
        og_title         TEXT,
        og_desc          TEXT,
        tw_title         TEXT,
        tw_desc          TEXT,
        tw_card          TEXT DEFAULT 'summary_large_image',
        schema_org       INTEGER DEFAULT 1,
        auto_meta        INTEGER DEFAULT 1,
        auto_sitemap     INTEGER DEFAULT 0,
        sitemap_freq     TEXT DEFAULT 'daily',
        sitemap_priority TEXT DEFAULT '0.8',
        robots_index     TEXT DEFAULT 'index, follow',
        robots_noindex   TEXT DEFAULT 'noindex, nofollow',
        lang             TEXT DEFAULT 'hi-IN',
        updated_at       TEXT
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

    // ✅ FIX (audit ISSUE-015): this was missing frozen/emergency/version/
    // environment — present in both deploy.js's own definition and
    // schema.sql. Since ensureTables() runs lazily per-request (not at
    // boot), whichever admin page (ai-brain.html or deploy-backup.html) an
    // admin visits first on a fresh database determined this table's real
    // columns — if this narrower version ran first, deploy.js's later
    // "UPDATE deploy_state SET frozen=?..." would fail with "no such
    // column: frozen." Matching the full definition here removes the
    // race entirely.
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
      // ✅ FIX (audit ISSUE-016): "UPDATE ... LIMIT 1" is not valid SQLite/
      // libSQL syntax (LIMIT on UPDATE requires a non-default SQLite compile
      // flag Turso doesn't enable) — this threw inside safeRun(), which
      // caught it and returned false, silently reporting "skipped" every
      // time. Auto-failover — the one thing meant to bring a backup server
      // online when all others are down — never actually executed. A
      // subquery scoped with its own LIMIT is the portable equivalent.
      const ok = await safeRun(db, `
        UPDATE servers SET active=1
        WHERE id = (
          SELECT id FROM servers
          WHERE fail_count = 0 AND active=0
          LIMIT 1
        )
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

  /* ✅ FIX (audit): trending_banners' WHERE page='trending' could never
     match any row — banners.page has a CHECK constraint limiting it to
     ('home','anime','cartoon','series','movies','search','episode',
     'download','category'), confirmed against both schema.sql and
     banners.html's admin dropdown (same 9 values, no 'trending' option).
     This setting has been a silent, permanent no-op: safeRun() reports
     success even when zero rows match, so it always logged "ran" while
     doing nothing. There's also no structural link between banners and
     "trending" anime to build a correct version of this from (banners
     has no anime_id/category-to-anime relationship in the current
     schema) — reporting that explicitly rather than continuing to claim
     a result that was never real. */
  if (cfg.trending_banners) {
    changes.trending_banners = "unsupported_no_trending_page_value"
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

        // ✅ FIX (audit): this INSERT OR REPLACE only listed 6 of
        // seo_meta's 8 columns — keywords/schema_json were missing
        // (confirmed against schema.sql and seoAdmin.js's own 8-column
        // batch-insert, which DOES populate both). INSERT OR REPLACE
        // replaces the ENTIRE row, so every time this auto-run engine
        // fired for an anime that already had keywords/schema_json set
        // via seoAdmin.js's "Bulk Generate SEO" feature, this would
        // silently wipe both back to NULL. Preserve whatever the
        // existing row already has for those two columns.
        const existingMeta = await safeFirst(db,
          "SELECT keywords, schema_json FROM seo_meta WHERE id=?", [a.id]
        )

        await safeRun(db, `
          INSERT OR REPLACE INTO seo_meta (id,type,meta_title,meta_desc,keywords,og_image,schema_json,updated_at)
          VALUES (?,?,?,?,?,?,?,?)
        `, [
          a.id, a.type || "anime", metaTitle, metaDesc,
          existingMeta?.keywords    ?? null,
          a.poster || "",
          existingMeta?.schema_json ?? null,
          now()
        ])
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

/* DOWNLOAD ENGINE
   ✅ FIX (audit): this used to target a table called `downloads` (id,
   episode_id, quality, url, active) — a legacy/simpler design this file
   itself CREATE TABLE IF NOT EXISTS's, but confirmed via a full-codebase
   search that no route anywhere ever INSERTs into it. The real, actively-
   used download-link tables are download_host_entries.direct_download
   (non-knight hosts, one URL) and download_links.link (knight hosts,
   one row per quality) — see downloads.js/downloadsAdmin.js. This engine
   was therefore running its cleanup queries against an always-empty
   table every cron cycle: no error, "cleaned"/successful status reported,
   but doing nothing whatsoever to real download links. Rewritten to
   validate the tables that actually hold link data. */
async function downloadEngine(db, cfg) {
  const changes = {}

  if (cfg.link_validation) {
    /* Non-knight hosts: direct_download URL lives on download_host_entries */
    const ok1 = await safeRun(db, `
      UPDATE download_host_entries
      SET status='broken'
      WHERE knight=0
        AND (direct_download IS NULL OR TRIM(direct_download)=''
             OR direct_download LIKE '%example.com%'
             OR direct_download LIKE '%localhost%'
             OR direct_download LIKE '%127.0.0.1%')
        AND status='active'
    `)

    /* Knight hosts: per-quality URLs live on download_links; if a host
       entry has zero remaining valid quality links, flag the entry too */
    const ok2 = await safeRun(db, `
      DELETE FROM download_links
      WHERE link IS NULL OR TRIM(link)=''
        OR link LIKE '%example.com%' OR link LIKE '%localhost%' OR link LIKE '%127.0.0.1%'
    `)

    const ok3 = await safeRun(db, `
      UPDATE download_host_entries
      SET status='broken'
      WHERE knight=1
        AND status='active'
        AND id NOT IN (SELECT DISTINCT host_entry_id FROM download_links)
    `)

    changes.link_validation = (ok1 && ok2 && ok3) ? "cleaned" : "partial"
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
