import { autoBan } from "../security/autoBan.js"

export async function firewall(c,next){

const ip =
c.req.header("CF-Connecting-IP") ||
"0.0.0.0"

const ua = c.req.header("user-agent") || ""
const country = c.req.cf?.country || "XX"

const db = c.env.DB

const settings = await db
.prepare("SELECT * FROM security_settings WHERE id=1")
.first()

/* =====================
BLOCKED IP
===================== */

const banned = await db
.prepare("SELECT ip FROM blocked_ips WHERE ip=?")
.bind(ip)
.first()

if(banned){
return c.text("Access denied",403)
}

/* =====================
GEO FIREWALL
===================== */

if(settings.geo_india_only && country !== "IN"){
return c.text("India only access",403)
}

if(settings.geo_block_foreign && country !== "IN"){
return c.text("Foreign blocked",403)
}

/* =====================
BOT DETECTION
===================== */

if(settings.ai_bot){

if(ua.length < 10 || ua.includes("bot")){
await increaseScore(db,ip,2)
}

}

/* =====================
RATE LIMIT (BURST)
===================== */

const now = Date.now()

const key = "rate:"+ip

const count = (c.env.RATE_LIMIT?.get(key) || 0) + 1

c.env.RATE_LIMIT?.put(key,count,{expirationTtl:1})

if(count > 40){
await autoBan(db,ip,"burst attack")
return c.text("Rate limit exceeded",429)
}

/* =====================
ULTRA MODE
===================== */

if(settings.ultra){

if(ua.length < 15){
return c.text("Ultra block",403)
}

}

/* =====================
IP SCORE SYSTEM
===================== */

async function increaseScore(db,ip,points){

const row = await db
.prepare("SELECT score FROM ip_scores WHERE ip=?")
.bind(ip)
.first()

const newScore = (row?.score || 0) + points

await db.prepare(`
INSERT OR REPLACE INTO ip_scores(ip,score)
VALUES(?,?)
`).bind(ip,newScore).run()

if(newScore >= 10){
await autoBan(db,ip,"AI auto ban")
}

}

await next()
}
