import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* GET ADS */

app.get("/ads", verifyAdmin, async (c)=>{

const { results } = await c.env.DB
.prepare("SELECT * FROM ads ORDER BY priority ASC")
.all()

return c.json(results)

})

/* CREATE AD */

app.post("/ads", verifyAdmin, async (c)=>{

const db = c.env.DB
const body = await c.req.json()

const id = crypto.randomUUID()

await db.prepare(`
INSERT INTO ads
(id,name,type,ad_code,page,position,priority,anime_slug,episode_number,country,device,start_date,end_date,status)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(
id,
body.name,
body.type,
body.adCode,
body.page,
body.position,
body.priority || 5,
body.animeSlug || null,
body.episodeNumber || null,
body.country || null,
body.device || "All",
body.startDate || null,
body.endDate || null,
"ON"
)
.run()

return c.json({success:true,id})

})

/* TOGGLE */

app.patch("/ads/:id/toggle", verifyAdmin, async (c)=>{

const id = c.req.param("id")
const db = c.env.DB

const ad = await db
.prepare("SELECT status FROM ads WHERE id=?")
.bind(id)
.first()

const status = ad.status==="ON"?"OFF":"ON"

await db.prepare("UPDATE ads SET status=? WHERE id=?")
.bind(status,id)
.run()

return c.json({success:true,status})

})

/* DELETE */

app.delete("/ads/:id", verifyAdmin, async (c)=>{

await c.env.DB
.prepare("DELETE FROM ads WHERE id=?")
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

/* BULK IMPORT */

app.post("/ads/bulk", verifyAdmin, async (c)=>{

const db = c.env.DB
const ads = await c.req.json()

for(const ad of ads){

const id = crypto.randomUUID()

await db.prepare(`
INSERT INTO ads
(id,name,type,ad_code,page,position,priority,anime_slug,episode_number,country,device,start_date,end_date,status)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`)
.bind(
id,
ad.name,
ad.type,
ad.adCode,
ad.page,
ad.position,
ad.priority || 5,
ad.animeSlug || null,
ad.episodeNumber || null,
ad.country || null,
ad.device || "All",
ad.startDate || null,
ad.endDate || null,
"ON"
)
.run()

}

return c.json({success:true})

})

export default app
