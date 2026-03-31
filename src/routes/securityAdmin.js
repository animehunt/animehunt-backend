import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

function safe(fn){
  return async (c)=>{
    try{
      return await fn(c)
    }catch(e){
      console.error("ROUTE ERROR:", e)
      return c.json({ error:"Internal crash", details:e.message },500)
    }
  }
}

/* ================= GET ================= */

app.get("/security", verifyAdmin, safe(async (c)=>{

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

}))

/* ================= POST ================= */

app.post("/security", verifyAdmin, safe(async (c)=>{

  let body

  try{
    body = await c.req.json()
  }catch{
    return c.json({ error:"Invalid JSON" },400)
  }

  const safeData = {
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
    safeData.firewallLevel,
    safeData.core.bot ? 1 : 0,
    safeData.core.scraper ? 1 : 0,
    safeData.core.hotlink ? 1 : 0,
    safeData.core.embed ? 1 : 0,
    safeData.admin.loginLimit ? 1 : 0,
    safeData.advanced.sessionMonitor ? 1 : 0,
    safeData.ai.autoBan ? 1 : 0
  ).run()

  return c.json({ success:true })

}))

export default app
