import { Hono } from "hono"

const app = new Hono()

app.get("/search", async (c)=>{

const q = c.req.query("q")?.toLowerCase()

if(!q) return c.json([])

const DB = c.env.DB

/* SEARCH ANIME */

const anime = await DB.prepare(`
SELECT id,title,poster,views
FROM anime
WHERE LOWER(title) LIKE ?
LIMIT 20
`).bind(`%${q}%`).all()

/* SEARCH EPISODES */

const episodes = await DB.prepare(`
SELECT id,title
FROM episodes
WHERE LOWER(title) LIKE ?
LIMIT 10
`).bind(`%${q}%`).all()

/* SEARCH CATEGORIES */

const categories = await DB.prepare(`
SELECT id,name
FROM categories
WHERE LOWER(name) LIKE ?
LIMIT 10
`).bind(`%${q}%`).all()

return c.json({

anime:anime.results,
episodes:episodes.results,
categories:categories.results

})

})

export default app
