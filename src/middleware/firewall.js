import { autoBan } from "../security/autoBan.js"

export async function firewall(c, next) {

  const ip =
    c.req.header("CF-Connecting-IP") ||
    "0.0.0.0"

  const ua = c.req.header("user-agent") || ""

  const DB = c.env.DB

  /* =========================
  LOAD SETTINGS
  ========================= */

  const settings = await DB
    .prepare("SELECT * FROM security_settings WHERE id=1")
    .first()

  if (!settings) {
    return c.text("Security config missing", 500)
  }

  /* =========================
  BLOCKED IP CHECK
  ========================= */

  const banned = await DB
    .prepare("SELECT ip FROM blocked_ips WHERE ip=?")
    .bind(ip)
    .first()

  if (banned) {
    return c.text("Access Denied", 403)
  }

  /* =========================
  BOT PROTECTION
  ========================= */

  if (settings.core_bot) {

    if (!ua || ua.length < 10) {

      if (settings.ai_auto_ban) {
        await autoBan(DB, ip, "Bot detected")
      }

      return c.text("Bot blocked", 403)
    }
  }

  /* =========================
  SCRAPER SHIELD
  ========================= */

  if (settings.core_scraper) {

    const badUA = ua.toLowerCase()

    if (
      badUA.includes("python") ||
      badUA.includes("curl") ||
      badUA.includes("wget")
    ) {

      if (settings.ai_auto_ban) {
        await autoBan(DB, ip, "Scraper detected")
      }

      return c.text("Scraper blocked", 403)
    }
  }

  /* =========================
  RATE LIMIT (FIREWALL LEVEL BASED)
  ========================= */

  const level = settings.firewall_level || 3

  let limit = 40

  if (level === 1) limit = 80
  if (level === 2) limit = 60
  if (level === 3) limit = 40
  if (level === 4) limit = 25
  if (level === 5) limit = 15

  const key = "rate_" + ip
  const now = Date.now()

  if (!globalThis.RATE) globalThis.RATE = {}

  if (!globalThis.RATE[key]) {
    globalThis.RATE[key] = []
  }

  globalThis.RATE[key] =
    globalThis.RATE[key].filter(t => now - t < 1000)

  globalThis.RATE[key].push(now)

  if (globalThis.RATE[key].length > limit) {

    if (settings.ai_auto_ban) {
      await autoBan(DB, ip, "Rate limit exceeded")
    }

    return c.text("Too many requests", 429)
  }

  /* =========================
  PASS REQUEST
  ========================= */

  await next()
}
