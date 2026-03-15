import { Hono } from "hono"

const app = new Hono()

/* =========================
GET SERVERS
========================= */

app.get("/servers", async (c)=>{

const q = c.req.query("q")

let rows

if(q){

rows = await c.env.DB.prepare(`
SELECT *
FROM servers
WHERE anime LIKE ?
ORDER BY priority ASC
LIMIT 200
`)
.bind("%"+q+"%")
.all()

}else{

rows = await c.env.DB.prepare(`
SELECT *
FROM servers
ORDER BY priority ASC
LIMIT 200
`).all()

}

return c.json(rows.results)

})

/* =========================
CREATE / UPDATE
========================= */

app.post("/servers", async (c)=>{

const body = await c.req.json()

const id = body.id || crypto.randomUUID()

await c.env.DB.prepare(`
INSERT OR REPLACE INTO servers(

id,
name,
anime,
season,
episode,
embed,
priority,
active,
created_at

) VALUES(?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
body.name,
body.anime,
body.season,
body.episode,
body.embed,
body.priority,
body.active ? 1 : 0,
Date.now()

)
.run()

return c.json({success:true,id})

})

/* =========================
DELETE SERVER
========================= */

app.delete("/servers/:id", async (c)=>{

const id = c.req.param("id")

await c.env.DB.prepare(`
DELETE FROM servers
WHERE id=?
`)
.bind(id)
.run()

return c.json({success:true})

})

export default app
