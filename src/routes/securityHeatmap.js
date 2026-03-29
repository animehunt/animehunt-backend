export default async function heatmap(c){

  const DB = c.env.DB

  const rows = await DB.prepare(`
    SELECT country, COUNT(*) as count
    FROM security_logs
    GROUP BY country
    ORDER BY count DESC
    LIMIT 10
  `).all()

  return c.json(rows.results)
}
