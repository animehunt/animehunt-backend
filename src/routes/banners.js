import { Hono } from "hono"

const app = new Hono()

/* ================= GET ================= */

app.get("/banners", async (c)=>{

const rows = await c.env.DB.prepare(`
SELECT *
FROM banners
ORDER BY banner_order ASC
`).all()

return c.json(rows.results)

})

/* ================= CREATE / UPDATE ================= */

app.post("/banners", async (c)=>{

const b = await c.req.json()

const id = b.id || crypto.randomUUID()

await c.env.DB.prepare(`
INSERT OR REPLACE INTO banners(

id,title,page,category,position,
banner_order,image,active,auto_rotate,created_at

) VALUES(?,?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
b.title,
b.page,
b.category,
b.position,
b.banner_order,
b.image,
b.active ? 1 : 0,
b.autoRotate ? 1 : 0,
Date.now()

)
.run()

return c.json({success:true,id})

})

/* ================= DELETE ================= */

app.delete("/banners/:id", async (c)=>{

await c.env.DB.prepare(`
DELETE FROM banners WHERE id=?
`)
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

/* ================= STATUS TOGGLE ================= */

app.patch("/banners/:id/status", async (c)=>{

const {active} = await c.req.json()

await c.env.DB.prepare(`
UPDATE banners SET active=? WHERE id=?
`)
.bind(active ? 1 : 0, c.req.param("id"))
.run()

return c.json({success:true})

})

export default app
