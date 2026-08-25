/* =========================================================
   ANIMEHUNT PLAYER ENGINE (FULL PRODUCTION - FIXED & RESTORED)
========================================================= */

import { Hono }   from "hono"
import crypto      from "node:crypto"
import { getClientIP } from "../utils/clientIp.js"

// Alias for index.js scheduled cron
export const runPlayerAI = runPlayerEngine

/* =========================================================
   STREAM TOKEN
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
  // Constant-time comparison to avoid a timing side-channel
  const sigBuf = Buffer.from(sig || "", "hex")
  const expBuf = Buffer.from(expected, "hex")
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

/* =========================================================
   LEGACY EMBED RENDERER ENGINE
========================================================= */
export async function runPlayerEngine(env, request = null){
  const db = env.DB
  try{
    const cfg = await db.prepare("SELECT * FROM player_settings WHERE id=1").first()
    if(!cfg){
      return error("Player config missing",500)
    }

    if(cfg.sec_embed_only){
      const referer = request?.headers?.get("referer") || ""
      const origin = request?.headers?.get("origin") || ""
      const host   = request?.headers?.get("host")   || ""
      let refOrigin = ""
      try { refOrigin = referer ? new URL(referer).hostname : "" } catch { refOrigin = "" }

      const allowed =
        refOrigin === host ||
        origin === `https://${host}` ||
        origin === `http://${host}`

      const animeId = request?.animeId ?? null
      const ep      = request?.episode ?? null
      const token    = request?.headers?.get("x-stream-token") || ""
      const hasValidToken = env.STREAM_TOKEN_SECRET && animeId && ep &&
        verifyStreamToken(animeId, ep, token, env.STREAM_TOKEN_SECRET)

      if(!allowed && !hasValidToken){
        return error("Embed only access",403)
      }
    }

    if(cfg.sec_cloudflare){
      const country = request?.headers?.get("cf-ipcountry") || ""
      if(["CN","KP"].includes(country)){
        return error("Region blocked",403)
      }
    }

    const rateUserId = getClientIP(request, "unknown")
    const rateCheck   = await checkStreamRateLimit(env, rateUserId)
    if(!rateCheck.allowed){
      return error("Too many stream requests — slow down",429)
    }

    let server = null
    if(cfg.default_server){
      server = await db.prepare(`SELECT * FROM servers WHERE name=? AND active=1`).bind(cfg.default_server).first()
    }
    if(!server){
      server = await getBestServer(db)
    }
    if(!server){
      return error("No streaming server available",503)
    }

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

    const streamUrl = buildStreamURL(server, request)
    if(!streamUrl){
      return error("Invalid stream request",400)
    }

    trackSession(env, request, server.id).catch(()=>{})

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
      headers:{ "Content-Type":"application/json" }
    })

  }catch(e){
    console.error("PLAYER ENGINE ERROR:", e)
    return error("Internal error",500)
  }
}

async function getBestServer(db, excludeId=null){
  let query = `SELECT * FROM servers WHERE active=1`
  const params = []
  if(excludeId){
    query += " AND id != ?"
    params.push(excludeId)
  }
  query += ` ORDER BY priority ASC, last_used ASC LIMIT 5`
  const { results } = await db.prepare(query).bind(...params).all()

  for(const s of results){
    const ok = await checkServer(s.embed)
    if(ok){
      await db.prepare(`UPDATE servers SET last_used=CURRENT_TIMESTAMP WHERE id=?`).bind(s.id).run()
      return s
    }
  }
  return null
}

async function checkServer(url){
  if(!url) return false
  try{
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url,{ method:"HEAD", signal: controller.signal })
    clearTimeout(timeout)
    return res.ok || res.status === 405
  }catch{
    return false
  }
}

function buildStreamURL(server, request){
  try{
    if (!request || !request.url) return server.embed
    const url = new URL(request.url)
    const animeId = url.searchParams.get("anime")
    const ep = url.searchParams.get("ep")
    if(!animeId || !ep) return null
    const safeStr = /^[a-zA-Z0-9_\-]+$/
    if(!safeStr.test(animeId) || !safeStr.test(ep)) return null
    return `${server.embed}/stream/${animeId}/${ep}`
  }catch{
    return null
  }
}

