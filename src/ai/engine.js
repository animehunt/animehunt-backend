export async function runSystemAI(env){

  const db = env.DB

  /* ================= SYSTEM CHECK ================= */

  const cfg = await db.prepare(
    "SELECT * FROM system_settings WHERE id=1"
  ).first()

  if(!cfg || !cfg.systemOn) return

  const state = await db.prepare(
    "SELECT paused FROM ai_state WHERE id=1"
  ).first()

  if(state?.paused) return

  console.log("🧠 AI STARTED")

  /* ================= LOAD AI SETTINGS ================= */

  const { results } = await db
    .prepare("SELECT * FROM ai_settings WHERE value=1")
    .all()

  const enabled = {}

  results.forEach(r=>{
    if(!enabled[r.engine]) enabled[r.engine]={}
    enabled[r.engine][r.setting]=true
  })

  /* =====================================================
     CORE AI ENGINE (RECOMMENDATION + TREND)
  ===================================================== */

  await db.prepare(`
    UPDATE anime
    SET score =
      (views * 1.2) +
      (rating * 2.5) +
      (favorites * 3.5)
  `).run()

  const users = await db.prepare(`
    SELECT DISTINCT user_id FROM watch_history
  `).all()

  for(const u of users.results){

    const prefs = await db.prepare(`
      SELECT category, COUNT(*) as total
      FROM watch_history
      WHERE user_id=?
      GROUP BY category
      ORDER BY total DESC
      LIMIT 5
    `).bind(u.user_id).all()

    for(const p of prefs.results){

      await db.prepare(`
        INSERT INTO user_preferences(user_id,category,score)
        VALUES (?,?,?)
        ON CONFLICT(user_id,category)
        DO UPDATE SET score=score+excluded.score
      `)
      .bind(u.user_id,p.category,p.total)
      .run()

    }

  }

  /* ================= RECOMMENDATION ================= */

  const prefList = await db.prepare(
    "SELECT * FROM user_preferences"
  ).all()

  for(const p of prefList.results){

    const rec = await db.prepare(`
      SELECT id FROM anime
      WHERE category=?
      ORDER BY score DESC
      LIMIT 15
    `).bind(p.category).all()

    for(const r of rec.results){

      await db.prepare(`
        INSERT INTO recommendations(user_id,anime_id,created_at)
        VALUES (?,?,CURRENT_TIMESTAMP)
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

  /* =====================================================
     AUTO SERVER ENGINE
  ===================================================== */

  if(enabled.auto_server_engine?.health_check){

    const servers = await db.prepare(
      "SELECT * FROM servers"
    ).all()

    for(const s of servers.results){

      if(!s.active){

        await db.prepare(`
          UPDATE servers SET priority=priority+1 WHERE id=?
        `).bind(s.id).run()

      }

    }

  }

  if(enabled.auto_server_engine?.auto_failover){

    await db.prepare(`
      UPDATE streams
      SET server_id = (
        SELECT id FROM servers
        WHERE active=1
        ORDER BY priority DESC
        LIMIT 1
      )
      WHERE status='failed'
    `).run()

  }

  /* =====================================================
     PLAYER ENGINE
  ===================================================== */

  if(enabled.auto_player_engine?.server_switch){

    await db.prepare(`
      UPDATE player_sessions
      SET server_id = (
        SELECT id FROM servers WHERE active=1 LIMIT 1
      )
      WHERE buffering=1
    `).run()

  }

  /* =====================================================
     ANALYTICS ENGINE
  ===================================================== */

  if(enabled.auto_analytics_engine?.popular_detect){

    await db.prepare(`
      UPDATE anime
      SET trending=1
      WHERE id IN (
        SELECT id FROM anime
        ORDER BY views DESC
        LIMIT 20
      )
    `).run()

  }

  /* =====================================================
     BACKUP ENGINE
  ===================================================== */

  if(enabled.auto_backup_engine?.backup_schedule){

    const last = await db.prepare(
      "SELECT MAX(date) as last FROM deploy_backups"
    ).first()

    const now = Date.now()

    if(!last?.last || now - new Date(last.last).getTime() > 86400000){

      const data = {
        anime:(await db.prepare("SELECT * FROM anime").all()).results
      }

      await db.prepare(`
        INSERT INTO deploy_backups(id,name,data,date)
        VALUES (?,?,?,CURRENT_TIMESTAMP)
      `)
      .bind(
        crypto.randomUUID(),
        "AUTO BACKUP",
        JSON.stringify(data)
      )
      .run()

    }

  }

  /* =====================================================
     DEPLOY ENGINE
  ===================================================== */

  if(enabled.auto_deploy_engine?.auto_publish){

    await db.prepare(`
      UPDATE deploy_state
      SET last_deploy=CURRENT_TIMESTAMP
      WHERE id=1
    `).run()

  }

  /* =====================================================
     CATEGORY ENGINE
  ===================================================== */

  if(enabled.auto_category_engine?.genre_detect){

    await db.prepare(`
      UPDATE anime
      SET category='Action'
      WHERE title LIKE '%fight%'
    `).run()

  }

  /* =====================================================
     HOMEPAGE ENGINE
  ===================================================== */

  if(enabled.auto_homepage_engine?.row_generate){

    await db.prepare(`DELETE FROM homepage_rows`).run()

    await db.prepare(`
      INSERT INTO homepage_rows(title,type)
      VALUES ('Trending Now','trending'),
             ('Top Rated','top'),
             ('Recommended','ai')
    `).run()

  }

  /* =====================================================
     SEARCH ENGINE
  ===================================================== */

  if(enabled.auto_search_engine?.auto_indexing){

    await db.prepare(`DELETE FROM search_index`).run()

    await db.prepare(`
      INSERT INTO search_index(anime_id,title)
      SELECT id,title FROM anime
    `).run()

  }

  /* =====================================================
     SEO ENGINE
  ===================================================== */

  if(enabled.auto_seo_engine?.auto_title){

    await db.prepare(`
      UPDATE anime
      SET seo_title = title || ' Watch Online Free'
    `).run()

  }

  /* =====================================================
     DOWNLOAD ENGINE
  ===================================================== */

  if(enabled.auto_download_engine?.link_validation){

    await db.prepare(`
      DELETE FROM downloads WHERE link IS NULL OR link=''
    `).run()

  }

  console.log("✅ AI COMPLETE")
}

export async function runSystemEngine(env, request){

  const db = env.DB

  const cfg = await db.prepare(
    "SELECT * FROM system_settings WHERE id=1"
  ).first()

  if(!cfg){
    return new Response("System config missing",{status:500})
  }

  /* =========================
  🔴 HARD SYSTEM OFF
  ========================= */
  if(!cfg.systemOn){
    return new Response("🚫 System Disabled",{status:503})
  }

  /* =========================
  🔴 HARD MAINTENANCE
  ========================= */
  if(cfg.maintenanceHard){
    return new Response(`
      <h1 style="text-align:center;margin-top:20%">
      🔴 Maintenance Mode
      </h1>
    `,{status:503,headers:{"Content-Type":"text/html"}})
  }

  /* =========================
  🟡 SOFT MAINTENANCE (API BLOCK)
  ========================= */
  if(cfg.maintenanceSoft){
    if(request.url.includes("/api")){
      return new Response(
        JSON.stringify({error:"Maintenance"}),
        {status:503}
      )
    }
  }

  /* =========================
  🔒 READ ONLY MODE
  ========================= */
  if(cfg.readOnly){
    if(request.method === "POST" || request.method === "PUT" || request.method==="DELETE"){
      return new Response(
        JSON.stringify({error:"Read Only Mode"}),
        {status:403}
      )
    }
  }

  /* =========================
  🔒 CMS LOCK
  ========================= */
  if(cfg.lockCMS){
    if(request.url.includes("/admin")){
      return new Response(
        "🔒 CMS Locked",
        {status:403}
      )
    }
  }

  /* =========================
  🌍 GEO BLOCK (BASIC)
  ========================= */
  if(cfg.geoBlock){
    const country = request.headers.get("cf-ipcountry")

    if(country === "CN" || country === "KP"){
      return new Response("Blocked Region",{status:403})
    }
  }

  /* =========================
  🔞 AGE LOCK
  ========================= */
  if(cfg.ageLock){
    const age = request.headers.get("x-user-age")

    if(age && Number(age) < 18){
      return new Response("🔞 Age Restricted",{status:403})
    }
  }

  /* =========================
  ⏰ SCHEDULE ENGINE
  ========================= */
  if(cfg.schedule){
    const hour = new Date().getHours()

    if(hour >= 3 && hour <= 5){
      // low traffic auto tasks
      await autoMaintenance(db)
    }
  }

  /* =========================
  👻 SHADOW MODE
  ========================= */
  if(cfg.shadow){
    // hidden content flag
    request.shadowMode = true
  }

  /* =========================
  ⚡ PERFORMANCE OPT
  ========================= */
  if(cfg.animation === "None"){
    request.noAnimation = true
  }

  return null
}

/* =========================
AUTO MAINTENANCE TASKS
========================= */
async function autoMaintenance(db){

  try{

    // Example: cleanup logs
    await db.prepare(`
      DELETE FROM logs
      WHERE created_at < datetime('now','-7 days')
    `).run()

    // Example: auto optimize
    await db.prepare(`
      VACUUM
    `).run()

  }catch(e){
    console.log("Maintenance error",e)
  }

}
