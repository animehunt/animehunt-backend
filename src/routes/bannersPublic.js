/* ================================================
   bannersPublic.js — Public banner click tracking ONLY

   ✅ NEW FILE (audit ISSUE-025): banners.js (the file this route was
   copied from) is mounted only under adminRoutes — so POST
   /banners/:id/click, the route that correctly writes to banner_clicks,
   was only ever reachable at /api/admin/banners/:id/click, behind admin
   auth. That meant real visitor clicks never actually recorded (compounded
   by a second bug: analytics.js's POST /api/track/banner tried to UPDATE
   a "clicks" column on the banners table that doesn't exist in the
   schema, also silently failing).

   This route can't simply be added to banners.js's existing public mount,
   because Hono's app.route(prefix, subApp) exposes every route the
   sub-app defines at that prefix — dual-mounting the whole banners.js
   file publicly would also expose POST /banners, PUT /banners/:id, and
   DELETE /banners/:id with no auth (the exact class of bug fixed in
   ISSUE-020 for player.js). This file contains only the one route that's
   actually meant to be public, matching the narrower, safer split.
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })

app.post("/banners/:id/click", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const ip  = c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "unknown"

    const banner = await db.prepare(
      "SELECT id, link FROM banners WHERE id=?"
    ).bind(id).first()

    if (!banner) return c.json(failure("Banner not found"), 404)

    // Record click
    await db.prepare(
      "INSERT INTO banner_clicks (banner_id, ip, clicked_at) VALUES (?, ?, datetime('now'))"
    ).bind(id, ip).run()

    return c.json(success({
      clicked:     true,
      redirectUrl: banner.link || null
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
