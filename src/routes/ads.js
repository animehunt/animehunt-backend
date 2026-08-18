/**
 * ads.js — AnimeHunt Backend
 * ════════════════════════════════════════════════════════
 * Ads & Monetization router (Hono + Cloudflare D1) — PUBLIC ROUTES ONLY
 *
 * index.js mein mount karo:
 *   app.route("/api", ads)   ← this file, public routes only
 *
 * ✅ FIX (security audit, dual-mount vulnerability): this file used to
 * contain BOTH public routes AND every admin CRUD route (ads library,
 * popup library, shortlinks library, redirect library, host/page/nav
 * monetization, bulk-assign) in one Hono() instance. index.js mounted
 * that same router object twice — once publicly (app.route("/api", ads),
 * no auth) and once under adminRoutes (adminRoutes.route("/", ads), auth
 * required).
 *
 * Hono's app.route(prefix, subApp) copies every handler already
 * registered on subApp into the parent's routing tree at that prefix —
 * it does NOT scope auth middleware attached to a *different* Hono
 * instance (adminRoutes) that mounts the same subApp a second time.
 * The result: every admin write route was reachable completely
 * unauthenticated at /api/... — the exact same problem already
 * identified and fixed for player.js (see ISSUE-020 / playerAdmin.js).
 * This split applies that same fix here.
 *
 * All admin routes have moved to adsAdmin.js (mounted only under
 * adminRoutes in index.js, so requireAuth applies).
 *
 * Public  routes → /api/public/page-ads, /api/public/nav-fire,
 *                   /api/public/ads/:adId/click
 * ════════════════════════════════════════════════════════
 */

import { Hono } from "hono"
import { getClientIP } from "../utils/clientIp.js"

const ads = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

function pickByMode(arr, mode, clicks = 0) {
  if (!arr?.length) return null
  if (mode === "direct")   return arr[0]
  if (mode === "sequence") return arr[clicks % arr.length]
  return arr[Math.floor(Math.random() * arr.length)]
}

// Persistent rotation counter (D1-backed) so "sequence" mode actually
// cycles across requests for stateless public endpoints.
async function nextSeq(db, key) {
  try {
    const row = await db.prepare(
      `INSERT INTO impression_counters (key, counter) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET counter = counter + 1
       RETURNING counter`
    ).bind(key).first()
    return row?.counter ?? 0
  } catch { return 0 }
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
      const mode = slotData.mode || "random"
      let pickedId
      if (mode === "sequence") {
        const seq = await nextSeq(db, `page:${page}:${slot}`)
        pickedId = slotData.ads[seq % slotData.ads.length]
      } else {
        pickedId = pickByMode(slotData.ads, mode)
      }
      if (!pickedId) continue
      const ad = await db.prepare(
        "SELECT code, type, name FROM ads_library WHERE id=? AND active=1"
      ).bind(pickedId).first()
      if (ad) result[slot] = { code: ad.code, type: ad.type, name: ad.name }
    }
    return ok(c, result)
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
    const pick = async (arr, kind) => {
      if (!arr.length) return null
      if (mode === "direct")   return arr[0]
      if (mode === "sequence") {
        const seq = await nextSeq(db, `nav:${nav_event}:${kind}`)
        return arr[seq % arr.length]
      }
      return arr[Math.floor(Math.random() * arr.length)]
    }

    const result = { fire: true, ad: null, popup: null, shortlink: null, redirect: null }

    if (adIds.length) {
      const ad = await db.prepare("SELECT code, type FROM ads_library WHERE id=? AND active=1").bind(await pick(adIds, "ad")).first()
      if (ad) result.ad = { code: ad.code, type: ad.type }
    }
    if (popupIds.length) {
      const popup = await db.prepare("SELECT script FROM popup_library WHERE id=? AND active=1").bind(await pick(popupIds, "popup")).first()
      if (popup) result.popup = popup.script
    }
    if (slIds.length) {
      const sl = await db.prepare("SELECT base_url, api_key FROM shortlinks_library WHERE id=? AND active=1").bind(await pick(slIds, "shortlink")).first()
      if (sl) result.shortlink = sl.base_url
    }
    if (rdIds.length) {
      const rd = await db.prepare("SELECT url FROM redirect_library WHERE id=? AND active=1").bind(await pick(rdIds, "redirect")).first()
      if (rd) result.redirect = rd.url
    }

    return ok(c, result)
  } catch(e) { return fail(c, e.message) }
})

/* ── AD CLICK TRACKING — dedupe by IP via KV (24h window) ── */
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
  // ✅ FIX (audit): was c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for")
  // — the old cf-connecting-ip-first priority, backwards for this nginx-fronted
  // deployment (see utils/clientIp.js's header comment). Wrong IP here meant
  // trackUniqueClick()'s per-IP dedup key could group different real visitors
  // together (or fail to dedup at all), undercounting or overcounting unique ad clicks.
  const ip   = getClientIP(c, "unknown")
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

export default ads
