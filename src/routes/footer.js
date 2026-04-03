import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ALLOWED FIELDS (SECURITY)
========================= */

const allowedFields = [
  "footerOn","footerLazy","footerBlur","footerLock","footerTheme",
  "about","privacy","disclaimer","dmca","telegram","linkBadges",
  "azOn","azAuto","azSticky","azCompact","azMode",
  "mobileNav","mobileFloat","mobileBlur","mobileHideScroll",
  "promoOn","promoText","promoLink","promoAutoHide"
]

/* =========================
ENSURE ROW EXISTS
========================= */

async function ensureRow(db){
  const row = await db.prepare("SELECT id FROM footer_config WHERE id=1").first()

  if(!row){
    await db.prepare(`
      INSERT INTO footer_config (id, footerOn)
      VALUES (1,1)
    `).run()
  }
}

/* =========================
ADMIN: GET CONFIG
========================= */

app.get("/footer", verifyAdmin, async (c) => {

  try{

    await ensureRow(c.env.DB)

    const row = await c.env.DB
      .prepare("SELECT * FROM footer_config WHERE id=1")
      .first()

    return c.json(row || {})

  }catch(e){
    return c.json({ error:"DB Error" },500)
  }

})

/* =========================
PUBLIC: GET CONFIG
========================= */

app.get("/footer/public", async (c) => {

  try{

    const row = await c.env.DB
      .prepare("SELECT * FROM footer_config WHERE id=1")
      .first()

    if(!row) return c.json({})

    /* 🔥 SAFE FILTER */
    const publicData = {}

    allowedFields.forEach(f=>{
      publicData[f] = row[f]
    })

    return c.json(publicData)

  }catch(e){
    return c.json({ error:"DB Error" },500)
  }

})

/* =========================
SAVE CONFIG (SAFE UPDATE)
========================= */

app.post("/footer", verifyAdmin, async (c) => {

  try{

    const body = await c.req.json()
    const db = c.env.DB

    await ensureRow(db)

    for (const key of Object.keys(body)) {

      if(!allowedFields.includes(key)) continue

      await db.prepare(`
        UPDATE footer_config
        SET ${key} = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id=1
      `)
      .bind(body[key])
      .run()

    }

    return c.json({ success: true })

  }catch(e){
    return c.json({ error:"Save Failed" },500)
  }

})

/* =========================
KILL
========================= */

app.post("/footer/kill", verifyAdmin, async (c) => {

  try{

    await c.env.DB.prepare(`
      UPDATE footer_config SET footerOn=0 WHERE id=1
    `).run()

    return c.json({ success: true })

  }catch{
    return c.json({ error:"Kill Failed" },500)
  }

})

/* =========================
RESET
========================= */

app.post("/footer/reset", verifyAdmin, async (c) => {

  try{

    await c.env.DB.prepare(`
      UPDATE footer_config SET

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
      promoAutoHide=0,

      updated_at=CURRENT_TIMESTAMP

      WHERE id=1
    `).run()

    return c.json({ success: true })

  }catch{
    return c.json({ error:"Reset Failed" },500)
  }

})

export default app
