/* ============================================================
  ANIMEHUNT — SYSTEM GUARD MIDDLEWARE
  File: src/middleware/systemGuard.js

  FIXES v2.2:
    ✅ FIX 1: KV cache for settings (1 min TTL) — no DB hit per request
    ✅ FIX 2: invalidateSystemSettingsCache() exported for system.js
    ✅ FIX 3: updateSystemSetting() REMOVED — was using wrong SQL schema
              system_settings is a single-row table, NOT key-value pairs
              system.js handles all settings updates directly via UPDATE
============================================================ */

import { Database } from "../db.js"

const SETTINGS_CACHE_TTL = 60
const SETTINGS_KV_KEY    = "system:settings"

/* ============================================================
   KV-CACHED SETTINGS FETCH
   FIX: KV first → DB fallback → KV write
============================================================ */
export async function getSystemSettings(env) {
  if (env.KV) {
    try {
      const cached = await env.KV.get(SETTINGS_KV_KEY, "json")
      if (cached) return cached
    } catch (e) {
      console.warn("⚠️ KV get systemSettings failed:", e.message)
    }
  }

  const db  = new Database(env.DB)
  const row = await db.queryOne("SELECT * FROM system_settings WHERE id=1")
  if (!row) return null

  if (env.KV) {
    try {
      await env.KV.put(SETTINGS_KV_KEY, JSON.stringify(row), {
        expirationTtl: SETTINGS_CACHE_TTL
      })
    } catch (e) {
      console.warn("⚠️ KV put systemSettings failed:", e.message)
    }
  }

  return row
}

/* ============================================================
   INVALIDATE CACHE — called by system.js after every save
============================================================ */
export async function invalidateSystemSettingsCache(env) {
  if (!env.KV) return
  try {
    await env.KV.delete(SETTINGS_KV_KEY)
  } catch (e) {
    console.warn("⚠️ KV delete systemSettings failed:", e.message)
  }
}

/* ============================================================
   SYSTEM GUARD MIDDLEWARE — Hono pattern (c, next)
============================================================ */
export async function systemGuard(c, next) {
  const path = c.req.path

  if (path.startsWith("/api/admin")) return next()
  if (path.startsWith("/api/auth"))  return next()
  if (path === "/api/system/health" || path === "/api/health") return next()

  try {
    const sys = await getSystemSettings(c.env)
    if (!sys) return next()

    // Hard maintenance — block all public routes
    if (sys.maintenanceHard === 1 || sys.maintenanceHard === true) {
      return c.json({
        success:     false,
        maintenance: true,
        message:     "Site is under maintenance. Please try again later."
      }, 503)
    }

    // System off
    if (sys.systemOn === 0 || sys.systemOn === false) {
      return c.json({
        success:  false,
        offline:  true,
        message:  "Site is currently offline."
      }, 503)
    }

    // Soft maintenance — add header, allow through
    if (sys.maintenanceSoft === 1 || sys.maintenanceSoft === true) {
      c.header("X-Maintenance", "true")
    }

  } catch (e) {
    console.warn("⚠️ systemGuard error:", e.message)
  }

  return next()
}

