import { Hono } from "hono"

const app = new Hono()

app.get("/banners", async (c)=>{

const db = c.env.DB

const page = c.req.query("page")
const category = c.req.query("category")
const position = c.req.query("position")

let query = `
SELECT * FROM banners
WHERE active=1
`

if(page)
query += ` AND page='${page}'`

if(category)
query += ` AND (category='' OR category='${category}')`

if(position)
query += ` AND position='${position}'`

query += `
ORDER BY banner_order ASC
`

const { results } = await db.prepare(query).all()

/* AUTO ROTATION */

const rotated = results.filter(b=>b.auto_rotate)

if(rotated.length){

const rand = rotated[Math.floor(Math.random()*rotated.length)]

return c.json([rand])

}

return c.json(results)

})

export default app
