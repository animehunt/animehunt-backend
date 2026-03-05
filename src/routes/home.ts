import { Hono } from "hono"

type Bindings = { DB: D1Database }

const home = new Hono<{ Bindings: Bindings }>()

home.get("/home", async (c) => {

const ongoing = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE active=1
ORDER BY created_at DESC
LIMIT 12
`).all()

const trending = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE active=1
ORDER BY views DESC
LIMIT 12
`).all()

const action = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE category LIKE '%action%'
LIMIT 12
`).all()

const romance = await c.env.DB.prepare(`
SELECT * FROM anime
WHERE category LIKE '%romance%'
LIMIT 12
`).all()

return c.json({
ongoing:ongoing.results,
trending:trending.results,
action:action.results,
romance:romance.results
})

})

export default home
