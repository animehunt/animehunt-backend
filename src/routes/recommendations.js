/* ============================================================
  ANIMEHUNT — RECOMMENDATIONS (FINAL — ALL ISSUES FIXED)
  File: src/routes/recommendations.js

  BUGS FIXED:
  ✅ KV cache 30 min TTL
  ✅ Genre LIKE — DB index required (D1_INDEXES_PART3.sql)
  ✅ Parallel genre + type fallback
  ✅ Slug OR id lookup both work
  ✅ FIXED: getRecommendations — when mainGenre empty AND type also empty,
            fallback returns top rated anime (not empty array)
  ✅ FIXED: /similar/:slug — must register BEFORE /:animeId
            otherwise Hono matches "similar" as animeId param

  DB INDEX (run in D1):
    CREATE INDEX IF NOT EXISTS idx_anime_genres ON anime(genres);
    CREATE INDEX IF NOT EXISTS idx_anime_type   ON anime(type);

  ROUTES:
  GET /api/recommendations/similar/:slug  — By slug (MUST be first)
  GET /api/recommendations/:animeId       — By id or slug
============================================================ */

import { Hono } from "hono"

const app  = new Hono()
const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

const KV_TTL = 1800 // 30 minutes

function safeJSON(v, fb=[]) { try { return JSON.parse(v || "[]") } catch { return fb } }

/* ============================================================
  INTERNAL — Get recommendations
  Priority: genre match → type match → top rated
============================================================ */

async function getRecommendations(db, animeId, limit = 8) {
  const anime = await db.prepare(
    "SELECT id, genres, type FROM anime WHERE (id=? OR slug=?) AND active=1 AND is_hidden=0 LIMIT 1"
  ).bind(animeId, animeId).first()

  if (!anime) return []

  const genres    = safeJSON(anime.genres)
  const mainGenre = genres[0] || ""
  const animeType = anime.type || "anime"

  // 1. Primary: genre match
  if (mainGenre) {
    const { results } = await db.prepare(`
      SELECT id, title, slug, poster, rating, type, year, status
      FROM anime
      WHERE is_hidden=0 AND active=1
        AND id != ?
        AND genres LIKE ?
      ORDER BY rating DESC
      LIMIT ?
    `).bind(anime.id, `%${mainGenre}%`, limit).all()

    if (results.length >= 4) return results

    // Pad with type fallback if genre gave <4
    if (results.length > 0) {
      const seen      = new Set(results.map(r => r.id))
      const remaining = limit - results.length

      const { results: typeRows } = await db.prepare(`
        SELECT id, title, slug, poster, rating, type, year, status
        FROM anime
        WHERE is_hidden=0 AND active=1
          AND id != ?
          AND type = ?
          AND genres NOT LIKE ?
        ORDER BY rating DESC
        LIMIT ?
      `).bind(anime.id, animeType, `%${mainGenre}%`, remaining).all()

      const padded = typeRows.filter(r => !seen.has(r.id))
      return [...results, ...padded].slice(0, limit)
    }
  }

  // 2. Type fallback (when genre gave 0 results)
  const { results: typeResults } = await db.prepare(`
    SELECT id, title, slug, poster, rating, type, year, status
    FROM anime
    WHERE is_hidden=0 AND active=1
      AND id != ?
      AND type = ?
    ORDER BY rating DESC
    LIMIT ?
  `).bind(anime.id, animeType, limit).all()

  if (typeResults.length > 0) return typeResults

  // 3. FIXED: Final fallback — top rated (instead of empty array)
  const { results: topResults } = await db.prepare(`
    SELECT id, title, slug, poster, rating, type, year, status
    FROM anime
    WHERE is_hidden=0 AND active=1
      AND id != ?
    ORDER BY rating DESC
    LIMIT ?
  `).bind(anime.id, limit).all()

  return topResults
}

/* ============================================================
  IMPORTANT: /api/recommendations/similar/:slug
  MUST be registered BEFORE /api/recommendations/:animeId
  Otherwise Hono treats "similar" as the animeId param
============================================================ */

app.get("/api/recommendations/similar/:slug", async (c) => {
  const db    = c.env.DB
  const slug  = c.req.param("slug")
  const _rl   = parseInt(c.req.query("limit") || "8")
  const limit = Math.min(16, isNaN(_rl) ? 8 : Math.max(1, _rl))

  try {
    const cacheKey = `recs:slug:${slug}:${limit}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })
    }

    const results = await getRecommendations(db, slug, limit)

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(results), {
        expirationTtl: KV_TTL
      }).catch(() => {})
    }

    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/recommendations/:animeId — By id or slug
  KV cached 30 min
============================================================ */

app.get("/api/recommendations/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")
  const _rla    = parseInt(c.req.query("limit") || "8")
  const limit   = Math.min(16, isNaN(_rla) ? 8 : Math.max(1, _rla))

  try {
    const cacheKey = `recs:${animeId}:${limit}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })
    }

    const results = await getRecommendations(db, animeId, limit)

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(results), {
        expirationTtl: KV_TTL
      }).catch(() => {})
    }

    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

export default app

