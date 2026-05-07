import { Hono } from "hono"

const app = new Hono()

app.get("/robots.txt", async (c) => {

  const text = `
User-agent: *
Allow: /

Sitemap: https://animehunt.in/sitemap.xml
`

  return c.text(text)
})

export default app
