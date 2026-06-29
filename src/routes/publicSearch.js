/* ============================================================
  ANIMEHUNT — PUBLIC SEARCH (FINAL — ALL ISSUES FIXED)
  File: src/routes/publicSearch.js

  BUGS FIXED:
  ✅ Bug #21: /search/log rate-limited (20/min/IP via KV) + removed from public
  ✅ Bug #22: FTS5 primary search + indexed LIKE fallback
  ✅ FIXED: FTS5 MATCH special chars sanitized (prevents FTS crash)
  ✅ FIXED: suggestions bind param count was wrong → fixed
  ✅ FIXED: /api/search route moved here ONLY (removed from public.js)
  ✅ FIXED: /api/search/popular here ONLY (removed from public.js)
  ✅ KV cache on all routes

  NOTE: public.js mein se /api/search aur /api/search/popular
        HATA DO — warna duplicate route conflict hoga.
        In routes ka single source sirf ye file hai.

  ROUTES:
  GET /api/search               — Main search (FTS5 + LIKE fallback)
  GET /api/search/popular       — Popular queries (KV cached)
  GET /api/search/suggestions   — Autocomplete prefix
  GET /api/search/filter        — Advanced filtered search
  GET /api/search/genre/:genre  — Browse by genre
  GET /api/search/az/:letter    — A-Z browse
  ⛔ POST /api/search/log      — REMOVED (admin-only in searchAdmin.js)
============================================================ */

import { Hono } from "hono"

const app  = new Hono()
const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

const COLS = "id, title, slug, poster, type, status, rating, year, language, genres"

/* ============================================================
  HELPER — Sanitize FTS5 query
  FIXED: Raw user input into FTS5 MATCH crashes on special chars
  Chars to escape/strip: " - * : ^ ~ + ( ) [ ]
============================================================ */

