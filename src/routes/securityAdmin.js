import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET SECURITY SETTINGS
========================= */

app.get("/security", verifyAdmin, async (c)=>{

  const row = await c.env.DB
    .prepare("SELECT * FROM security_settings WHERE id=1")
    .first()

  if(!row){
    return c.json({ error: "Settings not found" }, 500)
  }

  return c.json({

    ultra: !!row.ultra,
    firewallLevel: row.firewall_level ?? 3,

    core:{
      bot: !!row.core_bot,
      scraper: !!row.core_scraper,
      hotlink: !!row.core_hotlink,
      embed: !!row.core_embed
    },

    geo:{
      indiaOnly: !!row.geo_india_only,
      blockForeign: !!row.geo_block_foreign
    },

    admin:{
      loginLimit: !!row.admin_login_limit,
      deviceLock: !!row.admin_device_lock
    },

    ai:{
      autoBan: !!row.ai_auto_ban,
      brute: !!row.ai_brute,
      bot: !!row.ai_bot
    },

    advanced:{
      sessionMonitor: !!row.session_monitor,
      hideServer: !!row.hide_server,
      hideStack: !!row.hide_stack
    }

  })

})

/* =========================
UPDATE SECURITY SETTINGS
========================= */

app.post("/security", verifyAdmin, async (c)=>{

  let body

  try{
    body = await c.req.json()
  }catch{
    return c.json({ error: "Invalid JSON" }, 400)
  }

  /* SAFETY FALLBACKS */

  const safe = {
    ultra: !!body.ultra,
    firewallLevel: Number(body.firewallLevel || 3),

    core: body.core || {},
    geo: body.geo || {},
    admin: body.admin || {},
    ai: body.ai || {},

    sessionMonitor: !!body.sessionMonitor,
    hideServer: !!body.hideServer,
    hideStack: !!body.hideStack
  }

  await c.env.DB.prepare(`
    UPDATE security_settings SET

    ultra=?,
    firewall_level=?,

    core_bot=?,
    core_scraper=?,
    core_hotlink=?,
    core_embed=?,

    geo_india_only=?,
    geo_block_foreign=?,

    admin_login_limit=?,
    admin_device_lock=?,

    ai_auto_ban=?,
    ai_brute=?,
    ai_bot=?,

    session_monitor=?,
    hide_server=?,
    hide_stack=?

    WHERE id=1
  `).bind(

    safe.ultra,
    safe.firewallLevel,

    !!safe.core.bot,
    !!safe.core.scraper,
    !!safe.core.hotlink,
    !!safe.core.embed,

    !!safe.geo.indiaOnly,
    !!safe.geo.blockForeign,

    !!safe.admin.loginLimit,
    !!safe.admin.deviceLock,

    !!safe.ai.autoBan,
    !!safe.ai.brute,
    !!safe.ai.bot,

    safe.sessionMonitor,
    safe.hideServer,
    safe.hideStack

  ).run()

  return c.json({ success:true })

})

export default app
