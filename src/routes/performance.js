import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ENSURE ROW EXISTS
========================= */

async function ensureRow(db){
  await db.prepare(`
    INSERT OR IGNORE INTO performance_settings (id) VALUES (1)
  `).run()
}

/* =========================
GET
========================= */

app.get("/performance", verifyAdmin, async (c)=>{

  const db = c.env.DB

  await ensureRow(db)

  const row = await db
    .prepare("SELECT * FROM performance_settings WHERE id=1")
    .first()

  return c.json({
    lazyLoad: !!row.lazyLoad,
    smartPreload: !!row.smartPreload,
    assetMinify: !!row.assetMinify,
    imgOptimize: !!row.imgOptimize,

    jsOptimize: !!row.jsOptimize,
    cssOptimize: !!row.cssOptimize,

    smartCache: !!row.smartCache,
    mobilePriority: !!row.mobilePriority,

    cdnMode: !!row.cdnMode,
    adaptiveLoad: !!row.adaptiveLoad,

    preconnect: !!row.preconnect,
    bandwidth: !!row.bandwidth
  })

})

/* =========================
POST
========================= */

app.post("/performance", verifyAdmin, async (c)=>{

  const db = c.env.DB
  const body = await c.req.json()

  await ensureRow(db)

  await db.prepare(`
    UPDATE performance_settings SET
    lazyLoad=?,
    smartPreload=?,
    assetMinify=?,
    imgOptimize=?,
    jsOptimize=?,
    cssOptimize=?,
    smartCache=?,
    mobilePriority=?,
    cdnMode=?,
    adaptiveLoad=?,
    preconnect=?,
    bandwidth=?
    WHERE id=1
  `).bind(

    body.lazyLoad ? 1 : 0,
    body.smartPreload ? 1 : 0,
    body.assetMinify ? 1 : 0,
    body.imgOptimize ? 1 : 0,

    body.jsOptimize ? 1 : 0,
    body.cssOptimize ? 1 : 0,

    body.smartCache ? 1 : 0,
    body.mobilePriority ? 1 : 0,

    body.cdnMode ? 1 : 0,
    body.adaptiveLoad ? 1 : 0,

    body.preconnect ? 1 : 0,
    body.bandwidth ? 1 : 0

  ).run()

  return c.json({ success: true })

})

export default app
