import { autoBan } from "../security/autoBan.js"

export async function firewall(c, next) {

  try {

    const DB = c.env.DB

    if (!DB) {
      console.error("DB missing")
      return await next()
    }

    const ip =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("x-forwarded-for") ||
      "0.0.0.0"

    const ua = (c.req.header("user-agent") || "").toLowerCase()

    /* ================= SETTINGS ================= */

    const settings = await DB
      .prepare("SELECT * FROM security_settings WHERE id=1")
      .first()

    if (!settings) {
      return await next()
    }

    /* ================= BLOCKED IP ================= */

    const banned = await DB
      .prepare("SELECT ip FROM blocked_ips WHERE ip=?")
      .bind(ip)
      .first()

    if (banned) {
      return c.text("Access Denied", 403)
    }

    /* ================= BOT PROTECTION ================= */

    if (settings.core_bot) {
      if (!ua || ua.length < 10) {

        if (settings.ai_auto_ban) {
          await autoBan(DB, ip, "Bot detected")
        }

        return c.text("Bot blocked", 403)
      }
    }

    /* ================= SCRAPER ================= */

    if (settings.core_scraper) {

      if (
        ua.includes("curl") ||
        ua.includes("wget") ||
        ua.includes("python") ||
        ua.includes("scrapy") ||
        ua.includes("axios")
      ) {

        if (settings.ai_auto_ban) {
          await autoBan(DB, ip, "Scraper detected")
        }

        return c.text("Scraper blocked", 403)
      }
    }

    /* ================= RATE LIMIT ================= */

    const level = settings.firewall_level || 3

    const limits = {
      1: 80,
      2: 60,
      3: 40,
      4: 25,
      5: 15
    }

    const limit = limits[level] || 40

    const now = Date.now()
    const key = "rate_" + ip

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

    /* ================= PASS ================= */

    await next()

  } catch (err) {
    console.error("FIREWALL ERROR:", err)
    return await next() // fail-safe
  }
}
