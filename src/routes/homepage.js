import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL ROWS (ADMIN)
========================= */

app.get("/homepage", verifyAdmin, async (c)=>{

const rows = await c.env.DB.prepare(`
SELECT *
FROM homepage_rows
ORDER BY row_order ASC
`).all()

return c.json(rows.results)

})

/* =========================
GET SINGLE ROW
========================= */

app.get("/homepage/:id", verifyAdmin, async (c)=>{

const row = await c.env.DB.prepare(`
SELECT *
FROM homepage_rows
WHERE id=?
`)
.bind(c.req.param("id"))
.first()

return c.json(row)

})

/* =========================
CREATE ROW
========================= */

app.post("/homepage", verifyAdmin, async (c)=>{

const body = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO homepage_rows
(id,title,type,source,layout,row_limit,row_order,active,autoUpdate)
VALUES(?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
body.title,
body.type,
body.source,
body.layout,
body.limit,
body.order,
body.active ? 1 : 0,
body.autoUpdate ? 1 : 0

)
.run()

return c.json({success:true})

})

/* =========================
UPDATE ROW
========================= */

app.patch("/homepage/:id", verifyAdmin, async (c)=>{

const body = await c.req.json()

await c.env.DB.prepare(`
UPDATE homepage_rows
SET

title=?,
type=?,
source=?,
layout=?,
row_limit=?,
row_order=?,
active=?,
autoUpdate=?

WHERE id=?

`)
.bind(

body.title,
body.type,
body.source,
body.layout,
body.limit,
body.order,
body.active ? 1 : 0,
body.autoUpdate ? 1 : 0,
c.req.param("id")

)
.run()

return c.json({success:true})

})

/* =========================
DELETE ROW
========================= */

app.delete("/homepage/:id", verifyAdmin, async (c)=>{

await c.env.DB.prepare(`
DELETE FROM homepage_rows
WHERE id=?
`)
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

export default app
