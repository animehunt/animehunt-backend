import { Hono } from "hono"

const robots = new Hono()

robots.get("/robots.txt",(c)=>{

const origin = new URL(c.req.url).origin

return c.text(`

User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml

`)

})

export default robots
