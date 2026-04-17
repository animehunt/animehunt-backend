import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL ADS (ADMIN)
========================= */
app.get("/admin/ads", verifyAdmin, async (c)=>{

  const { results } = await c.env.DB
  .prepare(`
    SELECT *
    FROM ads
    ORDER BY weight DESC, created_at DESC
  `)
  .all()

  return c.json(results)

})

/* =========================
CREATE AD
========================= */
app.post("/admin/ads", verifyAdmin, async (c)=>{

  const body = await c.req.json()

  if(!body.name || !body.adCode){
    return c.json({error:"Missing fields"},400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO ads
    (id,name,type,ad_code,weight,step,source,delay,status,clicks,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `)
  .bind(
    id,
    body.name,
    body.type || "redirect",
    body.adCode,
    body.weight || 1,
    body.step || 1,
    body.source || null,
    body.delay || 0,
    "ON",
    0
  )
  .run()

  return c.json({success:true})

})

/* =========================
TOGGLE
========================= */
app.patch("/admin/ads/:id/toggle", verifyAdmin, async (c)=>{

  const id = c.req.param("id")

  const ad = await c.env.DB
  .prepare("SELECT status FROM ads WHERE id=?")
  .bind(id)
  .first()

  const status = ad.status === "ON" ? "OFF" : "ON"

  await c.env.DB.prepare(`
    UPDATE ads SET status=? WHERE id=?
  `)
  .bind(status,id)
  .run()

  return c.json({success:true})

})

/* =========================
DELETE
========================= */
app.delete("/admin/ads/:id", verifyAdmin, async (c)=>{

  await c.env.DB
  .prepare("DELETE FROM ads WHERE id=?")
  .bind(c.req.param("id"))
  .run()

  return c.json({success:true})

})

/* =========================
GET ADS BY FILTER (PUBLIC)
========================= */
async function getAds(db, source, step){

  let query = `SELECT * FROM ads WHERE status='ON'`
  let params = []

  if(source){
    query += ` AND source=?`
    params.push(source)
  }

  if(step){
    query += ` AND step=?`
    params.push(step)
  }

  const { results } = await db.prepare(query).bind(...params).all()

  return results

}

/* =========================
WEIGHTED RANDOM PICK
========================= */
function pickAd(ads){

  if(!ads.length) return null

  const total = ads.reduce((sum,a)=>sum + (a.weight||1),0)

  let rand = Math.random() * total

  for(const ad of ads){
    rand -= (ad.weight||1)
    if(rand <= 0) return ad
  }

  return ads[0]

}

/* =========================
TRACK CLICK
========================= */
async function trackClick(db, id){

  await db.prepare(`
    UPDATE ads SET clicks = clicks + 1 WHERE id=?
  `)
  .bind(id)
  .run()

}

/* =========================
GO ROUTE (CORE SYSTEM)
========================= */
app.get("/go", async (c)=>{

  const db = c.env.DB

  const anime = c.req.query("anime")
  const source = c.req.query("source")
  const quality = c.req.query("quality")
  const step = Number(c.req.query("step") || 1)

  /* =====================
  FINAL LINK FETCH
  ===================== */
  if(step === 99){

    const data = await db.prepare(`
      SELECT link
      FROM downloads
      WHERE anime=? AND host=? AND quality=?
      LIMIT 1
    `)
    .bind(anime, source, quality)
    .first()

    if(!data){
      return c.text("Link not found")
    }

    return c.redirect(data.link)
  }

  /* =====================
  GET ADS
  ===================== */
  const ads = await getAds(db, source, step)

  if(!ads.length){
    // skip step if no ads
    return c.redirect(`/go?anime=${anime}&source=${source}&quality=${quality}&step=${step+1}`)
  }

  const ad = pickAd(ads)

  await trackClick(db, ad.id)

  /* =====================
  REDIRECT TYPE
  ===================== */
  if(ad.type === "redirect"){
    return c.redirect(ad.ad_code)
  }

  /* =====================
  POPUP / SCRIPT PAGE
  ===================== */
  return c.html(`
  <html>
  <head><title>Continue</title></head>
  <body style="background:#000;color:#fff;text-align:center;padding-top:100px;">

  <h2>Please wait...</h2>

  <script>
  ${ad.type === "script" ? ad.ad_code : ""}

  setTimeout(()=>{
    window.location.href = "/go?anime=${anime}&source=${source}&quality=${quality}&step=${step+1}"
  }, ${ad.delay || 2000})
  </script>

  </body>
  </html>
  `)

})

export default app
