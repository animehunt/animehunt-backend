import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

async function ensureRow(DB){
await DB.prepare(`
INSERT OR IGNORE INTO security_settings (id) VALUES (1)
`).run()
}

/* GET */

app.get("/security", verifyAdmin, async (c)=>{

const DB = c.env.DB
await ensureRow(DB)

const row = await DB
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
},

advanced:{
sessionMonitor:!!row.session_monitor,
hideServer:!!row.hide_server,
hideStack:!!row.hide_stack
}

})

})

/* POST */

app.post("/security", verifyAdmin, async (c)=>{

const DB = c.env.DB
await ensureRow(DB)

const body = await c.req.json()

await DB.prepare(`
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

body.ultra ? 1 : 0,
body.firewallLevel,

body.core.bot ? 1 : 0,
body.core.scraper ? 1 : 0,
body.core.hotlink ? 1 : 0,
body.core.embed ? 1 : 0,

body.geo.indiaOnly ? 1 : 0,
body.geo.blockForeign ? 1 : 0,

body.admin.loginLimit ? 1 : 0,
body.admin.deviceLock ? 1 : 0,

body.ai.autoBan ? 1 : 0,
body.ai.brute ? 1 : 0,
body.ai.bot ? 1 : 0,

body.advanced.sessionMonitor ? 1 : 0,
body.advanced.hideServer ? 1 : 0,
body.advanced.hideStack ? 1 : 0

).run()

return c.json({success:true})

})

export default app
