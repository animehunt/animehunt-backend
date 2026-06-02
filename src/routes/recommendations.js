/* ============================================================
  ANIMEHUNT — RECOMMENDATIONS ROUTES (FIXED)
  File: src/routes/recommendations.js

  GET /api/recommendations/:animeId   - Related by genre
  GET /api/recommendations/similar/:slug - By slug
============================================================ */

import { Hono } from "hono"
const app  = new Hono()
const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

function safeJSON(v, fb=[]) { try { return JSON.parse(v||"[]") } catch { return fb } }

async function getRecommendations(db, animeId, limit=8) {
  // 1. Get source anime
  const anime = await db.prepare(
    "SELECT id, genres, type FROM anime WHERE (id=? OR slug=?) AND active=1 LIMIT 1"
  ).bind(animeId, animeId).first()

  if (!anime) return []

  const genres  = safeJSON(anime.genres)
  const mainGenre = genres[0] || ""

  // 2. Try genre match first
  if (mainGenre) {
    const { results } = await db.prepare(`
      SELECT id, title, slug, poster, rating, type, year, status
      FROM anime
      WHERE is_hidden=0 AND active=1
      AND id != ?
      AND genres LIKE ?
      ORDER BY rating DESC
      LIMIT ?
    `).bind(anime.id, "%" + mainGenre + "%", limit).all()
    if (results.length >= 4) return results
  }

  // 3. Fallback: same type
  const { results } = await db.prepare(`
    SELECT id, title, slug, poster, rating, type, year, status
    FROM anime
    WHERE is_hidden=0 AND active=1
    AND id != ?
    AND type = ?
    ORDER BY rating DESC
    LIMIT ?
  `).bind(anime.id, anime.type, limit).all()

  return results
}

app.get("/api/recommendations/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")
  const limit   = Math.min(16, parseInt(c.req.query("limit") || "8"))
  try {
    const results = await getRecommendations(db, animeId, limit)
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/recommendations/similar/:slug", async (c) => {
  const db    = c.env.DB
  const slug  = c.req.param("slug")
  const limit = Math.min(16, parseInt(c.req.query("limit") || "8"))
  try {
    const results = await getRecommendations(db, slug, limit)
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

export default app
