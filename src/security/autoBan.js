export async function autoBan(DB,ip,reason){

await DB.prepare(`
INSERT OR REPLACE INTO blocked_ips(ip,reason,created_at)
VALUES(?,?,?)
`)
.bind(ip,reason,Date.now())
.run()

await DB.prepare(`
INSERT INTO security_logs(ip,event,created_at)
VALUES(?,?,?)
`)
.bind(ip,"blocked",Date.now())
.run()

}
