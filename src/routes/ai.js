import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =====================================================
UTILS
===================================================== */

function now(){ return Date.now() }

async function getSettingsMap(db){
  const { results } = await db.prepare(`
    SELECT engine, setting, value FROM ai_settings
  `).all()

  const map = {}
  for(const r of results){
    if(!map[r.engine]) map[r.engine] = {}
    map[r.engine][r.setting] = !!r.value
  }
  return map
}

async function isPaused(db){
  const s = await db.prepare(`SELECT paused FROM ai_state WHERE id=1`).first()
  return !!s?.paused
}

async function logAI(db,type,msg,data={}){
  try{
    await db.prepare(`
      INSERT INTO ai_logs(type,message,data,created_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
    `).bind(type,msg,JSON.stringify(data)).run()
  }catch{}
}

/* =====================================================
API (AI STATE)
===================================================== */

app.get("/ai", verifyAdmin, async (c)=>{
  const db = c.env.DB

  const pausedRow = await db.prepare(`SELECT paused FROM ai_state WHERE id=1`).first()
  const engines = await getSettingsMap(db)

  return c.json({
    paused: !!pausedRow?.paused,
    engines
  })
})

app.patch("/ai", verifyAdmin, async (c)=>{
  const db = c.env.DB
  const { engine, setting, value } = await c.req.json()

  if(!engine || !setting){
    return c.json({error:"Invalid data"},400)
  }

  await db.prepare(`
    INSERT INTO ai_settings(engine,setting,value)
    VALUES(?,?,?)
    ON CONFLICT(engine,setting)
    DO UPDATE SET value=excluded.value
  `).bind(engine,setting,value?1:0).run()

  return c.json({success:true})
})

app.patch("/ai/pause", verifyAdmin, async (c)=>{
  const db = c.env.DB
  const s = await db.prepare(`SELECT paused FROM ai_state WHERE id=1`).first()
  const next = s?.paused ? 0 : 1

  await db.prepare(`UPDATE ai_state SET paused=? WHERE id=1`)
  .bind(next).run()

  return c.json({success:true, paused: !!next})
})

/* =====================================================
ENGINES (ALL FEATURES – MAPPED)
===================================================== */

/* ---------- SERVER ENGINE ---------- */
async function serverEngine(db, cfg){
  if(cfg.health_check){
    // simple health: inactive if last_ping too old (example column)
    await db.prepare(`
      UPDATE servers SET status='down'
      WHERE last_ping IS NOT NULL AND last_ping < datetime('now','-5 minutes')
    `).run()
  }

  if(cfg.auto_failover){
    // promote any alive server to priority top
    await db.prepare(`
      UPDATE servers SET priority=10
      WHERE status='up'
    `).run()
  }

  if(cfg.auto_priority){
    // prioritize by response_time (lower is better)
    await db.prepare(`
      UPDATE servers SET priority = 100 - IFNULL(response_time,50)
    `).run()
  }

  if(cfg.auto_fallback){
    // ensure at least one default server exists
    await db.prepare(`
      UPDATE servers SET is_default=1
      WHERE id IN (SELECT id FROM servers WHERE status='up' ORDER BY priority DESC LIMIT 1)
    `).run()
  }
}

/* ---------- PLAYER ENGINE ---------- */
async function playerEngine(db, cfg){
  if(cfg.server_switch){
    await db.prepare(`
      UPDATE episodes SET default_server = (
        SELECT id FROM servers WHERE status='up'
        ORDER BY priority DESC LIMIT 1
      )
    `).run()
  }

  if(cfg.stream_priority){
    await db.prepare(`
      UPDATE episodes SET stream_rank = views/100
    `).run()
  }

  if(cfg.embed_rotation){
    // rotate embeds by modulo
    await db.prepare(`
      UPDATE episodes SET embed_index = (embed_index + 1) % 3
    `).run()
  }
}

/* ---------- ANALYTICS ENGINE ---------- */
async function analyticsEngine(db, cfg){
  if(cfg.popular_detect){
    await db.prepare(`
      UPDATE anime SET popular=1 WHERE views > 3000
    `).run()
  }

  if(cfg.trending_detect){
    await db.prepare(`
      UPDATE anime SET trending=1 WHERE views > 5000
    `).run()
  }

  if(cfg.heatmap_logic){
    await db.prepare(`
      UPDATE anime SET heat = views/10
    `).run()
  }

  if(cfg.homepage_optimize){
    await db.prepare(`
      UPDATE anime SET homepage=1 WHERE trending=1
    `).run()
  }
}

