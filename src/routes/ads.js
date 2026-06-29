/**
 * ads.js — AnimeHunt Backend
 * ════════════════════════════════════════════════════════
 * Ads & Monetization router (Hono + Cloudflare D1)
 *
 * index.js mein mount karo:
 *   app.route("/api", ads)              ← public routes
 *   adminRoutes.route("/", ads)         ← admin routes (adminAuth already applied)
 *
 * Public  routes → /api/public/page-ads
 * Admin   routes → /api/admin/ads-library, /api/admin/popup-library, etc.
 * ════════════════════════════════════════════════════════
 */

import { Hono } from "hono"

const ads = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

function pickByMode(arr, mode, clicks = 0) {
  if (!arr?.length) return null
  if (mode === "direct")   return arr[0]
  if (mode === "sequence") return arr[clicks % arr.length]
  return arr[Math.floor(Math.random() * arr.length)]
}

/* ══════════════════════════════════════════════════════════
   PUBLIC ROUTES
   (index.js: app.route("/api", ads))
══════════════════════════════════════════════════════════ */

/* GET /api/public/page-ads?page=download */
ads.get("/public/page-ads", async (c) => {
  const db   = c.env.DB
  const page = c.req.query("page") || "download"
  try {
    const config = await db.prepare(
      "SELECT slot_config FROM page_monetization WHERE page_type=? AND enabled=1"
    ).bind(page).first()

    if (!config?.slot_config) return ok(c, {})

    let slotConfig = {}
    try { slotConfig = JSON.parse(config.slot_config) } catch {}

    const result = {}
    for (const [slot, slotData] of Object.entries(slotConfig)) {
      if (!slotData?.ads?.length) continue
      const pickedId = pickByMode(slotData.ads, slotData.mode || "random")
      if (!pickedId) continue
      const ad = await db.prepare(
        "SELECT code, type, name FROM ads_library WHERE id=? AND active=1"
      ).bind(pickedId).first()
      if (ad) result[slot] = { code: ad.code, type: ad.type, name: ad.name }
    }
    return ok(c, result)
  } catch(e) { return fail(c, e.message) }
})

/* ══════════════════════════════════════════════════════════
   ADMIN ROUTES
   (index.js: adminRoutes.route("/", ads) — adminAuth already applied)
   All routes: /api/admin/...
══════════════════════════════════════════════════════════ */

/* ── ADS LIBRARY ────────────────────────────────────────── */

