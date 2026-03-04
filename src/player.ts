import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const player = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ENSURE SETTINGS ROW EXISTS
================================ */
async function ensureRow(db:D1Database){

  const row = await db
    .prepare("SELECT id FROM player_settings WHERE id=1")
    .first()

  if(!row){

    await db.prepare(`
      INSERT INTO player_settings (
        id,defaultServer,autoplay,resume,autoswitch,mode,
        ui_servers,ui_download,ui_subscribe,ui_related
      )
      VALUES (1,'Server 1',0,0,0,'responsive',1,1,1,1)
    `).run()

  }

}

/* ===============================
   GET PLAYER SETTINGS
================================ */
player.get("/", async (c) => {

  try{

    await ensureRow(c.env.DB)

    const row:any = await c.env.DB
      .prepare("SELECT * FROM player_settings WHERE id=1")
      .first()

    if(!row){
      return c.json({})
    }

    return c.json({
      defaultServer: row.defaultServer || "Server 1",
      autoplay: !!row.autoplay,
      resume: !!row.resume,
      autoswitch: !!row.autoswitch,
      mode: row.mode || "responsive",
      ui:{
        servers: !!row.ui_servers,
        download: !!row.ui_download,
        subscribe: !!row.ui_subscribe,
        related: !!row.ui_related
      }
    })

  }catch(err){

    console.error("Player load error:",err)

    return c.json({})

  }

})

/* ===============================
   SAVE PLAYER SETTINGS
================================ */
player.post("/", async (c) => {

  try{

    const body = await c.req.json()

    await ensureRow(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE player_settings
      SET
        defaultServer=?,
        autoplay=?,
        resume=?,
        autoswitch=?,
        mode=?,
        ui_servers=?,
        ui_download=?,
        ui_subscribe=?,
        ui_related=?
      WHERE id=1
    `)
    .bind(
      body.defaultServer || "Server 1",
      body.autoplay ? 1 : 0,
      body.resume ? 1 : 0,
      body.autoswitch ? 1 : 0,
      body.mode || "responsive",
      body.ui?.servers ? 1 : 0,
      body.ui?.download ? 1 : 0,
      body.ui?.subscribe ? 1 : 0,
      body.ui?.related ? 1 : 0
    )
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Player save error:",err)

    return c.json({error:"Save failed"},500)

  }

})

export default player
