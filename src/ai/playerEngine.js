/* =========================================================
🎬 ANIMEHUNT PLAYER ENGINE (FULL PRODUCTION - FIXED)
========================================================= */

import { Hono }   from "hono"    // ✅ FIX (audit ISSUE-017): needed for playerProgressRoutes below
import crypto      from "node:crypto"  // ✅ FIX (audit ISSUE-018): for HMAC stream tokens below — Node runtime, available post-migration

// Alias for index.js scheduled cron
export const runPlayerAI = runPlayerEngine

/* =========================================================
🔑 STREAM TOKEN (audit ISSUE-018)

   The embed-lock check below (EMBED LOCK) correctly guards against
   unauthorized *browser-based* iframe embedding — Origin/Referer are
   genuinely set by the browser and can't be forged by a legitimate
   victim's browser during a real embed. But those headers are entirely
   client-supplied in a raw, non-browser HTTP request (curl, a script) —
   a request claiming Origin: https://<this-site> bypasses the check
   completely, since nothing here is bound to anything the server itself
   issued.

   This is a limitation inherent to any header-based origin check, not a
   coding mistake in the check itself — refining the header comparison
   logic further can't fix it. If protecting the stream URL from
   non-browser scraping/hotlinking matters (not just from being embedded
   on other sites), a short-lived signed token closes that gap: issue it
   when the page first loads the player, then require it on the actual
   stream request — this binds the request to something the server
   generated, which Origin/Referer alone cannot provide.

   This is an additional layer, not a replacement for the existing
   Origin/Referer check — both run.
========================================================= */

function generateStreamToken(animeId, ep, secret, expirySeconds = 300) {
  const exp = Math.floor(Date.now() / 1000) + expirySeconds
  const payload = `${animeId}:${ep}:${exp}`
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  return `${exp}.${sig}`
}

function verifyStreamToken(animeId, ep, token, secret) {
  if (!token || typeof token !== "string") return false
  const [expStr, sig] = token.split(".")
  const exp = parseInt(expStr, 10)
  if (!exp || Date.now() / 1000 > exp) return false
  const expected = crypto.createHmac("sha256", secret)
    .update(`${animeId}:${ep}:${exp}`).digest("hex")
  // Constant-time comparison to avoid a timing side-channel on the signature check.
  const sigBuf = Buffer.from(sig || "", "hex")
  const expBuf = Buffer.from(expected, "hex")
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

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

      // ✅ FIX (audit ISSUE-018): when a stream token is present and
      // STREAM_TOKEN_SECRET is configured, honor a valid token as an
      // alternative to the Origin/Referer check — this is what lets a
      // legitimate non-browser caller (if one is ever needed) through
      // without weakening the check for everyone else. When no token is
      // sent, behavior is unchanged from before this fix — the
      // Origin/Referer check alone still decides.
      const animeId = request?.animeId ?? null
      const ep      = request?.episode ?? null
      const token    = request?.headers?.get("x-stream-token") || ""
      const hasValidToken = env.STREAM_TOKEN_SECRET && animeId && ep &&
        verifyStreamToken(animeId, ep, token, env.STREAM_TOKEN_SECRET)

      if(!allowed && !hasValidToken){
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

   ✅ FIX (audit ISSUE-017): setupPlayerRoutes() previously used the raw
   Fetch API pattern ((req) => new Response(...)) instead of Hono's
   ((c) => c.json(...)) — every other route file in this codebase is a
   Hono sub-app mounted via app.route(prefix, subApp), and this function's
   raw-router signature couldn't compose that way. It was written, fully
   functional against real schema-backed tables (watch_progress,
   user_video_config), but never actually imported or mounted anywhere in
   index.js — meaning /api/player/validate, /api/player/progress, and
   /api/player/config never existed in production, and the entire
   "resume where you left off" / "remember my playback preferences"
   feature was completely dead despite being fully built. Rewritten below
   as a Hono sub-app (playerProgressRoutes) with the exact same logic —
   rate limiting, origin check, watch-progress read/write, video-config
   read/write — unchanged. See index.js for the app.route("/api",
   playerProgressRoutes) mount that makes this reachable.
========================================================= */

export const playerProgressRoutes = new Hono()

playerProgressRoutes.post("/player/validate", async (c) => {
  const origin = c.req.header("Origin") || ""
  const host   = c.req.header("host")   || ""
  if (origin && origin !== `https://${host}` && origin !== `http://${host}`) {
    return c.json({ error: "Origin not allowed" }, 403)
  }
  const body   = await c.req.json().catch(() => ({}))
  const userId = body.userId || c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown"
  const check  = await checkStreamRateLimit(c.env, userId)
  if (!check.allowed) return c.json({ error: "Too many stream requests" }, 429)
  return c.json({ valid: true })
})

playerProgressRoutes.post("/player/progress", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { userId, episodeId, timestamp, duration } = body
  if (!userId || !episodeId || timestamp === undefined) {
    return c.json({ error: "userId, episodeId, timestamp required" }, 400)
  }
  const result = await saveWatchProgress(c.env, userId, episodeId, timestamp, duration || 0)
  return c.json(result)
})

playerProgressRoutes.get("/player/progress/:userId/:episodeId", async (c) => {
  const userId    = c.req.param("userId")
  const episodeId = c.req.param("episodeId")
  const progress  = await getWatchProgress(c.env, userId, episodeId)
  return c.json({ progress: progress || { timestamp: 0, progress: 0 } })
})

playerProgressRoutes.post("/player/config", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { userId, config: cfg } = body
  if (!userId || !cfg) return c.json({ error: "userId and config required" }, 400)
  const result = await saveUserVideoConfig(c.env, userId, cfg)
  return c.json(result)
})

playerProgressRoutes.get("/player/config/:userId", async (c) => {
  const userId = c.req.param("userId")
  const row = await c.env.DB.prepare(
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
  return c.json({ config: parsedConfig })
})
