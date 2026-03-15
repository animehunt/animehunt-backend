import { Hono } from 'hono'
import { verifyAdmin } from '../middleware/adminAuth.js'

const app = new Hono()

/* =======================
GET ADS
======================= */

app.get('/ads', verifyAdmin, async (c) => {

const db = c.env.DB

const { results } = await db
.prepare("SELECT * FROM ads ORDER BY priority ASC")
.all()

return c.json(results)

})

/* =======================
CREATE AD
======================= */

app.post('/ads', verifyAdmin, async (c) => {

const db = c.env.DB
const body = await c.req.json()

const id = crypto.randomUUID()

await db.prepare(`
INSERT INTO ads
(id,name,type,ad_code,page,position,priority,anime_slug,episode_number,country,device,status)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
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
"ON"
)
.run()

return c.json({success:true,id})

})

/* =======================
TOGGLE AD
======================= */

app.patch('/ads/:id/toggle', verifyAdmin, async (c) => {

const id = c.req.param('id')
const db = c.env.DB

const ad = await db.prepare("SELECT status FROM ads WHERE id=?")
.bind(id)
.first()

if(!ad){
return c.json({error:"Ad not found"},404)
}

const newStatus = ad.status === "ON" ? "OFF" : "ON"

await db.prepare("UPDATE ads SET status=? WHERE id=?")
.bind(newStatus,id)
.run()

return c.json({success:true,status:newStatus})

})

/* =======================
DELETE AD
======================= */

app.delete('/ads/:id', verifyAdmin, async (c) => {

const id = c.req.param('id')
const db = c.env.DB

await db.prepare("DELETE FROM ads WHERE id=?")
.bind(id)
.run()

return c.json({success:true})

})

/* =======================
BULK IMPORT
======================= */

app.post('/ads/bulk', verifyAdmin, async (c) => {

const db = c.env.DB
const ads = await c.req.json()

if(!Array.isArray(ads)){
return c.json({error:"Invalid format"},400)
}

for(const ad of ads){

const id = crypto.randomUUID()

await db.prepare(`
INSERT INTO ads
(id,name,type,ad_code,page,position,priority,anime_slug,episode_number,country,device,status)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
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
"ON"
)
.run()

}

return c.json({success:true,count:ads.length})

})

export default app
