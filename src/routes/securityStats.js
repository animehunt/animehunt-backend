import { Hono } from "hono"

const app = new Hono()

app.get("/security/stats", async (c) => {

  const DB = c.env.DB

  const ipCount = await DB.prepare(
    "SELECT COUNT(*) as c FROM blocked_ips"
  ).first()

  const blocked = await DB.prepare(`
    SELECT COUNT(*) as c FROM security_logs
    WHERE event='blocked'
  `).first()

  const suspicious = await DB.prepare(`
    SELECT COUNT(*) as c FROM security_logs
    WHERE event='suspicious'
  `).first()

  return c.json({
    blockedIPs: ipCount.c || 0,
    suspicious: suspicious.c || 0,
    liveUsers: Math.floor(Math.random() * 200),
    reqPerSec: Math.floor(Math.random() * 100),
    blockedReq: blocked.c || 0
  })
})

export default app
