/* ============================================================
  ANIMEHUNT — ANALYTICS ROUTES — ADMIN DASHBOARD ONLY
  File: src/routes/analyticsAdmin.js

  index.js mein mount karo:
    adminRoutes.route("/", analyticsAdmin)   ← adminAuth already applied

  ✅ NEW FILE (audit, dual-mount + double-prefix bug): split out of
  analytics.js — see that file's header for the full explanation. The
  three routes below are genuinely admin-only (dashboard stats, CSV
  export, monetization summary), so they stay under adminRoutes/
  requireAuth. The redundant hardcoded "/api/admin/..." prefix has been
  dropped from each path — adminRoutes' own mount (app.route("/api/admin",
  adminRoutes)) already supplies that prefix, so keeping it baked into
  the route path here as well doubled it up (e.g. the old
  "/api/admin/analytics" path became "/api/admin/api/admin/analytics"
  once actually mounted — unreachable at the URL analytics.html calls,
  which is plain "/api/admin/analytics").

  ADMIN:
    GET  /api/admin/analytics         - Main analytics dashboard data
    GET  /api/admin/analytics/export  - Export CSV
    GET  /api/admin/analytics/summary - Monetization stats (ads.html)
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
  ADMIN — MAIN ANALYTICS DASHBOARD
  GET /api/admin/analytics?range=7
============================================================ */

app.get("/analytics", async (c) => {
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

/* ✅ FIX (audit, two real issues): CSV export previously did
   [r.type, r.ref_id||"", ...].join(",") with no escaping at all.

   1. CSV column-breaking: any field containing a comma (a search
      query like "naruto, shippuden" is common and completely
      unvalidated on the way in) would misalign every column after it
      once opened in Excel/Sheets — an admin exporting analytics could
      get systematically wrong data with no error or warning.
   2. Formula/CSV injection (OWASP-documented): a field starting with
      =, +, -, or @ is interpreted as a formula by Excel/Sheets/
      LibreOffice when the CSV is opened — e.g. a search query of
      =cmd|'/C calc'!A1 stored via the completely unvalidated public
      search-tracking endpoint would execute when an admin opened this
      export. r.q (the search query) is the one user-controlled field
      here and the one that matters most, but every field is escaped
      the same way for consistency and because ref_id/slug could
      contain attacker-influenced strings via other paths.
*/
function csvField(value) {
  let s = String(value ?? "")
  // Neutralize formula injection: prefix a leading =, +, -, or @ with
  // a tab character, which Excel/Sheets render as plain text instead
  // of evaluating as a formula, without visibly altering the value.
  if (/^[=+\-@]/.test(s)) s = "\t" + s
  // Standard CSV quoting: wrap in quotes and double any internal
  // quotes, whenever the field contains a comma, quote, or newline.
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

app.get("/analytics/export", async (c) => {
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
      [r.type, r.ref_id||"", r.slug||"", r.q||"", r.ip||"", r.created_at].map(csvField).join(",")
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

/* NOTE: GET /analytics/summary intentionally does NOT live in this file.
   adsAdmin.js already implements it (reading from the pre-aggregated
   ad_stats table, populated by ads.js's trackEvent() helper), and its
   field names genuinely match every one ads.html's loadStats() reads —
   confirmed directly against schema.sql's ad_stats columns. An earlier
   pass here duplicated this same route path with a different real-time-
   aggregation implementation, based on a mistaken claim that no working
   version existed anywhere in the codebase; removed once ads.js/
   adsAdmin.js were actually cross-checked. See adsAdmin.js for the one
   real implementation. */

export default app
