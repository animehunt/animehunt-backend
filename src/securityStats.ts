import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const stats = new Hono<{ Bindings: Bindings }>()

stats.get("/", async (c)=>{

try{

const row:any = await c.env.DB
.prepare(`
SELECT *
FROM security_stats
ORDER BY id DESC
LIMIT 1
`)
.first()

if(!row){

return c.json({
blockedIPs:0,
liveUsers:0,
reqPerSec:0,
blockedReq:0
})

}

return c.json({

blockedIPs: row.blockedIPs ?? 0,
liveUsers: row.liveUsers ?? 0,
reqPerSec: row.reqPerSec ?? 0,
blockedReq: row.blockedReq ?? 0

})

}catch(e){

console.error(e)

return c.json({
blockedIPs:0,
liveUsers:0,
reqPerSec:0,
blockedReq:0
})

}

})

export default stats
