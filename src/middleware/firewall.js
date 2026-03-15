export async function firewall(c,next){

const ip =
c.req.header("CF-Connecting-IP") ||
"0.0.0.0"

const row = await c.env.DB
.prepare("SELECT * FROM security_settings WHERE id=1")
.first()

/* BLOCKED IPS */

const banned = await c.env.DB
.prepare("SELECT ip FROM blocked_ips WHERE ip=?")
.bind(ip)
.first()

if(banned){

return c.text("Access denied",403)

}

/* ULTRA MODE */

if(row.ultra){

const ua = c.req.header("user-agent") || ""

if(ua.length < 10){

return c.text("Bot blocked",403)

}

}

await next()

}
