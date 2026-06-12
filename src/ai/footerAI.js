export async function runFooterAI(env) {

  const db = env.DB

  const cfg = await db
    .prepare("SELECT * FROM footer_config WHERE id=1")
    .first()

  if (!cfg) return

  /* =========================
  AUTO PROMO DISABLE
  ========================= */

  if (cfg.promoOn && !cfg.promoText) {
    await db.prepare(`
      UPDATE footer_config SET promoOn=0 WHERE id=1
    `).run()
  }

  /* =========================
  AUTO THEME ADJUST
  ========================= */

  if (cfg.footerTheme === "Auto") {
    // ✅ FIX: IST timezone (UTC+5:30)
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istTime = new Date(now.getTime() + istOffset)
  const hour = istTime.getUTCHours()

    const theme = (hour >= 18 || hour <= 6) ? "Dark" : "Light"

    await db.prepare(`
      UPDATE footer_config SET footerTheme=? WHERE id=1
    `).bind(theme).run()
  }

  /* =========================
  SMART MOBILE OPTIMIZATION
  ========================= */

  if (cfg.mobileNav && cfg.mobileFloat && cfg.mobileBlur) {
    // Too heavy → optimize
    await db.prepare(`
      UPDATE footer_config SET mobileBlur=0 WHERE id=1
    `).run()
  }

}
