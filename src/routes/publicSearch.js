import { Hono } from "hono"

const app = new Hono()

app.get("/search", async (c) => {

  const q = (c.req.query("q") || "").trim()

  if (!q) {
    return c.json({
      success: true,
      data: []
    })
  }

  const limit = Math.min(
    Number(c.req.query("limit") || 8),
    20
  )

  const query = `%${q.toLowerCase()}%`

  const { results } = await c.env.DB.prepare(`
    SELECT
      id,
      title,
      slug,
      poster,
      type,
      genres,
      is_trending,
      views
    FROM anime

    WHERE
      is_hidden = 0
      AND (
        LOWER(title) LIKE ?
        OR LOWER(slug) LIKE ?
      )

    ORDER BY
      is_trending DESC,
      views DESC,
      created_at DESC

    LIMIT ?
  `).bind(query, query, limit).all()

  const data = results.map(a => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    poster: a.poster,
    type: a.type,
    trending: !!a.is_trending,
    views: a.views || 0,
    genres: JSON.parse(a.genres || "[]")
  }))

  return c.json({
    success: true,
    data
  })
})

export default app
