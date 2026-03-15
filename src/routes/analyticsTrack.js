import { Hono } from "hono"

const app = new Hono()

app.post("/analytics/track", async (c)=>{

const db = c.env.DB
const body = await c.req.json()

const type = body.type
const ref = body.ref || null
const value = body.value || null

await db.prepare(`
INSERT INTO analytics_events(type,ref,value)
VALUES(?,?,?)
`)
.bind(type,ref,value)
.run()

/* VISITOR TRACK */

const ip = c.req.header("CF-Connecting-IP") || "0.0.0.0"

await db.prepare(`
INSERT INTO analytics_visitors(ip,last_visit)
VALUES(?,CURRENT_TIMESTAMP)
ON CONFLICT(ip)
DO UPDATE SET last_visit=CURRENT_TIMESTAMP
`)
.bind(ip)
.run()

return c.json({success:true})

})

export default app
