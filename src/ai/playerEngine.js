/* =========================================================
🎬 ANIMEHUNT PLAYER ENGINE (FULL PRODUCTION)
========================================================= */

export async function runPlayerEngine(env, request){

  const db = env.DB

  try{

    /* =========================
    LOAD CONFIG
    ========================= */

    const cfg = await db
      .prepare("SELECT * FROM player_settings WHERE id=1")
      .first()

    if(!cfg){
      return error("Player config missing",500)
    }

    /* =========================
    🔒 SECURITY LAYER
    ========================= */

    /* EMBED LOCK */
    if(cfg.sec_embed_only){

      const referer = request.headers.get("referer") || ""

      if(!referer.includes("yourdomain.com")){
        return error("Embed only access",403)
      }

    }

    /* CLOUDFLARE COUNTRY BLOCK */
    if(cfg.sec_cloudflare){

      const country = request.headers.get("cf-ipcountry")

      if(country === "CN" || country === "KP"){
        return error("Region blocked",403)
      }

    }

    /* =========================
    🎯 SERVER SELECTION
    ========================= */

    let server = null

    /* DEFAULT SERVER FIRST */
    if(cfg.default_server){

      server = await db.prepare(`
        SELECT * FROM servers
        WHERE name=? AND active=1
      `).bind(cfg.default_server).first()

    }

    /* FALLBACK: BEST SERVER */
    if(!server){

      server = await getBestServer(db)

    }

    /* NO SERVER AVAILABLE */
    if(!server){
      return error("No streaming server available",503)
    }

    /* =========================
    ⚡ HEALTH CHECK + FAILOVER
    ========================= */

    const alive = await checkServer(server.url)

    if(!alive && cfg.autoswitch){

      const fallback = await getBestServer(db, server.id)

      if(fallback){
        server = fallback
      }else{
        return error("All servers down",503)
      }

    }

    /* =========================
    📺 STREAM URL BUILD
    ========================= */

    const url = buildStreamURL(server, request)

    /* =========================
    🧠 AI HOOK (BUFFER TRACK)
    ========================= */

    trackSession(env, request, server.id)

    /* =========================
    🎛 PLAYER CONFIG OUTPUT
    ========================= */

    return new Response(JSON.stringify({

      stream: url,

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

    }),{
      headers:{
        "Content-Type":"application/json"
      }
    })

  }catch(e){

    console.error("PLAYER ENGINE ERROR:",e)

    return error("Internal error",500)

  }

}

/* =========================================================
⚙️ GET BEST SERVER
========================================================= */

async function getBestServer(db, excludeId=null){

  const { results } = await db.prepare(`
    SELECT * FROM servers
    WHERE active=1
    ${excludeId ? "AND id != ?" : ""}
    ORDER BY priority DESC, last_used ASC
    LIMIT 5
  `)
  .bind(excludeId ? excludeId : null)
  .all()

  for(const s of results){

    const ok = await checkServer(s.url)

    if(ok){

      await db.prepare(`
        UPDATE servers
        SET last_used=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(s.id).run()

      return s
    }

  }

  return null
}

/* =========================================================
🌐 SERVER HEALTH CHECK
========================================================= */

async function checkServer(url){

  try{

    const res = await fetch(url,{
      method:"HEAD",
      cf:{cacheTtl:0}
    })

    return res.ok

  }catch{
    return false
  }

}

/* =========================================================
🎬 BUILD STREAM URL
========================================================= */

function buildStreamURL(server, request){

  const url = new URL(request.url)

  const animeId = url.searchParams.get("anime")
  const ep = url.searchParams.get("ep")

  if(!animeId || !ep){
    return null
  }

  return `${server.url}/stream/${animeId}/${ep}`
}

/* =========================================================
🧠 TRACK SESSION (AI)
========================================================= */

async function trackSession(env, request, serverId){

  try{

    const db = env.DB

    const ip = request.headers.get("cf-connecting-ip") || "unknown"

    await db.prepare(`
      INSERT INTO player_sessions(ip,server_id,created_at)
      VALUES (?,?,CURRENT_TIMESTAMP)
    `)
    .bind(ip,serverId)
    .run()

  }catch{}
}

/* =========================================================
❌ ERROR RESPONSE
========================================================= */

function error(msg,status=400){

  return new Response(JSON.stringify({
    error: msg
  }),{
    status,
    headers:{
      "Content-Type":"application/json"
    }
  })

}
