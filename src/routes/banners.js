import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

app.get("/banners", verifyAdmin, async (c)=>{

  const { results } = await c.env.DB
  .prepare("SELECT * FROM banners ORDER BY banner_order ASC")
  .all()

  return c.json(results)

})

app.post("/banners", verifyAdmin, async (c)=>{

  try{

    const db = c.env.DB
    const body = await c.req.json()

    const id = body.id || crypto.randomUUID()

    await db.prepare(`
      INSERT INTO banners
      (id,title,page,category,position,banner_order,image,active,auto_rotate)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id)
      DO UPDATE SET
      title=excluded.title,
      page=excluded.page,
      category=excluded.category,
      position=excluded.position,
      banner_order=excluded.banner_order,
      image=excluded.image,
      active=excluded.active,
      auto_rotate=excluded.auto_rotate
    `)
    .bind(
      id,
      body.title,
      body.page,
      body.category || "",
      body.position,
      body.banner_order || 0,
      body.image,
      body.active ? 1 : 0,
      body.autoRotate ? 1 : 0
    )
    .run()

    return c.json({
      success:true,
      id
    })

  }catch(e){

    return c.json({
      success:false,
      error:"DB error",
      message:e.message
    },500)

  }

})

app.delete("/banners/:id", verifyAdmin, async (c)=>{

  await c.env.DB
  .prepare("DELETE FROM banners WHERE id=?")
  .bind(c.req.param("id"))
  .run()

  return c.json({success:true})

})

app.patch("/banners/:id/status", verifyAdmin, async (c)=>{

  const id = c.req.param("id")
  const body = await c.req.json()

  await c.env.DB
  .prepare("UPDATE banners SET active=? WHERE id=?")
  .bind(body.active ? 1 : 0, id)
  .run()

  return c.json({success:true})

})

export default app
