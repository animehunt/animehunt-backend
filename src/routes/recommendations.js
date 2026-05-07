import { Hono } from "hono"

const app = new Hono()

app.get("/recommendations/:slug", async (c) => {

  const slug =
    c.req.param("slug")

  const anime =
    await c.env.DB.prepare(`
      SELECT *
      FROM anime
      WHERE slug = ?
    `).bind(slug).first()

  if (!anime) {

    return c.json({
      success: false,
      data: []
    })
  }

  const genres =
    JSON.parse(
      anime.genres || "[]"
    )

  if (!genres.length) {

    return c.json({
      success: true,
      data: []
    })
  }

  const like =
    genres.map(() => `
      genres LIKE ?
    `).join(" OR ")

  const binds = genres.map(
    g => `%${g}%`
  )

  const { results } =
    await c.env.DB.prepare(`

      SELECT
        id,
        title,
        slug,
        poster,
        type

      FROM anime

      WHERE
        slug != ?
        AND is_hidden = 0
        AND (
          ${like}
        )

      ORDER BY
        is_trending DESC,
        updated_at DESC

      LIMIT 12

    `).bind(
      slug,
      ...binds
    ).all()

  return c.json({
    success: true,
    data: results
  })
})

export default app
