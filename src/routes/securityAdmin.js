import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET SECURITY
========================= */

app.get("/security", verifyAdmin, async (c)=>{

  const row = await c.env.DB
    .prepare("SELECT * FROM security_settings WHERE id=1")
    .first()

  if(!row){
    return c.json({ error:"Not found" },500)
  }

  return c.json({
    firewallLevel: row.firewall_level ?? 3,

    core:{
      bot: !!row.core_bot,
      scraper: !!row.core_scraper,
      hotlink: !!row.core_hotlink,
      embed: !!row.core_embed
    },

    admin:{
      loginLimit: !!row.admin_login_limit
    },

    advanced:{
      sessionMonitor: !!row.session_monitor
    },

    ai:{
      autoBan: !!row.ai_auto_ban
    }

  })
})

/* =========================
UPDATE SECURITY
========================= */

app.post("/security", verifyAdmin, async (c)=>{

  let body

  try{
    body = await c.req.json()
  }catch{
    return c.json({ error:"Invalid JSON" },400)
  }

  const safe = {
    firewallLevel: Number(body.firewallLevel || 3),

    core: body.core || {},
    admin: body.admin || {},
    advanced: body.advanced || {},
    ai: body.ai || {}
  }

  await c.env.DB.prepare(`
    UPDATE security_settings SET

    firewall_level=?,

    core_bot=?,
    core_scraper=?,
    core_hotlink=?,
    core_embed=?,

    admin_login_limit=?,

    session_monitor=?,

    ai_auto_ban=?

    WHERE id=1
  `).bind(

    safe.firewallLevel,

    !!safe.core.bot,
    !!safe.core.scraper,
    !!safe.core.hotlink,
    !!safe.core.embed,

    !!safe.admin.loginLimit,

    !!safe.advanced.sessionMonitor,

    !!safe.ai.autoBan

  ).run()

  return c.json({ success:true })
})

export default app
