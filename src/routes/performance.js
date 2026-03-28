import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET PERFORMANCE SETTINGS
========================= */

app.get("/performance", verifyAdmin, async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM performance_settings WHERE id=1")
.first()

if(!row){
  return c.json({
    lazyLoad:false,
    smartPreload:false,
    assetMinify:false,
    imgOptimize:false,
    jsOptimize:false,
    cssOptimize:false,
    smartCache:false,
    mobilePriority:false,
    cdnMode:false,
    adaptiveLoad:false,
    preconnect:false,
    bandwidth:false
  })
}

return c.json(row)

})

/* =========================
UPDATE PERFORMANCE SETTINGS
========================= */

app.post("/performance", verifyAdmin, async (c)=>{

const body = await c.req.json()

const db = c.env.DB

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

body.lazyLoad,
body.smartPreload,
body.assetMinify,
body.imgOptimize,
body.jsOptimize,
body.cssOptimize,
body.smartCache,
body.mobilePriority,
body.cdnMode,
body.adaptiveLoad,
body.preconnect,
body.bandwidth

).run()

}

return c.json({success:true})

})

export default app
