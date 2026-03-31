import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ================= GET ================= */

app.get("/security", verifyAdmin, async (c) => {

  try {

    const row = await c.env.DB
      .prepare("SELECT * FROM security_settings WHERE id=1")
      .first()

    if (!row) {
      return c.json({
        firewallLevel: 3,
        core:{ bot:false, scraper:false, hotlink:false, embed:false },
        admin:{ loginLimit:false },
        advanced:{ sessionMonitor:false },
        ai:{ autoBan:false }
      })
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

  } catch (err) {
    console.error("GET SECURITY ERROR:", err)
    return c.json({ error:"Failed to load" },500)
  }

})

/* ================= POST ================= */

app.post("/security", verifyAdmin, async (c) => {

  try {

    const body = await c.req.json()

    const data = {
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
      data.firewallLevel,

      data.core.bot ? 1 : 0,
      data.core.scraper ? 1 : 0,
      data.core.hotlink ? 1 : 0,
      data.core.embed ? 1 : 0,

      data.admin.loginLimit ? 1 : 0,

      data.advanced.sessionMonitor ? 1 : 0,

      data.ai.autoBan ? 1 : 0
    ).run()

    return c.json({ success:true })

  } catch (err) {
    console.error("POST SECURITY ERROR:", err)
    return c.json({ error:"Save failed" },500)
  }

})

export default app
