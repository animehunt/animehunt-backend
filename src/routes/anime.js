import { Hono } from "hono"

const app = new Hono()

/* =========================
GET ANIME (FILTER + SEARCH)
========================= */

app.get("/anime", async (c)=>{

const { type, status, home, q } = c.req.query()

let query = `SELECT * FROM anime WHERE 1=1`
let params = []

if(type){
query += " AND type=?"
params.push(type)
}

if(status){
query += " AND status=?"
params.push(status)
}

if(home==="yes"){
query += " AND is_home=1"
}

if(home==="no"){
query += " AND is_home=0"
}

if(q){
query += " AND title LIKE ?"
params.push("%"+q+"%")
}

query += " ORDER BY created_at DESC LIMIT 200"

const rows = await c.env.DB.prepare(query).bind(...params).all()

return c.json(rows.results)

})

/* =========================
CREATE / UPDATE
========================= */

app.post("/anime", async (c)=>{

const body = await c.req.json()

const id = body.id || crypto.randomUUID()

// AUTO SLUG
const slug = body.slug || body.title
.toLowerCase()
.replace(/[^a-z0-9]+/g,"-")

await c.env.DB.prepare(`
INSERT OR REPLACE INTO anime (

id,title,slug,type,status,
poster,banner,
year,rating,
language,duration,
genres,tags,description,
is_home,is_trending,is_most_viewed,is_banner,
created_at

) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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

body.genres,
body.tags,
body.description,

body.isHome ? 1 : 0,
body.isTrending ? 1 : 0,
body.isMostViewed ? 1 : 0,
body.isBanner ? 1 : 0,

Date.now()

).run()

return c.json({success:true,id,slug})

})

/* =========================
DELETE
========================= */

app.delete("/anime/:id", async (c)=>{

const id = c.req.param("id")

await c.env.DB.prepare(`
DELETE FROM anime WHERE id=?
`).bind(id).run()

return c.json({success:true})

})

/* =========================
HIDE / UNHIDE
========================= */

app.patch("/anime-hide/:id", async (c)=>{

const id = c.req.param("id")

const row = await c.env.DB
.prepare("SELECT is_hidden FROM anime WHERE id=?")
.bind(id)
.first()

const newVal = row.is_hidden ? 0 : 1

await c.env.DB.prepare(`
UPDATE anime SET is_hidden=? WHERE id=?
`).bind(newVal,id).run()

return c.json({success:true})

})

/* =========================
GET SINGLE (EDIT)
========================= */

app.get("/anime/:id", async (c)=>{

const id = c.req.param("id")

const row = await c.env.DB
.prepare("SELECT * FROM anime WHERE id=?")
.bind(id)
.first()

return c.json(row)

})

export default app
