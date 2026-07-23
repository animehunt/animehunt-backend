/* ================================================
   ANIMEHUNT — SEARCH ADMIN (FINAL — ALL ISSUES FIXED)
   File: src/routes/searchAdmin.js
   Auth handled by adminAuth middleware in index.js

   BUGS FIXED:
   ✅ Bug #21: /search/log admin-only (middleware protects)
   ✅ FIXED: FTS5 rebuild-index — D1 batch limit 100 max
              Large anime sets split into chunks of 100
   ✅ FIXED: FTS5 DELETE — used INSERT INTO anime_fts(anime_fts) VALUES('delete-all')
              instead of plain DELETE which breaks content table
   ✅ All settings/analytics routes preserved

   ROUTES (all protected by adminAuth middleware):
   GET    /search               — Get settings
   POST   /search               — Save settings
   POST   /search/reset         — Reset defaults
   GET    /search/popular       — Popular queries
   POST   /search/log           — Log search (admin only)
   DELETE /search/popular       — Clear logs
   GET    /search/test          — Test search
   GET    /search/logs          — Paginated raw logs
   GET    /search/top-queries   — Analytics
   GET    /search/zero-results  — Zero-result queries
   POST   /search/rebuild-index — Rebuild FTS5 (chunked)
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

/* ================================================
   DEFAULTS
================================================ */

const DEFAULTS = {
  enableSearch:   1,
  liveSearch:     1,
  mode:           "debounce",
  debounce:       300,
  ranking_mode:   "smart",
  ranking_boost:  1,
  ranking_weight: 5,
  src_anime:      1,
  src_episode:    1,
  src_category:   1,
  src_pages:      0,
  smart_typo:     1,
  smart_alias:    1,
  smart_language: "all",
  ui_max:         8,
  ui_thumb:       1,
  ui_group:       1,
  ui_highlight:   1,
  safe_mode:      "medium",
  track_popular:  1,
  seo_urls:       1,
  cache_seconds:  60,
  updated_at:     ""
}

/* ================================================
   FORMAT ROW
================================================ */

function formatRow(row) {
  return {
    enableSearch: !!row.enableSearch,
    liveSearch:   !!row.liveSearch,
    mode:         row.mode      || "debounce",
    debounce:     row.debounce  || 300,
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
      max:       row.ui_max      || 8,
      thumb:     !!row.ui_thumb,
      group:     !!row.ui_group,
      highlight: !!row.ui_highlight
    },
    safety: {
      safe:  row.safe_mode     || "medium",
      track: !!row.track_popular,
      seo:   !!row.seo_urls,
      cache: row.cache_seconds || 60
    },
    updated_at: row.updated_at
  }
}

/* ================================================
   ENSURE TABLES
================================================ */

async function ensureSettingsRow(db) {
  try {
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
    console.error("ensureSettingsRow:", err)
  }
}

