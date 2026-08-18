/**
 * adsAdmin.js — AnimeHunt Backend
 * ════════════════════════════════════════════════════════
 * Ads & Monetization router (Hono + Cloudflare D1) — ADMIN ROUTES ONLY
 *
 * index.js mein mount karo:
 *   adminRoutes.route("/", adsAdmin)   ← adminAuth already applied
 *
 * ✅ NEW FILE (security audit, dual-mount vulnerability): split out of
 * ads.js. Every route below used to live in ads.js, which was mounted
 * BOTH publicly (app.route("/api", ads), no auth) AND under adminRoutes
 * (adminRoutes.route("/", ads), auth required) — because it's the same
 * underlying Hono() router object in both places, every one of these
 * admin write routes (ads library, popup library, shortlinks library,
 * redirect library, host/page/nav monetization CRUD, bulk-assign) was
 * reachable completely unauthenticated at /api/..., bypassing adminAuth
 * entirely. See ads.js's header comment for the full explanation — same
 * root cause and fix pattern already used for player.js/playerAdmin.js
 * (ISSUE-020).
 *
 * All public/read routes stay in ads.js (mounted only under
 * app.route("/api", ...)).
 * ════════════════════════════════════════════════════════
 */

import { Hono } from "hono"

const adsAdmin = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

/* ══════════════════════════════════════════════════════════
   ADMIN ROUTES — /api/admin/...
   (index.js: adminRoutes.route("/", adsAdmin) — adminAuth already applied)
══════════════════════════════════════════════════════════ */

/* ── ADS LIBRARY ────────────────────────────────────────── */

