import { Hono } from "hono"

const app = new Hono()

/* =========================================
PUBLIC SEARCH
========================================= */

app.get("/search", async (c) => {

  try {

    const q =
      (c.req.query("q") || "")
      .trim()
      .toLowerCase()

    if (!q) {

      return c.json({
        success: true,
        data: []
      })
    }

    const limit = Math.min(
      Number(
        c.req.query("limit") || 8
      ),
      12
    )

    const search =
      `%${q}%`

    const { results } =
      await c.env.DB.prepare(`

        SELECT
          id,
          title,
          slug,
          poster,
          genres,
          type

        FROM anime

        WHERE
          is_hidden = 0

        AND (

          LOWER(title)
          LIKE ?

          OR LOWER(slug)
          LIKE ?

          OR LOWER(genres)
          LIKE ?

          OR LOWER(type)
          LIKE ?

        )

        ORDER BY

          is_trending DESC,
          updated_at DESC

        LIMIT ?

      `).bind(
        search,
        search,
        search,
        search,
        limit
      ).all()

    const data =
      results.map(a => ({

        id: a.id,

        title: a.title,

        slug: a.slug,

        poster: a.poster,

        type: a.type,

        genres:
          JSON.parse(
            a.genres || "[]"
          )
      }))

    return c.json({

      success: true,

      data
    })

  } catch (err) {

    return c.json({

      success: false,

      message: err.message

    }, 500)
  }
})

export default app
