import { Hono } from "hono"

const app = new Hono()

/* =========================
SAFE PUBLIC RESPONSE FILTER
========================= */

function buildSafeConfig(row){

  return {

    defaultServer: row.default_server,

    autoplay: !!row.autoplay,
    resume: !!row.resume,
    autoswitch: !!row.autoswitch,

    mode: row.mode,

    ui:{
      servers: !!row.ui_servers,
      download: !!row.ui_download,
      subscribe: !!row.ui_subscribe,
      related: !!row.ui_related
    },

    /* 🔥 SECURITY HIDE */
    security:{
      sandbox: !!row.sec_sandbox,
      referrer: row.sec_referrer
    }

  }

}

/* =========================
GET PUBLIC PLAYER CONFIG
========================= */

app.get("/player", async (c)=>{

  try{

    const db = c.env.DB

    const row = await db
      .prepare("SELECT * FROM player_settings WHERE id=1")
      .first()

    if(!row){
      return c.json({})
    }

    return c.json(buildSafeConfig(row))

  }catch(e){

    console.error("PUBLIC PLAYER ERROR:",e)

    return c.json({
      error:"Failed to load player"
    },500)

  }

})

/* =========================
GET STREAM DATA (MAIN PLAYER API)
========================= */

app.get("/player/stream", async (c)=>{

  try{

    const db = c.env.DB

    const anime = c.req.query("anime")
    const ep = c.req.query("ep")

    if(!anime || !ep){
      return c.json({error:"Missing params"},400)
    }

    /* ================= CONFIG ================= */

    const cfg = await db
      .prepare("SELECT * FROM player_settings WHERE id=1")
      .first()

    if(!cfg){
      return c.json({error:"Config missing"},500)
    }

    /* ================= SERVER ================= */

    let server = await db.prepare(`
      SELECT * FROM servers
      WHERE name=? AND active=1
    `).bind(cfg.default_server).first()

    if(!server){

      server = await db.prepare(`
        SELECT * FROM servers
        WHERE active=1
        ORDER BY priority DESC
        LIMIT 1
      `).first()

    }

    if(!server){
      return c.json({error:"No server"},503)
    }

    /* ================= URL ================= */

    const stream = `${server.url}/stream/${anime}/${ep}`

    /* ================= RESPONSE ================= */

    return c.json({

      stream,

      server: server.name,

      config:{
        autoplay: !!cfg.autoplay,
        resume: !!cfg.resume,
        autoswitch: !!cfg.autoswitch,
        mode: cfg.mode,

        ui:{
          servers: !!cfg.ui_servers,
          download: !!cfg.ui_download,
          subscribe: !!cfg.ui_subscribe,
          related: !!cfg.ui_related
        },

        security:{
          sandbox: !!cfg.sec_sandbox,
          referrer: cfg.sec_referrer
        }

      }

    })

  }catch(e){

    console.error("STREAM ERROR:",e)

    return c.json({error:"Stream failed"},500)

  }

})

export default app
