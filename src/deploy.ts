import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const deploy = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ENSURE SYSTEM ROW EXISTS
================================ */
async function ensureState(db: D1Database){

  const state:any = await db
    .prepare("SELECT * FROM system_state WHERE id=1")
    .first()

  if(!state){

    await db.prepare(`
      INSERT INTO system_state (id,frozen,emergency,updatedAt)
      VALUES (1,0,0,?)
    `)
    .bind(new Date().toISOString())
    .run()

  }

}

/* ===============================
   GET STATUS
================================ */
deploy.get("/", async (c) => {

  const db = c.env.DB

  try{

    await ensureState(db)

    const state = await db
      .prepare("SELECT * FROM system_state WHERE id=1")
      .first()

    const versions = await db
      .prepare("SELECT * FROM versions ORDER BY date DESC")
      .all()

    const backups = await db
      .prepare("SELECT * FROM backups ORDER BY date DESC")
      .all()

    return c.json({
      state: state || {},
      versions: versions?.results || [],
      backups: backups?.results || []
    })

  }catch(err){

    console.error("Deploy status error:",err)

    return c.json({
      state:{},
      versions:[],
      backups:[]
    })

  }

})

/* ===============================
   DEPLOY
================================ */
deploy.post("/deploy", async (c) => {

  try{

    const id = crypto.randomUUID()
    const date = new Date().toISOString()

    await c.env.DB.prepare(`
      INSERT INTO versions (id,name,date)
      VALUES (?,?,?)
    `)
    .bind(id,id.slice(0,8),date)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Deploy error:",err)

    return c.json({error:"Deploy failed"},500)

  }

})

/* ===============================
   FREEZE
================================ */
deploy.patch("/freeze", async (c) => {

  try{

    await ensureState(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE system_state
      SET frozen=1, updatedAt=?
      WHERE id=1
    `)
    .bind(new Date().toISOString())
    .run()

    return c.json({success:true})

  }catch(err){

    return c.json({error:"Freeze failed"},500)

  }

})

/* ===============================
   UNFREEZE
================================ */
deploy.patch("/unfreeze", async (c) => {

  try{

    await ensureState(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE system_state
      SET frozen=0, updatedAt=?
      WHERE id=1
    `)
    .bind(new Date().toISOString())
    .run()

    return c.json({success:true})

  }catch(err){

    return c.json({error:"Unfreeze failed"},500)

  }

})

/* ===============================
   CREATE VERSION
================================ */
deploy.post("/version", async (c) => {

  try{

    const id = crypto.randomUUID()
    const date = new Date().toISOString()

    await c.env.DB.prepare(`
      INSERT INTO versions (id,name,date)
      VALUES (?,?,?)
    `)
    .bind(id,id.slice(0,8),date)
    .run()

    const versions = await c.env.DB
      .prepare("SELECT * FROM versions ORDER BY date DESC")
      .all()

    return c.json({versions:versions?.results || []})

  }catch(err){

    return c.json({versions:[]})

  }

})

/* ===============================
   CREATE BACKUP
================================ */
deploy.post("/backup", async (c) => {

  try{

    const id = crypto.randomUUID()
    const date = new Date().toISOString()

    await c.env.DB.prepare(`
      INSERT INTO backups (id,name,date)
      VALUES (?,?,?)
    `)
    .bind(id,id.slice(0,8),date)
    .run()

    const backups = await c.env.DB
      .prepare("SELECT * FROM backups ORDER BY date DESC")
      .all()

    return c.json({backups:backups?.results || []})

  }catch(err){

    return c.json({backups:[]})

  }

})

/* ===============================
   RESTORE
================================ */
deploy.post("/restore/:id", async (c) => {

  const id = c.req.param("id")

  return c.json({
    restored:id
  })

})

/* ===============================
   EMERGENCY SHUTDOWN
================================ */
deploy.post("/emergency/shutdown", async (c) => {

  try{

    await ensureState(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE system_state
      SET emergency=1, updatedAt=?
      WHERE id=1
    `)
    .bind(new Date().toISOString())
    .run()

    return c.json({success:true})

  }catch{

    return c.json({error:"Shutdown failed"},500)

  }

})

/* ===============================
   EMERGENCY RECOVER
================================ */
deploy.post("/emergency/recover", async (c) => {

  try{

    await ensureState(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE system_state
      SET emergency=0, updatedAt=?
      WHERE id=1
    `)
    .bind(new Date().toISOString())
    .run()

    return c.json({success:true})

  }catch{

    return c.json({error:"Recover failed"},500)

  }

})

export default deploy
