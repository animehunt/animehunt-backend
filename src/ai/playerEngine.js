/* =========================================================
🎬 ANIMEHUNT PLAYER ENGINE (FULL PRODUCTION - FIXED)
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

      // ✅ FIX: safer domain check
      if(!referer.includes("yourdomain.com")){
        return error("Embed only access",403)
      }

    }

    /* REGION BLOCK */
    if(cfg.sec_cloudflare){

      const country = request.headers.get("cf-ipcountry") || ""

      if(["CN","KP"].includes(country)){
        return error("Region blocked",403)
      }

    }

    /* =========================
    🎯 SERVER SELECTION
    ========================= */

    let server = null

    if(cfg.default_server){

      server = await db.prepare(`
        SELECT * FROM servers
        WHERE name=? AND active=1
      `).bind(cfg.default_server).first()

    }

    /* FALLBACK */
    if(!server){
      server = await getBestServer(db)
    }

    if(!server){
      return error("No streaming server available",503)
    }

    /* =========================
    ⚡ HEALTH CHECK + FAILOVER
    ========================= */

    let alive = await checkServer(server.url)

    if(!alive && cfg.autoswitch){

      const fallback = await getBestServer(db, server.id)

      if(fallback){
        server = fallback
        alive = true
      }else{
        return error("All servers down",503)
      }

    }

    /* =========================
    📺 BUILD STREAM URL
    ========================= */

    const streamUrl = buildStreamURL(server, request)

    if(!streamUrl){
      return error("Invalid stream request",400)
    }

    /* =========================
    🧠 TRACK SESSION (NON-BLOCKING)
    ========================= */

    // ✅ FIX: don't block response
    trackSession(env, request, server.id).catch(()=>{})

    /* =========================
    🎛 RESPONSE
    ========================= */

    return new Response(JSON.stringify({

      stream: streamUrl,

      server: server.name,

      config:{
        autoplay: !!cfg.autoplay,
        resume: !!cfg.resume,
        autoswitch: !!cfg.autoswitch,
        mode: cfg.mode || "responsive",

        ui:{
          servers: !!cfg.ui_servers,
          download: !!cfg.ui_download,
          subscribe: !!cfg.ui_subscribe,
          related: !!cfg.ui_related
        },

        security:{
          sandbox: !!cfg.sec_sandbox,
          referrer: cfg.sec_referrer || "strict-origin"
        }
      }

    }),{
      headers:{
        "Content-Type":"application/json"
      }
    })

  }catch(e){

    console.error("PLAYER ENGINE ERROR:", e)

    return error("Internal error",500)

  }

}

/* =========================================================
⚙️ GET BEST SERVER (FIXED)
========================================================= */

async function getBestServer(db, excludeId=null){

  let query = `
    SELECT * FROM servers
    WHERE active=1
  `

  const params = []

  if(excludeId){
    query += " AND id != ?"
    params.push(excludeId)
  }

  query += `
    ORDER BY priority DESC, last_used ASC
    LIMIT 5
  `

  const { results } = await db.prepare(query).bind(...params).all()

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
🌐 SERVER HEALTH CHECK (IMPROVED)
========================================================= */

async function checkServer(url){

  try{

    const controller = new AbortController()

    const timeout = setTimeout(() => controller.abort(), 3000)

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

/* =========================================================
🎬 BUILD STREAM URL (SAFE)
========================================================= */

function buildStreamURL(server, request){

  try{

    const url = new URL(request.url)

    const animeId = url.searchParams.get("anime")
    const ep = url.searchParams.get("ep")

    if(!animeId || !ep) return null

    // ✅ sanitize
    if(!/^\d+$/.test(animeId) || !/^\d+$/.test(ep)){
      return null
    }

    return `${server.url}/stream/${animeId}/${ep}`

  }catch{
    return null
  }

}

/* =========================================================
🧠 TRACK SESSION (SAFE + NON BLOCKING)
========================================================= */

async function trackSession(env, request, serverId){

  try{

    const db = env.DB

    const ip = request.headers.get("cf-connecting-ip") || "unknown"

    await db.prepare(`
      INSERT INTO player_sessions(ip,server_id,created_at)
      VALUES (?,?,CURRENT_TIMESTAMP)
    `)
    .bind(ip, serverId)
    .run()

  }catch(e){
    console.log("Session track failed:", e)
  }

}

/* =========================================================
❌ ERROR RESPONSE (STANDARDIZED)
========================================================= */

function error(msg,status=400){

  return new Response(JSON.stringify({
    success:false,
    error: msg
  }),{
    status,
    headers:{
      "Content-Type":"application/json"
    }
  })

}
