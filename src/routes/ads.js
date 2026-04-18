import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ADMIN: GET ADS
========================= */
app.get("/admin/ads", verifyAdmin, async (c)=>{

const { results } = await c.env.DB
.prepare("SELECT * FROM ads ORDER BY weight DESC, created_at DESC")
.all()

return c.json(results)

})

/* =========================
CREATE AD
========================= */
app.post("/admin/ads", verifyAdmin, async (c)=>{

const body = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO ads
(id,name,type,ad_code,weight,step,source,delay,shortlinks,auto_short,anti_bypass,status,clicks,impressions,created_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
`)
.bind(
id,
body.name,
body.type,
body.adCode,
body.weight || 1,
body.step || 1,
body.source || null,
body.delay || 0,
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
app.patch("/admin/ads/:id/toggle", verifyAdmin, async (c)=>{

const id = c.req.param("id")

const ad = await c.env.DB
.prepare("SELECT status FROM ads WHERE id=?")
.bind(id)
.first()

const status = ad.status==="ON"?"OFF":"ON"

await c.env.DB.prepare("UPDATE ads SET status=? WHERE id=?")
.bind(status,id)
.run()

return c.json({success:true})

})

/* =========================
DELETE
========================= */
app.delete("/admin/ads/:id", verifyAdmin, async (c)=>{

await c.env.DB.prepare("DELETE FROM ads WHERE id=?")
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

/* =========================
HELPERS
========================= */

function pickWeighted(ads){
const total = ads.reduce((s,a)=>s+(a.weight||1),0)
let r = Math.random()*total
for(const ad of ads){
r -= (ad.weight||1)
if(r<=0) return ad
}
return ads[0]
}

function pickShortlink(list){
if(!list.length) return null
return list[Math.floor(Math.random()*list.length)]
}

/* =========================
GET ADS FOR STEP
========================= */
async function getAds(db, source, step){

let query = "SELECT * FROM ads WHERE status='ON' AND step=?"
let params = [step]

if(source){
query += " AND source=?"
params.push(source)
}

const { results } = await db.prepare(query).bind(...params).all()

return results

}

/* =========================
TRACK
========================= */
async function trackClick(db,id){
await db.prepare("UPDATE ads SET clicks=clicks+1 WHERE id=?")
.bind(id)
.run()
}

async function trackImpression(db,id){
await db.prepare("UPDATE ads SET impressions=impressions+1 WHERE id=?")
.bind(id)
.run()
}

/* =========================
ANTI BYPASS CHECK
========================= */
function antiBypassCheck(c){

const ref = c.req.header("referer") || ""

if(!ref.includes("/go")){
return false
}

return true
}

/* =========================
MAIN ENGINE (/go)
========================= */

app.get("/go", async (c)=>{

const db = c.env.DB

const anime = c.req.query("anime")
const source = c.req.query("source")
const quality = c.req.query("quality")
const step = Number(c.req.query("step") || 1)

/* ===== FINAL STEP ===== */
if(step === 99){

const data = await db.prepare(`
SELECT link FROM downloads
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

/* ===== GET ADS ===== */
const ads = await getAds(db, source, step)

/* ===== NO ADS → SKIP ===== */
if(!ads.length){
return c.redirect(`/go?anime=${anime}&source=${source}&quality=${quality}&step=${step+1}`)
}

/* ===== PICK AD ===== */
const ad = pickWeighted(ads)

/* ===== TRACK ===== */
await trackImpression(db, ad.id)

/* ===== ANTI BYPASS ===== */
if(ad.anti_bypass){
if(!antiBypassCheck(c)){
return c.text("Bypass detected")
}
}

/* ===== SHORTLINK ROTATION ===== */
let shortlinks = []

try{
shortlinks = JSON.parse(ad.shortlinks || "[]")
}catch{}

if(ad.auto_short && shortlinks.length){

const short = pickShortlink(shortlinks)

await trackClick(db, ad.id)

return c.redirect(short)
}

/* ===== REDIRECT TYPE ===== */
if(ad.type === "redirect"){

await trackClick(db, ad.id)

return c.redirect(ad.ad_code)
}

/* ===== SCRIPT / POPUP PAGE ===== */
await trackClick(db, ad.id)

return c.html(`
<html>
<head><title>Loading...</title></head>
<body style="background:#000;color:#fff;text-align:center;padding-top:100px;">

<h2>Please wait...</h2>

<script>

${ad.type==="script" ? ad.ad_code : ""}

setTimeout(()=>{
window.location.href="/go?anime=${anime}&source=${source}&quality=${quality}&step=${step+1}"
}, ${ad.delay || 2000})

</script>

</body>
</html>
`)

})

export default app
