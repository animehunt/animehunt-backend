import { Hono } from "hono"

const app = new Hono()

app.get("/player/:episode", async (c)=>{

const ep = c.req.param("episode")

const row = await c.env.DB
.prepare(`
SELECT servers
FROM episodes
WHERE id=?
`)
.bind(ep)
.first()

if(!row){

return c.json({error:"Episode not found"})

}

const servers = JSON.parse(row.servers)

return c.json({

servers

})

})

export default app
