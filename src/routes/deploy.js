import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET DEPLOY DATA
========================= */

app.get("/deploy", verifyAdmin, async (c)=>{

const db = c.env.DB

const state = await db
.prepare("SELECT * FROM deploy_state WHERE id=1")
.first()

const versions = (await db
.prepare("SELECT * FROM deploy_versions ORDER BY date DESC")
.all()).results

const backups = (await db
.prepare("SELECT id,name,date FROM deploy_backups ORDER BY date DESC")
.all()).results

return c.json({

state,
versions,
backups

})

})

/* =========================
DEPLOY
========================= */

app.post("/deploy/deploy", verifyAdmin, async (c)=>{

await c.env.DB.prepare(`
UPDATE deploy_state
SET last_deploy=CURRENT_TIMESTAMP
WHERE id=1
`).run()

return c.json({success:true})

})

/* =========================
CREATE VERSION
========================= */

app.post("/deploy/version", verifyAdmin, async (c)=>{

const id = crypto.randomUUID()

const name = "Version " + Date.now()

await c.env.DB.prepare(`
INSERT INTO deploy_versions
(id,name,date)
VALUES(?,?,CURRENT_TIMESTAMP)
`)
.bind(id,name)
.run()

return c.json({success:true})

})

/* =========================
BACKUP
========================= */

app.post("/deploy/backup", verifyAdmin, async (c)=>{

const db = c.env.DB

const anime = (await db.prepare("SELECT * FROM anime").all()).results
const episodes = (await db.prepare("SELECT * FROM episodes").all()).results
const categories = (await db.prepare("SELECT * FROM categories").all()).results
const banners = (await db.prepare("SELECT * FROM banners").all()).results

const data = {

anime,
episodes,
categories,
banners

}

const id = crypto.randomUUID()

await db.prepare(`
INSERT INTO deploy_backups
(id,name,data,date)
VALUES(?,?,?,CURRENT_TIMESTAMP)
`)
.bind(

id,
"Backup "+new Date().toISOString(),
JSON.stringify(data)

)
.run()

return c.json({success:true})

})

/* =========================
RESTORE
========================= */

app.post("/deploy/restore", verifyAdmin, async (c)=>{

const body = await c.req.json()

const row = await c.env.DB.prepare(`
SELECT data FROM deploy_backups
WHERE id=?
`)
.bind(body.id)
.first()

if(!row) return c.json({error:"Backup not found"},404)

const data = JSON.parse(row.data)

const db = c.env.DB

await db.prepare("DELETE FROM anime").run()
await db.prepare("DELETE FROM episodes").run()
await db.prepare("DELETE FROM categories").run()
await db.prepare("DELETE FROM banners").run()

for(const a of data.anime){
await db.prepare(`
INSERT INTO anime VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`).bind(...Object.values(a)).run()
}

for(const e of data.episodes){
await db.prepare(`
INSERT INTO episodes VALUES(?,?,?,?,?,?,?,?,?,?)
`).bind(...Object.values(e)).run()
}

for(const c of data.categories){
await db.prepare(`
INSERT INTO categories VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
`).bind(...Object.values(c)).run()
}

for(const b of data.banners){
await db.prepare(`
INSERT INTO banners VALUES(?,?,?,?,?,?,?,?,?,?)
`).bind(...Object.values(b)).run()
}

return c.json({success:true})

})

/* =========================
STATE CONTROL
========================= */

app.patch("/deploy/state", verifyAdmin, async (c)=>{

const body = await c.req.json()

if(body.type==="freeze"){

await c.env.DB.prepare(`
UPDATE deploy_state
SET frozen=?
WHERE id=1
`)
.bind(body.value?1:0)
.run()

}

if(body.type==="emergency"){

await c.env.DB.prepare(`
UPDATE deploy_state
SET emergency=?
WHERE id=1
`)
.bind(body.value?1:0)
.run()

}

return c.json({success:true})

})

export default app
