import { Hono } from "hono"

const app = new Hono()

/* =========================
GET ANIME (FILTER + SEARCH)
========================= */

app.get("/anime", async (c)=>{

const {type,status,home,q} = c.req.query()

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

query += " ORDER BY created_at DESC"

const rows = await c.env.DB.prepare(query).bind(...params).all()

return c.json(rows.results)

})

/* =========================
CREATE / UPDATE
========================= */

app.post("/anime", async (c)=>{

const b = await c.req.json()

const id = b.id || crypto.randomUUID()

await c.env.DB.prepare(`
INSERT OR REPLACE INTO anime VALUES(
?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
)
`).bind(

id,
b.title,
b.slug,

b.type,
b.status,

b.poster,
b.banner,

b.year,
b.rating,

b.language,
b.duration,

b.genres,
b.tags,
b.description,

b.isHome?1:0,
b.isTrending?1:0,
b.isMostViewed?1:0,
b.isBanner?1:0,

0,
Date.now()

).run()

return c.json({success:true,id})

})

/* =========================
DELETE
========================= */

app.delete("/anime/:id", async (c)=>{

await c.env.DB.prepare("DELETE FROM anime WHERE id=?")
.bind(c.req.param("id"))
.run()

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

await c.env.DB.prepare(`
UPDATE anime SET is_hidden=?
WHERE id=?
`)
.bind(row.is_hidden?0:1,id)
.run()

return c.json({success:true})

})

export default app
