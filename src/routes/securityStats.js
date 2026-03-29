import { Hono } from "hono"

const app = new Hono()

app.get("/security/stats", async (c)=>{

  const DB = c.env.DB

  /* BLOCKED IPS */
  const ipCount = await DB.prepare(
    "SELECT COUNT(*) as c FROM blocked_ips"
  ).first()

  /* BLOCK EVENTS */
  const blocked = await DB.prepare(`
    SELECT COUNT(*) as c
    FROM security_logs
    WHERE event='blocked'
  `).first()

  /* SUSPICIOUS */
  const suspicious = await DB.prepare(`
    SELECT COUNT(*) as c
    FROM security_logs
    WHERE event='suspicious'
  `).first()

  /* HIGH RISK IPS */
  const highRisk = await DB.prepare(`
    SELECT COUNT(*) as c
    FROM ip_scores
    WHERE score >= 10
  `).first()

  /* RANDOM LIVE (SIMULATION) */
  const liveUsers = Math.floor(Math.random()*200)+50
  const reqPerSec = Math.floor(Math.random()*100)+20

  /* THREAT LEVEL LOGIC */
  let threat = "Low"

  if((suspicious.c || 0) > 20) threat = "Medium"
  if((suspicious.c || 0) > 50) threat = "High"

  return c.json({

    blockedIPs: ipCount?.c || 0,
    blockedReq: blocked?.c || 0,
    suspicious: suspicious?.c || 0,
    highRiskIPs: highRisk?.c || 0,

    liveUsers,
    reqPerSec,

    threat

  })

})

export default app
