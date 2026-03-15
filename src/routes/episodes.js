import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ==========================
GET ALL EPISODES
========================== */

app.get("/episodes", verifyAdmin, async (c)=>{

const { results } = await c.env.DB
.prepare(`
SELECT * FROM episodes
ORDER BY created_at DESC
`)
.all()

const data = results.map(e=>({

...e,

servers: JSON.parse(e.servers || "[]"),

downloads: JSON.parse(e.downloads || "[]")

}))

return c.json(data)

})

/* ==========================
GET SINGLE
========================== */

app.get("/episodes/:id", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM episodes WHERE id=?")
.bind(c.req.param("id"))
.first()

if(!row) return c.json({error:"Not found"},404)

row.servers = JSON.parse(row.servers || "[]")
row.downloads = JSON.parse(row.downloads || "[]")

return c.json(row)

})

/* ==========================
CREATE
========================== */

app.post("/episodes", verifyAdmin, async (c)=>{

const body = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO episodes
(id,anime,season,episode,title,description,servers,downloads,ongoing,featured)
VALUES(?,?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
body.anime,
body.season,
body.episode,
body.title,
body.description,

JSON.stringify(body.servers || []),
JSON.stringify(body.downloads || []),

body.ongoing ? 1:0,
body.featured ? 1:0

)
.run()

return c.json({success:true,id})

})

/* ==========================
UPDATE
========================== */

app.patch("/episodes/:id", verifyAdmin, async (c)=>{

const body = await c.req.json()

await c.env.DB.prepare(`
UPDATE episodes SET

anime=?,
season=?,
episode=?,
title=?,
description=?,

servers=?,
downloads=?,

ongoing=?,
featured=?

WHERE id=?

`)
.bind(

body.anime,
body.season,
body.episode,
body.title,
body.description,

JSON.stringify(body.servers || []),
JSON.stringify(body.downloads || []),

body.ongoing ? 1:0,
body.featured ? 1:0,

c.req.param("id")

)
.run()

return c.json({success:true})

})

/* ==========================
DELETE
========================== */

app.delete("/episodes/:id", verifyAdmin, async (c)=>{

await c.env.DB
.prepare("DELETE FROM episodes WHERE id=?")
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

export default app
