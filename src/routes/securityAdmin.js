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

return c.json({

ultra:!!row.ultra,

firewallLevel:row.firewall_level,

core:{
bot:!!row.core_bot,
scraper:!!row.core_scraper,
hotlink:!!row.core_hotlink,
embed:!!row.core_embed
},

geo:{
indiaOnly:!!row.geo_india_only,
blockForeign:!!row.geo_block_foreign
},

admin:{
loginLimit:!!row.admin_login_limit,
deviceLock:!!row.admin_device_lock
},

ai:{
autoBan:!!row.ai_auto_ban,
brute:!!row.ai_brute,
bot:!!row.ai_bot
}

})

})

/* =========================
UPDATE SECURITY
========================= */

app.post("/security", verifyAdmin, async (c)=>{

const body = await c.req.json()

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
ai_bot=?

WHERE id=1
`).bind(

body.ultra,
body.firewallLevel,

body.core.bot,
body.core.scraper,
body.core.hotlink,
body.core.embed,

body.geo.indiaOnly,
body.geo.blockForeign,

body.admin.loginLimit,
body.admin.deviceLock,

body.ai.autoBan,
body.ai.brute,
body.ai.bot

).run()

return c.json({success:true})

})

export default app
