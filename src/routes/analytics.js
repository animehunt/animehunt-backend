/* ============================================================
  ANIMEHUNT — ANALYTICS ROUTES (NEW - COMPLETE)
  File: src/routes/analytics.js

  PUBLIC (tracker — called from frontend JS):
    POST /api/track/view          - Track page/anime/episode view
    POST /api/track/download      - Track download click
    POST /api/track/search        - Track search query
    POST /api/track/banner        - Track banner click

  ADMIN:
    GET  /api/admin/analytics         - Main analytics dashboard data
    GET  /api/admin/analytics/export  - Export CSV
============================================================ */

import { Hono } from "hono"

const app = new Hono()

const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })

/* ── Date helpers — format must match SQLite datetime('now') for string compare ── */
function toSqliteDatetime(d) {
  const pad = n => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function rangeStart(range) {
  const d = new Date()
  if (range === "today") {
    d.setUTCHours(0, 0, 0, 0)
    return toSqliteDatetime(d)
  }
  const days = parseInt(range) || 7
  d.setUTCDate(d.getUTCDate() - days)
  return toSqliteDatetime(d)
}

/* ============================================================
  PUBLIC — TRACKING ENDPOINTS
============================================================ */

app.post("/api/track/view", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const ip   = c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown"
  const ua   = c.req.header("User-Agent") || ""

  try {
    await db.prepare(`
      INSERT INTO analytics_views (type, ref_id, slug, ip, ua, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      body.type   || "page",
      body.ref_id || null,
      body.slug   || null,
      ip, ua
    ).run()
    return c.json(ok())
  } catch { return c.json(ok()) } // silent fail — never block user
})

app.post("/api/track/download", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const ip   = c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown"

  try {
    await db.prepare(`
      INSERT INTO analytics_downloads (link_id, host_id, quality, ip, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(body.link_id || null, body.host_id || null, body.quality || null, ip).run()

    // Also increment link downloads counter
    if (body.link_id) {
      await db.prepare(
        "UPDATE download_links SET downloads=COALESCE(downloads,0)+1 WHERE id=?"
      ).bind(body.link_id).run().catch(() => {})
    }
    return c.json(ok())
  } catch { return c.json(ok()) }
})

app.post("/api/track/search", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const ip   = c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown"

  try {
    await db.prepare(`
      INSERT INTO analytics_views (type, q, ip, created_at)
      VALUES ('search', ?, ?, datetime('now'))
    `).bind(body.q || "", ip).run()
    return c.json(ok())
  } catch { return c.json(ok()) }
})

app.post("/api/track/banner", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))

  try {
    await db.prepare(`
      INSERT INTO analytics_views (type, ref_id, slug, created_at)
      VALUES ('banner', ?, ?, datetime('now'))
    `).bind(body.banner_id || null, body.slug || null).run()

    if (body.banner_id) {
      await db.prepare(
        "UPDATE banners SET clicks=COALESCE(clicks,0)+1 WHERE id=?"
      ).bind(body.banner_id).run().catch(() => {})
    }
    return c.json(ok())
  } catch { return c.json(ok()) }
})

/* ============================================================
  ADMIN — MAIN ANALYTICS DASHBOARD
  GET /api/admin/analytics?range=7
============================================================ */

app.get("/api/admin/analytics", async (c) => {
  const db    = c.env.DB
  const range = c.req.query("range") || "7"
  const since = rangeStart(range)

  try {
    // ── Overview stats ──
    const [visitors, pageViews, animeViews, episodeViews, downloads, searches] = await Promise.all([
      db.prepare(`SELECT COUNT(DISTINCT ip) as v FROM analytics_views WHERE created_at >= ?`).bind(since).first(),
      db.prepare(`SELECT COUNT(*) as v FROM analytics_views WHERE created_at >= ?`).bind(since).first(),
      db.prepare(`SELECT COUNT(*) as v FROM analytics_views WHERE type='anime' AND created_at >= ?`).bind(since).first(),
      db.prepare(`SELECT COUNT(*) as v FROM analytics_views WHERE type='episode' AND created_at >= ?`).bind(since).first(),
      db.prepare(`SELECT COUNT(*) as v FROM analytics_downloads WHERE created_at >= ?`).bind(since).first(),
      db.prepare(`SELECT COUNT(*) as v FROM analytics_views WHERE type='search' AND created_at >= ?`).bind(since).first(),
    ])

    // ── Top lists ──
    const { results: topAnime } = await db.prepare(`
      SELECT slug, COUNT(*) as v FROM analytics_views
      WHERE type='anime' AND created_at >= ?
      GROUP BY slug ORDER BY v DESC LIMIT 10
    `).bind(since).all()

    const { results: topEpisodes } = await db.prepare(`
      SELECT ref_id as id, COUNT(*) as v FROM analytics_views
      WHERE type='episode' AND created_at >= ?
      GROUP BY ref_id ORDER BY v DESC LIMIT 10
    `).bind(since).all()

    const { results: topSearches } = await db.prepare(`
      SELECT q, COUNT(*) as c FROM analytics_views
      WHERE type='search' AND q IS NOT NULL AND q != '' AND created_at >= ?
      GROUP BY q ORDER BY c DESC LIMIT 10
    `).bind(since).all()

    const { results: topCategories } = await db.prepare(`
      SELECT slug as cat, COUNT(*) as v FROM analytics_views
      WHERE type='category' AND created_at >= ?
      GROUP BY slug ORDER BY v DESC LIMIT 10
    `).bind(since).all()

    const { results: topBanners } = await db.prepare(`
      SELECT slug as ban, COUNT(*) as c FROM analytics_views
      WHERE type='banner' AND created_at >= ?
      GROUP BY slug ORDER BY c DESC LIMIT 8
    `).bind(since).all()

    const { results: topServers } = await db.prepare(`
      SELECT slug as srv, COUNT(*) as v FROM analytics_views
      WHERE type='server' AND created_at >= ?
      GROUP BY slug ORDER BY v DESC LIMIT 8
    `).bind(since).all()

    return c.json(ok({
      stats: {
        visitors:     visitors?.v     || 0,
        pageViews:    pageViews?.v    || 0,
        animeViews:   animeViews?.v   || 0,
        episodeViews: episodeViews?.v || 0,
        downloads:    downloads?.v    || 0,
        searches:     searches?.v     || 0,
      },
      topAnime:      topAnime      || [],
      topEpisodes:   topEpisodes   || [],
      topSearches:   topSearches   || [],
      topCategories: topCategories || [],
      topBanners:    topBanners    || [],
      topServers:    topServers    || [],
    }))

  } catch (err) {
    console.error("analytics error:", err)
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  ADMIN — EXPORT CSV
============================================================ */

app.get("/api/admin/analytics/export", async (c) => {
  const db    = c.env.DB
  const range = c.req.query("range") || "7"
  const since = rangeStart(range)

  try {
    const { results } = await db.prepare(`
      SELECT type, ref_id, slug, q, ip, created_at
      FROM analytics_views
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 5000
    `).bind(since).all()

    const rows = results.map(r =>
      [r.type, r.ref_id||"", r.slug||"", r.q||"", r.ip||"", r.created_at].join(",")
    )
    const csv = ["type,ref_id,slug,query,ip,created_at", ...rows].join("\n")

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="analytics-${range}days.csv"`
      }
    })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

export default app

