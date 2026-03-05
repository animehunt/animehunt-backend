import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const anime = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ALL ANIME
=============================== */
anime.get("/", async (c) => {

  const rows = await c.env.DB.prepare(`
    SELECT * FROM anime
    WHERE active = 1
    ORDER BY created_at DESC
  `).all()

  return c.json(rows.results || [])

})

/* ===============================
   BY TYPE
   anime / movie / series / cartoon
=============================== */
anime.get("/type/:type", async (c) => {

  const type = c.req.param("type")

  const rows = await c.env.DB.prepare(`
    SELECT * FROM anime
    WHERE type = ?
    AND active = 1
    ORDER BY created_at DESC
  `)
  .bind(type)
  .all()

  return c.json(rows.results || [])

})

/* ===============================
   BY CATEGORY
=============================== */
anime.get("/category/:slug", async (c) => {

  const slug = c.req.param("slug")

  const rows = await c.env.DB.prepare(`
    SELECT * FROM anime
    WHERE category_slug = ?
    AND active = 1
    ORDER BY created_at DESC
  `)
  .bind(slug)
  .all()

  return c.json(rows.results || [])

})

/* ===============================
   SINGLE ANIME
=============================== */
anime.get("/:slug", async (c) => {

  const slug = c.req.param("slug")

  const row = await c.env.DB.prepare(`
    SELECT * FROM anime
    WHERE slug = ?
  `)
  .bind(slug)
  .first()

  return c.json(row || {})

})

export default anime
