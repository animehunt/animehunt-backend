import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

app.get("/ads/analytics", verifyAdmin, async(c)=>{

const { results } = await c.env.DB.prepare(`
SELECT
name,
impressions,
clicks,
CASE
WHEN impressions>0
THEN ROUND((clicks*100.0)/impressions,2)
ELSE 0
END as ctr
FROM ads
ORDER BY impressions DESC
`).all()

return c.json(results)

})

export default app