async function ensureLogsTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        query      TEXT NOT NULL,
        results    INTEGER DEFAULT 0,
        ip         TEXT DEFAULT '',
        created_at TEXT
      )
    `).run()
  } catch (err) {
    console.error("ensureLogsTable:", err)
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

function syncToReplicas(env, settings) {
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
            sql: `INSERT OR REPLACE INTO search_settings (
              id,enableSearch,liveSearch,mode,debounce,
              ranking_mode,ranking_boost,ranking_weight,
              src_anime,src_episode,src_category,src_pages,
              smart_typo,smart_alias,smart_language,
              ui_max,ui_thumb,ui_group,ui_highlight,
              safe_mode,track_popular,seo_urls,cache_seconds,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              settings.enableSearch, settings.liveSearch,
              settings.mode, settings.debounce,
              settings.ranking_mode, settings.ranking_boost, settings.ranking_weight,
              settings.src_anime, settings.src_episode,
              settings.src_category, settings.src_pages,
              settings.smart_typo, settings.smart_alias, settings.smart_language,
              settings.ui_max, settings.ui_thumb, settings.ui_group, settings.ui_highlight,
              settings.safe_mode, settings.track_popular,
              settings.seo_urls, settings.cache_seconds, settings.updated_at
            ].map(v => ({
              type:  typeof v === "number" ? "integer" : "text",
              value: String(v ?? "")
            }))
          }
        }]
      })
    }).catch(e => console.error("Turso sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/search_settings?id=eq.1`, {
      method: "PATCH",
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
   GET /search — Settings
================================================ */

app.get("/search", async (c) => {
  try {
    const db = c.env.DB
    await ensureSettingsRow(db)
    const row = await db.prepare("SELECT * FROM search_settings WHERE id=1").first()
    return c.json(success(formatRow(row || DEFAULTS)))
  } catch (err) {
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
    await ensureSettingsRow(db)

    const timestamp = now()
    const settings  = {
      enableSearch:   bool(body.enableSearch),
      liveSearch:     bool(body.liveSearch),
      mode:           body.mode            || "debounce",
      debounce:       Number(body.debounce || 300),
      ranking_mode:   body.ranking?.mode   || "smart",
      ranking_boost:  bool(body.ranking?.boost),
      ranking_weight: Number(body.ranking?.weight || 5),
      src_anime:      bool(body.sources?.anime),
      src_episode:    bool(body.sources?.episode),
      src_category:   bool(body.sources?.category),
      src_pages:      bool(body.sources?.pages),
      smart_typo:     bool(body.smart?.typo),
      smart_alias:    bool(body.smart?.alias),
      smart_language: body.smart?.language || "all",
      ui_max:         Number(body.ui?.max  || 8),
      ui_thumb:       bool(body.ui?.thumb),
      ui_group:       bool(body.ui?.group),
      ui_highlight:   bool(body.ui?.highlight),
      safe_mode:      body.safety?.safe   || "medium",
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
      settings.seo_urls, settings.cache_seconds, settings.updated_at
    ).run()

    syncToReplicas(c.env, settings)

    return c.json(success({ saved: true, updated_at: timestamp }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /search/reset — Reset Defaults
================================================ */

app.post("/search/reset", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()
    await ensureSettingsRow(db)

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
      DEFAULTS.seo_urls, DEFAULTS.cache_seconds, timestamp
    ).run()

    return c.json(success({ reset: true, updated_at: timestamp }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/popular — Admin view (with days filter)
================================================ */

app.get("/search/popular", async (c) => {
  try {
    const db    = c.env.DB
    const _lim  = parseInt(c.req.query("limit") || "50"); const limit = Math.min(100, isNaN(_lim) ? 50 : Math.max(1, _lim))
    const _days = parseInt(c.req.query("days")  || "30"); const days  = Math.min(90,  isNaN(_days)? 30 : Math.max(1, _days))

    await ensureLogsTable(db)

    const { results } = await db.prepare(`
      SELECT query, COUNT(*) as count,
             MAX(created_at) as last_searched,
             AVG(results) as avg_results
      FROM search_logs
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY LOWER(query)
      ORDER BY count DESC
      LIMIT ?
    `).bind(days, limit).all()

    return c.json(success(results || []))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /search/log — ADMIN ONLY (Bug #21 Fix)
   Protected by adminAuth middleware in index.js
================================================ */

app.post("/search/log", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    if (!body.query?.trim()) return c.json(success({}))

    const settings = await db.prepare(
      "SELECT track_popular FROM search_settings WHERE id=1"
    ).first().catch(() => null)

    if (!settings?.track_popular) return c.json(success({ skipped: true }))

    await ensureLogsTable(db)

    await db.prepare(
      "INSERT INTO search_logs (query, results, ip, created_at) VALUES (?, ?, ?, ?)"
    ).bind(
      body.query.trim().toLowerCase().substring(0, 100),
      Number(body.results || 0),
      body.ip || "admin",
      now()
    ).run()

    return c.json(success({ logged: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /search/popular — Clear logs
================================================ */

app.delete("/search/popular", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM search_logs").run()
    if (c.env.KV) await c.env.KV.delete("search:popular").catch(() => {})
    return c.json(success({ cleared: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/test — Live search test
================================================ */

app.get("/search/test", async (c) => {
  try {
    const db    = c.env.DB
    const query = (c.req.query("q") || "").trim()

    if (!query) return c.json(success({ results: [], query: "" }))

    const { results } = await db.prepare(`
      SELECT id, title, slug, type, status, poster, rating
      FROM anime
      WHERE title LIKE ? AND is_hidden=0 AND active=1
      ORDER BY rating DESC
      LIMIT 20
    `).bind(`%${query}%`).all()

    return c.json(success({ query, results: results || [] }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/logs — Paginated raw logs
================================================ */

app.get("/search/logs", async (c) => {
  try {
    const db       = c.env.DB
    const _lp      = parseInt(c.req.query("page")  || "1");  const page  = (isNaN(_lp)  || _lp  < 1) ? 1  : _lp
    const _ll      = parseInt(c.req.query("limit") || "50"); const limit = Math.min(100, isNaN(_ll) ? 50 : Math.max(1, _ll))
    const offset   = (page - 1) * limit
    const dateFrom = c.req.query("from")
    const dateTo   = c.req.query("to")

    await ensureLogsTable(db)

    let sql      = "SELECT * FROM search_logs"
    let countSql = "SELECT COUNT(*) as total FROM search_logs"
    const params      = []
    // ✅ FIX (audit ISSUE-035): countParams tracks its own bind list —
    // the count query previously ignored dateFrom/dateTo entirely, so
    // pagination.total (and any "X of Y" UI derived from it) was wrong
    // whenever a date filter was active — e.g. filtering to "last 7 days"
    // could show 50 matching rows on the page while total reported the
    // count across all history.
    const countParams = []
    const conds  = []

    if (dateFrom) { conds.push("created_at >= ?"); params.push(dateFrom); countParams.push(dateFrom) }
    if (dateTo)   { conds.push("created_at <= ?"); params.push(dateTo);   countParams.push(dateTo) }
    if (conds.length) {
      const whereClause = " WHERE " + conds.join(" AND ")
      sql      += whereClause
      countSql += whereClause
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.push(limit, offset)

    const [logs, total] = await Promise.all([
      db.prepare(sql).bind(...params).all(),
      db.prepare(countSql).bind(...countParams).first()
    ])

    return c.json(success({
      logs:       logs.results,
      pagination: { page, limit, total: total?.total || 0 }
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/top-queries — Analytics
================================================ */

app.get("/search/top-queries", async (c) => {
  try {
    const db    = c.env.DB
    const _tqd  = parseInt(c.req.query("days") || "7")
    const days  = Math.min(90, isNaN(_tqd) ? 7 : Math.max(1, _tqd))

    await ensureLogsTable(db)

    const { results } = await db.prepare(`
      SELECT query, COUNT(*) as count, AVG(results) as avg_results
      FROM search_logs
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY LOWER(query)
      ORDER BY count DESC
      LIMIT 50
    `).bind(days).all()

    return c.json(success({ queries: results, days }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /search/zero-results — Zero result queries
================================================ */

app.get("/search/zero-results", async (c) => {
  try {
    const db    = c.env.DB
    const _zrl  = parseInt(c.req.query("limit") || "30")
    const limit = Math.min(50, isNaN(_zrl) ? 30 : Math.max(1, _zrl))

    await ensureLogsTable(db)

    const { results } = await db.prepare(`
      SELECT query, COUNT(*) as searches, MAX(created_at) as last_seen
      FROM search_logs
      WHERE results = 0
      GROUP BY LOWER(query)
      ORDER BY searches DESC
      LIMIT ?
    `).bind(limit).all()

    return c.json(success(results || []))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /search/rebuild-index — Rebuild FTS5 index
   FIXED (Issue #14): Correct FTS5 delete syntax
   FIXED (Issue #23): D1 batch limit 100 — chunked processing
   Accepts ?offset= for pagination (client calls repeatedly)
================================================ */

app.post("/search/rebuild-index", async (c) => {
  try {
    const db       = c.env.DB
    const CHUNK    = 100  // D1 batch max = 100 statements
    const rawOff   = parseInt(c.req.query("offset") || "0")
    const offset   = (isNaN(rawOff) || rawOff < 0) ? 0 : rawOff
    const isFirst  = offset === 0

    // Create FTS5 virtual table
    // MIGRATION FIX: this was external-content mode (content='anime',
    // content_rowid='id'), which requires content_rowid to be an actual
    // SQLite integer rowid. anime.id is TEXT (crypto.randomUUID(), see the
    // schema audit) — confirmed via direct testing that external-content
    // mode throws "datatype mismatch" the moment a real UUID gets inserted.
    // Switched to a standalone FTS5 table with id as a regular UNINDEXED
    // column instead — verified working end-to-end with a real TEXT id.
    await db.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS anime_fts USING fts5(
        id UNINDEXED,
        title, description, genres
      )
    `).run()

    // MIGRATION FIX: the special 'delete-all' command is specifically for
    // external-content FTS5 tables (which this no longer is) — a plain
    // DELETE is the correct, tested way to clear a standalone FTS5 table.
    if (isFirst) {
      try {
        await db.prepare("DELETE FROM anime_fts").run()
      } catch {
        // Fallback: table might not have data yet, ignore error
      }
    }

    // Fetch ONE chunk only per request (D1 batch limit = 100)
    const { results: animeList } = await db.prepare(`
      SELECT id, title, description, genres
      FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `).bind(CHUNK, offset).all()

    if (!animeList.length) {
      return c.json(success({
        done:    true,
        indexed: 0,
        message: "FTS5 index rebuild complete"
      }))
    }

    // Batch insert this chunk (max 100 at a time — D1 limit safe)
    // MIGRATION FIX: id goes into the real 'id' column now, not rowid.
    const stmts = animeList.map(a =>
      db.prepare(
        "INSERT INTO anime_fts (id, title, description, genres) VALUES (?, ?, ?, ?)"
      ).bind(a.id, a.title || "", a.description || "", a.genres || "")
    )
    await db.batch(stmts)

    const nextOffset = offset + CHUNK

    return c.json(success({
      done:       false,
      indexed:    animeList.length,
      nextOffset,
      message:    `Indexed ${animeList.length} anime. Call again with offset=${nextOffset}`
    }))

  } catch (err) {
    console.error("FTS rebuild:", err)
    return c.json(failure(err.message), 500)
  }
})

export default app