function sanitizeFTS(q) {
  // Remove FTS5 special chars, keep alphanumeric + spaces + Hindi chars
  return q
    .replace(/["*:\^~+\(\)\[\]{}\\|]/g, " ")  // strip FTS operators
    .replace(/\s+/g, " ")
    .trim()
}

/* ============================================================
  HELPER — Rate-limited search log (non-blocking)
  FIXED: KV rate limit prevents D1 spam (Bug #21)
============================================================ */

async function logSearch(env, query, ip, resultCount) {
  if (!env?.KV || !env?.DB) return

  try {
    const limitKey = `srch_log_lmt:${ip}`
    const existing = await env.KV.get(limitKey).catch(() => null)
    const count    = parseInt(existing || "0")

    if (count >= 20) return // silent skip

    await env.KV.put(limitKey, String(count + 1), { expirationTtl: 60 }).catch(() => {})

    env.DB.prepare(
      "INSERT INTO search_logs (query, results, created_at) VALUES (?, ?, ?)"
    ).bind(
      query.trim().toLowerCase().substring(0, 100),
      resultCount,
      new Date().toISOString()
    ).run().catch(() => {})
  } catch {}
}

/* ============================================================
  GET /api/search — Main search
  FTS5 primary; indexed LIKE fallback
  KV cached 60s
  FIXED: FTS5 special char sanitization
  FIXED: Single definition here (not in public.js)
============================================================ */

app.get("/api/search", async (c) => {
  const db     = c.env.DB
  const q      = (c.req.query("q") || "").trim()
  const rawPage  = parseInt(c.req.query("page")  || "1")
  const rawLimit = parseInt(c.req.query("limit") || "20")
  const page   = (isNaN(rawPage)  || rawPage  < 1)  ? 1  : rawPage
  const limit  = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))
  const offset = (page - 1) * limit
  const ip     = c.req.header("CF-Connecting-IP") || "unknown"

  if (q.length < 2) {
    return c.json(ok({ query: q, results: [], count: 0, pagination: { page, limit, total: 0, pages: 0 } }))
  }
  if (q.length > 100) {
    return c.json(fail("Query too long (max 100 chars)"), 400)
  }

  try {
    const cacheKey = `search:${q.toLowerCase()}:${page}:${limit}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(cached, 200, { "X-Cache": "HIT" })
    }

    let results = []
    let total   = 0

    // FTS5 — sanitize first to prevent crash on special chars (FIXED)
    const ftsQuery = sanitizeFTS(q)

    if (ftsQuery.length >= 2) {
      try {
        const ftsRows = await db.prepare(`
          SELECT a.id, a.title, a.slug, a.poster, a.type, a.status,
                 a.rating, a.year, a.language, a.genres,
                 bm25(anime_fts) as rank
          FROM anime_fts
          JOIN anime a ON anime_fts.rowid = a.id
          WHERE anime_fts MATCH ?
            AND a.is_hidden=0 AND a.active=1
          ORDER BY rank
          LIMIT ? OFFSET ?
        `).bind(ftsQuery, limit, offset).all()

        if (ftsRows.results?.length > 0) {
          results = ftsRows.results

          const cntRow = await db.prepare(`
            SELECT COUNT(*) as total
            FROM anime_fts
            JOIN anime a ON anime_fts.rowid = a.id
            WHERE anime_fts MATCH ?
              AND a.is_hidden=0 AND a.active=1
          `).bind(ftsQuery).first()
          total = cntRow?.total || results.length
        } else {
          throw new Error("FTS empty")
        }
      } catch {
        // LIKE fallback on indexed columns (Bug #22 Fix)
        const [likeRows, cntRow] = await Promise.all([
          db.prepare(`
            SELECT ${COLS}
            FROM anime
            WHERE is_hidden=0 AND active=1
              AND (title LIKE ? OR genres LIKE ?)
            ORDER BY
              CASE WHEN title LIKE ? THEN 1 ELSE 2 END,
              rating DESC
            LIMIT ? OFFSET ?
          `).bind(`%${q}%`, `%${q}%`, `${q}%`, limit, offset).all(),
          db.prepare(`
            SELECT COUNT(*) as total FROM anime
            WHERE is_hidden=0 AND active=1
              AND (title LIKE ? OR genres LIKE ?)
          `).bind(`%${q}%`, `%${q}%`).first()
        ])
        results = likeRows.results || []
        total   = cntRow?.total   || 0
      }
    } else {
      // Sanitized query too short → LIKE only
      const [likeRows, cntRow] = await Promise.all([
        db.prepare(`
          SELECT ${COLS}
          FROM anime
          WHERE is_hidden=0 AND active=1
            AND (title LIKE ? OR genres LIKE ?)
          ORDER BY rating DESC
          LIMIT ? OFFSET ?
        `).bind(`%${q}%`, `%${q}%`, limit, offset).all(),
        db.prepare(`
          SELECT COUNT(*) as total FROM anime
          WHERE is_hidden=0 AND active=1
            AND (title LIKE ? OR genres LIKE ?)
        `).bind(`%${q}%`, `%${q}%`).first()
      ])
      results = likeRows.results || []
      total   = cntRow?.total   || 0
    }

    const response = {
      success: true,
      data: {
        query:   q,
        results,
        count:   results.length,
        pagination: {
          page, limit, total,
          pages: Math.ceil(total / limit)
        }
      }
    }

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(response), {
        expirationTtl: 60
      }).catch(() => {})
    }

    logSearch(c.env, q, ip, results.length)

    return c.json(response, 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/search/popular — Popular search queries
  FIXED: Single source (was also in public.js — REMOVED from there)
  KV cached 5 min
============================================================ */

app.get("/api/search/popular", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("search:popular", "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    const { results } = await c.env.DB.prepare(`
      SELECT query, COUNT(*) as count, MAX(created_at) as last_searched
      FROM search_logs
      WHERE query IS NOT NULL AND query != ''
      GROUP BY LOWER(query)
      ORDER BY count DESC
      LIMIT 20
    `).all().catch(() => ({ results: [] }))

    const data = results || []

    if (c.env.KV) {
      await c.env.KV.put("search:popular", JSON.stringify(data), {
        expirationTtl: 300
      }).catch(() => {})
    }

    return c.json(ok(data))
  } catch {
    return c.json(ok([]))
  }
})

/* ============================================================
  GET /api/search/suggestions — Autocomplete
  FIXED: bind params now correct (3 params for 3 ?)
  KV cached 5 min
============================================================ */

app.get("/api/search/suggestions", async (c) => {
  const db    = c.env.DB
  const q     = (c.req.query("q") || "").trim()
  const _sl   = parseInt(c.req.query("limit") || "6")
  const limit = Math.min(8, isNaN(_sl) ? 6 : Math.max(1, _sl))

  if (q.length < 1) return c.json(ok([]))

  try {
    const cacheKey = `suggest:${q.toLowerCase()}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    // FIXED: Query has 3 '?' → bind has exactly 3 params
    // `${q}%` for LIKE-prefix, `${q}%` for CASE WHEN, limit
    const { results } = await db.prepare(`
      SELECT id, title, slug, poster, type
      FROM anime
      WHERE title LIKE ? AND is_hidden=0 AND active=1
      ORDER BY
        CASE WHEN title LIKE ? THEN 1 ELSE 2 END,
        rating DESC
      LIMIT ?
    `).bind(`${q}%`, `${q}%`, limit).all()

    // Broaden to %q% if prefix gave nothing
    let final = results
    if (!results.length && q.length >= 2) {
      const { results: wider } = await db.prepare(`
        SELECT id, title, slug, poster, type
        FROM anime
        WHERE title LIKE ? AND is_hidden=0 AND active=1
        ORDER BY rating DESC
        LIMIT ?
      `).bind(`%${q}%`, limit).all()
      final = wider
    }

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(final), {
        expirationTtl: 300
      }).catch(() => {})
    }

    return c.json(ok(final))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/search/filter — Advanced filtered search
============================================================ */

app.get("/api/search/filter", async (c) => {
  const db     = c.env.DB
  const qp     = c.req.query
  const search = (qp("q") || "").trim()
  const type   = qp("type")   || ""
  const status = qp("status") || ""
  const genre  = qp("genre")  || ""
  const year   = qp("year")   || ""
  const sort   = qp("sort")   || "rating"
  const _rp    = parseInt(qp("page")  || "1");  const page  = (isNaN(_rp)  || _rp  < 1) ? 1  : _rp
  const _rl    = parseInt(qp("limit") || "20"); const limit = Math.min(40, isNaN(_rl) ? 20 : Math.max(1, _rl))
  const offset = (page - 1) * limit

  const where  = ["is_hidden=0", "active=1"]
  const binds  = []

  if (search) { where.push("(title LIKE ? OR genres LIKE ?)"); binds.push(`%${search}%`, `%${search}%`) }
  if (type)   { where.push("type=?");        binds.push(type) }
  if (status) { where.push("status=?");      binds.push(status) }
  if (genre)  { where.push("genres LIKE ?"); binds.push(`%${genre}%`) }
  if (year)   { where.push("year=?");        binds.push(parseInt(year)) }

  const orderMap = {
    rating: "rating DESC",
    latest: "created_at DESC",
    title:  "title ASC",
    year:   "year DESC",
    oldest: "created_at ASC"
  }
  const orderBy  = orderMap[sort] || "rating DESC"
  const whereSQL = where.join(" AND ")

  try {
    const [countRow, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as total FROM anime WHERE ${whereSQL}`)
        .bind(...binds).first(),
      db.prepare(`SELECT ${COLS} FROM anime WHERE ${whereSQL} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
        .bind(...binds, limit, offset).all()
    ])

    return c.json(ok({
      query: search, page, limit,
      total: countRow?.total || 0,
      count: rows.results.length,
      data:  rows.results
    }))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/search/genre/:genre — Browse by genre
  KV cached 5 min
============================================================ */

app.get("/api/search/genre/:genre", async (c) => {
  const db     = c.env.DB
  const genre  = c.req.param("genre")
  const _gp    = parseInt(c.req.query("page")  || "1");  const page  = (isNaN(_gp)  || _gp  < 1) ? 1  : _gp
  const _gl    = parseInt(c.req.query("limit") || "20"); const limit = Math.min(40, isNaN(_gl) ? 20 : Math.max(1, _gl))
  const offset = (page - 1) * limit

  try {
    const cacheKey = `genre:${genre.toLowerCase()}:${page}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    const [countRow, rows] = await Promise.all([
      db.prepare("SELECT COUNT(*) as total FROM anime WHERE genres LIKE ? AND is_hidden=0 AND active=1")
        .bind(`%${genre}%`).first(),
      db.prepare(`SELECT ${COLS} FROM anime WHERE genres LIKE ? AND is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ? OFFSET ?`)
        .bind(`%${genre}%`, limit, offset).all()
    ])

    const response = {
      genre, page, limit,
      total: countRow?.total || 0,
      data:  rows.results
    }

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(response), {
        expirationTtl: 300
      }).catch(() => {})
    }

    return c.json(ok(response))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/search/az/:letter — A-Z browse
  '#' = non-alphabetic; SQLite safe (no [] syntax)
============================================================ */

app.get("/api/search/az/:letter", async (c) => {
  const db     = c.env.DB
  const letter = c.req.param("letter").toUpperCase().slice(0, 1)
  const _ap    = parseInt(c.req.query("page")  || "1");  const page  = (isNaN(_ap)  || _ap  < 1) ? 1  : _ap
  const _al    = parseInt(c.req.query("limit") || "20"); const limit = Math.min(40, isNaN(_al) ? 20 : Math.max(1, _al))
  const offset = (page - 1) * limit

  try {
    if (letter === "#") {
      const { results } = await db.prepare(`
        SELECT ${COLS} FROM anime
        WHERE is_hidden=0 AND active=1
          AND SUBSTR(UPPER(title), 1, 1) NOT BETWEEN 'A' AND 'Z'
        ORDER BY title ASC LIMIT ? OFFSET ?
      `).bind(limit, offset).all()
      return c.json(ok({ letter, page, limit, data: results }))
    }

    const { results } = await db.prepare(`
      SELECT ${COLS} FROM anime
      WHERE title LIKE ? AND is_hidden=0 AND active=1
      ORDER BY title ASC LIMIT ? OFFSET ?
    `).bind(`${letter}%`, limit, offset).all()

    return c.json(ok({ letter, page, limit, data: results }))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  POST /api/search/log — NOT HERE
  Bug #21: moved to searchAdmin.js as admin-only
  Public logging via rate-limited logSearch() above
============================================================ */

export default app
