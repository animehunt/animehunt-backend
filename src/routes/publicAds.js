import { Hono } from "hono"

const app = new Hono()

app.get("/ads", async(c)=>{

const db = c.env.DB

const page = c.req.query("page")
const device = c.req.query("device") || "All"
const anime = c.req.query("anime")
const episode = c.req.query("episode")
const country = c.req.query("country")

let query = `
SELECT * FROM ads
WHERE status='ON'
AND (start_date IS NULL OR start_date <= CURRENT_TIMESTAMP)
AND (end_date IS NULL OR end_date >= CURRENT_TIMESTAMP)
`

if(page) query += ` AND page='${page}'`

if(device!=="All"){
query += ` AND (device='All' OR device='${device}')`
}

if(anime){
query += ` AND (anime_slug IS NULL OR anime_slug='${anime}')`
}

if(episode){
query += ` AND (episode_number IS NULL OR episode_number='${episode}')`
}

if(country){
query += ` AND (country IS NULL OR country='${country}')`
}

query += ` ORDER BY priority ASC`

const { results } = await db.prepare(query).all()

if(!results.length) return c.json([])

/* ROTATION */

const randomAd = results[Math.floor(Math.random()*results.length)]

await db.prepare(`
UPDATE ads
SET impressions = impressions + 1
WHERE id=?
`).bind(randomAd.id).run()

return c.json(randomAd)

})

export default app
