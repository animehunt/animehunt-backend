/* ============================================================
  ANIMEHUNT — SYSTEM GUARD MIDDLEWARE
  File: src/middleware/systemGuard.js

  Maintenance mode check karta hai.
  Public routes pe chalta hai.
  index.js: app.use("/api/*", systemGuard)  ← firewall ke baad
============================================================ */

export async function systemGuard(c, next) {
  const path = c.req.path

  // Admin routes bypass — admin kaam karta rahe maintenance mein bhi
  if (path.startsWith("/api/admin")) return next()

  // Auth routes bypass
  if (path.startsWith("/api/auth")) return next()

  // Health check bypass
  if (path === "/api/system/health" || path === "/api/health") return next()

  try {
    const sys = await c.env.DB.prepare(
      "SELECT systemOn, maintenanceSoft, maintenanceHard FROM system_settings WHERE id=1"
    ).first()

    if (!sys) return next() // Table nahi hai — allow

    // Hard maintenance — sab block
    if (sys.maintenanceHard) {
      return c.json({
        success: false,
        maintenance: true,
        message: "Site is under maintenance. Please try again later."
      }, 503)
    }

    // System off
    if (sys.systemOn === 0) {
      return c.json({
        success: false,
        offline: true,
        message: "Site is currently offline."
      }, 503)
    }

    // Soft maintenance — allow but add header
    if (sys.maintenanceSoft) {
      c.header("X-Maintenance", "true")
    }
  } catch {
    // DB error — allow through
  }

  return next()
}
