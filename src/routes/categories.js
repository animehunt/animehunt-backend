import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL
========================= */

app.get("/categories", verifyAdmin, async (c)=>{

const { results } = await c.env.DB
.prepare(`
SELECT * FROM categories
ORDER BY category_order ASC
`)
.all()

return c.json(results)

})

/* =========================
GET SINGLE
========================= */

app.get("/categories/:id", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM categories WHERE id=?")
.bind(c.req.param("id"))
.first()

if(!row) return c.json({error:"Not found"},404)

return c.json(row)

})

/* =========================
CREATE
========================= */

app.post("/categories", verifyAdmin, async (c)=>{

const body = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO categories
(id,name,slug,type,category_order,priority,show_home,active,featured,ai_trending,ai_popular,ai_assign)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
body.name,
body.slug,
body.type,

body.order,
body.priority,

body.showHome?1:0,
body.isActive?1:0,

body.isFeatured?1:0,

body.aiTrending?1:0,
body.aiPopular?1:0,
body.aiAssign?1:0

)
.run()

return c.json({success:true,id})

})

/* =========================
UPDATE
========================= */

app.put("/categories/:id", verifyAdmin, async (c)=>{

const body = await c.req.json()

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

body.name,
body.slug,
body.type,

body.order,
body.priority,

body.showHome?1:0,
body.isActive?1:0,

body.isFeatured?1:0,

body.aiTrending?1:0,
body.aiPopular?1:0,
body.aiAssign?1:0,

c.req.param("id")

)
.run()

return c.json({success:true})

})

/* =========================
DELETE
========================= */

app.delete("/categories/:id", verifyAdmin, async (c)=>{

await c.env.DB
.prepare("DELETE FROM categories WHERE id=?")
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

export default app
