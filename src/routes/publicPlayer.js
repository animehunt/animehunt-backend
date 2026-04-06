import { Hono } from "hono"

const app = new Hono()

/* =========================
SAFE PUBLIC RESPONSE FILTER
========================= */

function buildSafeConfig(row){

  return {

    defaultServer: row.default_server || "Server 1",

    autoplay: !!row.autoplay,
    resume: !!row.resume,
    autoswitch: !!row.autoswitch,

    mode: row.mode || "responsive",

    ui:{
      servers: !!row.ui_servers,
      download: !!row.ui_download,
      subscribe: !!row.ui_subscribe,
      related: !!row.ui_related
    },

    /* 🔒 SECURITY (LIMITED PUBLIC) */
    security:{
      sandbox: !!row.sec_sandbox,
      referrer: row.sec_referrer || "strict-origin"
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
      return c.json({ success:true, config:{} })
    }

    return c.json({
      success:true,
      config: buildSafeConfig(row)
    })

  }catch(e){

    console.error("PUBLIC PLAYER ERROR:",e)

    return c.json({
      success:false,
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

    /* ================= VALIDATION ================= */

    if(!anime || !ep){
      return c.json({ success:false, error:"Missing params" },400)
    }

    // 🔒 sanitize (IMPORTANT)
    if(!/^\d+$/.test(anime) || !/^\d+$/.test(ep)){
      return c.json({ success:false, error:"Invalid params" },400)
    }

    /* ================= CONFIG ================= */

    const cfg = await db
      .prepare("SELECT * FROM player_settings WHERE id=1")
      .first()

    if(!cfg){
      return c.json({ success:false, error:"Config missing" },500)
    }

    /* ================= SERVER ================= */

    let server = null

    if(cfg.default_server){

      server = await db.prepare(`
        SELECT * FROM servers
        WHERE name=? AND active=1
      `).bind(cfg.default_server).first()

    }

    /* FALLBACK */
    if(!server){

      server = await db.prepare(`
        SELECT * FROM servers
        WHERE active=1
        ORDER BY priority DESC, last_used ASC
        LIMIT 1
      `).first()

    }

    if(!server){
      return c.json({ success:false, error:"No server available" },503)
    }

    /* ================= HEALTH CHECK ================= */

    const alive = await checkServer(server.url)

    if(!alive && cfg.autoswitch){

      const fallback = await db.prepare(`
        SELECT * FROM servers
        WHERE active=1 AND id != ?
        ORDER BY priority DESC
        LIMIT 1
      `).bind(server.id).first()

      if(fallback){
        server = fallback
      }else{
        return c.json({ success:false, error:"All servers down" },503)
      }

    }

    /* ================= STREAM URL ================= */

    const stream = `${server.url}/stream/${anime}/${ep}`

    /* ================= TRACK (ASYNC) ================= */

    trackSession(env, c.req, server.id).catch(()=>{})

    /* ================= RESPONSE ================= */

    return c.json({

      success:true,

      stream,
      server: server.name,

      config: buildSafeConfig(cfg)

    })

  }catch(e){

    console.error("STREAM ERROR:",e)

    return c.json({
      success:false,
      error:"Stream failed"
    },500)

  }

})

/* =========================
SERVER HEALTH CHECK
========================= */

async function checkServer(url){

  try{

    const controller = new AbortController()
    const timeout = setTimeout(()=>controller.abort(), 3000)

    const res = await fetch(url,{
      method:"HEAD",
      signal: controller.signal,
      cf:{ cacheTtl:0 }
    })

    clearTimeout(timeout)

    return res.ok

  }catch{
    return false
  }

}

/* =========================
TRACK SESSION (SAFE)
========================= */

async function trackSession(env, req, serverId){

  try{

    const db = env.DB

    const ip = req.headers.get("cf-connecting-ip") || "unknown"

    await db.prepare(`
      INSERT INTO player_sessions(ip,server_id,created_at)
      VALUES (?,?,CURRENT_TIMESTAMP)
    `)
    .bind(ip, serverId)
    .run()

  }catch(e){
    console.log("TRACK ERROR:", e)
  }

}

export default app