async function trackSession(env, request, serverId){
  try{
    const db = env.DB
    const ip = getClientIP(request, "unknown")
    await db.prepare(`
      INSERT INTO player_sessions(ip,server_id,created_at)
      VALUES (?,?,CURRENT_TIMESTAMP)
    `).bind(ip, serverId).run()
  }catch(e){}
}

function error(msg,status=400){
  return new Response(JSON.stringify({ success:false, error: msg }),{
    status, headers:{ "Content-Type":"application/json" }
  })
}

async function checkStreamRateLimit(env, userId) {
  if (!env.KV) return { allowed: true } 
  const key    = `stream_limit:${userId}`
  const limit  = 10  
  const window = 60  
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
   PUBLIC PLAYER API SUB-APP 
========================================================= */

export const playerProgressRoutes = new Hono()

playerProgressRoutes.post("/player/validate", async (c) => {
  const origin = c.req.header("Origin") || ""
  const host   = c.req.header("host")   || ""
  if (origin && origin !== `https://${host}` && origin !== `http://${host}`) {
    return c.json({ error: "Origin not allowed" }, 403)
  }
  const body   = await c.req.json().catch(() => ({}))
  const userId = body.userId || getClientIP(c, "unknown")
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

/* =========================================================
   MASTER JW PLAYER CONFIG GENERATOR (Dynamic Priority & Multi-Audio Engine)
========================================================= */
playerProgressRoutes.get("/player/jw-config/:episodeId", async (c) => {
  const episodeId = c.req.param("episodeId")
  const db = c.env.DB

  try {
    // 1. Fetch servers mapped to this episode
    const { results: servers } = await db.prepare(
      "SELECT * FROM servers WHERE episode_id=? AND active=1 ORDER BY priority ASC, fail_count ASC"
    ).bind(episodeId).all()

    if (!servers || servers.length === 0) {
      return c.json({ success: false, message: "No servers available for this episode" }, 404)
    }

    // 2. STRICT DUBBING SEGREGATION LOGIC (Muse vs Crunchyroll protection)
    const serverGroups = {};
    for (const srv of servers) {
        // Extract dub label from name (e.g., "1080p (Muse Asia)" -> "Muse Asia")
        const match = (srv.name || "").match(/\(([^)]+)\)/);
        const dubLabel = match ? match[1].toLowerCase() : "default_dub";
        if (!serverGroups[dubLabel]) serverGroups[dubLabel] = [];
        serverGroups[dubLabel].push(srv);
    }
    
    // Select only the primary dub group (to prevent mixing dubbing artists during failover)
    const primaryDubGroup = Object.keys(serverGroups)[0];
    const segregatedServers = serverGroups[primaryDubGroup];

    // 3. Strict Priority Failover Cascade Engine (P1 -> P2 -> P3)
    const p1Sources = [] // Custom Storage / Direct CDN / Telegram (Flexible)
    const p2Sources = [] // AnimeSalt / Zephyrix API (Regional)
    const p3Sources = [] // MegaCloud / RapidCloud (Global Scraper)

    for (const s of segregatedServers) {
      const n = (s.name || "").toLowerCase()
      // Detect P3 Scrapers
      if (n.includes("mega") || n.includes("rapid")) {
        p3Sources.push(s)
      } 
      // Detect P2 Regional APIs
      else if (n.includes("salt") || n.includes("zephyrix")) {
        p2Sources.push(s)
      } 
      // Default to P1 custom direct hosting
      else {
        p1Sources.push(s)
      }
    }

    const orderedServers = [...p1Sources, ...p2Sources, ...p3Sources]
    const primaryServer = orderedServers[0]

    // 4. Multi-Audio Priority & Auto-Selection Engine
    const tracks = []
    const manifestUrl = primaryServer.embed

    // Analyze primary server embed for Hindi tracks if it's an M3U8 manifest
    if (primaryServer.type === 'm3u8' || manifestUrl.includes('.m3u8')) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3500)
        const m3u8Res = await fetch(manifestUrl, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (m3u8Res.ok) {
          const m3u8Text = await m3u8Res.text()
          const hasHindi = m3u8Text.toLowerCase().includes('hindi') || m3u8Text.toLowerCase().includes('language="hi"')

          // MANDATORY LOGIC: Automatically map and prioritize Hindi track directly inside JW Player's config array
          if (hasHindi) {
            tracks.push({
              file: manifestUrl,
              label: "Hindi",
              language: "hi",
              default: true,
              autoselect: true
            })
            tracks.push({
              file: manifestUrl,
              label: "English / Japanese",
              language: "en",
              default: false
            })
          }
        }
      } catch (e) {
        // Soft fail manifest fetch, fallback to standard mappings
      }
    }

    // Fallback generic track mapping if Hindi specific logic didn't trigger
    if (tracks.length === 0) {
      tracks.push({
        file: manifestUrl,
        label: "Default Stream",
        default: true
      })
    }

    // Inject standardized Captions & Subtitles
    const captions = [
      { file: "/subs/hindi.vtt", label: "Hindi", kind: "captions" },
      { file: "/subs/english.vtt", label: "English", kind: "captions" }
    ]

    const playlistTracks = [...tracks, ...captions]

    // 5. In-Player Ads Control & Monetization System
    const adSettings = await db.prepare("SELECT * FROM player_settings WHERE id=1").first()
    
    let preRollTag = ""
    let midRollTag = ""
    let popunderUrl = ""

    try {
      const { results: adsLib } = await db.prepare("SELECT type, code FROM ads_library WHERE active=1").all()
      for (const ad of (adsLib || [])) {
        if (ad.type === "vast" || ad.code.includes(".xml") || ad.code.includes("preroll")) {
          if (!preRollTag) preRollTag = ad.code
          else if (!midRollTag) midRollTag = ad.code
        } else if (ad.type === "popup" || ad.type === "redirect" || ad.type === "clickunder") {
          popunderUrl = ad.code 
        }
      }
    } catch(e) {}

    const adsControl = {
      frequencyCapping: {
        storageType: "localStorage",
        maxPreRoll: 1,
        maxPopunder: 2,
        windowMinutes: 20
      },
      vastInjections: {
        client: "vast",
        skipoffset: adSettings?.ads_skip_sec || 5,
        schedule: []
      },
      clickunder: {
        enabled: !!popunderUrl,
        trigger: "firstPlay",
        url: popunderUrl
      },
      antiAdBlock: {
        enabled: true,
        fallbackBanner: "/assets/adblock-fallback.jpg",
        fallbackLink: "/premium"
      }
    }

    // Inject VMAP/VAST offsets
    if (preRollTag) adsControl.vastInjections.schedule.push({ offset: "pre", tag: preRollTag })
    if (midRollTag) adsControl.vastInjections.schedule.push({ offset: "50%", tag: midRollTag })

    // 6. Auto-Failover Backup Sources Payload Construction (ONLY from Segregated Group)
    const fallbacks = orderedServers.slice(1).map(s => ({
      file: s.embed,
      type: s.type === 'm3u8' ? 'hls' : 'mp4',
      name: s.name,
      priority: s.priority
    }))

    // Final Assembled JW Player Configuration JSON 
    const jwConfig = {
      playlist: [{
        sources: [
          {
            file: primaryServer.embed,
            type: primaryServer.type === 'm3u8' ? 'hls' : 'mp4',
            label: "Auto" 
          }
        ],
        tracks: playlistTracks
      }],
      cast: {},
      autostart: !!adSettings?.autoplay,
      advertising: adSettings?.ads_enabled ? adsControl.vastInjections : null,
      adsControlLayer: adSettings?.ads_enabled ? adsControl : null,
      autoFailover: {
        enabled: fallbacks.length > 0,
        backupSources: fallbacks,
        eventHandlers: {
          onSetupError: "function(e) { window.AnimeHuntFailover(e, 'setupError'); }",
          onError: "function(e) { window.AnimeHuntFailover(e, 'error'); }"
        }
      }
    }

    return c.json({
      success: true,
      jwConfig
    })

  } catch (err) {
    console.error("JW Config Gen Error:", err)
    return c.json({ success: false, message: "Internal server error" }, 500)
  }
})
