export async function systemGuard(c, next) {

  try {

    const DB = c.env.DB

    if (!DB) {
      return await next()
    }

    /* ================= SYSTEM STATE ================= */

    const state = await DB
      .prepare("SELECT emergency FROM deploy_state WHERE id=1")
      .first()

    if (state?.emergency) {
      return c.json({ error: "System Offline" }, 503)
    }

    /* ================= PASS ================= */

    await next()

    /* ================= STEALTH ================= */

    const settings = await DB
      .prepare("SELECT hide_server, hide_stack FROM security_settings WHERE id=1")
      .first()

    if (settings?.hide_server) {
      c.res.headers.set("Server", "AnimeHunt")
    }

    if (settings?.hide_stack) {
      c.res.headers.delete("x-powered-by")
    }

  } catch (err) {
    console.error("SYSTEM GUARD ERROR:", err)
    return await next()
  }
}
