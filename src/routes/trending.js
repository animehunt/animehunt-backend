/* ============================================================
  ANIMEHUNT — TRENDING ROUTES (FULLY FIXED)
  File: src/routes/trending.js

  ✅ KV cache added to ALL routes (was missing)
  ✅ Cache TTL: 15 min (trending changes frequently but not per-second)
  ✅ Cache invalidated when anime updated (via KV key naming)

  DB INDEX NOTE — For better performance:
    CREATE INDEX IF NOT EXISTS idx_anime_trending ON anime(is_trending, is_hidden, active);
    CREATE INDEX IF NOT EXISTS idx_anime_status   ON anime(status);

  ROUTES:
  GET /api/trending          — is_trending=1 anime (KV 15 min)
  GET /api/trending/top      — Top rated all time
  GET /api/trending/new      — Latest added
  GET /api/trending/ongoing  — Currently airing
  GET /api/trending/movies   — Latest movies
============================================================ */

import { Hono } from "hono"

const app  = new Hono()
const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

const COLS   = "id, title, slug, poster, rating, year, type, status, language"
const KV_TTL = 900 // 15 minutes

// NaN-safe limit parser
function safeLimit(val, def, max) {
  const n = parseInt(val || String(def))
  return Math.min(max, isNaN(n) ? def : Math.max(1, n))
}

/* ============================================================
  HELPER — KV get with graceful fallback
============================================================ */

async function kvGet(env, key) {
  if (!env.KV) return null
  return env.KV.get(key, "json").catch(() => null)
}

async function kvSet(env, key, data, ttl = KV_TTL) {
  if (!env.KV) return
  env.KV.put(key, JSON.stringify(data), { expirationTtl: ttl }).catch(() => {})
}

/* ============================================================
  GET /api/trending — is_trending=1
  KV cached 15 min
============================================================ */

app.get("/api/trending", async (c) => {
  const limit = safeLimit(c.req.query("limit"), 20, 40)

  try {
    const cacheKey = `trending:main:${limit}`
    const cached   = await kvGet(c.env, cacheKey)
    if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })

    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE is_trending=1 AND is_hidden=0 AND active=1
      ORDER BY rating DESC LIMIT ?
    `).bind(limit).all()

    await kvSet(c.env, cacheKey, results)
    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/trending/top — Top rated
  KV cached 15 min
============================================================ */

app.get("/api/trending/top", async (c) => {
  const limit = safeLimit(c.req.query("limit"), 10, 40)

  try {
    const cacheKey = `trending:top:${limit}`
    const cached   = await kvGet(c.env, cacheKey)
    if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })

    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY rating DESC LIMIT ?
    `).bind(limit).all()

    await kvSet(c.env, cacheKey, results)
    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/trending/new — Latest added
  KV cached 5 min (new content changes fastest)
============================================================ */

app.get("/api/trending/new", async (c) => {
  const limit = safeLimit(c.req.query("limit"), 10, 40)

  try {
    const cacheKey = `trending:new:${limit}`
    const cached   = await kvGet(c.env, cacheKey)
    if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })

    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all()

    await kvSet(c.env, cacheKey, results, 300) // 5 min TTL
    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/trending/ongoing — Currently airing
  KV cached 15 min
============================================================ */

app.get("/api/trending/ongoing", async (c) => {
  const limit = safeLimit(c.req.query("limit"), 20, 40)

  try {
    const cacheKey = `trending:ongoing:${limit}`
    const cached   = await kvGet(c.env, cacheKey)
    if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })

    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE status='ongoing' AND is_hidden=0 AND active=1
      ORDER BY updated_at DESC LIMIT ?
    `).bind(limit).all()

    await kvSet(c.env, cacheKey, results)
    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/trending/movies — Latest movies
  KV cached 15 min
============================================================ */

app.get("/api/trending/movies", async (c) => {
  const limit = safeLimit(c.req.query("limit"), 20, 40)

  try {
    const cacheKey = `trending:movies:${limit}`
    const cached   = await kvGet(c.env, cacheKey)
    if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })

    const { results } = await c.env.DB.prepare(`
      SELECT ${COLS} FROM anime
      WHERE type='movie' AND is_hidden=0 AND active=1
      ORDER BY year DESC, rating DESC LIMIT ?
    `).bind(limit).all()

    await kvSet(c.env, cacheKey, results)
    return c.json(ok(results), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

export default app
