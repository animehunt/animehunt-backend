import { autoBan } from "../security/autoBan.js"

/* =========================
HELPERS
========================= */

function jsonError(c, message, status = 403) {
  return c.json({
    success: false,
    error: message
  }, status)
}

function getIP(c) {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  )
}

function getUA(c) {
  return (c.req.header("user-agent") || "").toLowerCase()
}

function isBotUA(ua) {
  if (!ua || ua.length < 10) return true

  const bots = [
    "bot","crawl","spider","slurp",
    "facebook","discord","whatsapp",
    "telegram","preview"
  ]

  return bots.some(b => ua.includes(b))
}

function isScraperUA(ua) {
  const bad = [
    "curl","wget","python","scrapy",
    "axios","postman","insomnia"
  ]

  return bad.some(b => ua.includes(b))
}

/* =========================
RATE LIMIT ENGINE (GLOBAL MEMORY)
========================= */

function checkRateLimit(ip, limit) {

  const now = Date.now()
  const window = 1000 // 1 sec

  if (!globalThis.RATE) globalThis.RATE = {}

  if (!globalThis.RATE[ip]) {
    globalThis.RATE[ip] = []
  }

  const hits = globalThis.RATE[ip]

  // clean old
  globalThis.RATE[ip] = hits.filter(t => now - t < window)

  globalThis.RATE[ip].push(now)

  return globalThis.RATE[ip].length <= limit
}

/* =========================
MAIN FIREWALL
========================= */

export async function firewall(c, next) {

  try {

    const DB = c.env.DB

    if (!DB) {
      console.warn("Firewall: DB missing → skipping")
      return await next()
    }

    const ip = getIP(c)
    const ua = getUA(c)

    /* =========================
    LOAD SETTINGS (SAFE)
    ========================= */

    const settings = await DB
      .prepare("SELECT * FROM security_settings WHERE id=1")
      .first()
      .catch(() => null)

    if (!settings) {
      return await next()
    }

    /* =========================
    WHITELIST (OPTIONAL)
    ========================= */

    const white = await DB
      .prepare("SELECT ip FROM whitelist_ips WHERE ip=?")
      .bind(ip)
      .first()
      .catch(() => null)

    if (white) {
      return await next()
    }

    /* =========================
    BLOCKED IP
    ========================= */

    const banned = await DB
      .prepare("SELECT ip FROM blocked_ips WHERE ip=?")
      .bind(ip)
      .first()
      .catch(() => null)

    if (banned) {
      return jsonError(c, "Access Denied", 403)
    }

    /* =========================
    BOT PROTECTION
    ========================= */

    if (settings.core_bot && isBotUA(ua)) {

      if (settings.ai_auto_ban) {
        await autoBan(DB, ip, "Bot detected")
      }

      return jsonError(c, "Bot blocked", 403)
    }

    /* =========================
    SCRAPER PROTECTION
    ========================= */

    if (settings.core_scraper && isScraperUA(ua)) {

      if (settings.ai_auto_ban) {
        await autoBan(DB, ip, "Scraper detected")
      }

      return jsonError(c, "Scraper blocked", 403)
    }

    /* =========================
    GEO BLOCK (OPTIONAL)
    ========================= */

    if (settings.geo_block) {

      const country = c.req.header("cf-ipcountry") || "XX"

      const blocked = (settings.geo_block_list || "")
        .split(",")
        .map(x => x.trim())

      if (blocked.includes(country)) {
        return jsonError(c, "Region blocked", 403)
      }
    }

    /* =========================
    RATE LIMIT
    ========================= */

    const levels = {
      1: 120,
      2: 80,
      3: 50,
      4: 30,
      5: 15
    }

    const limit = levels[settings.firewall_level || 3] || 50

    const allowed = checkRateLimit(ip, limit)

    if (!allowed) {

      if (settings.ai_auto_ban) {
        await autoBan(DB, ip, "Rate limit exceeded")
      }

      return jsonError(c, "Too many requests", 429)
    }

    /* =========================
    REQUEST PASS
    ========================= */

    await next()

  } catch (err) {

    console.error("🔥 FIREWALL CRASH:", err)

    /* FAIL-SAFE → allow request */
    return await next()
  }
}
