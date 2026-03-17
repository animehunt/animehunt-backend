import { Hono } from "hono"

const app = new Hono()

/* ================= GET ALL ================= */

app.get("/categories", async (c)=>{

const rows = await c.env.DB.prepare(`
SELECT *
FROM categories
ORDER BY priority ASC, category_order ASC
`).all()

return c.json(rows.results)

})

/* ================= GET SINGLE ================= */

app.get("/categories/:id", async (c)=>{

const row = await c.env.DB.prepare(`
SELECT *
FROM categories
WHERE id=?
`)
.bind(c.req.param("id"))
.first()

return c.json(row)

})

/* ================= CREATE ================= */

app.post("/categories", async (c)=>{

const d = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO categories(

id,name,slug,type,
category_order,priority,
show_home,active,featured,
ai_trending,ai_popular,ai_assign,
created_at

) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
d.name,
d.slug,
d.type,

d.order,
d.priority,

d.showHome ? 1 : 0,
d.isActive ? 1 : 0,
d.isFeatured ? 1 : 0,

d.aiTrending ? 1 : 0,
d.aiPopular ? 1 : 0,
d.aiAssign ? 1 : 0,

Date.now()

)
.run()

return c.json({success:true})

})

/* ================= UPDATE ================= */

app.put("/categories/:id", async (c)=>{

const d = await c.req.json()
const id = c.req.param("id")

await c.env.DB.prepare(`
UPDATE categories SET

name=?,
slug=?,
type=?,

category_order=?,
priority=?,

show_home=?,
active=?,
featured=?,

ai_trending=?,
ai_popular=?,
ai_assign=?

WHERE id=?
`)
.bind(

d.name,
d.slug,
d.type,

d.order,
d.priority,

d.showHome ? 1 : 0,
d.isActive ? 1 : 0,
d.isFeatured ? 1 : 0,

d.aiTrending ? 1 : 0,
d.aiPopular ? 1 : 0,
d.aiAssign ? 1 : 0,

id

)
.run()

return c.json({success:true})

})

/* ================= DELETE ================= */

app.delete("/categories/:id", async (c)=>{

await c.env.DB.prepare(`
DELETE FROM categories WHERE id=?
`)
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

export default app
