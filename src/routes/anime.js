import { Hono } from "hono"

const app = new Hono()

/* GET ANIME */
app.get("/anime", async (c)=>{

const {type,status,home,q} = c.req.query()

let query = `SELECT * FROM anime WHERE 1=1`
let binds=[]

if(type){
query += ` AND type=?`
binds.push(type)
}

if(status){
query += ` AND status=?`
binds.push(status)
}

if(home==="yes"){
query += ` AND is_home=1`
}

if(home==="no"){
query += ` AND is_home=0`
}

if(q){
query += ` AND title LIKE ?`
binds.push("%"+q+"%")
}

query += ` ORDER BY created_at DESC`

const rows = await c.env.DB.prepare(query).bind(...binds).all()

return c.json(rows.results)

})

/* CREATE / UPDATE */
app.post("/anime", async (c)=>{

const body = await c.req.json()

const id = body.id || crypto.randomUUID()

await c.env.DB.prepare(`
INSERT OR REPLACE INTO anime(

id,title,slug,type,status,
poster,banner,
year,rating,language,duration,
genres,tags,description,
is_home,is_trending,is_most_viewed,is_banner,
created_at

) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
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

body.genres,
body.tags,
body.description,

body.isHome,
body.isTrending,
body.isMostViewed,
body.isBanner,

Date.now()

)
.run()

return c.json({success:true})

})

/* DELETE */
app.delete("/anime/:id", async (c)=>{

await c.env.DB.prepare(`
DELETE FROM anime WHERE id=?
`).bind(c.req.param("id")).run()

return c.json({success:true})

})

/* HIDE */
app.patch("/anime-hide/:id", async (c)=>{

await c.env.DB.prepare(`
UPDATE anime SET is_hidden = CASE WHEN is_hidden=1 THEN 0 ELSE 1 END
WHERE id=?
`).bind(c.req.param("id")).run()

return c.json({success:true})

})

export default app
