import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ================= GET ================= */

app.get("/deploy", verifyAdmin, async (c)=>{

  try{

    const db = c.env.DB

    const state = await db.prepare("SELECT * FROM deploy_state WHERE id=1").first()

    const versions = (await db
      .prepare("SELECT * FROM deploy_versions ORDER BY date DESC")
      .all()).results

    const backups = (await db
      .prepare("SELECT id,name,date FROM deploy_backups ORDER BY date DESC")
      .all()).results

    return c.json({ state, versions, backups })

  }catch(e){
    console.error("DEPLOY LOAD ERROR:",e)
    return c.json({error:"Load failed"},500)
  }

})

/* ================= DEPLOY ================= */

app.post("/deploy/deploy", verifyAdmin, async (c)=>{

  await c.env.DB.prepare(`
    UPDATE deploy_state
    SET last_deploy=CURRENT_TIMESTAMP
    WHERE id=1
  `).run()

  return c.json({success:true})

})

/* ================= VERSION ================= */

app.post("/deploy/version", verifyAdmin, async (c)=>{

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO deploy_versions(id,name,date)
    VALUES(?,?,CURRENT_TIMESTAMP)
  `)
  .bind(id,"Version "+Date.now())
  .run()

  return c.json({success:true})

})

/* ================= BACKUP ================= */

app.post("/deploy/backup", verifyAdmin, async (c)=>{

  try{

    const db = c.env.DB

    const data = {
      anime:(await db.prepare("SELECT * FROM anime").all()).results,
      episodes:(await db.prepare("SELECT * FROM episodes").all()).results,
      categories:(await db.prepare("SELECT * FROM categories").all()).results,
      banners:(await db.prepare("SELECT * FROM banners").all()).results
    }

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO deploy_backups(id,name,data,date)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
    `)
    .bind(id,"Backup "+new Date().toISOString(),JSON.stringify(data))
    .run()

    return c.json({success:true})

  }catch(e){
    console.error("BACKUP ERROR:",e)
    return c.json({error:"Backup failed"},500)
  }

})

/* ================= DELETE BACKUP ================= */

app.post("/deploy/delete-backup", verifyAdmin, async (c)=>{

  try{

    const body = await c.req.json()

    await c.env.DB.prepare(`
      DELETE FROM deploy_backups WHERE id=?
    `)
    .bind(body.id)
    .run()

    return c.json({success:true})

  }catch(e){
    console.error("DELETE BACKUP ERROR:",e)
    return c.json({error:"Delete failed"},500)
  }

})

/* ================= RESTORE ================= */

app.post("/deploy/restore", verifyAdmin, async (c)=>{

  try{

    const body = await c.req.json()

    const row = await c.env.DB.prepare(`
      SELECT data FROM deploy_backups WHERE id=?
    `)
    .bind(body.id)
    .first()

    if(!row) return c.json({error:"Backup not found"},404)

    const data = JSON.parse(row.data)
    const db = c.env.DB

    await db.prepare("DELETE FROM anime").run()
    await db.prepare("DELETE FROM episodes").run()
    await db.prepare("DELETE FROM categories").run()
    await db.prepare("DELETE FROM banners").run()

    /* SAFE INSERT (IMPORTANT FIX) */
    for(const a of data.anime){
      await db.prepare(`INSERT INTO anime VALUES(${Object.keys(a).map(()=>"?").join(",")})`)
      .bind(...Object.values(a)).run()
    }

    for(const e of data.episodes){
      await db.prepare(`INSERT INTO episodes VALUES(${Object.keys(e).map(()=>"?").join(",")})`)
      .bind(...Object.values(e)).run()
    }

    for(const cdata of data.categories){
      await db.prepare(`INSERT INTO categories VALUES(${Object.keys(cdata).map(()=>"?").join(",")})`)
      .bind(...Object.values(cdata)).run()
    }

    for(const b of data.banners){
      await db.prepare(`INSERT INTO banners VALUES(${Object.keys(b).map(()=>"?").join(",")})`)
      .bind(...Object.values(b)).run()
    }

    return c.json({success:true})

  }catch(e){
    console.error("RESTORE ERROR:",e)
    return c.json({error:"Restore failed"},500)
  }

})

/* ================= STATE ================= */

app.patch("/deploy/state", verifyAdmin, async (c)=>{

  const body = await c.req.json()

  if(body.type==="freeze"){
    await c.env.DB.prepare(`UPDATE deploy_state SET frozen=? WHERE id=1`)
    .bind(body.value?1:0).run()
  }

  if(body.type==="emergency"){
    await c.env.DB.prepare(`UPDATE deploy_state SET emergency=? WHERE id=1`)
    .bind(body.value?1:0).run()
  }

  return c.json({success:true})

})

export default app
