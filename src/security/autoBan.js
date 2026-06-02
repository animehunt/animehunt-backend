/* ============================================================
  ANIMEHUNT — AUTO BAN SYSTEM
  File: src/security/autoBan.js

  Threat logs monitor karta hai.
  High-threat IPs auto ban karta hai.
  engine.js se call hota hai cron mein.
============================================================ */

export async function runAutoBan(db) {
  try {
    // Security settings check
    const settings = await db.prepare(
      "SELECT ai_auto_ban, ai_ban_threshold FROM security_settings WHERE id=1"
    ).first().catch(() => null)

    if (!settings?.ai_auto_ban) {
      return { autoBan: false, reason: "disabled" }
    }

    const threshold = settings.ai_ban_threshold || 5

    // Last 1 hour mein repeat offenders
    const { results: threats } = await db.prepare(`
      SELECT ip, COUNT(*) as cnt
      FROM threat_logs
      WHERE created_at >= datetime('now', '-1 hour')
      AND ip IS NOT NULL AND ip != '' AND ip != 'unknown'
      GROUP BY ip
      HAVING cnt >= ?
      ORDER BY cnt DESC
      LIMIT 50
    `).bind(threshold).all()

    let banned = 0

    for (const t of threats) {
      // Already banned check
      const existing = await db.prepare(
        "SELECT ip FROM banned_ips WHERE ip = ? LIMIT 1"
      ).bind(t.ip).first().catch(() => null)

      if (!existing) {
        await db.prepare(`
          INSERT INTO banned_ips (ip, reason, ban_count, created_at)
          VALUES (?, 'ai_auto_ban', ?, datetime('now'))
        `).bind(t.ip, t.cnt).run()
        banned++
      } else {
        // Existing ban — increment count
        await db.prepare(
          "UPDATE banned_ips SET ban_count = COALESCE(ban_count,0) + ? WHERE ip = ?"
        ).bind(t.cnt, t.ip).run().catch(() => {})
      }
    }

    return { autoBan: true, checked: threats.length, banned }
  } catch (err) {
    console.error("autoBan error:", err)
    return { autoBan: false, error: err.message }
  }
}
