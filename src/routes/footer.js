import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET FOOTER CONFIG
========================= */

app.get("/footer", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM footer_config WHERE id=1")
.first()

return c.json(row)

})

/* =========================
SAVE FOOTER CONFIG
========================= */

app.post("/footer", verifyAdmin, async (c)=>{

const body = await c.req.json()

const db = c.env.DB

const fields = Object.keys(body)

for(const f of fields){

await db.prepare(`
UPDATE footer_config
SET ${f}=?
WHERE id=1
`)
.bind(body[f])
.run()

}

return c.json({success:true})

})

/* =========================
KILL FOOTER
========================= */

app.post("/footer/kill", verifyAdmin, async (c)=>{

await c.env.DB.prepare(`
UPDATE footer_config
SET footerOn=0
WHERE id=1
`).run()

return c.json({success:true})

})

/* =========================
RESET FOOTER
========================= */

app.post("/footer/reset", verifyAdmin, async (c)=>{

await c.env.DB.prepare(`
UPDATE footer_config
SET

footerOn=1,
footerLazy=0,
footerBlur=0,
footerLock=0,
footerTheme='Dark',

about=1,
privacy=1,
disclaimer=1,
dmca=1,
telegram=1,
linkBadges=0,

azOn=1,
azAuto=1,
azSticky=0,
azCompact=0,
azMode='Scroll',

mobileNav=1,
mobileFloat=0,
mobileBlur=0,
mobileHideScroll=1,

promoOn=0,
promoText='',
promoLink='',
promoAutoHide=0

WHERE id=1
`).run()

return c.json({success:true})

})

export default app