ads.get("/ads-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, type, code, delay, weight, active, created_at FROM ads_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

ads.get("/ads-library/:id", async (c) => {
  const db  = c.env.DB
  const id  = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM ads_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/ads-library", async (c) => {
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

ads.put("/ads-library/:id", async (c) => {
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

ads.delete("/ads-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM ads_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── POPUP LIBRARY ──────────────────────────────────────── */

ads.get("/popup-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, script, trigger, active, created_at FROM popup_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

ads.get("/popup-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM popup_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/popup-library", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { name, script, trigger, active } = body
  if (!name || !script) return fail(c, "name and script required")
  try {
    const res = await db.prepare(
      `INSERT INTO popup_library (name, script, trigger, active, created_at)
       VALUES (?,?,?,?,datetime('now'))`
    ).bind(name, script, trigger || "onload", active ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

ads.put("/popup-library/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { name, script, trigger, active } = body
  if (!name || !script) return fail(c, "name and script required")
  try {
    await db.prepare(
      `UPDATE popup_library SET name=?, script=?, trigger=?, active=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name, script, trigger || "onload", active ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

ads.delete("/popup-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM popup_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── SHORTLINKS LIBRARY ─────────────────────────────────── */

ads.get("/shortlinks-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, base_url, api_key, weight, active, created_at FROM shortlinks_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

ads.get("/shortlinks-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM shortlinks_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/shortlinks-library", async (c) => {
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

ads.put("/shortlinks-library/:id", async (c) => {
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

ads.delete("/shortlinks-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM shortlinks_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── REDIRECT LIBRARY ───────────────────────────────────── */

ads.get("/redirect-library", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, name, url, delay, active, created_at FROM redirect_library ORDER BY id DESC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

ads.get("/redirect-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM redirect_library WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/redirect-library", async (c) => {
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

ads.put("/redirect-library/:id", async (c) => {
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

ads.delete("/redirect-library/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM redirect_library WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── HOST MONETIZATION ──────────────────────────────────── */

ads.get("/host-monetization", async (c) => {
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

ads.get("/host-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM host_monetization WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/host-monetization", async (c) => {
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

ads.put("/host-monetization/:id", async (c) => {
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

/* ── PAGE MONETIZATION ──────────────────────────────────── */

ads.get("/page-monetization", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT id, page_type, slot_config, frequency, enabled, updated_at FROM page_monetization ORDER BY page_type ASC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

ads.get("/page-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare("SELECT * FROM page_monetization WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    return ok(c, row)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/page-monetization", async (c) => {
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

ads.put("/page-monetization/:id", async (c) => {
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

/* ── ANALYTICS SUMMARY ──────────────────────────────────── */

ads.get("/analytics/summary", async (c) => {
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

ads.get("/nav-monetization", async (c) => {
  const db = c.env.DB
  try {
    const res = await db.prepare(
      "SELECT * FROM nav_monetization ORDER BY nav_event ASC"
    ).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

ads.post("/nav-monetization", async (c) => {
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

ads.put("/nav-monetization/:id", async (c) => {
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

ads.delete("/nav-monetization/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM nav_monetization WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* Public nav-monetization — called by frontend on navigation events */
ads.post("/public/nav-fire", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { nav_event } = body
  if (!nav_event) return ok(c, { fire: false })
  try {
    const config = await db.prepare(
      "SELECT * FROM nav_monetization WHERE nav_event=? AND enabled=1"
    ).bind(nav_event).first()

    if (!config) return ok(c, { fire: false })

    let adIds=[], popupIds=[], slIds=[], rdIds=[]
    try { adIds    = JSON.parse(config.ads        || "[]") } catch {}
    try { popupIds = JSON.parse(config.popups     || "[]") } catch {}
    try { slIds    = JSON.parse(config.shortlinks || "[]") } catch {}
    try { rdIds    = JSON.parse(config.redirects  || "[]") } catch {}

    const mode = config.mode || "random"
    const pick = (arr) => {
      if (!arr.length) return null
      if (mode === "direct")   return arr[0]
      if (mode === "sequence") return arr[0]
      return arr[Math.floor(Math.random() * arr.length)]
    }

    const result = { fire: true, ad: null, popup: null, shortlink: null, redirect: null }

    if (adIds.length) {
      const ad = await db.prepare("SELECT code, type FROM ads_library WHERE id=? AND active=1").bind(pick(adIds)).first()
      if (ad) result.ad = { code: ad.code, type: ad.type }
    }
    if (popupIds.length) {
      const popup = await db.prepare("SELECT script FROM popup_library WHERE id=? AND active=1").bind(pick(popupIds)).first()
      if (popup) result.popup = popup.script
    }
    if (slIds.length) {
      const sl = await db.prepare("SELECT base_url, api_key FROM shortlinks_library WHERE id=? AND active=1").bind(pick(slIds)).first()
      if (sl) result.shortlink = sl.base_url
    }
    if (rdIds.length) {
      const rd = await db.prepare("SELECT url FROM redirect_library WHERE id=? AND active=1").bind(pick(rdIds)).first()
      if (rd) result.redirect = rd.url
    }

    return ok(c, result)
  } catch(e) { return fail(c, e.message) }
})


/* ── AD CLICK TRACKING — NULL FIX + UNIQUE TRACKING (FIXES + NEW) ──────────────
   BUG FIX (Blueprint Line 20): ad.clicks null hone par crash → null-safe kiya
   NEW FEATURE (Blueprint §2 Item 5): IP-based unique click dedupe via KV
────────────────────────────────────────────────────────────────────────────── */

// Helper: dedupe click by IP using KV (24h window)
async function trackUniqueClick(env, adId, ip) {
  if (!env.KV) return { unique: true }
  const kvKey    = `ad_click:${adId}:${ip}`
  const existing = await env.KV.get(kvKey)
  if (existing) return { unique: false }
  await env.KV.put(kvKey, "1", { expirationTtl: 86400 })
  return { unique: true }
}

// POST /api/public/ads/:adId/click
ads.post("/public/ads/:adId/click", async (c) => {
  const db   = c.env.DB
  const adId = parseInt(c.req.param("adId"))
  const ip   = c.req.header("CF-Connecting-IP") || "unknown"
  try {
    const ad = await db.prepare("SELECT id, clicks FROM ads_library WHERE id=?").bind(adId).first()
    if (!ad) return fail(c, "Ad not found", 404)

    // ✅ BUG FIX (Line 20): null-safe
    const currentClicks = ad?.clicks ?? 0

    // ✅ NEW: Unique user tracking
    const uniqueResult = await trackUniqueClick(c.env, adId, ip)

    const updateSql = uniqueResult.unique
      ? `UPDATE ads_library SET clicks=clicks+1, unique_clicks=COALESCE(unique_clicks,0)+1, updated_at=datetime('now') WHERE id=?`
      : `UPDATE ads_library SET clicks=clicks+1, updated_at=datetime('now') WHERE id=?`

    await db.prepare(updateSql).bind(adId).run()

    return ok(c, { totalClicks: currentClicks + 1, unique: uniqueResult.unique })
  } catch(e) { return fail(c, e.message) }
})

/* ── BULK ASSIGN ADS TO SLOTS (MISSING FEATURE — ADDED) ─────────────────────
   Blueprint §2 Item 11 — assign one ad to multiple page slots at once
────────────────────────────────────────────────────────────────────────────── */

ads.post("/ads/bulk-assign", async (c) => {
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

// ✅ FIX: export default correctly placed at true end of file
//    (was mis-placed before nav-monetization routes — those routes were never registered)
export default ads
