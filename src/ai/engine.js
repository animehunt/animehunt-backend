export async function runEngine(env){

  const db = env.DB

  const cfg = await db
    .prepare("SELECT * FROM system_settings WHERE id=1")
    .first()

  if(!cfg || !cfg.systemOn) return

  console.log("🧠 SYSTEM AI START")

  /* ================= TREND SCORE ================= */

  await db.prepare(`
    UPDATE anime
    SET score = (views * 1.5) + (rating * 2) + (favorites * 3)
  `).run()

  /* ================= USER PREFERENCES ================= */

  const users = await db.prepare(`
    SELECT DISTINCT user_id FROM watch_history
  `).all()

  for(const u of users.results){

    const pref = await db.prepare(`
      SELECT category, COUNT(*) as total
      FROM watch_history
      WHERE user_id=?
      GROUP BY category
      ORDER BY total DESC
      LIMIT 3
    `).bind(u.user_id).all()

    for(const p of pref.results){

      await db.prepare(`
        INSERT INTO user_preferences (user_id,category,score)
        VALUES (?,?,?)
        ON CONFLICT(user_id,category)
        DO UPDATE SET score=score+1
      `)
      .bind(u.user_id,p.category,p.total)
      .run()

    }

  }

  /* ================= RECOMMEND ================= */

  const prefs = await db.prepare(`
    SELECT * FROM user_preferences
  `).all()

  for(const p of prefs.results){

    const rec = await db.prepare(`
      SELECT id FROM anime
      WHERE category=?
      ORDER BY score DESC
      LIMIT 10
    `).bind(p.category).all()

    for(const r of rec.results){

      await db.prepare(`
        INSERT INTO recommendations (user_id,anime_id)
        VALUES (?,?)
        ON CONFLICT(user_id,anime_id) DO NOTHING
      `)
      .bind(p.user_id,r.id)
      .run()

    }

  }

  /* ================= CLEAN OLD ================= */

  await db.prepare(`
    DELETE FROM recommendations
    WHERE created_at < datetime('now','-7 days')
  `).run()

  console.log("✅ SYSTEM AI DONE")
}
