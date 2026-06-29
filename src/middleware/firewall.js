/* ============================================================
  ANIMEHUNT — FIREWALL MIDDLEWARE
  File: src/middleware/firewall.js

  FIXES v2.2:
    ✅ FIX 1: globalThis.RATE removed (CF Workers isolate resets)
    ✅ FIX 2: KV-based distributed rate limiting
    ✅ FIX 3: IP blocklist via KV fast-path + DB fallback
    ✅ FIX 4: blockIP/unblockIP exported for securityAdmin.js
    ✅ FIX 5: c.text() headers fixed — Hono doesn't accept headers
              as 3rd arg to c.text(); use c.header() then c.text()
============================================================ */

const RATE_LIMIT_RULES = {
  "/api/admin/auth/login":   { limit: 5,   window: 300 },
  "/api/admin/auth/refresh": { limit: 10,  window: 60  },
  "/api/search":             { limit: 30,  window: 60  },
  "/api/anime":              { limit: 100, window: 60  },
  "default":                 { limit: 200, window: 60  }
}

const FIREWALL_LEVEL_LIMITS = {
  1: 200, 2: 150, 3: 100, 4: 60, 5: 30
}

/* ── IP Blocklist: KV fast-path + DB fallback ── */
async function isIPBlocked(env, ip, db) {
  if (env.KV) {
    try {
      const kvBlocked = await env.KV.get(`blocklist:${ip}`)
      if (kvBlocked !== null) return true
    } catch (e) {
      console.warn("⚠️ KV blocklist check failed:", e.message)
    }
  }

  try {
    const banned = await db.prepare(
      "SELECT ip FROM banned_ips WHERE ip=?"
    ).bind(ip).first()

    if (banned && env.KV) {
      env.KV.put(`blocklist:${ip}`, "1", { expirationTtl: 3600 })
        .catch(e => console.warn("⚠️ KV blocklist cache write failed:", e.message))
      return true
    }
    return false
  } catch {
    return false
  }
}

/* ── KV-based Rate Limiter ── */
async function checkRateLimit(env, ip, path, firewallLevel = 3) {
  if (!env.KV) return { blocked: false, remaining: 999 }

  const pathRule   = RATE_LIMIT_RULES[path] || RATE_LIMIT_RULES["default"]
  const levelLimit = FIREWALL_LEVEL_LIMITS[firewallLevel] || 100
  const limit      = Math.min(pathRule.limit, levelLimit)
  const window     = pathRule.window
  const kvKey      = `ratelimit:${ip}:${path}`

  try {
    const current = await env.KV.get(kvKey)

    if (!current) {
      await env.KV.put(kvKey, "1", { expirationTtl: window })
      return { blocked: false, remaining: limit - 1, retryAfter: window }
    }

    const count = parseInt(current, 10)
    if (count >= limit) return { blocked: true, remaining: 0, retryAfter: window }

    await env.KV.put(kvKey, String(count + 1), { expirationTtl: window })
    return { blocked: false, remaining: limit - count - 1, retryAfter: window }

  } catch (e) {
    console.warn("⚠️ Rate limit KV error:", e.message)
    return { blocked: false, remaining: 999 }
  }
}

/* ── Auto-ban: DB insert + KV cache ── */
async function autoBan(env, db, ip, reason) {
  try {
    await db.prepare(
      "INSERT OR IGNORE INTO banned_ips (ip, reason, ban_count, created_at) VALUES (?, ?, 1, datetime('now'))"
    ).bind(ip, reason).run()

    if (env.KV) {
      env.KV.put(`blocklist:${ip}`, "1", { expirationTtl: 86400 })
        .catch(e => console.warn("⚠️ KV autoBan cache failed:", e.message))
    }
  } catch (err) {
    console.error("autoBan error:", err)
  }
}

/* ── Exported: blockIP / unblockIP — used by securityAdmin.js ── */
export async function blockIP(env, ip, reason = "manual", durationSeconds = 86400) {
  if (!env.DB) return

  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM banned_ips WHERE ip=?"
    ).bind(ip).first()

    if (existing) {
      await env.DB.prepare(
        "UPDATE banned_ips SET ban_count=ban_count+1, reason=? WHERE ip=?"
      ).bind(reason, ip).run()
    } else {
      await env.DB.prepare(
        "INSERT INTO banned_ips (ip, reason, ban_count, created_at) VALUES (?, ?, 1, datetime('now'))"
      ).bind(ip, reason).run()
    }

    if (env.KV) {
      env.KV.put(`blocklist:${ip}`, JSON.stringify({ reason, blockedAt: new Date().toISOString() }), {
        expirationTtl: durationSeconds
      }).catch(e => console.warn("⚠️ KV blockIP cache failed:", e.message))
    }
  } catch (err) {
    console.error("blockIP error:", err)
  }
}

export async function unblockIP(env, ip) {
  if (!env.DB) return

  try {
    await env.DB.prepare("DELETE FROM banned_ips WHERE ip=?").bind(ip).run()

    if (env.KV) {
      env.KV.delete(`blocklist:${ip}`)
        .catch(e => console.warn("⚠️ KV unblockIP delete failed:", e.message))
    }
  } catch (err) {
    console.error("unblockIP error:", err)
  }
}

/* ── Main Firewall Middleware ── */
export async function firewall(c, next) {
  try {
    const DB = c.env.DB
    if (!DB) {
      console.error("DB missing in firewall")
      return await next()
    }

    const ip   = c.req.header("CF-Connecting-IP") || c.req.header("x-forwarded-for") || "0.0.0.0"
    const ua   = (c.req.header("user-agent") || "").toLowerCase()
    const path = new URL(c.req.url).pathname

    const settings = await DB.prepare("SELECT * FROM security_settings WHERE id=1").first()
    if (!settings) return await next()

    /* IP Blocklist */
    if (await isIPBlocked(c.env, ip, DB)) {
      return c.text("Access Denied", 403)
    }

    /* Bot Protection */
    if (settings.core_bot && (!ua || ua.length < 10)) {
      if (settings.ai_auto_ban) await autoBan(c.env, DB, ip, "Bot detected")
      return c.text("Bot blocked", 403)
    }

    /* Scraper Detection */
    if (settings.core_scraper) {
      const scraperPatterns = ["curl", "wget", "python", "scrapy", "axios", "httpie", "libwww"]
      if (scraperPatterns.some(p => ua.includes(p))) {
        if (settings.ai_auto_ban) await autoBan(c.env, DB, ip, "Scraper detected")
        return c.text("Scraper blocked", 403)
      }
    }

    /* KV-based Rate Limiting */
    if (settings.rate_limit) {
      const level  = settings.firewall_level || 3
      const result = await checkRateLimit(c.env, ip, path, level)

      if (result.blocked) {
        if (settings.ai_auto_ban) await autoBan(c.env, DB, ip, "Rate limit exceeded")
        // FIX: Hono c.text() only takes (text, status) — headers set separately
        c.header("Retry-After",          String(result.retryAfter))
        c.header("X-RateLimit-Remaining", "0")
        return c.text("Too many requests", 429)
      }

      c.header("X-RateLimit-Remaining", String(result.remaining))
    }

    await next()

  } catch (err) {
    console.error("FIREWALL ERROR:", err)
    return await next()
  }
}
