import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ==========================
UTILS
========================== */

function safeJSON(data, fallback = []) {
  try {
    return JSON.parse(data || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

/* ==========================
GET ALL EPISODES
========================== */

app.get("/episodes", verifyAdmin, async (c) => {

  try {

    const { results } = await c.env.DB
      .prepare(`
        SELECT * FROM episodes
        ORDER BY created_at DESC
      `)
      .all()

    const data = results.map(e => ({
      ...e,
      servers: safeJSON(e.servers),
      ongoing: !!e.ongoing,
      featured: !!e.featured
    }))

    return c.json(data)

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to load episodes" }, 500)
  }

})

/* ==========================
GET SINGLE EPISODE
========================== */

app.get("/episodes/:id", verifyAdmin, async (c) => {

  try {

    const row = await c.env.DB
      .prepare("SELECT * FROM episodes WHERE id=?")
      .bind(c.req.param("id"))
      .first()

    if (!row) {
      return c.json({ error: "Not found" }, 404)
    }

    return c.json({
      ...row,
      servers: safeJSON(row.servers),
      ongoing: !!row.ongoing,
      featured: !!row.featured
    })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to fetch episode" }, 500)
  }

})

/* ==========================
CREATE EPISODE
========================== */

app.post("/episodes", verifyAdmin, async (c) => {

  try {

    const body = await c.req.json()

    if (!body.anime || !body.episode) {
      return c.json({ error: "Anime and episode required" }, 400)
    }

    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO episodes
      (id, anime, season, episode, title, description, servers, ongoing, featured, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    .bind(
      id,
      body.anime,
      body.season || "1",
      body.episode,
      body.title || null,
      body.description || null,
      JSON.stringify(body.servers || []),
      body.ongoing ? 1 : 0,
      body.featured ? 1 : 0
    )
    .run()

    return c.json({ success: true, id })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to create episode" }, 500)
  }

})

/* ==========================
UPDATE EPISODE
========================== */

app.patch("/episodes/:id", verifyAdmin, async (c) => {

  try {

    const body = await c.req.json()
    const id = c.req.param("id")

    await c.env.DB.prepare(`
      UPDATE episodes SET
        anime=?,
        season=?,
        episode=?,
        title=?,
        description=?,
        servers=?,
        ongoing=?,
        featured=?
      WHERE id=?
    `)
    .bind(
      body.anime,
      body.season || "1",
      body.episode,
      body.title || null,
      body.description || null,
      JSON.stringify(body.servers || []),
      body.ongoing ? 1 : 0,
      body.featured ? 1 : 0,
      id
    )
    .run()

    return c.json({ success: true })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to update episode" }, 500)
  }

})

/* ==========================
DELETE EPISODE
========================== */

app.delete("/episodes/:id", verifyAdmin, async (c) => {

  try {

    const id = c.req.param("id")

    await c.env.DB
      .prepare("DELETE FROM episodes WHERE id=?")
      .bind(id)
      .run()

    return c.json({ success: true })

  } catch (err) {
    console.error(err)
    return c.json({ error: "Failed to delete episode" }, 500)
  }

})

export default app
