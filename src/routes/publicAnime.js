import { Hono } from "hono"

const app = new Hono()

/* =========================
HOME PAGE DATA
========================= */

app.get("/anime/home", async (c)=>{

const rows = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE is_home=1 AND is_hidden=0
ORDER BY created_at DESC
LIMIT 50
`).all()

return c.json(rows.results)

})

/* =========================
TRENDING
========================= */

app.get("/anime/trending", async (c)=>{

const rows = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE is_trending=1 AND is_hidden=0
ORDER BY views DESC
LIMIT 20
`).all()

return c.json(rows.results)

})

/* =========================
SINGLE BY SLUG
========================= */

app.get("/anime/:slug", async (c)=>{

const slug = c.req.param("slug")

const row = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE slug=? AND is_hidden=0
`).bind(slug).first()

return c.json(row)

})

export default app
