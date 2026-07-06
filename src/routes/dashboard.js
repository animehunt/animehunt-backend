/* ================================================
   dashboard.js — Admin Dashboard Stats + Health
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ================================================
   SAFE DB QUERY — never crash whole dashboard
================================================ */
async function safeQuery(db, sql, fallback = 0) {
  try {
    const row = await db.prepare(sql).first()
    return row?.total ?? row?.count ?? fallback
  } catch {
    return fallback
  }
}

async function safeAll(db, sql, fallback = []) {
  try {
    const { results } = await db.prepare(sql).all()
    return results || fallback
  } catch {
    return fallback
  }
}

/* ================================================
   GET /dashboard — Main Stats
================================================ */

app.get("/dashboard", async (c) => {
  try {
    const db = c.env.DB

    /* ---- CORE COUNTS ---- */
    const [
      animeCount,
      episodeCount,
      categoryCount,
      bannerCount,
      serverCount,
      downloadCount
    ] = await Promise.all([
      safeQuery(db, "SELECT COUNT(*) as total FROM anime"),
      safeQuery(db, "SELECT COUNT(*) as total FROM episodes"),
      safeQuery(db, "SELECT COUNT(*) as total FROM categories"),
      safeQuery(db, "SELECT COUNT(*) as total FROM banners"),
      safeQuery(db, "SELECT COUNT(*) as total FROM servers"),
      safeQuery(db, "SELECT COUNT(*) as total FROM download_entries")
    ])

    /* ---- ANIME BREAKDOWN ---- */
    const [
      trendingAnime,
      ongoingAnime,
      completedAnime,
      topRated,
      hiddenAnime,
      bannerAnime
    ] = await Promise.all([
      safeQuery(db, "SELECT COUNT(*) as total FROM anime WHERE is_trending=1"),
      safeQuery(db, "SELECT COUNT(*) as total FROM anime WHERE status='ongoing'"),
      safeQuery(db, "SELECT COUNT(*) as total FROM anime WHERE status='completed'"),
      safeQuery(db, "SELECT COUNT(*) as total FROM anime WHERE rating>=8"),
      safeQuery(db, "SELECT COUNT(*) as total FROM anime WHERE is_hidden=1"),
      safeQuery(db, "SELECT COUNT(*) as total FROM anime WHERE is_banner=1")
    ])

    /* ---- SERVER HEALTH ---- */
    const [
      activeServers,
      failedServers,
      verifiedServers
    ] = await Promise.all([
      safeQuery(db, "SELECT COUNT(*) as total FROM servers WHERE active=1"),
      safeQuery(db, "SELECT COUNT(*) as total FROM servers WHERE fail_count>=5"),
      safeQuery(db, "SELECT COUNT(*) as total FROM servers WHERE verified=1")
    ])

    /* ---- ACTIVE BANNERS ---- */
    const activeBanners = await safeQuery(db,
      "SELECT COUNT(*) as total FROM banners WHERE active=1"
    )

    /* ---- RECENT ANIME (last 8 added) ---- */
    const recentAnime = await safeAll(db, `
      SELECT id,title,slug,type,status,poster,rating,created_at
      FROM anime
      ORDER BY created_at DESC
      LIMIT 8
    `)

    /* ---- RECENT EPISODES (last 5) ---- */
    const recentEpisodes = await safeAll(db, `
      SELECT id,anime_title,season,episode,title,created_at
      FROM episodes
      ORDER BY created_at DESC
      LIMIT 5
    `)

    /* ---- TOP ANIME BY TYPE ---- */
    const animeByType = await safeAll(db, `
      SELECT type, COUNT(*) as count
      FROM anime
      GROUP BY type
      ORDER BY count DESC
    `)

    /* ---- DB REPLICA STATUS ---- */
    const tursoOk    = !!(c.env.TURSO_URL && c.env.TURSO_AUTH_TOKEN)
    const supabaseOk = !!(c.env.SUPABASE_URL && c.env.SUPABASE_KEY)

    /* ---- SYSTEM STATUS ---- */
    const systemStatus = {
      cmsStatus:    "Online",
      apiStatus:    "Running",
      dbD1:         "Connected",
      dbTurso:      tursoOk    ? "Connected" : "Not Configured",
      dbSupabase:   supabaseOk ? "Connected" : "Not Configured",
      tripleSync:   (tursoOk && supabaseOk) ? "Active" : tursoOk || supabaseOk ? "Partial" : "Disabled",
      imageKit:     c.env.IMAGEKIT_PRIVATE_KEY ? "Connected" : "Not Configured",
      aiEngine:     "Active",
      searchIndex:  "Ready",
      lastChecked:  now()
    }

    return c.json(success({
      core: {
        animeCount,
        episodeCount,
        categoryCount,
        bannerCount,
        serverCount,
        downloadCount
      },
      anime: {
        trending:  trendingAnime,
        ongoing:   ongoingAnime,
        completed: completedAnime,
        topRated,
        hidden:    hiddenAnime,
        banner:    bannerAnime
      },
      servers: {
        total:    serverCount,
        active:   activeServers,
        failed:   failedServers,
        verified: verifiedServers
      },
      banners: {
        total:  bannerCount,
        active: activeBanners
      },
      recent: {
        anime:    recentAnime,
        episodes: recentEpisodes
      },
      breakdown: {
        animeByType
      },
      system: systemStatus
    }))

  } catch (err) {
    console.error("dashboard error:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /dashboard/health — Quick health check
================================================ */

app.get("/dashboard/health", async (c) => {
  try {
    const db = c.env.DB

    /* Test DB with a simple query */
    await db.prepare("SELECT 1").first()

    return c.json(success({
      status:    "healthy",
      db:        "ok",
      timestamp: now()
    }))

  } catch (err) {
    return c.json(failure("DB connection failed"), 500)
  }
})

/* ================================================
   POST /dashboard/sync-check — Test replica DBs
================================================ */

app.post("/dashboard/sync-check", async (c) => {
  const results = { d1: false, turso: false, supabase: false }

  /* D1 */
  try {
    await c.env.DB.prepare("SELECT 1").first()
    results.d1 = true
  } catch { /* d1 failed */ }

  /* Turso */
  if (c.env.TURSO_URL && c.env.TURSO_AUTH_TOKEN) {
    try {
      // ✅ FIX: 'libsql://' protocol ko fetch direct support nahi karta, isliye isko 'https://' kiya gaya hai
      const targetUrl = c.env.TURSO_URL.replace("libsql://", "https://")
      
      const res = await fetch(`${targetUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${c.env.TURSO_AUTH_TOKEN}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify({
          requests: [{ type:"execute", stmt:{ sql:"SELECT 1", args:[] } }]
        })
      })
      results.turso = res.ok
    } catch (e) {
      console.error("Turso check error:", e)
      results.turso = false
    }
  }

  /* Supabase */
  if (c.env.SUPABASE_URL && c.env.SUPABASE_KEY) {
    try {
      const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/anime?limit=1`, {
        headers: {
          "apikey":        c.env.SUPABASE_KEY,
          "Authorization": `Bearer ${c.env.SUPABASE_KEY}`
        }
      })
      results.supabase = res.ok
    } catch { /* supabase failed */ }
  }

  return c.json(success(results))
})

/* ================================================
   POST /dashboard/ai-scan — Trigger AI scan
================================================ */

app.post("/dashboard/ai-scan", async (c) => {
  try {
    /* Import and run the AI engine */
    const { runPlayerAI } = await import("../ai/playerEngine.js")
    await runPlayerAI(c.env)

    return c.json(success({
      status:  "completed",
      message: "AI scan finished",
      time:    now()
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app

