import { Hono } from "hono"
const app = new Hono()

// GET ALL ANIME
app.get("/", async (c) => {
  const { type, status, home, q } = c.req.query()
  let sql = `SELECT * FROM anime WHERE 1=1`
  const params = []

  if (type) { sql += ` AND type=?`; params.push(type); }
  if (status) { sql += ` AND status=?`; params.push(status); }
  if (home === "yes") sql += ` AND is_home=1`
  if (home === "no") sql += ` AND is_home=0`
  if (q) { sql += ` AND title LIKE ?`; params.push(`%${q}%`); }

  sql += ` ORDER BY created_at DESC`
  const { results } = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json(results || [])
})

// GET SINGLE ANIME
app.get("/:id", async (c) => {
  const id = c.req.param("id")
  const row = await c.env.DB.prepare(`SELECT * FROM anime WHERE id=?`).bind(id).first()
  return c.json(row || {})
})

// CREATE OR UPDATE ANIME (FIXED SQL)
app.post("/", async (c) => {
  try {
    const b = await c.req.json()
    if (!b.title) return c.json({ success: false, error: "Title required" }, 400)

    const id = b.id || crypto.randomUUID()
    const createdAt = b.id ? undefined : Date.now() // Sirf naye anime ke liye date

    // Query with exactly 20 columns
    const sql = `
      INSERT OR REPLACE INTO anime (
        id, title, slug, type, status, poster, banner, 
        year, rating, language, duration, genres, tags, 
        description, is_home, is_trending, is_most_viewed, 
        is_banner, is_hidden, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM anime WHERE id=?), ?))
    `

    await c.env.DB.prepare(sql).bind(
      id, b.title, b.slug || "", b.type || "anime", b.status || "ongoing",
      b.poster || "", b.banner || "", b.year || "", b.rating || "",
      b.language || "", b.duration || "", b.genres || "", b.tags || "",
      b.description || "", 
      b.isHome ? 1 : 0, b.isTrending ? 1 : 0, b.isMostViewed ? 1 : 0, b.isBanner ? 1 : 0,
      0, id, Date.now()
    ).run()

    return c.json({ success: true, id })
  } catch (e) {
    console.error(e)
    return c.json({ success: false, error: e.message }, 500)
  }
})

// DELETE ANIME
app.delete("/:id", async (c) => {
  const id = c.req.param("id")
  await c.env.DB.prepare(`DELETE FROM anime WHERE id=?`).bind(id).run()
  return c.json({ success: true })
})

// TOGGLE HIDE
app.patch("/hide/:id", async (c) => {
  const id = c.req.param("id")
  const row = await c.env.DB.prepare(`SELECT is_hidden FROM anime WHERE id=?`).bind(id).first()
  const next = row?.is_hidden ? 0 : 1
  await c.env.DB.prepare(`UPDATE anime SET is_hidden=? WHERE id=?`).bind(next, id).run()
  return c.json({ success: true })
})

export default app
