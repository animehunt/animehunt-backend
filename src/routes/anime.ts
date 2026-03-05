import { Hono } from "hono"

type Bindings = { DB: D1Database }

const anime = new Hono<{ Bindings: Bindings }>()

anime.get("/", async (c)=>{

const rows = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE active=1
ORDER BY created_at DESC
`).all()

return c.json(rows.results)

})

anime.get("/:slug", async (c)=>{

const slug = c.req.param("slug")

const row = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE slug=?
`).bind(slug).first()

return c.json(row)

})

anime.get("/category/:slug", async (c)=>{

const slug = c.req.param("slug")

const rows = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE category LIKE '%' || ? || '%'
`).bind(slug).all()

return c.json(rows.results)

})

export default anime
