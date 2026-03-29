export default async function graph(c){

  const DB = c.env.DB

  const rows = await DB.prepare(`
    SELECT 
      strftime('%H:%M', datetime(created_at/1000,'unixepoch')) as t,
      SUM(CASE WHEN event='request' THEN 1 ELSE 0 END) as requests,
      SUM(CASE WHEN event='blocked' THEN 1 ELSE 0 END) as blocked,
      SUM(CASE WHEN event='suspicious' THEN 1 ELSE 0 END) as suspicious
    FROM security_logs
    GROUP BY t
    ORDER BY created_at DESC
    LIMIT 20
  `).all()

  return c.json(rows.results.reverse())
}
