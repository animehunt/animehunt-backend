import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL DOWNLOADS
========================= */
app.get("/downloads", verifyAdmin, async (c)=>{

const { results } = await c.env.DB
.prepare(`
SELECT *
FROM downloads
ORDER BY created_at DESC
`)
.all()

return c.json(results)

})

/* =========================
GET BY EPISODE
========================= */
app.get("/downloads/:anime/:season/:episode", async (c)=>{

const {anime,season,episode} = c.req.param()

const { results } = await c.env.DB
.prepare(`
SELECT host,quality,link,type,route
FROM downloads
WHERE anime=? AND season=? AND episode=?
`)
.bind(anime,season,episode)
.all()

return c.json(results)

})

/* =========================
CREATE SINGLE
========================= */
app.post("/downloads", verifyAdmin, async (c)=>{

const body = await c.req.json()
const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO downloads
(id,anime,season,episode,host,quality,link,type,route,clicks)
VALUES(?,?,?,?,?,?,?,?,?,0)
`)
.bind(
id,
body.anime,
body.season,
body.episode,
body.host,
body.quality,
body.link,
body.type || "internal",
body.route || "go"
)
.run()

return c.json({success:true})

})

/* =========================
BULK INSERT
========================= */
app.post("/downloads/bulk", verifyAdmin, async (c)=>{

const rows = await c.req.json()
const db = c.env.DB

for(const d of rows){

await db.prepare(`
INSERT INTO downloads
(id,anime,season,episode,host,quality,link,type,route,clicks)
VALUES(?,?,?,?,?,?,?,?,?,0)
`)
.bind(
crypto.randomUUID(),
d.anime,
d.season,
d.episode,
d.host,
d.quality,
d.link,
d.type || "internal",
d.route || "go"
)
.run()

}

return c.json({success:true})

})

/* =========================
UPDATE DOWNLOAD (🔥 NEW)
========================= */
app.put("/downloads/update/:id", verifyAdmin, async (c)=>{

const id = c.req.param("id")
const body = await c.req.json()

await c.env.DB.prepare(`
UPDATE downloads
SET
anime=?,
season=?,
episode=?,
host=?,
quality=?,
link=?,
type=?,
route=?
WHERE id=?
`)
.bind(
body.anime,
body.season,
body.episode,
body.host,
body.quality,
body.link,
body.type || "internal",
body.route || "go",
id
)
.run()

return c.json({success:true})

})

/* =========================
DELETE
========================= */
app.delete("/downloads/:id", verifyAdmin, async (c)=>{

await c.env.DB.prepare(`
DELETE FROM downloads
WHERE id=?
`)
.bind(c.req.param("id"))
.run()

return c.json({success:true})

})

/* =========================
GO ROUTE (🔥 MONEY ROUTE)
========================= */
app.get("/go/:id", async (c)=>{

const id = c.req.param("id")
const db = c.env.DB

// 1. get link
const data = await db
.prepare("SELECT link FROM downloads WHERE id=?")
.bind(id)
.first()

if(!data){
return c.text("Link not found",404)
}

// 2. increment click
await db.prepare(`
UPDATE downloads
SET clicks = clicks + 1
WHERE id=?
`)
.bind(id)
.run()

// 3. redirect
return c.redirect(data.link)

})

export default app
