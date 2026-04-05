import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ALLOWED FIELDS (SECURITY)
========================= */
const ALLOWED_FIELDS = [
  "systemOn","maintenanceSoft","maintenanceHard","lockCMS","readOnly",
  "env","theme","animation",
  "geoBlock","ageLock","schedule","shadow"
]

/* =========================
ENSURE ROW EXISTS
========================= */
async function ensureRow(db){

  const row = await db
    .prepare("SELECT id FROM system_settings WHERE id=1")
    .first()

  if(!row){
    await db.prepare(`
      INSERT INTO system_settings (id) VALUES (1)
    `).run()
  }

}

/* =========================
GET SYSTEM SETTINGS
========================= */
app.get("/system", verifyAdmin, async (c) => {

  try{

    const db = c.env.DB

    await ensureRow(db)

    const data = await db
      .prepare("SELECT * FROM system_settings WHERE id=1")
      .first()

    return c.json(data || {})

  }catch(e){
    return c.json({ error:"DB_ERROR" },500)
  }

})

/* =========================
UPDATE SETTINGS (SAFE)
========================= */
app.post("/system", verifyAdmin, async (c) => {

  try{

    const body = await c.req.json()
    const db = c.env.DB

    await ensureRow(db)

    for(const key of Object.keys(body)){

      if(!ALLOWED_FIELDS.includes(key)) continue

      await db.prepare(`
        UPDATE system_settings
        SET ${key} = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `)
      .bind(body[key])
      .run()

    }

    return c.json({ success:true })

  }catch(e){
    return c.json({ success:false, error:"UPDATE_FAILED" },500)
  }

})

/* =========================
RESET SYSTEM
========================= */
app.post("/system/reset", verifyAdmin, async (c) => {

  try{

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

  }catch{
    return c.json({ error:"RESET_FAILED" },500)
  }

})

/* =========================
KILL SWITCH
========================= */
app.post("/system/kill", verifyAdmin, async (c) => {

  try{

    await c.env.DB.prepare(`
      UPDATE system_settings
      SET systemOn=0,
          maintenanceHard=1,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=1
    `).run()

    return c.json({ halted:true })

  }catch{
    return c.json({ error:"KILL_FAILED" },500)
  }

})

/* =========================
CACHE CLEAR (SAFE)
========================= */
app.post("/system/cache-clear", verifyAdmin, async (c) => {

  try{

    const db = c.env.DB

    // Ensure table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS cache_store (
        id TEXT PRIMARY KEY,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()

    await db.prepare(`DELETE FROM cache_store`).run()

    return c.json({ success:true })

  }catch{
    return c.json({ error:"CACHE_FAILED" },500)
  }

})

export default app
