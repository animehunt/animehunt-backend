import { syncToReplicas } from "../routes/footer.js"

export async function runFooterAI(env) {

  const db = env.DB

  const cfg = await db
    .prepare("SELECT * FROM footer_config WHERE id=1")
    .first()

  if (!cfg) return

  // ✅ FIX (audit): track whether any of the three auto-adjust branches
  // below actually ran an UPDATE, so we sync once at the end instead of
  // not at all (the original bug) or redundantly after each branch.
  let changed = false

  /* =========================
  AUTO PROMO DISABLE
  ========================= */

  if (cfg.promoOn && !cfg.promoText) {
    await db.prepare(`
      UPDATE footer_config SET promoOn=0 WHERE id=1
    `).run()
    changed = true
  }

  /* =========================
  AUTO THEME ADJUST
  ========================= */

  if (cfg.footerTheme === "Auto") {
    // ✅ FIX (Blueprint Line 21): Manual offset calculation was CPU-delay sensitive
    //    and could give wrong hour if Worker startup was slow.
    //    Intl.DateTimeFormat is the safe, spec-correct way in CF Workers.
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",   // IST = UTC+5:30
      hour:     "numeric",
      hour12:   false
    }).format(new Date())

    const hour  = parseInt(hourStr) || 0
    const theme = (hour >= 18 || hour < 6) ? "Dark" : "Light"

    await db.prepare(`
      UPDATE footer_config SET footerTheme=? WHERE id=1
    `).bind(theme).run()
    changed = true
  }

  /* =========================
  SMART MOBILE OPTIMIZATION
  ========================= */

  if (cfg.mobileNav && cfg.mobileFloat && cfg.mobileBlur) {
    // Too many mobile effects active simultaneously → disable blur to save resources
    await db.prepare(`
      UPDATE footer_config SET mobileBlur=0 WHERE id=1
    `).run()
    changed = true
  }

  // ✅ FIX (audit): this never called syncToReplicas() at all — none of
  // the three auto-adjust UPDATEs above ever reached a Turso/Supabase
  // replica, so a replica-served reader would keep seeing the pre-
  // adjustment footer config (stale promo, wrong-for-time-of-day theme,
  // or the heavier mobile-effects combination) indefinitely, even
  // though the primary DB had already self-corrected.
  if (changed) {
    const freshRow = await db.prepare("SELECT * FROM footer_config WHERE id=1").first()
    if (freshRow) syncToReplicas(env, freshRow)
  }

}
