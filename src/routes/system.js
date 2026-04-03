import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ================= GET PUBLIC ================= */

app.get("/system", async (c)=>{

  const row = await c.env.DB
    .prepare("SELECT * FROM system_settings WHERE id=1")
    .first()

  return c.json(row || {})

})

/* ================= UPDATE ADMIN ================= */

app.post("/system", verifyAdmin, async (c)=>{

  const body = await c.req.json()
  const db = c.env.DB

  for(const key in body){

    await db.prepare(`
      UPDATE system_settings
      SET ${key}=?
      WHERE id=1
    `)
    .bind(body[key])
    .run()
  }

  return c.json({success:true})

})

/* ================= KILL ================= */

app.post("/system/kill", verifyAdmin, async (c)=>{

  await c.env.DB.prepare(`
    UPDATE system_settings SET systemOn=0 WHERE id=1
  `).run()

  return c.json({halted:true})

})

export default app
