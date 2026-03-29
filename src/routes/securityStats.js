import { Hono } from "hono"

const app = new Hono()

app.get("/security/stats", async (c)=>{

const DB = c.env.DB

/* =========================
BLOCKED IPS COUNT
========================= */

const ipCount = await DB
.prepare("SELECT COUNT(*) as c FROM blocked_ips")
.first()

/* =========================
BLOCKED REQUESTS
========================= */

const blocked = await DB
.prepare(`
SELECT COUNT(*) as c
FROM security_logs
WHERE event='blocked'
`)
.first()

/* =========================
SUSPICIOUS ACTIVITY
========================= */

const suspicious = await DB
.prepare(`
SELECT COUNT(*) as c
FROM security_logs
WHERE event='suspicious'
`)
.first()

/* =========================
AUTO BANS (AI)
========================= */

const autoBan = await DB
.prepare(`
SELECT COUNT(*) as c
FROM security_logs
WHERE event='auto_ban'
`)
.first()

/* =========================
TOP ATTACK COUNTRIES (DUMMY + REAL READY)
========================= */

const countries = [
{country:"IN",count:12},
{country:"US",count:5},
{country:"CN",count:21},
{country:"RU",count:9},
{country:"BR",count:3}
]

/* =========================
LIVE METRICS (SIMULATED)
========================= */

const liveUsers = Math.floor(Math.random()*200)+50
const reqPerSec = Math.floor(Math.random()*80)+10

/* =========================
RESPONSE
========================= */

return c.json({

blockedIPs: ipCount?.c || 0,
blockedReq: blocked?.c || 0,

suspicious: suspicious?.c || 0,
autoBans: autoBan?.c || 0,

liveUsers,
reqPerSec,

countries

})

})

export default app
