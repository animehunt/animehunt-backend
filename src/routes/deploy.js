import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ================= SAFE WRAPPER ================= */

function safe(fn){
  return async (c)=>{
    try{
      return await fn(c)
    }catch(e){
      console.error("DEPLOY ERROR:", e)
      return c.json({
        error:"Internal server error",
        details:e.message
      },500)
    }
  }
}

/* =========================
GET DEPLOY DATA
========================= */

app.get("/deploy", verifyAdmin, safe(async (c)=>{

  const db = c.env.DB

  const state = await db
    .prepare("SELECT * FROM deploy_state WHERE id=1")
    .first()

  const backups = (await db
    .prepare("SELECT id,name,date FROM deploy_backups ORDER BY date DESC")
    .all()).results

  return c.json({
    state,
    backups
  })

}))

/* =========================
DEPLOY TRIGGER
========================= */

app.post("/deploy", verifyAdmin, safe(async (c)=>{

  await c.env.DB.prepare(`
    UPDATE deploy_state
    SET last_deploy=CURRENT_TIMESTAMP
    WHERE id=1
  `).run()

  return c.json({ success:true })

}))

/* =========================
CREATE BACKUP
========================= */

app.post("/backup", verifyAdmin, safe(async (c)=>{

  const db = c.env.DB

  const anime = (await db.prepare("SELECT * FROM anime").all()).results
  const episodes = (await db.prepare("SELECT * FROM episodes").all()).results
  const categories = (await db.prepare("SELECT * FROM categories").all()).results
  const banners = (await db.prepare("SELECT * FROM banners").all()).results

  const data = {
    anime,
    episodes,
    categories,
    banners
  }

  const id = crypto.randomUUID()

  await db.prepare(`
    INSERT INTO deploy_backups(id,name,data,date)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
  `)
  .bind(
    id,
    "Backup " + new Date().toISOString(),
    JSON.stringify(data)
  )
  .run()

  return c.json({ success:true })

}))

/* =========================
DELETE BACKUP
========================= */

app.post("/delete-backup", verifyAdmin, safe(async (c)=>{

  const body = await c.req.json()

  if(!body?.id){
    return c.json({ error:"Missing backup id" },400)
  }

  await c.env.DB.prepare(`
    DELETE FROM deploy_backups WHERE id=?
  `)
  .bind(body.id)
  .run()

  return c.json({ success:true })

}))

/* =========================
RESTORE BACKUP (SAFE VERSION)
========================= */

app.post("/restore", verifyAdmin, safe(async (c)=>{

  const body = await c.req.json()

  if(!body?.id){
    return c.json({ error:"Missing backup id" },400)
  }

  const row = await c.env.DB.prepare(`
    SELECT data FROM deploy_backups WHERE id=?
  `)
  .bind(body.id)
  .first()

  if(!row){
    return c.json({ error:"Backup not found" },404)
  }

  const data = JSON.parse(row.data)
  const db = c.env.DB

  /* CLEAR OLD DATA */
  await db.prepare("DELETE FROM anime").run()
  await db.prepare("DELETE FROM episodes").run()
  await db.prepare("DELETE FROM categories").run()
  await db.prepare("DELETE FROM banners").run()

  /* SAFE INSERT FUNCTION */
  async function insert(table, rows){
    for(const r of rows){

      const keys = Object.keys(r)
      const placeholders = keys.map(()=>"?").join(",")

      await db.prepare(`
        INSERT INTO ${table} (${keys.join(",")})
        VALUES (${placeholders})
      `)
      .bind(...Object.values(r))
      .run()
    }
  }

  await insert("anime", data.anime || [])
  await insert("episodes", data.episodes || [])
  await insert("categories", data.categories || [])
  await insert("banners", data.banners || [])

  return c.json({ success:true })

}))

/* =========================
STATE CONTROL
========================= */

app.patch("/state", verifyAdmin, safe(async (c)=>{

  const body = await c.req.json()

  if(body.type==="freeze"){

    await c.env.DB.prepare(`
      UPDATE deploy_state SET frozen=? WHERE id=1
    `)
    .bind(body.value?1:0)
    .run()
  }

  if(body.type==="emergency"){

    await c.env.DB.prepare(`
      UPDATE deploy_state SET emergency=? WHERE id=1
    `)
    .bind(body.value?1:0)
    .run()
  }

  return c.json({ success:true })

}))

export default app
