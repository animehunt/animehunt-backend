import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ===============================
GET AI STATE
=============================== */

app.get("/ai", verifyAdmin, async (c)=>{

const db = c.env.DB

const state = await db
.prepare("SELECT paused FROM ai_state WHERE id=1")
.first()

const { results } = await db
.prepare("SELECT * FROM ai_settings")
.all()

const engines = {}

results.forEach(row=>{

if(!engines[row.engine])
engines[row.engine] = {}

engines[row.engine][row.setting] = !!row.value

})

return c.json({
paused: !!state.paused,
engines
})

})

/* ===============================
UPDATE SETTING
=============================== */

app.patch("/ai", verifyAdmin, async (c)=>{

const db = c.env.DB
const body = await c.req.json()

const {engine,setting,value} = body

if(!engine || !setting){
return c.json({error:"Invalid data"},400)
}

await db.prepare(`
INSERT INTO ai_settings(engine,setting,value)
VALUES(?,?,?)
ON CONFLICT(engine,setting)
DO UPDATE SET value=excluded.value
`)
.bind(engine,setting,value?1:0)
.run()

return c.json({success:true})

})

/* ===============================
PAUSE / RESUME
=============================== */

app.patch("/ai/pause", verifyAdmin, async (c)=>{

const db = c.env.DB

const state = await db
.prepare("SELECT paused FROM ai_state WHERE id=1")
.first()

const paused = state.paused ? 0 : 1

await db
.prepare("UPDATE ai_state SET paused=? WHERE id=1")
.bind(paused)
.run()

return c.json({
success:true,
paused: !!paused
})

})

export default app
