import { Hono } from "hono"

const app = new Hono()

app.get("/sitemap.xml", async (c) => {

  const { results } =
    await c.env.DB.prepare(`
      SELECT slug, updated_at
      FROM anime
      WHERE is_hidden = 0
    `).all()

  const urls = results.map(a => `
    <url>
      <loc>
        https://animehunt.in/details.html?slug=${a.slug}
      </loc>

      <lastmod>
        ${a.updated_at}
      </lastmod>
    </url>
  `).join("")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>

  <urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  >

    ${urls}

  </urlset>`

  return c.body(xml, 200, {
    "Content-Type":
      "application/xml"
  })
})

export default app
