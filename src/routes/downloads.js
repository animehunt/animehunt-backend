import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL DOWNLOADS
========================= */

app.get("/downloads", verifyAdmin, async (c)=>{

const data = await c.env.DB
.prepare(`
SELECT *
FROM downloads
ORDER BY created_at DESC
`)
.all()

return c.json(data.results)

})

/* =========================
GET DOWNLOADS BY EPISODE
(for watch/download page)
========================= */

app.get("/downloads/:anime/:season/:episode", async (c)=>{

const {anime,season,episode} = c.req.param()

const data = await c.env.DB
.prepare(`
SELECT host,quality,link
FROM downloads
WHERE anime=? AND season=? AND episode=?
`)
.bind(anime,season,episode)
.all()

return c.json(data.results)

})

/* =========================
CREATE SINGLE DOWNLOAD
========================= */

app.post("/downloads", verifyAdmin, async (c)=>{

const body = await c.req.json()

const id = crypto.randomUUID()

await c.env.DB.prepare(`
INSERT INTO downloads
(id,anime,season,episode,host,quality,link)
VALUES(?,?,?,?,?,?,?)
`)
.bind(
id,
body.anime,
body.season,
body.episode,
body.host,
body.quality,
body.link
)
.run()

return c.json({success:true})

})

/* =========================
BULK INSERT (CMS USE)
========================= */

app.post("/downloads/bulk", verifyAdmin, async (c)=>{

const rows = await c.req.json()

const db = c.env.DB

for(const d of rows){

await db.prepare(`
INSERT INTO downloads
(id,anime,season,episode,host,quality,link)
VALUES(?,?,?,?,?,?,?)
`)
.bind(

crypto.randomUUID(),
d.anime,
d.season,
d.episode,
d.host,
d.quality,
d.link

)
.run()

}

return c.json({success:true})

})

/* =========================
DELETE DOWNLOAD
========================= */

app.delete("/downloads/:id", verifyAdmin, async (c)=>{

const {id} = c.req.param()

await c.env.DB.prepare(`
DELETE FROM downloads
WHERE id=?
`)
.bind(id)
.run()

return c.json({success:true})

})

export default app
