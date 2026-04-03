import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ADMIN CONFIG
========================= */

app.get("/footer", verifyAdmin, async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM footer_config WHERE id=1")
    .first()

  return c.json(row || {})

})

/* =========================
PUBLIC CONFIG (REAL USE)
========================= */

app.get("/footer/public", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM footer_config WHERE id=1")
    .first()

  return c.json(row || {})

})

/* =========================
SAVE CONFIG (SMART UPDATE)
========================= */

app.post("/footer", verifyAdmin, async (c) => {

  const body = await c.req.json()
  const db = c.env.DB

  const fields = Object.keys(body)

  for (const key of fields) {

    await db.prepare(`
      UPDATE footer_config
      SET ${key} = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id=1
    `)
    .bind(body[key])
    .run()

  }

  return c.json({ success: true })

})

/* =========================
KILL
========================= */

app.post("/footer/kill", verifyAdmin, async (c) => {

  await c.env.DB.prepare(`
    UPDATE footer_config SET footerOn=0 WHERE id=1
  `).run()

  return c.json({ success: true })

})

/* =========================
RESET
========================= */

app.post("/footer/reset", verifyAdmin, async (c) => {

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

})

export default app