/* ---------- BACKUP ENGINE ---------- */
async function backupEngine(db, cfg){
  if(cfg.backup_schedule){
    // once per 24h
    const last = await db.prepare(`
      SELECT date FROM deploy_backups ORDER BY date DESC LIMIT 1
    `).first()

    if(!last || (now() - new Date(last.date).getTime()) > 86400000){
      const anime = (await db.prepare("SELECT * FROM anime").all()).results
      const data = {anime}

      await db.prepare(`
        INSERT INTO deploy_backups(id,name,data,date)
        VALUES(?,?,?,CURRENT_TIMESTAMP)
      `).bind(crypto.randomUUID(),"Auto Backup",JSON.stringify(data)).run()
    }
  }

  if(cfg.auto_versioning){
    await db.prepare(`
      INSERT INTO deploy_versions(id,name,date)
      VALUES(?,?,CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(),"Auto Version").run()
  }

  if(cfg.auto_restore){
    // safety: do nothing unless emergency flag exists
  }
}

/* ---------- DEPLOY ENGINE ---------- */
async function deployEngine(db, cfg){
  if(cfg.auto_publish){
    await db.prepare(`
      UPDATE deploy_state SET last_deploy=CURRENT_TIMESTAMP WHERE id=1
    `).run()
  }

  if(cfg.auto_sync){
    // example: sync flag
    await db.prepare(`UPDATE deploy_state SET synced=1 WHERE id=1`).run()
  }

  if(cfg.auto_update){
    await db.prepare(`UPDATE deploy_state SET updated=1 WHERE id=1`).run()
  }

  if(cfg.auto_rollback){
    // placeholder safe check
  }
}

/* ---------- CATEGORY ENGINE ---------- */
async function categoryEngine(db, cfg){
  if(cfg.genre_detect){
    await db.prepare(`
      UPDATE anime SET category='Action' WHERE title LIKE '%fight%'
    `).run()
  }

  if(cfg.category_assign){
    await db.prepare(`
      UPDATE anime SET category='Trending' WHERE trending=1
    `).run()
  }

  if(cfg.auto_trending){
    await db.prepare(`
      UPDATE anime SET trending=1 WHERE views>4000
    `).run()
  }

  if(cfg.auto_latest){
    await db.prepare(`
      UPDATE anime SET latest=1 WHERE created_at > datetime('now','-7 days')
    `).run()
  }
}

/* ---------- BANNER ENGINE ---------- */
async function bannerEngine(db, cfg){
  if(cfg.homepage_banners){
    await db.prepare(`
      UPDATE banners SET active=1 WHERE type='homepage'
    `).run()
  }

  if(cfg.category_banners){
    await db.prepare(`
      UPDATE banners SET active=1 WHERE type='category'
    `).run()
  }

  if(cfg.trending_banners){
    await db.prepare(`
      UPDATE banners SET active=1 WHERE type='trending'
    `).run()
  }

  if(cfg.hero_banners){
    await db.prepare(`
      UPDATE banners SET hero=1 WHERE priority>5
    `).run()
  }
}

/* ---------- HOMEPAGE ENGINE ---------- */
async function homepageEngine(db, cfg){
  if(cfg.row_generate){
    await db.prepare(`
      UPDATE anime SET homepage=1 WHERE popular=1
    `).run()
  }

  if(cfg.row_sorting){
    await db.prepare(`
      UPDATE anime SET position = views
    `).run()
  }

  if(cfg.priority_system){
    await db.prepare(`
      UPDATE anime SET priority = views/100
    `).run()
  }

  if(cfg.layout_logic){
    // layout flag
    await db.prepare(`UPDATE deploy_state SET layout='ai' WHERE id=1`).run()
  }
}

/* ---------- SEARCH ENGINE ---------- */
async function searchEngine(db, cfg){
  if(cfg.auto_indexing){
    await db.prepare(`UPDATE anime SET indexed=1`).run()
  }

  if(cfg.auto_suggestion){
    await db.prepare(`UPDATE anime SET suggestion=1 WHERE views>1000`).run()
  }

  if(cfg.auto_ranking){
    await db.prepare(`UPDATE anime SET rank=views/100`).run()
  }

  if(cfg.popularity_boost){
    await db.prepare(`UPDATE anime SET rank=rank+5 WHERE popular=1`).run()
  }
}

/* ---------- SEO ENGINE ---------- */
async function seoEngine(db, cfg){
  if(cfg.auto_title){
    await db.prepare(`
      UPDATE anime SET meta_title = title || ' Watch Online'
    `).run()
  }

  if(cfg.auto_description){
    await db.prepare(`
      UPDATE anime SET meta_desc = 'Watch ' || title
    `).run()
  }

  if(cfg.og_tags){
    await db.prepare(`
      UPDATE anime SET og=1
    `).run()
  }

  if(cfg.sitemap__robots || cfg.sitemap_robots){
    await db.prepare(`
      UPDATE deploy_state SET sitemap_generated=1 WHERE id=1
    `).run()
  }
}

/* ---------- DOWNLOAD ENGINE ---------- */
async function downloadEngine(db, cfg){
  if(cfg.quality_mapping){
    await db.prepare(`
      UPDATE downloads SET quality='HD' WHERE size > 500
    `).run()
  }

  if(cfg.server_mapping){
    await db.prepare(`
      UPDATE downloads SET server='primary'
    `).run()
  }

  if(cfg.link_validation){
    await db.prepare(`
      DELETE FROM downloads WHERE url IS NULL
    `).run()
  }

  if(cfg.broken_remove){
    await db.prepare(`
      DELETE FROM downloads WHERE status='broken'
    `).run()
  }
}

/* =====================================================
MASTER RUNNER (GOD MODE)
===================================================== */

export async function runAIEngines(env){
  const db = env.DB

  try{
    if(await isPaused(db)) return

    const map = await getSettingsMap(db)

    // execute each engine with its config
    if(map.server)   await serverEngine(db, map.server)
    if(map.player)   await playerEngine(db, map.player)
    if(map.analytics)await analyticsEngine(db, map.analytics)
    if(map.backup)   await backupEngine(db, map.backup)
    if(map.deploy)   await deployEngine(db, map.deploy)
    if(map.category) await categoryEngine(db, map.category)
    if(map.banner)   await bannerEngine(db, map.banner)
    if(map.homepage) await homepageEngine(db, map.homepage)
    if(map.search)   await searchEngine(db, map.search)
    if(map.seo)      await seoEngine(db, map.seo)
    if(map.download) await downloadEngine(db, map.download)

    await logAI(db,"cycle","AI cycle executed")

  }catch(e){
    console.error("AI GOD MODE ERROR:", e)
    await logAI(db,"error", e.message || "unknown")
  }
}

/* =====================================================
CRON ENTRY
===================================================== */

export async function scheduled(event, env){
  await runAIEngines(env)
}

export default app
