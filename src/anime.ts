import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const anime = new Hono<{ Bindings: Bindings }>()

/* =====================================================
   GET ALL (FILTER SUPPORT)
===================================================== */
anime.get("/", async (c) => {

  try {

    const { type, status, home, search } = c.req.query()

    let query = "SELECT * FROM anime WHERE 1=1"
    const params: any[] = []

    if (type) {
      query += " AND type = ?"
      params.push(type)
    }

    if (status) {
      query += " AND status = ?"
      params.push(status)
    }

    if (home === "yes") {
      query += " AND isHome = 1"
    }

    if (home === "no") {
      query += " AND isHome = 0"
    }

    if (search) {
      query += " AND title LIKE ?"
      params.push(`%${search}%`)
    }

    // 🔥 FIXED (NO createdAt error)
    query += " ORDER BY rowid DESC"

    const result = await c.env.DB.prepare(query).bind(...params).all()

    return c.json(result.results)

  } catch (err) {
    console.error("GET ALL ERROR:", err)
    return c.json({ message: "Server error" }, 500)
  }

})

/* =====================================================
   GET ONE
===================================================== */
anime.get("/:id", async (c) => {

  try {

    const { id } = c.req.param()

    const data = await c.env.DB
      .prepare("SELECT * FROM anime WHERE id = ?")
      .bind(id)
      .first()

    if (!data) {
      return c.json({ message: "Not found" }, 404)
    }

    return c.json(data)

  } catch (err) {
    console.error("GET ONE ERROR:", err)
    return c.json({ message: "Server error" }, 500)
  }

})

/* =====================================================
   CREATE
===================================================== */
anime.post("/", async (c) => {

  try {

    const body = await c.req.json()

    if (!body.title || !body.slug) {
      return c.json({ message: "Title & slug required" }, 400)
    }

    const exists = await c.env.DB
      .prepare("SELECT id FROM anime WHERE slug = ?")
      .bind(body.slug)
      .first()

    if (exists) {
      return c.json({ message: "Slug already exists" }, 400)
    }

    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO anime (
        id, title, slug, type, status,
        poster, banner, year, rating,
        language, duration, categories,
        tags, description,
        isHome, isTrending, isMostViewed, isBanner
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.title,
      body.slug,
      body.type || null,
      body.status || null,
      body.poster || null,
      body.banner || null,
      body.year || null,
      body.rating || null,
      body.language || null,
      body.duration || null,
      body.categories || null,
      body.tags || null,
      body.description || null,
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0
    ).run()

    return c.json({ success: true })

  } catch (err) {
    console.error("CREATE ERROR:", err)
    return c.json({ message: "Insert failed" }, 500)
  }

})

/* =====================================================
   UPDATE
===================================================== */
anime.patch("/:id", async (c) => {

  try {

    const { id } = c.req.param()
    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE anime SET
        title=?,
        slug=?,
        type=?,
        status=?,
        poster=?,
        banner=?,
        year=?,
        rating=?,
        language=?,
        duration=?,
        categories=?,
        tags=?,
        description=?,
        isHome=?,
        isTrending=?,
        isMostViewed=?,
        isBanner=?
      WHERE id=?
    `).bind(
      body.title,
      body.slug,
      body.type || null,
      body.status || null,
      body.poster || null,
      body.banner || null,
      body.year || null,
      body.rating || null,
      body.language || null,
      body.duration || null,
      body.categories || null,
      body.tags || null,
      body.description || null,
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,
      id
    ).run()

    return c.json({ success: true })

  } catch (err) {
    console.error("UPDATE ERROR:", err)
    return c.json({ message: "Update failed" }, 500)
  }

})

/* =====================================================
   DELETE
===================================================== */
anime.delete("/:id", async (c) => {

  try {

    const { id } = c.req.param()

    await c.env.DB
      .prepare("DELETE FROM anime WHERE id=?")
      .bind(id)
      .run()

    return c.json({ success: true })

  } catch (err) {
    console.error("DELETE ERROR:", err)
    return c.json({ message: "Delete failed" }, 500)
  }

})

export default anime
