import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ALLOWED FIELDS (SECURITY)
========================= */

const allowedFields = [
"systemOn","maintenanceSoft","maintenanceHard","lockCMS","readOnly","env",
"theme","animation","skeleton","imgBlur","mobileUI",
"autoHome","aiHome","trendBoost","manualPin","homeMode",
"geoBlock","ageLock","schedule","shadow",
"autoPlay","resume","autoNext","skipIntro","serverSwitch",
"downloads","zip","scan","limit",
"liveSearch","highlight","fuzzy","adult","maxResult",
"antiInspect","iframe","rateLimit","rightClick"
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
      INSERT INTO system_settings (id, systemOn)
      VALUES (1,1)
    `).run()
  }

}

/* =========================
GET ADMIN CONFIG
========================= */

app.get("/system", verifyAdmin, async (c)=>{

  try{

    await ensureRow(c.env.DB)

    const row = await c.env.DB
      .prepare("SELECT * FROM system_settings WHERE id=1")
      .first()

    return c.json(row || {})

  }catch{
    return c.json({error:"DB Error"},500)
  }

})

/* =========================
GET PUBLIC CONFIG
========================= */

app.get("/system/public", async (c)=>{

  try{

    const row = await c.env.DB
      .prepare("SELECT * FROM system_settings WHERE id=1")
      .first()

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

      await db.prepare(`
        UPDATE system_settings
        SET ${key}=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `)
      .bind(body[key])
      .run()

    }

    return c.json({success:true})

  }catch{
    return c.json({error:"Update Failed"},500)
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
      maintenanceSoft=0,
      maintenanceHard=0,
      lockCMS=0,
      readOnly=0,
      env='Production',

      theme='Dark',
      animation='Soft',
      skeleton=1,
      imgBlur=1,
      mobileUI=1,

      autoHome=1,
      aiHome=1,
      trendBoost=1,
      manualPin=0,
      homeMode='Dynamic',

      geoBlock=0,
      ageLock=0,
      schedule=1,
      shadow=0,

      autoPlay=1,
      resume=1,
      autoNext=1,
      skipIntro=1,
      serverSwitch=1,

      downloads=1,
      zip=0,
      scan=1,
      limit=0,

      liveSearch=1,
      highlight=1,
      fuzzy=1,
      adult=0,
      maxResult=12,

      antiInspect=0,
      iframe=1,
      rateLimit=1,
      rightClick=0,

      updated_at=CURRENT_TIMESTAMP

      WHERE id=1
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
WATCH TRACKING (AI INPUT)
========================= */

app.post("/track", async (c)=>{

  try{

    const { user_id, anime_id, category, progress } = await c.req.json()

    await c.env.DB.prepare(`
      INSERT INTO watch_history (user_id,anime_id,category,progress)
      VALUES (?,?,?,?)
    `)
    .bind(user_id,anime_id,category,progress)
    .run()

    return c.json({tracked:true})

  }catch{
    return c.json({error:"Track Failed"},500)
  }

})

/* =========================
RECOMMENDATION API
========================= */

app.get("/recommend/:user", async (c)=>{

  try{

    const user = c.req.param("user")

    const data = await c.env.DB.prepare(`
      SELECT a.*
      FROM recommendations r
      JOIN anime a ON a.id=r.anime_id
      WHERE r.user_id=?
      LIMIT 20
    `).bind(user).all()

    return c.json(data.results || [])

  }catch{
    return c.json([])
  }

})

export default app
