import { Hono } from "hono"

const app = new Hono()

app.patch("/:id", async (c)=>{

const id=c.req.param("id")

await c.env.DB.prepare(`
UPDATE anime
SET is_hidden = CASE WHEN is_hidden=1 THEN 0 ELSE 1 END
WHERE id=?
`).bind(id).run()

return c.json({success:true})

})

export default app
