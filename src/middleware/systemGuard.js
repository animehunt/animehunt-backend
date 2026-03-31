export async function systemGuard(c, next) {

  try {

    const state = await c.env.DB
      .prepare("SELECT frozen, emergency FROM deploy_state WHERE id=1")
      .first()

    /* 🚫 EMERGENCY BLOCK */
    if (state?.emergency) {
      return c.json({ error: "System Offline" }, 503)
    }

    /* ✅ CONTINUE REQUEST */
    await next()

    /* =========================
       POST RESPONSE MODIFICATIONS
    ========================= */

    try {

      const settings = await c.env.DB
        .prepare("SELECT hide_server, hide_stack FROM security_settings WHERE id=1")
        .first()

      if (settings?.hide_server) {
        c.res.headers.set("Server", "AnimeHunt")
      }

      if (settings?.hide_stack) {
        c.res.headers.delete("x-powered-by")
      }

    } catch (e) {
      console.error("STEALTH ERROR:", e)
    }

  } catch (err) {
    console.error("SYSTEM GUARD ERROR:", err)
    return c.json({ error: "System guard failed" }, 500)
  }
}
