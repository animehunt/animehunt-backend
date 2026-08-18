/* ============================================================
  ANIMEHUNT — ANALYTICS ROUTES — PUBLIC TRACKING ONLY
  File: src/routes/analytics.js

  index.js mein mount karo:
    app.route("/api", analytics)

  ✅ FIX (audit, dual-mount + double-prefix bug): this file used to
  contain BOTH the public tracking routes AND the admin dashboard
  routes in one Hono() instance, mounted only via
  adminRoutes.route("/", analytics) — i.e. under /api/admin, auth
  required. That's backwards for the tracking routes below: they're
  called by ordinary visitor page-loads (frontend JS would fire these
  on every view/download/search/banner-click), so requiring admin auth
  meant they could never actually be called by a real visitor.

  On top of that, every route path here was hardcoded with a leading
  "/api/..." (or "/api/admin/...") even though index.js's mount already
  supplies that prefix — Hono's app.route(prefix, subApp) concatenates
  the two verbatim, so the real effective path was double-prefixed
  (e.g. "/api/track/view" mounted under adminRoutes at "/api/admin"
  became "/api/admin/api/track/view" — unreachable at the URL any
  caller would actually use).

  Fixed by: (1) splitting into this public-only file (mounted under
  app.route("/api", ...), correct auth-exposure for tracking) and
  analyticsAdmin.js (mounted only under adminRoutes, so requireAuth
  still applies to the dashboard/export/summary routes), and (2)
  dropping the redundant hardcoded prefix from every route path so the
  mount prefix supplies it exactly once.

  PUBLIC (tracker — called from frontend JS):
    POST /api/track/view          - Track page/anime/episode view
    POST /api/track/download      - Track download click
    POST /api/track/search        - Track search query
    POST /api/track/banner        - Track banner click
============================================================ */

import { Hono } from "hono"
import { getClientIP } from "../utils/clientIp.js"

const app = new Hono()

const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })

/* ============================================================
  PUBLIC — TRACKING ENDPOINTS
============================================================ */

app.post("/track/view", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const ip   = getClientIP(c)
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

app.post("/track/download", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const ip   = getClientIP(c)

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

app.post("/track/search", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))
  const ip   = getClientIP(c)

  try {
    await db.prepare(`
      INSERT INTO analytics_views (type, q, ip, created_at)
      VALUES ('search', ?, ?, datetime('now'))
    `).bind(body.q || "", ip).run()
    return c.json(ok())
  } catch { return c.json(ok()) }
})

app.post("/track/banner", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json().catch(() => ({}))

  try {
    await db.prepare(`
      INSERT INTO analytics_views (type, ref_id, slug, created_at)
      VALUES ('banner', ?, ?, datetime('now'))
    `).bind(body.banner_id || null, body.slug || null).run()

    // ✅ FIX (audit ISSUE-025): removed "UPDATE banners SET clicks=..." —
    // no "clicks" column exists on the banners table (confirmed against
    // schema.sql), so this always threw and was silently swallowed by the
    // .catch(() => {}) below, never actually recording anything.
    // banner_clicks (written via bannersPublic.js's POST
    // /banners/:id/click, now correctly mounted publicly) is the real,
    // working destination for this data.

    return c.json(ok())
  } catch { return c.json(ok()) }
})

export default app
