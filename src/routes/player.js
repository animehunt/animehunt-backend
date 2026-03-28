import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ========================
GET PLAYER SETTINGS
======================== */

app.get("/player", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM player_settings WHERE id=1")
.first()

return c.json({

defaultServer:row.default_server,

autoplay:!!row.autoplay,
resume:!!row.resume,
autoswitch:!!row.autoswitch,

mode:row.mode,

ui:{
servers:!!row.ui_servers,
download:!!row.ui_download,
subscribe:!!row.ui_subscribe,
related:!!row.ui_related
},

security:{
embedOnly:!!row.sec_embed_only,
cloudflare:!!row.sec_cloudflare,
sandbox:!!row.sec_sandbox,
referrer:row.sec_referrer
}

})

})

/* ========================
SAVE SETTINGS
======================== */

app.post("/player", verifyAdmin, async (c)=>{

const body = await c.req.json()

await c.env.DB.prepare(`
UPDATE player_settings SET

default_server=?,

autoplay=?,
resume=?,
autoswitch=?,

mode=?,

ui_servers=?,
ui_download=?,
ui_subscribe=?,
ui_related=?,

sec_embed_only=?,
sec_cloudflare=?,
sec_sandbox=?,
sec_referrer=?

WHERE id=1
`).bind(

body.defaultServer,

body.autoplay,
body.resume,
body.autoswitch,

body.mode,

body.ui.servers,
body.ui.download,
body.ui.subscribe,
body.ui.related,

body.security.embedOnly,
body.security.cloudflare,
body.security.sandbox,
body.security.referrer

).run()

return c.json({success:true})

})

export default app
