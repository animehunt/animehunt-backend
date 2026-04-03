import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ALLOWED FIELDS (SECURITY)
========================= */

const allowedFields = [
  "systemOn",
  "maintenanceMode",
  "siteName",
  "logo",
  "theme",
  "maxUploadSize",
  "allowRegister",
  "allowGuest",
  "adsEnabled",
  "aiEnabled"
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
      INSERT INTO system_settings (id, systemOn, maintenanceMode, siteName)
      VALUES (1,1,0,'AnimeHunt')
    `).run()

  }

}

/* =========================
PUBLIC: GET SYSTEM CONFIG
========================= */

app.get("/system", async (c)=>{

  try{

    const db = c.env.DB

    await ensureRow(db)

    const row = await db
      .prepare("SELECT * FROM system_settings WHERE id=1")
      .first()

    if(!row) return c.json({})

    /* 🔥 SAFE FILTER */
    const publicData = {}

    allowedFields.forEach(f=>{
      publicData[f] = row[f]
    })

    return c.json(publicData)

  }catch(e){
    return c.json({ error:"SYSTEM_FETCH_ERROR" },500)
  }

})

/* =========================
ADMIN: UPDATE SYSTEM
========================= */

app.post("/system", verifyAdmin, async (c)=>{

  try{

    const body = await c.req.json()
    const db = c.env.DB

    await ensureRow(db)

    for(const key of Object.keys(body)){

      if(!allowedFields.includes(key)) continue

      await db.prepare(`
        UPDATE system_settings
        SET ${key}=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `)
      .bind(body[key])
      .run()

    }

    return c.json({ success:true })

  }catch(e){
    return c.json({ error:"SYSTEM_UPDATE_FAILED" },500)
  }

})

/* =========================
KILL SWITCH (FULL STOP)
========================= */

app.post("/system/kill", verifyAdmin, async (c)=>{

  try{

    await c.env.DB.prepare(`
      UPDATE system_settings
      SET systemOn=0, maintenanceMode=1
      WHERE id=1
    `).run()

    return c.json({
      halted:true,
      message:"System stopped"
    })

  }catch{
    return c.json({ error:"KILL_FAILED" },500)
  }

})

/* =========================
RESET SYSTEM
========================= */

app.post("/system/reset", verifyAdmin, async (c)=>{

  try{

    await c.env.DB.prepare(`
      UPDATE system_settings SET

      systemOn=1,
      maintenanceMode=0,
      siteName='AnimeHunt',
      logo='',

      theme='dark',

      maxUploadSize=50,

      allowRegister=1,
      allowGuest=1,

      adsEnabled=1,
      aiEnabled=1,

      updated_at=CURRENT_TIMESTAMP

      WHERE id=1
    `).run()

    return c.json({ success:true })

  }catch{
    return c.json({ error:"RESET_FAILED" },500)
  }

})

export default app
