export default async function logs(c) {

  const DB = c.env.DB

  const rows = await DB.prepare(`
    SELECT ip,event,country
    FROM security_logs
    ORDER BY created_at DESC
    LIMIT 50
  `).all()

  return c.json(rows.results)
}
