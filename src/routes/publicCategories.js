import { Hono } from "hono"

const app = new Hono()

/* HOMEPAGE ROWS */

app.get("/categories/home", async (c)=>{

const { results } = await c.env.DB.prepare(`
SELECT *
FROM categories
WHERE show_home=1 AND active=1
ORDER BY category_order
`).all()

return c.json(results)

})

/* CATEGORY PAGE */

app.get("/categories/:slug", async (c)=>{

const slug = c.req.param("slug")

const cat = await c.env.DB.prepare(`
SELECT * FROM categories
WHERE slug=?
`)
.bind(slug)
.first()

if(!cat) return c.json({error:"Not found"},404)

const { results } = await c.env.DB.prepare(`
SELECT *
FROM anime
WHERE genres LIKE '%' || ? || '%'
LIMIT 30
`)
.bind(slug)
.all()

return c.json({
category:cat,
anime:results
})

})

export default app
