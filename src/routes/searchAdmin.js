/* ================================================
   searchAdmin.js — Search Settings + Analytics
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

/* ================================================
   DEFAULT SETTINGS — used when no row exists
================================================ */

const DEFAULTS = {
  enableSearch:    1,
  liveSearch:      1,
  mode:            "debounce",
  debounce:        300,
  ranking_mode:    "smart",
  ranking_boost:   1,
  ranking_weight:  5,
  src_anime:       1,
  src_episode:     1,
  src_category:    1,
  src_pages:       0,
  smart_typo:      1,
  smart_alias:     1,
  smart_language:  "all",
  ui_max:          8,
  ui_thumb:        1,
  ui_group:        1,
  ui_highlight:    1,
  safe_mode:       "medium",
  track_popular:   1,
  seo_urls:        1,
  cache_seconds:   60,
  updated_at:      now()
}

/* ================================================
   FORMAT ROW → API response
================================================ */

function formatRow(row) {
  return {
    enableSearch: !!row.enableSearch,
    liveSearch:   !!row.liveSearch,
    mode:         row.mode       || "debounce",
    debounce:     row.debounce   || 300,
    ranking: {
      mode:   row.ranking_mode   || "smart",
      boost:  !!row.ranking_boost,
      weight: row.ranking_weight || 5
    },
    sources: {
      anime:    !!row.src_anime,
      episode:  !!row.src_episode,
      category: !!row.src_category,
      pages:    !!row.src_pages
    },
    smart: {
      typo:     !!row.smart_typo,
      alias:    !!row.smart_alias,
      language: row.smart_language || "all"
    },
    ui: {
      max:       row.ui_max       || 8,
      thumb:     !!row.ui_thumb,
      group:     !!row.ui_group,
      highlight: !!row.ui_highlight
    },
    safety: {
      safe:  row.safe_mode      || "medium",
      track: !!row.track_popular,
      seo:   !!row.seo_urls,
      cache: row.cache_seconds  || 60
    },
    updated_at: row.updated_at
  }
}

/* ================================================
   ENSURE TABLE + DEFAULT ROW EXISTS
================================================ */

async function ensureRow(db) {
  try {
    /* Create table if not exists */
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS search_settings (
        id              INTEGER PRIMARY KEY DEFAULT 1,
        enableSearch    INTEGER DEFAULT 1,
        liveSearch      INTEGER DEFAULT 1,
        mode            TEXT    DEFAULT 'debounce',
        debounce        INTEGER DEFAULT 300,
        ranking_mode    TEXT    DEFAULT 'smart',
        ranking_boost   INTEGER DEFAULT 1,
        ranking_weight  INTEGER DEFAULT 5,
        src_anime       INTEGER DEFAULT 1,
        src_episode     INTEGER DEFAULT 1,
        src_category    INTEGER DEFAULT 1,
        src_pages       INTEGER DEFAULT 0,
        smart_typo      INTEGER DEFAULT 1,
        smart_alias     INTEGER DEFAULT 1,
        smart_language  TEXT    DEFAULT 'all',
        ui_max          INTEGER DEFAULT 8,
        ui_thumb        INTEGER DEFAULT 1,
        ui_group        INTEGER DEFAULT 1,
        ui_highlight    INTEGER DEFAULT 1,
        safe_mode       TEXT    DEFAULT 'medium',
        track_popular   INTEGER DEFAULT 1,
        seo_urls        INTEGER DEFAULT 1,
        cache_seconds   INTEGER DEFAULT 60,
        updated_at      TEXT
      )
    `).run()

    /* Insert default row if missing */
    const row = await db.prepare("SELECT id FROM search_settings WHERE id=1").first()
    if (!row) {
      await db.prepare(`
        INSERT INTO search_settings (
          id,enableSearch,liveSearch,mode,debounce,
          ranking_mode,ranking_boost,ranking_weight,
          src_anime,src_episode,src_category,src_pages,
          smart_typo,smart_alias,smart_language,
          ui_max,ui_thumb,ui_group,ui_highlight,
          safe_mode,track_popular,seo_urls,cache_seconds,updated_at
        ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        DEFAULTS.enableSearch, DEFAULTS.liveSearch,
        DEFAULTS.mode, DEFAULTS.debounce,
        DEFAULTS.ranking_mode, DEFAULTS.ranking_boost, DEFAULTS.ranking_weight,
        DEFAULTS.src_anime, DEFAULTS.src_episode,
        DEFAULTS.src_category, DEFAULTS.src_pages,
        DEFAULTS.smart_typo, DEFAULTS.smart_alias, DEFAULTS.smart_language,
        DEFAULTS.ui_max, DEFAULTS.ui_thumb, DEFAULTS.ui_group, DEFAULTS.ui_highlight,
        DEFAULTS.safe_mode, DEFAULTS.track_popular,
        DEFAULTS.seo_urls, DEFAULTS.cache_seconds, now()
      ).run()
    }
  } catch (err) {
    console.error("ensureRow error:", err)
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, settings) {
  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    fetch(`${env.TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO search_settings (
              id,enableSearch,liveSearch,mode,debounce,
              ranking_mode,ranking_boost,ranking_weight,
              src_anime,src_episode,src_category,src_pages,
              smart_typo,smart_alias,smart_language,
              ui_max,ui_thumb,ui_group,ui_highlight,
              safe_mode,track_popular,seo_urls,cache_seconds,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: Object.values(settings).map(v => ({
              type: typeof v === "number" ? "integer" : "text",
              value: v
            }))
          }
        }]
      })
    }).catch(e => console.error("Turso sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/search_settings?id=eq.1`, {
      method:  "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates"
      },
      body: JSON.stringify(settings)
    }).catch(e => console.error("Supabase sync:", e))
  }
}

