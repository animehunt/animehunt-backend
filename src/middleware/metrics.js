export async function trackMetrics(DB, type){

  const minute = Math.floor(Date.now() / 60000)

  const row = await DB.prepare(
    "SELECT * FROM attack_metrics WHERE minute=?"
  ).bind(minute).first()

  if(!row){

    await DB.prepare(`
      INSERT INTO attack_metrics(minute,requests,blocked,suspicious)
      VALUES(?,?,?,?)
    `).bind(minute,1,0,0).run()

  }else{

    let req = row.requests
    let blocked = row.blocked
    let suspicious = row.suspicious

    if(type==="request") req++
    if(type==="blocked") blocked++
    if(type==="suspicious") suspicious++

    await DB.prepare(`
      UPDATE attack_metrics
      SET requests=?, blocked=?, suspicious=?
      WHERE minute=?
    `).bind(req,blocked,suspicious,minute).run()

  }

}
