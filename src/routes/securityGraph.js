import { Hono } from "hono"

const app = new Hono()

app.get("/security/graph", async (c)=>{

  const DB = c.env.DB

  const { results } = await DB.prepare(`
    SELECT * FROM attack_metrics
    ORDER BY minute DESC
    LIMIT 60
  `).all()

  return c.json(results.reverse())

})

export default app
