import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET SEO
========================= */

app.get("/seo", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM seo_settings WHERE id=1")
.first()

return c.json({

global:{
title:row.site_title,
desc:row.site_desc,
keywords:row.site_keywords,
canonical:row.canonical,
indexing:row.indexing
},

home:{
title:row.home_title,
desc:row.home_desc,
keywords:row.home_keywords,
og:row.home_og
},

templates:{
anime:row.tpl_anime,
category:row.tpl_category,
episode:row.tpl_episode,
search:row.tpl_search
},

social:{
ogTitle:row.og_title,
ogDesc:row.og_desc,
twTitle:row.tw_title,
twDesc:row.tw_desc,
twCard:row.tw_card
}

})

})

/* =========================
SAVE SEO
========================= */

app.post("/seo", verifyAdmin, async (c)=>{

const body = await c.req.json()

await c.env.DB.prepare(`
UPDATE seo_settings SET

site_title=?,
site_desc=?,
site_keywords=?,
canonical=?,
indexing=?,

home_title=?,
home_desc=?,
home_keywords=?,
home_og=?,

tpl_anime=?,
tpl_category=?,
tpl_episode=?,
tpl_search=?,

og_title=?,
og_desc=?,
tw_title=?,
tw_desc=?,
tw_card=?

WHERE id=1
`).bind(

body.global.title,
body.global.desc,
body.global.keywords,
body.global.canonical,
body.global.indexing,

body.home.title,
body.home.desc,
body.home.keywords,
body.home.og,

body.templates.anime,
body.templates.category,
body.templates.episode,
body.templates.search,

body.social.ogTitle,
body.social.ogDesc,
body.social.twTitle,
body.social.twDesc,
body.social.twCard

).run()

return c.json({success:true})

})

export default app
