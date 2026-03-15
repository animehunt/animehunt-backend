import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET SETTINGS
========================= */

app.get("/search", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM search_settings WHERE id=1")
.first()

return c.json({

enableSearch:!!row.enableSearch,
liveSearch:!!row.liveSearch,

mode:row.mode,
debounce:row.debounce,

ranking:{
mode:row.ranking_mode,
boost:!!row.ranking_boost,
weight:row.ranking_weight
},

sources:{
anime:!!row.src_anime,
episode:!!row.src_episode,
category:!!row.src_category,
pages:!!row.src_pages
},

smart:{
typo:!!row.smart_typo,
alias:!!row.smart_alias,
language:row.smart_language
},

ui:{
max:row.ui_max,
thumb:!!row.ui_thumb,
group:!!row.ui_group,
highlight:!!row.ui_highlight
},

safety:{
safe:row.safe_mode,
track:!!row.track_popular,
seo:!!row.seo_urls,
cache:row.cache_seconds
}

})

})

/* =========================
UPDATE SETTINGS
========================= */

app.post("/search", verifyAdmin, async (c)=>{

const body = await c.req.json()

await c.env.DB.prepare(`
UPDATE search_settings SET

enableSearch=?,
liveSearch=?,

mode=?,
debounce=?,

ranking_mode=?,
ranking_boost=?,
ranking_weight=?,

src_anime=?,
src_episode=?,
src_category=?,
src_pages=?,

smart_typo=?,
smart_alias=?,
smart_language=?,

ui_max=?,
ui_thumb=?,
ui_group=?,
ui_highlight=?,

safe_mode=?,
track_popular=?,
seo_urls=?,
cache_seconds=?

WHERE id=1
`).bind(

body.enableSearch,
body.liveSearch,

body.mode,
body.debounce,

body.ranking.mode,
body.ranking.boost,
body.ranking.weight,

body.sources.anime,
body.sources.episode,
body.sources.category,
body.sources.pages,

body.smart.typo,
body.smart.alias,
body.smart.language,

body.ui.max,
body.ui.thumb,
body.ui.group,
body.ui.highlight,

body.safety.safe,
body.safety.track,
body.safety.seo,
body.safety.cache

).run()

return c.json({success:true})

})

export default app
