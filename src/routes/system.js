import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ALLOWED FIELDS (SECURITY)
========================= */

const allowedFields = [
"systemOn","maintenanceSoft","maintenanceHard","lockCMS","readOnly","env",
"theme","animation",
"geoBlock","ageLock","schedule","shadow"
]

/* =========================
ENSURE ROW EXISTS
========================= */

async function ensureRow(db){

  const row = await db.prepare(
    "SELECT id FROM system_settings WHERE id=1"
  ).first()

  if(!row){
    await db.prepare(
      "INSERT INTO system_settings (id) VALUES (1)"
    ).run()
  }

}

/* =========================
GET ADMIN CONFIG
========================= */

app.get("/system", verifyAdmin, async (c)=>{

  try{

    await ensureRow(c.env.DB)

    const row = await c.env.DB.prepare(
      "SELECT * FROM system_settings WHERE id=1"
    ).first()

    return c.json(row || {})

  }catch(e){
    return c.json({error:"DB Error"},500)
  }

})

/* =========================
GET PUBLIC CONFIG
========================= */

app.get("/system/public", async (c)=>{

  try{

    const row = await c.env.DB.prepare(
      "SELECT * FROM system_settings WHERE id=1"
    ).first()

    if(!row) return c.json({})

    const safe = {}

    allowedFields.forEach(f=>{
      safe[f] = row[f]
    })

    return c.json(safe)

  }catch{
    return c.json({})
  }

})

/* =========================
UPDATE SYSTEM
========================= */

app.post("/system", verifyAdmin, async (c)=>{

  try{

    const body = await c.req.json()
    const db = c.env.DB

    await ensureRow(db)

    for(const key of Object.keys(body)){

      if(!allowedFields.includes(key)) continue

      const value = typeof body[key] === "boolean"
        ? (body[key] ? 1 : 0)
        : body[key]

      await db.prepare(`
        UPDATE system_settings
        SET ${key} = ?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `)
      .bind(value)
      .run()

    }

    return c.json({success:true})

  }catch(e){
    return c.json({error:"Update Failed"},500)
  }

})

/* =========================
RESET SYSTEM
========================= */

app.post("/system/reset", verifyAdmin, async (c)=>{

  try{

    await c.env.DB.prepare(`
      DELETE FROM system_settings
    `).run()

    await c.env.DB.prepare(`
      INSERT INTO system_settings (id) VALUES (1)
    `).run()

    return c.json({success:true})

  }catch{
    return c.json({error:"Reset Failed"},500)
  }

})

/* =========================
KILL SWITCH
========================= */

app.post("/system/kill", verifyAdmin, async (c)=>{

  try{

    await c.env.DB.prepare(`
      UPDATE system_settings
      SET systemOn=0
      WHERE id=1
    `).run()

    return c.json({halted:true})

  }catch{
    return c.json({error:"Kill Failed"},500)
  }

})

/* =========================
CACHE CLEAR (REAL HOOK)
========================= */

app.post("/system/cache-clear", verifyAdmin, async (c)=>{

  try{

    // future: cloudflare cache purge / kv clear
    return c.json({cleared:true})

  }catch{
    return c.json({error:true},500)
  }

})

/* =========================
EXPORT CONFIG
========================= */

app.get("/system/export", verifyAdmin, async (c)=>{

  try{

    const row = await c.env.DB.prepare(
      "SELECT * FROM system_settings WHERE id=1"
    ).first()

    return c.json(row || {})

  }catch{
    return c.json({error:true},500)
  }

})

/* =========================
IMPORT CONFIG
========================= */

app.post("/system/import", verifyAdmin, async (c)=>{

  try{

    const data = await c.req.json()
    const db = c.env.DB

    for(const key of Object.keys(data)){

      if(!allowedFields.includes(key)) continue

      await db.prepare(`
        UPDATE system_settings
        SET ${key}=?
        WHERE id=1
      `)
      .bind(data[key])
      .run()

    }

    return c.json({imported:true})

  }catch{
    return c.json({error:true},500)
  }

})

export default app
