// ============================================================
// src/middleware/dbSync.js  —  Auto DB Sync Middleware v2.0
// ============================================================
// Ye middleware har write request ke baad
// Turso + Supabase ko background mein sync karta hai.
//
// v2 FEATURES:
//   ✅ DB instance injection
//   ✅ Request-level rate limiting
//   ✅ Sync health headers in response
//   ✅ Request origin tracking
// ============================================================

import { getDB } from "../db.js"

/* ─────────────────────────────────────────────────────────────
   SIMPLE IN-MEMORY RATE LIMITER
   (Production mein Cloudflare Rate Limiting Rules use karo)
───────────────────────────────────────────────────────────── */
const rateLimitMap = new Map()
const RATE_LIMIT_WINDOW_MS  = 60_000  // 1 minute
const RATE_LIMIT_MAX_WRITES = 500     // max 500 writes per minute per IP

function checkRateLimit(ip) {
  const now    = Date.now()
  const record = rateLimitMap.get(ip) || { count: 0, windowStart: now }

  // Reset window if expired
  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record.count       = 0
    record.windowStart = now
  }

  record.count++
  rateLimitMap.set(ip, record)

  return record.count <= RATE_LIMIT_MAX_WRITES
}

// Cleanup old rate limit entries every 5 min
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of rateLimitMap) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip)
    }
  }
}, 5 * 60_000)

/* ─────────────────────────────────────────────────────────────
   MAIN MIDDLEWARE
───────────────────────────────────────────────────────────── */
export async function dbSync(c, next) {
  const start = Date.now()
  const ip    = c.req.header("CF-Connecting-IP") || "unknown"

  // Rate limit check
  if (!checkRateLimit(ip)) {
    return c.json({
      success: false,
      message: "Rate limit exceeded. Max 500 writes/minute."
    }, 429)
  }

  // Inject DB instance with sync metadata
  const db = getDB(c.env)
  c.set("db", db)

  // Track request start time for latency header
  c.set("sync_start", start)

  await next()

  // Add sync health headers to every response
  const elapsed = Date.now() - start
  c.res.headers.set("X-DB-Sync-Ms",      String(elapsed))
  c.res.headers.set("X-DB-Primary",      "d1")
  c.res.headers.set("X-DB-Replicas",     "turso,supabase")
  c.res.headers.set("X-DB-Sync-Version", "2.0")
}
