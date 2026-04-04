import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET SYSTEM SETTINGS
========================= */
app.get("/system", async (c) => {

  const data = await c.env.DB
    .prepare("SELECT * FROM system_settings WHERE id=1")
    .first()

  return c.json(data || {})

})

/* =========================
UPDATE SETTINGS
========================= */
app.post("/system", verifyAdmin, async (c) => {

  const body = await c.req.json()
  const db = c.env.DB

  try{

    for(const key in body){

      await db.prepare(`
        UPDATE system_settings
        SET ${key} = ?
        WHERE id = 1
      `)
      .bind(body[key])
      .run()

    }

    return c.json({ success:true })

  }catch(e){
    return c.json({ success:false, error:e.message })
  }

})

/* =========================
RESET SYSTEM
========================= */
app.post("/system/reset", verifyAdmin, async (c) => {

  await c.env.DB.prepare(`
    UPDATE system_settings SET
    systemOn=1,
    maintenanceSoft=0,
    maintenanceHard=0,
    lockCMS=0,
    readOnly=0,
    env='Production',
    theme='Dark',
    animation='Soft',
    geoBlock=0,
    ageLock=0,
    schedule=0,
    shadow=0,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run()

  return c.json({ success:true })

})

/* =========================
KILL SWITCH
========================= */
app.post("/system/kill", verifyAdmin, async (c) => {

  await c.env.DB.prepare(`
    UPDATE system_settings
    SET systemOn=0,
        maintenanceHard=1,
        updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run()

  return c.json({ halted:true })

})

/* =========================
CACHE CLEAR
========================= */
app.post("/system/cache-clear", verifyAdmin, async (c) => {

  try{

    // Example cache clear (customize later)
    await c.env.DB.prepare(`
      DELETE FROM cache_store
    `).run()

  }catch{}

  return c.json({ success:true })

})

export default app