/* ================================================
   GET /search — Get Settings
================================================ */

app.get("/search", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)

    const row = await db.prepare(
      "SELECT * FROM search_settings WHERE id=1"
    ).first()

    if (!row) {
      return c.json(success(formatRow(DEFAULTS)))
    }

    return c.json(success(formatRow(row)))

  } catch (err) {
    console.error("search GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /search — Save Settings
================================================ */

app.post("/search", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    await ensureRow(db)

    const timestamp = now()

    const settings = {
      enableSearch:   bool(body.enableSearch),
      liveSearch:     bool(body.liveSearch),
      mode:           body.mode           || "debounce",
      debounce:       Number(body.debounce   || 300),
      ranking_mode:   body.ranking?.mode  || "smart",
      ranking_boost:  bool(body.ranking?.boost),
      ranking_weight: Number(body.ranking?.weight || 5),
      src_anime:      bool(body.sources?.anime),
      src_episode:    bool(body.sources?.episode),
      src_category:   bool(body.sources?.category),
      src_pages:      bool(body.sources?.pages),
      smart_typo:     bool(body.smart?.typo),
      smart_alias:    bool(body.smart?.alias),
      smart_language: body.smart?.language || "all",
      ui_max:         Number(body.ui?.max     || 8),
      ui_thumb:       bool(body.ui?.thumb),
      ui_group:       bool(body.ui?.group),
      ui_highlight:   bool(body.ui?.highlight),
      safe_mode:      body.safety?.safe  || "medium",
      track_popular:  bool(body.safety?.track),
      seo_urls:       bool(body.safety?.seo),
      cache_seconds:  Number(body.safety?.cache || 60),
      updated_at:     timestamp
    }

    await db.prepare(`
      UPDATE search_settings SET
        enableSearch=?,liveSearch=?,mode=?,debounce=?,
        ranking_mode=?,ranking_boost=?,ranking_weight=?,
        src_anime=?,src_episode=?,src_category=?,src_pages=?,
        smart_typo=?,smart_alias=?,smart_language=?,
        ui_max=?,ui_thumb=?,ui_group=?,ui_highlight=?,
        safe_mode=?,track_popular=?,seo_urls=?,
        cache_seconds=?,updated_at=?
      WHERE id=1
    `).bind(
      settings.enableSearch, settings.liveSearch,
      settings.mode, settings.debounce,
      settings.ranking_mode, settings.ranking_boost, settings.ranking_weight,
      settings.src_anime, settings.src_episode,
      settings.src_category, settings.src_pages,
      settings.smart_typo, settings.smart_alias, settings.smart_language,
      settings.ui_max, settings.ui_thumb, settings.ui_group, settings.ui_highlight,
      settings.safe_mode, settings.track_popular,
      settings.seo_urls, settings.cache_seconds,
      settings.updated_at
    ).run()

    syncToReplicas(c.env, settings)

    return c.json(success({ saved: true, updated_at: timestamp }))

  } catch (err) {
    console.error("search POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /search/reset — Reset to defaults
================================================ */

app.post("/search/reset", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()

    await ensureRow(db)

    await db.prepare(`
      UPDATE search_settings SET
        enableSearch=?,liveSearch=?,mode=?,debounce=?,
        ranking_mode=?,ranking_boost=?,ranking_weight=?,
        src_anime=?,src_episode=?,src_category=?,src_pages=?,
        smart_typo=?,smart_alias=?,smart_language=?,
        ui_max=?,ui_thumb=?,ui_group=?,ui_highlight=?,
        safe_mode=?,track_popular=?,seo_urls=?,
        cache_seconds=?,updated_at=?
      WHERE id=1
    `).bind(
      DEFAULTS.enableSearch, DEFAULTS.liveSearch,
      DEFAULTS.mode, DEFAULTS.debounce,
      DEFAULTS.ranking_mode, DEFAULTS.ranking_boost, DEFAULTS.ranking_weight,
      DEFAULTS.src_anime, DEFAULTS.src_episode,
      DEFAULTS.src_category, DEFAULTS.src_pages,
      DEFAULTS.smart_typo, DEFAULTS.smart_alias, DEFAULTS.smart_language,
      DEFAULTS.ui_max, DEFAULTS.ui_thumb, DEFAULTS.ui_group, DEFAULTS.ui_highlight,
      DEFAULTS.safe_mode, DEFAULTS.track_popular,
      DEFAULTS.seo_urls, DEFAULTS.cache_seconds,
      timestamp
    ).run()

    return c.json(success({ reset: true, updated_at: timestamp }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/popular — Popular search queries
================================================ */

app.get("/search/popular", async (c) => {
  try {
    const db    = c.env.DB
    const limit = Number(c.req.query("limit") || 20)

    /* Create table if not exists */
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        query      TEXT NOT NULL,
        results    INTEGER DEFAULT 0,
        created_at TEXT
      )
    `).run()

    const { results } = await db.prepare(`
      SELECT query, COUNT(*) as count, MAX(created_at) as last_searched
      FROM search_logs
      GROUP BY LOWER(query)
      ORDER BY count DESC
      LIMIT ?
    `).bind(limit).all()

    return c.json(success(results || []))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /search/log — Log a search query (public)
================================================ */

app.post("/search/log", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    if (!body.query?.trim()) return c.json(success({}))

    /* Check tracking enabled */
    const settings = await db.prepare(
      "SELECT track_popular FROM search_settings WHERE id=1"
    ).first()

    if (!settings?.track_popular) return c.json(success({}))

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        results INTEGER DEFAULT 0,
        created_at TEXT
      )
    `).run()

    await db.prepare(
      "INSERT INTO search_logs (query,results,created_at) VALUES (?,?,?)"
    ).bind(
      body.query.trim().toLowerCase(),
      Number(body.results || 0),
      now()
    ).run()

    return c.json(success({}))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /search/popular — Clear search logs
================================================ */

app.delete("/search/popular", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM search_logs").run()
    return c.json(success({ cleared: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/test — Test search live
================================================ */

app.get("/search/test", async (c) => {
  try {
    const db    = c.env.DB
    const query = c.req.query("q") || ""

    if (!query.trim()) return c.json(success({ results: [], query: "" }))

    const { results } = await db.prepare(`
      SELECT id,title,slug,type,status,poster,rating
      FROM anime
      WHERE title LIKE ? AND is_hidden=0
      ORDER BY rating DESC
      LIMIT 10
    `).bind(`%${query}%`).all()

    return c.json(success({ query, results: results || [] }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
