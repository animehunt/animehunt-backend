import { Hono } from "hono"

const app = new Hono()

app.get("/trending", async (c) => {

  const { results } =
    await c.env.DB.prepare(`

      SELECT
        a.id,
        a.title,
        a.slug,
        a.poster,
        a.type

      FROM anime a

      LEFT JOIN anime_views v
      ON a.id = v.anime_id

      WHERE a.is_hidden = 0

      ORDER BY
        v.views DESC,
        a.updated_at DESC

      LIMIT 12

    `).all()

  return c.json({
    success: true,
    data: results
  })
})

export default app
