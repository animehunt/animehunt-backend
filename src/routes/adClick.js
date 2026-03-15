import { Hono } from "hono"

const app = new Hono()

app.post("/ads/click/:id", async(c)=>{

const id = c.req.param("id")

await c.env.DB
.prepare(`
UPDATE ads
SET clicks = clicks + 1
WHERE id=?
`)
.bind(id)
.run()

return c.json({success:true})

})

export default app
