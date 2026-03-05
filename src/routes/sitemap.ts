import { Hono } from "hono"

type Bindings = { DB:D1Database }

const sitemap = new Hono<{Bindings:Bindings}>()

sitemap.get("/sitemap.xml",async(c)=>{

const origin = new URL(c.req.url).origin

const rows = await c.env.DB.prepare(`
SELECT slug FROM anime
WHERE active=1
`).all()

let urls=""

rows.results.forEach((a:any)=>{

urls += `
<url>
<loc>${origin}/anime.html?slug=${a.slug}</loc>
<changefreq>daily</changefreq>
<priority>0.8</priority>
</url>
`

})

const xml = `

<?xml version="1.0" encoding="UTF-8"?>

<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

<url>
<loc>${origin}</loc>
<priority>1.0</priority>
</url>

${urls}

</urlset>

`

return c.text(xml,{
headers:{ "Content-Type":"application/xml" }
})

})

export default sitemap
