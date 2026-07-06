// ============================================================
// src/middleware/dbSync.js  —  Auto DB Sync Middleware v2.2
// ============================================================
// FIXES v2.2:
//   ✅ FIX 1: In-memory rateLimitMap removed (CF Workers isolate resets)
//   ✅ FIX 2: setInterval() removed (not supported in CF Workers)
//   ✅ FIX 3: KV-based distributed rate limiting
//   ✅ FIX 4: Combined import from db.js (was two separate import lines)
//   ✅ FIX 5: syncAnimeToKV — KV guard added (won't crash if env.KV missing)
// ============================================================

// FIX: Combined into one import line
import { getDB, Database } from "../db.js"

/* ─────────────────────────────────────────────────────────────
   KV-BASED DISTRIBUTED RATE LIMITER
───────────────────────────────────────────────────────────── */
const RATE_LIMIT_WINDOW_SEC = 60
const RATE_LIMIT_MAX_WRITES = 500

export async function checkRateLimit(env, key, limit = RATE_LIMIT_MAX_WRITES, windowSeconds = RATE_LIMIT_WINDOW_SEC) {
  if (!env.KV) return { allowed: true, remaining: limit }

  const kvKey = `ratelimit:${key}`

  try {
    const current = await env.KV.get(kvKey)

    if (!current) {
      await env.KV.put(kvKey, "1", { expirationTtl: windowSeconds })
      return { allowed: true, remaining: limit - 1 }
    }

    const count = parseInt(current, 10)
    if (count >= limit) return { allowed: false, remaining: 0 }

    await env.KV.put(kvKey, String(count + 1), { expirationTtl: windowSeconds })
    return { allowed: true, remaining: limit - count - 1 }

  } catch (e) {
    console.warn("⚠️ Rate limit KV error:", e.message)
    return { allowed: true, remaining: limit }
  }
}

/* ─────────────────────────────────────────────────────────────
   KV CACHE SYNC FUNCTIONS
───────────────────────────────────────────────────────────── */

// FIX: Guard added — if env.KV missing, won't crash
export async function syncAnimeToKV(env, animeId) {
  const db    = new Database(env.DB)
  const anime = await db.queryOne("SELECT * FROM anime WHERE id = ?", [animeId])

  if (anime && env.KV) {
    try {
      await env.KV.put(`anime:${animeId}`, JSON.stringify(anime), {
        expirationTtl: 3600
      })
    } catch (e) {
      console.warn("⚠️ syncAnimeToKV KV write failed:", e.message)
    }
  }
  return anime
}

export async function invalidateAnimeCache(env, animeId) {
  if (!env.KV) return
  try {
    await env.KV.delete(`anime:${animeId}`)
  } catch (e) {
    console.warn("⚠️ KV invalidate error:", e.message)
  }
}

export async function invalidateCacheByPrefix(env, prefix) {
  if (!env.KV) return
  try {
    const list = await env.KV.list({ prefix })
    if (list.keys.length > 0) {
      await Promise.all(list.keys.map(k => env.KV.delete(k.name)))
    }
  } catch (e) {
    console.warn("⚠️ KV prefix invalidate error:", e.message)
  }
}

/* ─────────────────────────────────────────────────────────────
   MAIN MIDDLEWARE  —  Hono pattern (c, next)
───────────────────────────────────────────────────────────── */
export async function dbSync(c, next) {
  const start = Date.now()
  const ip    = c.req.header("CF-Connecting-IP") || "unknown"

  const rateLimitResult = await checkRateLimit(c.env, ip)
  if (!rateLimitResult.allowed) {
    return c.json({
      success: false,
      message: "Rate limit exceeded. Max 500 writes/minute."
    }, 429)
  }

  const db = getDB(c.env)
  c.set("db", db)
  c.set("sync_start", start)

  await next()

  const elapsed = Date.now() - start
  c.res.headers.set("X-DB-Sync-Ms",      String(elapsed))
  c.res.headers.set("X-DB-Primary",      "d1")
  c.res.headers.set("X-DB-Replicas",     "turso,supabase")
  c.res.headers.set("X-DB-Sync-Version", "2.2")
}