adsAdmin.get("/ads-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, type, code, delay, weight, active, created_at FROM ads_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.get("/ads-library/:id", async (c) => {
  const db  = c.env.DB
  const id  = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM ads_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/ads-library", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { name, type, code, delay, weight, active } = body
  if (!name || !code) return fail(c, "name and code required")
  try {
    const res = await db.prepare(
      `INSERT INTO ads_library (name, type, code, delay, weight, active, created_at)
       VALUES (?,?,?,?,?,?,datetime('now'))`
    ).bind(name, type || "banner", code, delay ?? 0, weight ?? 1, active ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/ads-library/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { name, type, code, delay, weight, active } = body
  if (!name || !code) return fail(c, "name and code required")
  try {
    await db.prepare(
      `UPDATE ads_library SET name=?, type=?, code=?, delay=?, weight=?, active=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name, type || "banner", code, delay ?? 0, weight ?? 1, active ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/ads-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM ads_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── POPUP LIBRARY ──────────────────────────────────────── */

adsAdmin.get("/popup-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, script, trigger, position, max_count, active, created_at FROM popup_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.get("/popup-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM popup_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/popup-library", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { name, script, trigger, position, max_count, active } = body
  if (!name || !script) return fail(c, "name and script required")
  try {
    const res = await db.prepare(
      `INSERT INTO popup_library (name, script, trigger, position, max_count, active, created_at)
       VALUES (?,?,?,?,?,?,datetime('now'))`
    ).bind(name, script, trigger || "onload", position || "center", max_count ?? 1, active ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/popup-library/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { name, script, trigger, position, max_count, active } = body
  if (!name || !script) return fail(c, "name and script required")
  try {
    await db.prepare(
      `UPDATE popup_library SET name=?, script=?, trigger=?, position=?, max_count=?, active=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name, script, trigger || "onload", position || "center", max_count ?? 1, active ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/popup-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM popup_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── SHORTLINKS LIBRARY ─────────────────────────────────── */

adsAdmin.get("/shortlinks-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, base_url, api_key, weight, active, created_at FROM shortlinks_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.get("/shortlinks-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM shortlinks_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/shortlinks-library", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { name, base_url, api_key, weight, active } = body
  if (!name || !base_url) return fail(c, "name and base_url required")
  try {
    const res = await db.prepare(
      `INSERT INTO shortlinks_library (name, base_url, api_key, weight, active, created_at)
       VALUES (?,?,?,?,?,datetime('now'))`
    ).bind(name, base_url, api_key || null, weight ?? 1, active ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/shortlinks-library/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { name, base_url, api_key, weight, active } = body
  if (!name || !base_url) return fail(c, "name and base_url required")
  try {
    await db.prepare(
      `UPDATE shortlinks_library SET name=?, base_url=?, api_key=?, weight=?, active=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name, base_url, api_key || null, weight ?? 1, active ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/shortlinks-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM shortlinks_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── REDIRECT LIBRARY ───────────────────────────────────── */

adsAdmin.get("/redirect-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, url, delay, active, created_at FROM redirect_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.get("/redirect-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM redirect_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/redirect-library", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { name, url, delay, active } = body
  if (!name || !url) return fail(c, "name and url required")
  try {
    const res = await db.prepare(
      `INSERT INTO redirect_library (name, url, delay, active, created_at)
       VALUES (?,?,?,?,datetime('now'))`
    ).bind(name, url, delay ?? 0, active ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/redirect-library/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { name, url, delay, active } = body
  if (!name || !url) return fail(c, "name and url required")
  try {
    await db.prepare(
      `UPDATE redirect_library SET name=?, url=?, delay=?, active=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name, url, delay ?? 0, active ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/redirect-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM redirect_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── HOST MONETIZATION ──────────────────────────────────── */

adsAdmin.get("/host-monetization", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      `SELECT hm.*, h.name as host_name
       FROM host_monetization hm
       LEFT JOIN hosts h ON h.id = hm.host_id
       ORDER BY hm.host_id ASC`
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.get("/host-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM host_monetization WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/host-monetization", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { host_id, mode, ads: adsJson, popups, shortlinks, redirects, max_popups } = body
  if (!host_id) return fail(c, "host_id required")
  try {
    // Upsert — one row per host
    const existing = await db.prepare("SELECT id FROM host_monetization WHERE host_id=?").bind(host_id).first()
    if (existing) {
      await db.prepare(
        `UPDATE host_monetization SET mode=?, ads=?, popups=?, shortlinks=?, redirects=?, max_popups=?, updated_at=datetime('now') WHERE host_id=?`
      ).bind(mode || "random", adsJson || "[]", popups || "[]", shortlinks || "[]", redirects || "[]", max_popups || 1, host_id).run()
      return ok(c, { id: existing.id })
    }
    const res = await db.prepare(
      `INSERT INTO host_monetization (host_id, mode, ads, popups, shortlinks, redirects, max_popups, clicks)
       VALUES (?,?,?,?,?,?,?,0)`
    ).bind(host_id, mode || "random", adsJson || "[]", popups || "[]", shortlinks || "[]", redirects || "[]", max_popups || 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/host-monetization/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { mode, ads: adsJson, popups, shortlinks, redirects, max_popups } = body
  try {
    await db.prepare(
      `UPDATE host_monetization SET mode=?, ads=?, popups=?, shortlinks=?, redirects=?, max_popups=?, updated_at=datetime('now') WHERE id=?`
    ).bind(mode || "random", adsJson || "[]", popups || "[]", shortlinks || "[]", redirects || "[]", max_popups || 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/host-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM host_monetization WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── PAGE MONETIZATION ──────────────────────────────────── */

adsAdmin.get("/page-monetization", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, page_type, slot_config, frequency, enabled, updated_at FROM page_monetization ORDER BY page_type ASC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.get("/page-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM page_monetization WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/page-monetization", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { page_type, slot_config, frequency, enabled } = body
  if (!page_type) return fail(c, "page_type required")
  try {
    // Upsert — one row per page_type
    const existing = await db.prepare("SELECT id FROM page_monetization WHERE page_type=?").bind(page_type).first()
    if (existing) {
      await db.prepare(
        `UPDATE page_monetization SET slot_config=?, frequency=?, enabled=?, updated_at=datetime('now') WHERE page_type=?`
      ).bind(slot_config || "{}", frequency || "every_click", enabled ?? 1, page_type).run()
      return ok(c, { id: existing.id })
    }
    const res = await db.prepare(
      `INSERT INTO page_monetization (page_type, slot_config, frequency, enabled, updated_at)
       VALUES (?,?,?,?,datetime('now'))`
    ).bind(page_type, slot_config || "{}", frequency || "every_click", enabled ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/page-monetization/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { slot_config, frequency, enabled } = body
  try {
    await db.prepare(
      `UPDATE page_monetization SET slot_config=?, frequency=?, enabled=?, updated_at=datetime('now') WHERE id=?`
    ).bind(slot_config || "{}", frequency || "every_click", enabled ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/page-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM page_monetization WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── ANALYTICS SUMMARY ──────────────────────────────────── */

adsAdmin.get("/analytics/summary", async (c) => {
  const db = c.env.DB
  try {
    const row = await db.prepare("SELECT * FROM ad_stats WHERE id=1").first()
    return ok(c, {
      impressions:      row?.impressions      ?? 0,
      ad_clicks:        row?.ad_clicks        ?? 0,
      ad_views:         row?.ad_views         ?? 0,
      shortlink_clicks: row?.shortlink_clicks ?? 0,
      redirect_clicks:  row?.redirect_clicks  ?? 0,
      popup_opens:      row?.popup_opens      ?? 0,
      popup_views:      row?.popup_views      ?? 0,
      popup_closes:     row?.popup_closes     ?? 0,
      verify_clicks:    row?.verify_clicks    ?? 0,
      go_link_clicks:   row?.go_link_clicks   ?? 0,
      host_clicks:      row?.host_clicks      ?? 0,
      downloads:        row?.downloads        ?? 0,
      knight_downloads: row?.knight_downloads ?? 0,
      page_ad_views:    row?.page_ad_views    ?? 0,
      page_ad_clicks:   row?.page_ad_clicks   ?? 0,
      revenue_events:   row?.revenue_events   ?? 0
    })
  } catch(e) { return fail(c, e.message) }
})

/* ── NAV MONETIZATION ───────────────────────────────────
   Page Navigation events pe monetization
   (Next Page, Prev Page, Pagination, Load More)
────────────────────────────────────────────────────────── */

adsAdmin.get("/nav-monetization", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT * FROM nav_monetization ORDER BY nav_event ASC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.post("/nav-monetization", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { nav_event, ads: adsJson, popups, shortlinks, redirects, mode, frequency, enabled } = body
  if (!nav_event) return fail(c, "nav_event required")
  try {
    // Upsert — one row per nav_event
    const existing = await db.prepare(
      "SELECT id FROM nav_monetization WHERE nav_event=?"
    ).bind(nav_event).first()

    if (existing) {
      await db.prepare(
        `UPDATE nav_monetization
         SET ads=?, popups=?, shortlinks=?, redirects=?, mode=?, frequency=?, enabled=?, updated_at=datetime('now')
         WHERE nav_event=?`
      ).bind(
        adsJson    || "[]",
        popups     || "[]",
        shortlinks || "[]",
        redirects  || "[]",
        mode       || "random",
        frequency  || "every_click",
        enabled ?? 1,
        nav_event
      ).run()
      return ok(c, { id: existing.id })
    }

    const res = await db.prepare(
      `INSERT INTO nav_monetization (nav_event, ads, popups, shortlinks, redirects, mode, frequency, enabled, created_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))`
    ).bind(
      nav_event,
      adsJson    || "[]",
      popups     || "[]",
      shortlinks || "[]",
      redirects  || "[]",
      mode       || "random",
      frequency  || "every_click",
      enabled ?? 1
    ).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.put("/nav-monetization/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { ads: adsJson, popups, shortlinks, redirects, mode, frequency, enabled } = body
  try {
    await db.prepare(
      `UPDATE nav_monetization
       SET ads=?, popups=?, shortlinks=?, redirects=?, mode=?, frequency=?, enabled=?, updated_at=datetime('now')
       WHERE id=?`
    ).bind(
      adsJson    || "[]",
      popups     || "[]",
      shortlinks || "[]",
      redirects  || "[]",
      mode       || "random",
      frequency  || "every_click",
      enabled ?? 1,
      id
    ).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

adsAdmin.delete("/nav-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM nav_monetization WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── BULK ASSIGN ADS TO SLOTS ────────────────────────────────────────────
   Blueprint §2 Item 11 — assign one ad to multiple page slots at once
────────────────────────────────────────────────────────────────────────────── */

adsAdmin.post("/ads/bulk-assign", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { adId, pageSlots } = body || {}
  if (!adId || !Array.isArray(pageSlots) || pageSlots.length === 0) {
    return fail(c, "adId and pageSlots array required")
  }
  try {
    const ad = await db.prepare("SELECT id FROM ads_library WHERE id=?").bind(adId).first()
    if (!ad) return fail(c, "Ad not found", 404)

    // ✅ D1 batch — one round-trip
    const stmts = pageSlots.map(slot =>
      db.prepare(
        `INSERT OR REPLACE INTO ad_assignments (ad_id, slot, updated_at) VALUES (?, ?, datetime('now'))`
      ).bind(adId, slot)
    )
    await db.batch(stmts)
    return ok(c, { assigned: pageSlots.length, adId })
  } catch(e) { return fail(c, e.message) }
})

export default adsAdmin


