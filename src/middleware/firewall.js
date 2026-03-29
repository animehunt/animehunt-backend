import { autoBan } from "../security/autoBan.js"
import { updateScore } from "./ipReputation.js"
import { trackMetrics } from "./metrics.js"
import { broadcastAttack } from "../routes/ws.js"

export async function firewall(c, next) {

  const ip =
    c.req.header("CF-Connecting-IP") ||
    "0.0.0.0"

  const ua = c.req.header("user-agent") || ""
  const country = c.req.cf?.country || "XX"

  const DB = c.env.DB

  /* =========================
  LOAD SETTINGS
  ========================= */

  const settings = await DB
    .prepare("SELECT * FROM security_settings WHERE id=1")
    .first()

  /* =========================
  TRACK REQUEST
  ========================= */

  await trackMetrics(DB, "request")

  await DB.prepare(`
    INSERT INTO security_logs(ip,event,created_at,country)
    VALUES(?,?,?,?)
  `).bind(ip,"request",Date.now(),country).run()

  /* =========================
  REALTIME ATTACK STREAM
  ========================= */

  broadcastAttack({
    ip,
    country,
    type: "request",
    time: Date.now()
  })

  /* =========================
  BLOCKED IP CHECK
  ========================= */

  const banned = await DB
    .prepare("SELECT ip FROM blocked_ips WHERE ip=?")
    .bind(ip)
    .first()

  if (banned) {

    await trackMetrics(DB, "blocked")

    broadcastAttack({
      ip,
      country,
      type: "blocked"
    })

    return c.text("Access Denied", 403)
  }

  /* =========================
  GEO FIREWALL
  ========================= */

  if (settings.geo_india_only && country !== "IN") {

    await autoBan(DB, ip, "Geo blocked")

    await trackMetrics(DB, "blocked")

    broadcastAttack({
      ip,
      country,
      type: "geo_block"
    })

    return c.text("Geo blocked", 403)
  }

  if (settings.geo_block_foreign && country !== "IN") {

    await autoBan(DB, ip, "Foreign blocked")

    await trackMetrics(DB, "blocked")

    broadcastAttack({
      ip,
      country,
      type: "foreign_block"
    })

    return c.text("Foreign blocked", 403)
  }

  /* =========================
  BOT DETECTION
  ========================= */

  if (settings.core_bot) {

    if (!ua || ua.length < 10) {

      const score = await updateScore(DB, ip, 3)

      await trackMetrics(DB, "suspicious")

      await DB.prepare(`
        INSERT INTO security_logs(ip,event,created_at,country)
        VALUES(?,?,?,?)
      `).bind(ip,"bot_detected",Date.now(),country).run()

      broadcastAttack({
        ip,
        country,
        type: "bot"
      })

      if (score >= 10 && settings.ai_auto_ban) {

        await autoBan(DB, ip, "Bot detected")

        await trackMetrics(DB, "blocked")
      }

      return c.text("Bot blocked", 403)
    }
  }

  /* =========================
  SCRAPER DETECTION
  ========================= */

  if (settings.core_scraper) {

    if (
      ua.toLowerCase().includes("python") ||
      ua.toLowerCase().includes("curl") ||
      ua.toLowerCase().includes("wget")
    ) {

      const score = await updateScore(DB, ip, 2)

      await trackMetrics(DB, "suspicious")

      await DB.prepare(`
        INSERT INTO security_logs(ip,event,created_at,country)
        VALUES(?,?,?,?)
      `).bind(ip,"scraper_detected",Date.now(),country).run()

      broadcastAttack({
        ip,
        country,
        type: "scraper"
      })

      if (score >= 10 && settings.ai_auto_ban) {
        await autoBan(DB, ip, "Scraper detected")
      }

      return c.text("Scraper blocked", 403)
    }
  }

  /* =========================
  RATE LIMIT
  ========================= */

  const key = "rate_" + ip
  const now = Date.now()

  if (!globalThis.RATE) globalThis.RATE = {}

  if (!globalThis.RATE[key]) {
    globalThis.RATE[key] = []
  }

  globalThis.RATE[key] =
    globalThis.RATE[key].filter(t => now - t < 1000)

  globalThis.RATE[key].push(now)

  if (globalThis.RATE[key].length > 40) {

    await autoBan(DB, ip, "Rate limit")

    await trackMetrics(DB, "blocked")

    await DB.prepare(`
      INSERT INTO security_logs(ip,event,created_at,country)
      VALUES(?,?,?,?)
    `).bind(ip,"rate_limit",Date.now(),country).run()

    broadcastAttack({
      ip,
      country,
      type: "rate_limit"
    })

    return c.text("Too many requests", 429)
  }

  /* =========================
  BURST DETECTION
  ========================= */

  if (globalThis.RATE[key].length > 25) {

    await updateScore(DB, ip, 1)

    await trackMetrics(DB, "suspicious")

    broadcastAttack({
      ip,
      country,
      type: "burst"
    })
  }

  /* =========================
  IP REPUTATION
  ========================= */

  const scoreRow = await DB
    .prepare("SELECT score FROM ip_scores WHERE ip=?")
    .bind(ip)
    .first()

  if (scoreRow && scoreRow.score >= 15) {

    await autoBan(DB, ip, "High risk IP")

    await trackMetrics(DB, "blocked")

    broadcastAttack({
      ip,
      country,
      type: "high_risk"
    })

    return c.text("High risk blocked", 403)
  }

  /* =========================
  STEALTH MODE
  ========================= */

  if (settings.hide_server) {
    c.header("Server", "cloudflare")
  }

  if (settings.hide_stack) {
    c.header("X-Powered-By", "unknown")
  }

  /* =========================
  PASS
  ========================= */

  await next()
}
