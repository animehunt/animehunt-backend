import { Hono } from "hono"

type Bindings = { DB: D1Database }

const episodes = new Hono<{ Bindings: Bindings }>()

episodes.get("/:slug", async (c)=>{

const slug = c.req.param("slug")

const rows = await c.env.DB.prepare(`
SELECT * FROM episodes
WHERE anime_slug=?
ORDER BY episode_number ASC
`).bind(slug).all()

return c.json(rows.results)

})

export default episodes
