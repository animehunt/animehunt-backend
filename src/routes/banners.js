import { Hono } from "hono"

const app = new Hono()

/* ================= GET ================= */

app.get("/banners", async (c)=>{

try{

const { results } = await c.env.DB.prepare(`
SELECT *
FROM banners
ORDER BY banner_order ASC
`).all()

return c.json(results || [])

}catch(e){

console.error("GET banners error:", e)

return c.json({success:false,error:"Failed to load banners"},500)

}

})

/* ================= CREATE / UPDATE ================= */

app.post("/banners", async (c)=>{

try{

const b = await c.req.json()

if(!b.image){
return c.json({success:false,error:"Image required"},400)
}

const id = b.id || crypto.randomUUID()

await c.env.DB.prepare(`
INSERT OR REPLACE INTO banners(

id,
title,
page,
category,
position,
banner_order,
image,
active,
auto_rotate,
created_at

) VALUES(?,?,?,?,?,?,?,?,?,?)
`)
.bind(

id,
b.title || "",
b.page || "home",
b.category || "",
b.position || "hero",
Number(b.banner_order || 0),
b.image,
b.active ? 1 : 0,
b.autoRotate ? 1 : 0,
Date.now()

)
.run()

return c.json({success:true,id})

}catch(e){

console.error("SAVE banner error:", e)

return c.json({success:false,error:"Save failed"},500)

}

})

/* ================= DELETE ================= */

app.delete("/banners/:id", async (c)=>{

try{

const id = c.req.param("id")

await c.env.DB.prepare(`
DELETE FROM banners WHERE id=?
`)
.bind(id)
.run()

return c.json({success:true})

}catch(e){

console.error("DELETE banner error:", e)

return c.json({success:false},500)

}

})

/* ================= STATUS TOGGLE ================= */

app.patch("/banners/:id/status", async (c)=>{

try{

const id = c.req.param("id")

const { active } = await c.req.json()

await c.env.DB.prepare(`
UPDATE banners SET active=? WHERE id=?
`)
.bind(active ? 1 : 0, id)
.run()

return c.json({success:true})

}catch(e){

console.error("STATUS error:", e)

return c.json({success:false},500)

}

})

export default app
