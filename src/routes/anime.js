import { Hono } from "hono"

const app = new Hono()

/* GET */
app.get("/", async (c)=>{

const { type, status, q } = c.req.query()

let sql="SELECT * FROM anime WHERE 1=1"
const params=[]

if(type){
sql+=" AND type=?"
params.push(type)
}

if(status){
sql+=" AND status=?"
params.push(status)
}

if(q){
sql+=" AND title LIKE ?"
params.push(`%${q}%`)
}

sql+=" ORDER BY created_at DESC"

const { results } = await c.env.DB.prepare(sql).bind(...params).all()

return c.json(results)

})

/* POST */
app.post("/", async (c)=>{

const body = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO anime VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`).bind(

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

body.isHome?1:0,
body.isTrending?1:0,
body.isMostViewed?1:0,
body.isBanner?1:0,

0,
Date.now()

).run()

return c.json({success:true})

})

/* DELETE */
app.delete("/:id", async (c)=>{

const id=c.req.param("id")

await c.env.DB.prepare("DELETE FROM anime WHERE id=?")
.bind(id).run()

return c.json({success:true})

})

export default app
