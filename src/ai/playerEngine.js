/* =========================================================
🎬 ANIMEHUNT PLAYER ENGINE (FULL PRODUCTION - FIXED)
========================================================= */

// Alias for index.js scheduled cron
export const runPlayerAI = runPlayerEngine

export async function runPlayerEngine(env, request = null){

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

      const referer = request?.headers?.get("referer") || ""

      // request ke origin se domain detect karo — hardcode nahi
      const origin = request?.headers?.get("origin") || ""
      const host   = request?.headers?.get("host")   || ""
      let refOrigin = ""
      try { refOrigin = referer ? new URL(referer).hostname : "" } catch { refOrigin = "" }

      // origin.includes(host) security bypass fixed.
      //    'evil.com/trusted.com' se bypass possible tha — exact match use karo.
      // MIGRATION: dropped the .pages.dev / .workers.dev checks that used to
      // allow-list embeds served from Cloudflare Pages/Workers preview URLs —
      // dead weight once this isn't running on Workers itself.
      const allowed =
        refOrigin === host ||
        origin === `https://${host}` ||
        origin === `http://${host}`

      if(!allowed){
        return error("Embed only access",403)
      }

    }

    /* REGION BLOCK
       MIGRATION: cf-ipcountry is a Cloudflare-only header. This only keeps
       working if you keep Cloudflare's proxy (orange-cloud DNS) in front of
       the VPS — see the migration report §1.1/§3.3. If you go fully
       origin-direct instead, `country` below is always "", so this block
       quietly becomes a no-op rather than breaking anything — if you need
       real geo-blocking without Cloudflare in front, swap this for an
       IP-geolocation lookup (e.g. a MaxMind GeoLite2 database) instead. */
    if(cfg.sec_cloudflare){

      const country = request?.headers?.get("cf-ipcountry") || ""

      if(["CN","KP"].includes(country)){
        return error("Region blocked",403)
      }

    }

    /* =========================
    🚦 STREAM RATE LIMIT
    ========================= */

    const rateUserId = request?.headers?.get("cf-connecting-ip") || request?.headers?.get("x-forwarded-for") || "unknown"
    const rateCheck   = await checkStreamRateLimit(env, rateUserId)
    if(!rateCheck.allowed){
      return error("Too many stream requests — slow down",429)
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

    let alive = await checkServer(server.embed)

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

    trackSession(env, request, server.id).catch(()=>{})

    /* =========================
    🎛 RESPONSE
    ========================= */

    return new Response(JSON.stringify({

      success: true,

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
    ORDER BY priority ASC, last_used ASC
    LIMIT 5
  `

  const { results } = await db.prepare(query).bind(...params).all()

  for(const s of results){

    const ok = await checkServer(s.embed)

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

  if(!url) return false

  try{

    const controller = new AbortController()

    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(url,{
      method:"HEAD",
      signal: controller.signal
      // MIGRATION: dropped `cf:{ cacheTtl:0 }` — that's a Cloudflare
      // Workers-only fetch() extension for controlling edge caching.
      // Node's fetch() doesn't recognize it (it was a harmless no-op on
      // Node either way), and a HEAD health-check like this isn't going
      // to get cached by anything in between regardless.
    })

    clearTimeout(timeout)

    return res.ok || res.status === 405

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

    // UUID aur numbers dono allow karo
    const safeStr = /^[a-zA-Z0-9_\-]+$/
    if(!safeStr.test(animeId) || !safeStr.test(ep)){
      return null
    }

    return `${server.embed}/stream/${animeId}/${ep}`

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

    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown"

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

/* =========================================================
⚡ STREAM RATE LIMITING
   Spam stream requests block karo
========================================================= */

async function checkStreamRateLimit(env, userId) {
  if (!env.KV) return { allowed: true } // KV not bound — skip gracefully

  const key    = `stream_limit:${userId}`
  const limit  = 10  // max 10 stream requests per minute per user
  const window = 60  // seconds

  const current = await env.KV.get(key)

  if (!current) {
    await env.KV.put(key, "1", { expirationTtl: window })
    return { allowed: true }
  }

  const count = parseInt(current) || 0
  if (count >= limit) return { allowed: false, count }

  await env.KV.put(key, String(count + 1), { expirationTtl: window })
  return { allowed: true, count: count + 1 }
}

/* =========================================================
📺 WATCH PROGRESS
   Timestamp tracking per user per episode
========================================================= */

export async function saveWatchProgress(env, userId, episodeId, timestamp, duration) {
  const db       = env.DB
  const progress = duration > 0 ? Math.round((timestamp / duration) * 100) : 0
  const now      = new Date().toISOString()

  await db.prepare(`
    INSERT INTO watch_progress (user_id, episode_id, timestamp, progress, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, episode_id)
    DO UPDATE SET timestamp=excluded.timestamp, progress=excluded.progress, updated_at=excluded.updated_at
  `).bind(userId, episodeId, timestamp, progress, now).run()

  return { success: true, progress }
}

export async function getWatchProgress(env, userId, episodeId) {
  return await env.DB.prepare(
    "SELECT * FROM watch_progress WHERE user_id=? AND episode_id=?"
  ).bind(userId, episodeId).first()
}

/* =========================================================
🎛 PER-USER VIDEO CONFIG
   Playback speed, subtitle lang, quality etc.
========================================================= */

const VALID_CONFIG_KEYS = [
  "playback_speed", "subtitle_lang", "audio_lang",
  "quality", "autoplay", "subtitle_size"
]

export async function saveUserVideoConfig(env, userId, cfg) {
  const safe = {}
  for (const key of VALID_CONFIG_KEYS) {
    if (cfg[key] !== undefined) safe[key] = cfg[key]
  }

  const now = new Date().toISOString()
  const json = JSON.stringify(safe)
  await env.DB.prepare(`
    INSERT INTO user_video_config (user_id, config, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET config=excluded.config, updated_at=excluded.updated_at
  `).bind(userId, json, now).run()

  return { success: true }
}

/* =========================================================
🚦 EXPORTED HTTP HANDLERS (for index.js to mount)
   These are additional routes beyond runPlayerEngine()
========================================================= */

export function setupPlayerRoutes(router, env) {

  // Rate-limited stream validate
  router.post("/api/player/validate", async (req) => {
    const origin = req.headers.get("Origin") || ""
    const host   = req.headers.get("host")   || ""
    if (origin && origin !== `https://${host}` && origin !== `http://${host}`) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403, headers: { "Content-Type": "application/json" }
      })
    }
    let body = {}
    try { body = await req.json() } catch {}
    const userId = body.userId || req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for") || "unknown"
    const check  = await checkStreamRateLimit(env, userId)
    if (!check.allowed) {
      return new Response(JSON.stringify({ error: "Too many stream requests" }), {
        status: 429, headers: { "Content-Type": "application/json" }
      })
    }
    return new Response(JSON.stringify({ valid: true }), {
      status: 200, headers: { "Content-Type": "application/json" }
    })
  })

  // Save watch progress
  router.post("/api/player/progress", async (req) => {
    let body = {}
    try { body = await req.json() } catch {}
    const { userId, episodeId, timestamp, duration } = body
    if (!userId || !episodeId || timestamp === undefined) {
      return new Response(JSON.stringify({ error: "userId, episodeId, timestamp required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      })
    }
    const result = await saveWatchProgress(env, userId, episodeId, timestamp, duration || 0)
    return new Response(JSON.stringify(result), {
      status: 200, headers: { "Content-Type": "application/json" }
    })
  })

  // Get watch progress
  router.get("/api/player/progress/:userId/:episodeId", async (req) => {
    const url       = new URL(req.url)
    const parts     = url.pathname.split("/")
    const userId    = parts[parts.length - 2]
    const episodeId = parts[parts.length - 1]
    const progress  = await getWatchProgress(env, userId, episodeId)
    return new Response(JSON.stringify({
      progress: progress || { timestamp: 0, progress: 0 }
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  })

  // Save user video config
  router.post("/api/player/config", async (req) => {
    let body = {}
    try { body = await req.json() } catch {}
    const { userId, config: cfg } = body
    if (!userId || !cfg) {
      return new Response(JSON.stringify({ error: "userId and config required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      })
    }
    const result = await saveUserVideoConfig(env, userId, cfg)
    return new Response(JSON.stringify(result), {
      status: 200, headers: { "Content-Type": "application/json" }
    })
  })

  // Get user video config
  router.get("/api/player/config/:userId", async (req) => {
    const url    = new URL(req.url)
    const userId = url.pathname.split("/").pop()
    const row    = await env.DB.prepare(
      "SELECT config FROM user_video_config WHERE user_id=?"
    ).bind(userId).first()

    const defaultConfig = {
      playback_speed: 1, subtitle_lang: "en", quality: "auto",
      autoplay: true, subtitle_size: "medium"
    }

    let parsedConfig = defaultConfig
    if (row) {
      try { parsedConfig = JSON.parse(row.config) } catch { parsedConfig = defaultConfig }
    }

    return new Response(JSON.stringify({
      config: parsedConfig
    }), { status: 200, headers: { "Content-Type": "application/json" } })
  })
}
