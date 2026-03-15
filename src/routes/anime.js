import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =============================
GET ANIME LIST
============================= */

app.get("/anime", verifyAdmin, async (c)=>{

const db = c.env.DB

const type = c.req.query("type")
const status = c.req.query("status")
const home = c.req.query("home")
const q = c.req.query("q")

let query = `SELECT * FROM anime WHERE 1=1`

if(type) query += ` AND type='${type}'`
if(status) query += ` AND status='${status}'`

if(home==="yes") query += ` AND is_home=1`
if(home==="no") query += ` AND is_home=0`

if(q) query += ` AND title LIKE '%${q}%'`

query += ` ORDER BY created_at DESC`

const { results } = await db.prepare(query).all()

return c.json(results)

})

/* =============================
CREATE ANIME
============================= */

app.post("/anime", verifyAdmin, async (c)=>{

const db = c.env.DB
const body = await c.req.json()

const id = crypto.randomUUID()

const slug = body.slug || body.title
.toLowerCase()
.replace(/[^a-z0-9]+/g,"-")

await db.prepare(`
INSERT INTO anime
(id,title,slug,type,status,poster,banner,year,rating,language,duration,description,tags,genres,is_home,is_trending,is_most_viewed,is_banner)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(
id,
body.title,
slug,
body.type,
body.status,
body.poster,
body.banner,
body.year,
body.rating,
body.language,
body.duration,
body.description,
body.tags,
body.genres,
body.isHome?1:0,
body.isTrending?1:0,
body.isMostViewed?1:0,
body.isBanner?1:0
)
.run()

return c.json({success:true,id})

})

/* =============================
UPDATE ANIME
============================= */

app.put("/anime/:id", verifyAdmin, async (c)=>{

const db = c.env.DB
const id = c.req.param("id")

const body = await c.req.json()

await db.prepare(`
UPDATE anime SET
title=?,
slug=?,
type=?,
status=?,
poster=?,
banner=?,
year=?,
rating=?,
language=?,
duration=?,
description=?,
tags=?,
genres=?,
is_home=?,
is_trending=?,
is_most_viewed=?,
is_banner=?
WHERE id=?
`)
.bind(
body.title,
body.slug,
body.type,
body.status,
body.poster,
body.banner,
body.year,
body.rating,
body.language,
body.duration,
body.description,
body.tags,
body.genres,
body.isHome?1:0,
body.isTrending?1:0,
body.isMostViewed?1:0,
body.isBanner?1:0,
id
)
.run()

return c.json({success:true})

})

/* =============================
DELETE ANIME
============================= */

app.delete("/anime/:id", verifyAdmin, async (c)=>{

await c.env.DB
.prepare("DELETE FROM anime WHERE id=?")
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

/* =============================
HIDE / UNHIDE
============================= */

app.patch("/anime-hide/:id", verifyAdmin, async (c)=>{

const id = c.req.param("id")
const db = c.env.DB

const row = await db.prepare(`
SELECT is_hidden FROM anime WHERE id=?
`).bind(id).first()

const hidden = row.is_hidden ? 0 : 1

await db.prepare(`
UPDATE anime SET is_hidden=? WHERE id=?
`).bind(hidden,id).run()

return c.json({success:true})

})

export default app
