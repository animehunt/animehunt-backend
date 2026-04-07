/* =========================================================
🛡️ ANIMEHUNT SYSTEM GUARD (FULL PRODUCTION)
========================================================= */

/* =========================
HELPER: JSON RESPONSE
========================= */

function jsonError(c, message, status = 503) {
  return c.json({
    success: false,
    error: message
  }, status)
}

/* =========================
MAIN MIDDLEWARE
========================= */

export async function systemGuard(c, next) {

  try {

    const DB = c.env.DB

    if (!DB) {
      console.warn("SystemGuard: DB missing → skipping")
      return await next()
    }

    /* =========================
    LOAD SYSTEM STATE (SAFE)
    ========================= */

    let state = null

    try {
      state = await DB
        .prepare(`
          SELECT systemOn, maintenanceSoft, maintenanceHard, readOnly
          FROM system_settings
          WHERE id=1
        `)
        .first()
    } catch (e) {
      console.warn("SystemGuard: system_settings missing → skip")
      return await next()
    }

    if (!state) {
      return await next()
    }

    const isAdminRoute = c.req.path.startsWith("/api/admin")

    /* =========================
    🔴 HARD MAINTENANCE
    ========================= */

    if (state.maintenanceHard) {

      if (!isAdminRoute) {
        return jsonError(c, "System Under Maintenance", 503)
      }

    }

    /* =========================
    🟡 SOFT MAINTENANCE
    ========================= */

    if (state.maintenanceSoft) {

      if (!isAdminRoute) {
        return jsonError(c, "Maintenance Mode Active", 503)
      }

    }

    /* =========================
    🔴 SYSTEM OFF
    ========================= */

    if (!state.systemOn) {

      if (!isAdminRoute) {
        return jsonError(c, "System Offline", 503)
      }

    }

    /* =========================
    🔒 READ ONLY MODE
    ========================= */

    if (state.readOnly) {

      const method = c.req.method

      if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {

        if (!isAdminRoute) {
          return jsonError(c, "Read-only mode enabled", 403)
        }

      }

    }

    /* =========================
    PASS REQUEST
    ========================= */

    await next()

    /* =========================
    🔐 RESPONSE HARDENING
    ========================= */

    try {

      const sec = await DB
        .prepare(`
          SELECT hide_server, hide_stack
          FROM security_settings
          WHERE id=1
        `)
        .first()
        .catch(() => null)

      if (sec?.hide_server) {
        c.res.headers.set("Server", "AnimeHunt")
      }

      if (sec?.hide_stack) {
        c.res.headers.delete("x-powered-by")
      }

      /* =========================
      EXTRA SECURITY HEADERS
      ========================= */

      c.res.headers.set("X-Frame-Options", "SAMEORIGIN")
      c.res.headers.set("X-Content-Type-Options", "nosniff")
      c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

    } catch (e) {
      console.error("SystemGuard Headers Error:", e)
    }

  } catch (err) {

    console.error("🔥 SYSTEM GUARD CRASH:", err)

    /* FAIL-SAFE → allow request */
    return await next()
  }
}
