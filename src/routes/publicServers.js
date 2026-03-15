import { Hono } from "hono"

const app = new Hono()

app.get("/servers/:anime/:season/:episode", async (c)=>{

const anime = c.req.param("anime")
const season = c.req.param("season")
const episode = c.req.param("episode")

const rows = await c.env.DB.prepare(`
SELECT name,embed,priority
FROM servers
WHERE anime=?
AND season=?
AND episode=?
AND active=1
ORDER BY priority ASC
`)
.bind(anime,season,episode)
.all()

return c.json(rows.results)

})

export default app
