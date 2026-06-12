/* ============================================================
  ANIMEHUNT — PUBLIC SEARCH (FIXED)
  File: src/routes/publicSearch.js
  NOTE: Basic search already in public.js (/api/search)
  This file adds advanced search features.

  GET /api/search/suggestions   - Autocomplete (title prefix)
  GET /api/search/filter        - Advanced filtered search
  GET /api/search/genre/:genre  - Browse by genre
  GET /api/search/az/:letter    - A-Z browse
============================================================ */

import { Hono } from "hono"
const app  = new Hono()
const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

const COLS = "id, title, slug, poster, type, status, rating, year, language"

/* Autocomplete suggestions */
app.get("/api/search/suggestions", async (c) => {
  const db    = c.env.DB
  const q     = (c.req.query("q") || "").trim()
  const limit = Math.min(8, parseInt(c.req.query("limit") || "6"))

  if (q.length < 1) return c.json(ok([]))

  try {
    const { results } = await db.prepare(`
      SELECT id, title, slug, poster, type
      FROM anime
      WHERE title LIKE ? AND is_hidden=0 AND active=1
      ORDER BY CASE WHEN title LIKE ? THEN 1 ELSE 2 END, rating DESC
      LIMIT ?
    `).bind(q + "%", q, limit).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* Advanced filter search */
app.get("/api/search/filter", async (c) => {
  const db     = c.env.DB
  const q      = c.req.query
  const search = (q("q") || "").trim()
  const type   = q("type")   || ""
  const status = q("status") || ""
  const genre  = q("genre")  || ""
  const year   = q("year")   || ""
  const sort   = q("sort")   || "rating"
  const page   = Math.max(1, parseInt(q("page") || "1"))
  const limit  = Math.min(40, parseInt(q("limit") || "20"))
  const offset = (page - 1) * limit

  const where = ["is_hidden=0", "active=1"]
  const binds = []

  if (search) { where.push("title LIKE ?"); binds.push("%" + search + "%") }
  if (type)   { where.push("type=?");       binds.push(type) }
  if (status) { where.push("status=?");     binds.push(status) }
  if (genre)  { where.push("genres LIKE ?"); binds.push("%" + genre + "%") }
  if (year)   { where.push("year=?");       binds.push(parseInt(year)) }

  const orderMap = { rating: "rating DESC", latest: "created_at DESC", title: "title ASC", year: "year DESC" }
  const orderBy  = orderMap[sort] || "rating DESC"
  const whereSQL = where.join(" AND ")

  try {
    const countRow = await db.prepare(`SELECT COUNT(*) as total FROM anime WHERE ${whereSQL}`)
      .bind(...binds).first()
    const { results } = await db.prepare(
      `SELECT ${COLS} FROM anime WHERE ${whereSQL} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all()

    return c.json(ok({
      query: search, page, limit,
      total: countRow?.total || 0,
      count: results.length,
      data:  results
    }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* Browse by genre */
app.get("/api/search/genre/:genre", async (c) => {
  const db    = c.env.DB
  const genre = c.req.param("genre")
  const page  = Math.max(1, parseInt(c.req.query("page") || "1"))
  const limit = Math.min(40, parseInt(c.req.query("limit") || "20"))
  const offset = (page - 1) * limit

  try {
    const countRow = await db.prepare(
      "SELECT COUNT(*) as total FROM anime WHERE genres LIKE ? AND is_hidden=0 AND active=1"
    ).bind("%" + genre + "%").first()
    const { results } = await db.prepare(`
      SELECT ${COLS} FROM anime
      WHERE genres LIKE ? AND is_hidden=0 AND active=1
      ORDER BY rating DESC LIMIT ? OFFSET ?
    `).bind("%" + genre + "%", limit, offset).all()
    return c.json(ok({ genre, page, limit, total: countRow?.total || 0, data: results }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* A-Z browse */
app.get("/api/search/az/:letter", async (c) => {
  const db     = c.env.DB
  const letter = c.req.param("letter").toUpperCase().slice(0, 1)
  const page   = Math.max(1, parseInt(c.req.query("page") || "1"))
  const limit  = Math.min(40, parseInt(c.req.query("limit") || "20"))
  const offset = (page - 1) * limit

  try {
    // ✅ FIX: SQLite LIKE mein [] support nahi — # ke liye alag query
  if (letter === "#") {
    try {
      const { results } = await db.prepare(`
        SELECT ${COLS} FROM anime
        WHERE is_hidden=0 AND active=1
        AND SUBSTR(UPPER(title),1,1) NOT BETWEEN 'A' AND 'Z'
        ORDER BY title ASC LIMIT ? OFFSET ?
      `).bind(limit, offset).all()
      return c.json(ok({ letter, page, limit, data: results }))
    } catch (err) { return c.json(fail(err.message), 500) }
  }
  const pattern = letter + "%"
    const { results } = await db.prepare(`
      SELECT ${COLS} FROM anime
      WHERE title LIKE ? AND is_hidden=0 AND active=1
      ORDER BY title ASC LIMIT ? OFFSET ?
    `).bind(pattern, limit, offset).all()
    return c.json(ok({ letter, page, limit, data: results }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

export default app
