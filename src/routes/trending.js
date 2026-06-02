/* ============================================================
  ANIMEHUNT — TRENDING ROUTES (FIXED)
  File: src/routes/trending.js

  GET /api/trending           - is_trending=1 anime
  GET /api/trending/top       - Top rated
  GET /api/trending/new       - Latest added
  GET /api/trending/ongoing   - Currently airing
  GET /api/trending/movies    - Latest movies
============================================================ */

import { Hono } from "hono"
const app  = new Hono()
const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

const COLS = "id, title, slug, poster, rating, year, type, status, language"

app.get("/api/trending", async (c) => {
  const limit = Math.min(40, parseInt(c.req.query("limit") || "20"))
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE is_trending=1 AND is_hidden=0 AND active=1
      ORDER BY rating DESC LIMIT ?
    `).bind(limit).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/trending/top", async (c) => {
  const limit = Math.min(40, parseInt(c.req.query("limit") || "10"))
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY rating DESC LIMIT ?
    `).bind(limit).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/trending/new", async (c) => {
  const limit = Math.min(40, parseInt(c.req.query("limit") || "10"))
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/trending/ongoing", async (c) => {
  const limit = Math.min(40, parseInt(c.req.query("limit") || "20"))
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE status='ongoing' AND is_hidden=0 AND active=1
      ORDER BY updated_at DESC LIMIT ?
    `).bind(limit).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/trending/movies", async (c) => {
  const limit = Math.min(40, parseInt(c.req.query("limit") || "20"))
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE type='movie' AND is_hidden=0 AND active=1
      ORDER BY year DESC, rating DESC LIMIT ?
    `).bind(limit).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

export default app
