import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ADMIN: GET ADS
========================= */
app.get("/ads", verifyAdmin, async (c)=>{
  const { results } = await c.env.DB
  .prepare("SELECT * FROM ads ORDER BY weight DESC, created_at DESC")
  .all()

  return c.json(results)
})

/* =========================
CREATE
========================= */
app.post("/ads", verifyAdmin, async (c)=>{

  const body = await c.req.json()

  await c.env.DB.prepare(`
    INSERT INTO ads
    (id,name,type,ad_code,weight,step,source,delay,shortlinks,auto_short,anti_bypass,status,clicks,impressions,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `)
  .bind(
    crypto.randomUUID(),
    body.name,
    body.type,
    body.adCode,
    body.weight || 1,
    body.step || 1,
    body.source || null,
    body.delay || 2000,
    JSON.stringify(body.shortlinks || []),
    body.autoShort ? 1 : 0,
    body.antiBypass ? 1 : 0,
    "ON",
    0,
    0
  )
  .run()

  return c.json({success:true})
})

/* =========================
TOGGLE
========================= */
app.patch("/ads/:id/toggle", verifyAdmin, async (c)=>{
  const id = c.req.param("id")

  await c.env.DB.prepare(`
    UPDATE ads
    SET status = CASE WHEN status='ON' THEN 'OFF' ELSE 'ON' END
    WHERE id=?
  `).bind(id).run()

  return c.json({success:true})
})

/* =========================
DELETE
========================= */
app.delete("/ads/:id", verifyAdmin, async (c)=>{
  await c.env.DB.prepare("DELETE FROM ads WHERE id=?")
  .bind(c.req.param("id"))
  .run()

  return c.json({success:true})
})

/* =========================
GO ENGINE (FINAL SYSTEM)
========================= */

app.get("/go", async (c)=>{

  const db = c.env.DB

  const anime = c.req.query("anime")
  const season = c.req.query("season")
  const episode = c.req.query("episode")
  const host = c.req.query("host")
  const quality = c.req.query("quality")
  const step = Number(c.req.query("step") || 1)

  /* ================= FINAL DOWNLOAD ================= */
  if(step === 99){

    const data = await db.prepare(`
      SELECT link FROM downloads
      WHERE anime=? AND season=? AND episode=? AND host=? AND quality=?
      LIMIT 1
    `)
    .bind(anime,season,episode,host,quality)
    .first()

    if(!data) return c.text("Link not found")

    return c.redirect(data.link)
  }

  /* ================= KNIGHT STEP ================= */
  if(step === 2 && host.toLowerCase() === "knightwolf"){
    return c.redirect(`/knight.html?anime=${anime}&season=${season}&episode=${episode}&host=${host}`)
  }

  /* ================= LOAD ADS ================= */
  const { results } = await db.prepare(`
    SELECT * FROM ads
    WHERE status='ON'
    AND (source=? OR source IS NULL)
    AND step=?
    ORDER BY weight DESC
  `)
  .bind(host,step)
  .all()

  /* ================= NO ADS → NEXT ================= */
  if(!results.length){
    return c.redirect(`/go?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality}&step=${step+1}`)
  }

  /* ================= PICK RANDOM ================= */
  const ad = results[Math.floor(Math.random()*results.length)]

  /* ================= TRACK ================= */
  await db.prepare(`UPDATE ads SET clicks=clicks+1 WHERE id=?`)
  .bind(ad.id)
  .run()

  /* ================= SHORTLINK ================= */
  let shortlinks = []
  try{
    shortlinks = JSON.parse(ad.shortlinks || "[]")
  }catch{}

  if(ad.auto_short && shortlinks.length){
    const short = shortlinks[Math.floor(Math.random()*shortlinks.length)]
    return c.redirect(short)
  }

  /* ================= REDIRECT ================= */
  if(ad.type === "redirect"){
    return c.redirect(ad.ad_code)
  }

  /* ================= SCRIPT PAGE ================= */
  return c.html(`
  <html>
  <body style="background:#000;color:#fff;text-align:center;padding-top:100px">

  <h2>Please wait...</h2>

  <script>
  ${ad.type==="script" ? ad.ad_code : ""}

  setTimeout(()=>{
    location.href="/go?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality}&step=${step+1}"
  }, ${ad.delay || 2000})
  </script>

  </body>
  </html>
  `)

})

export default app
