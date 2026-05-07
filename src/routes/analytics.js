import { Hono } from "hono"

const app = new Hono()

app.post("/view/:id", async (c) => {

  const animeId =
    c.req.param("id")

  const exists =
    await c.env.DB.prepare(`
      SELECT * FROM anime_views
      WHERE anime_id = ?
    `).bind(animeId).first()

  if (!exists) {

    await c.env.DB.prepare(`
      INSERT INTO anime_views (
        id,
        anime_id,
        views,
        updated_at
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      animeId,
      1,
      new Date().toISOString()
    ).run()

  } else {

    await c.env.DB.prepare(`
      UPDATE anime_views
      SET
        views = views + 1,
        updated_at = ?
      WHERE anime_id = ?
    `).bind(
      new Date().toISOString(),
      animeId
    ).run()
  }

  return c.json({
    success: true
  })
})

export default app
