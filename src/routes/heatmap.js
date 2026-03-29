import { Hono } from "hono"

const app = new Hono()

app.get("/security/heatmap", async (c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT country, COUNT(*) as count
    FROM security_logs
    GROUP BY country
  `).all()

  return c.json(results)
})

export default app
