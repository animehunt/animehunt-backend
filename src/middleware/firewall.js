import { autoBan } from "../security/autoBan.js"
import { updateScore } from "./ipReputation.js"

export async function firewall(c, next) {

  const ip = c.req.header("CF-Connecting-IP") || "0.0.0.0"
  const ua = c.req.header("user-agent") || ""
  const country = c.req.cf?.country || "XX"

  const DB = c.env.DB

  const settings = await DB
    .prepare("SELECT * FROM security_settings WHERE id=1")
    .first()

  /* BLOCKED IP */
  const banned = await DB
    .prepare("SELECT ip FROM blocked_ips WHERE ip=?")
    .bind(ip)
    .first()

  if (banned) return c.text("Blocked", 403)

  /* GEO FIREWALL */
  if (settings.geo_india_only && country !== "IN") {
    await autoBan(DB, ip, "Geo Block")
    return c.text("Geo blocked", 403)
  }

  /* BOT DETECTION */
  if (settings.core_bot) {
    if (!ua || ua.length < 10) {
      const score = await updateScore(DB, ip, 3)

      if (score >= 10 && settings.ai_auto_ban) {
        await autoBan(DB, ip, "Bot detected")
      }

      return c.text("Bot blocked", 403)
    }
  }

  /* ADVANCED RATE LIMIT */
  const key = "rate_" + ip
  const now = Date.now()

  if (!globalThis.RATE) globalThis.RATE = {}

  if (!globalThis.RATE[key]) {
    globalThis.RATE[key] = []
  }

  globalThis.RATE[key] = globalThis.RATE[key].filter(t => now - t < 1000)
  globalThis.RATE[key].push(now)

  if (globalThis.RATE[key].length > 40) {
    await autoBan(DB, ip, "Rate limit exceeded")
    return c.text("Too many requests", 429)
  }

  await next()
}
