import { Hono } from "hono"

const app = new Hono()

app.get("/episodes", async (c)=>{

const anime = c.req.query("anime")

const { results } = await c.env.DB.prepare(`
SELECT * FROM episodes
WHERE anime=?
ORDER BY season,episode
`)
.bind(anime)
.all()

const data = results.map(e=>({

...e,

servers: JSON.parse(e.servers || "[]"),
downloads: JSON.parse(e.downloads || "[]")

}))

return c.json(data)

})

/* PLAYER PAGE */

app.get("/episode/:id", async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM episodes WHERE id=?")
.bind(c.req.param("id"))
.first()

if(!row) return c.json({error:"Not found"},404)

row.servers = JSON.parse(row.servers || "[]")
row.downloads = JSON.parse(row.downloads || "[]")

return c.json(row)

})

export default app
