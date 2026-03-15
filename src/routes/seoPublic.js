import { Hono } from "hono"

const app = new Hono()

app.get("/seo", async (c)=>{

const row = await c.env.DB
.prepare("SELECT * FROM seo_settings WHERE id=1")
.first()

return c.json(row)

})

export default app
