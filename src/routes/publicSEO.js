/* ============================================================
  ANIMEHUNT — PUBLIC SEO ROUTES (FIXED)
  File: src/routes/publicSEO.js

  GET /sitemap.xml         - XML sitemap for Google
  GET /robots.txt          - robots.txt for crawlers
  GET /api/seo/schema/:id  - JSON-LD schema.org for anime
============================================================ */

import { Hono } from "hono"
const app  = new Hono()
const ok   = d => ({ success: true, data: d })
const fail = m => ({ success: false, message: m })

/* ============================================================
  GET /robots.txt
============================================================ */
app.get("/robots.txt", async (c) => {
  try {
    const seo  = await c.env.DB.prepare(
      "SELECT canonical FROM seo_settings WHERE id=1"
    ).first().catch(() => null)
    const base = seo?.canonical || "https://animehunt.in"

    const content = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/admin/
Disallow: /api/go
Disallow: /go.html
Crawl-delay: 2

Sitemap: ${base}/sitemap.xml`

    return new Response(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })
  } catch (err) {
    return new Response("User-agent: *\nAllow: /\n", {
      headers: { "Content-Type": "text/plain" }
    })
  }
})

/* ============================================================
  GET /sitemap.xml
============================================================ */
app.get("/sitemap.xml", async (c) => {
  try {
    const db  = c.env.DB
    const seo = await db.prepare(
      "SELECT canonical, sitemap_freq, sitemap_priority FROM seo_settings WHERE id=1"
    ).first().catch(() => null)

    const base = seo?.canonical  || "https://animehunt.in"
    const freq = seo?.sitemap_freq     || "daily"
    const prio = seo?.sitemap_priority || "0.8"
    const today = new Date().toISOString().slice(0, 10)

    const { results: anime } = await db.prepare(`
      SELECT slug, type, updated_at
      FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY updated_at DESC
      LIMIT 5000
    `).all()

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`

    // Static pages
    const statics = [
      { loc: "/",             priority: "1.0" },
      { loc: "/anime.html",   priority: "0.9" },
      { loc: "/movies.html",  priority: "0.9" },
      { loc: "/cartoon.html", priority: "0.9" },
      { loc: "/series.html",  priority: "0.9" },
    ]
    for (const s of statics) {
      xml += `\n  <url>
    <loc>${base}${s.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${s.priority}</priority>
  </url>`
    }

    // Anime pages
    for (const a of anime) {
      const lastmod = a.updated_at?.slice(0, 10) || today
      xml += `\n  <url>
    <loc>${base}/details.html?id=${encodeURIComponent(a.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
  </url>`
    }

    xml += "\n</urlset>"

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
      }
    })
  } catch (err) {
    return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`, {
      headers: { "Content-Type": "application/xml" }
    })
  }
})

/* ============================================================
  GET /api/seo/schema/:animeId — JSON-LD schema.org
============================================================ */
app.get("/api/seo/schema/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    const anime = await db.prepare(
      "SELECT id, title, slug, description, poster, rating, year, type, genres, language FROM anime WHERE (id=? OR slug=?) AND active=1 LIMIT 1"
    ).bind(animeId, animeId).first()

    if (!anime) return c.json(fail("Not found"), 404)

    const seo  = await db.prepare("SELECT canonical FROM seo_settings WHERE id=1").first().catch(() => null)
    const base = seo?.canonical || "https://animehunt.in"

    let genres = []
    try { genres = JSON.parse(anime.genres || "[]") } catch {}

    const schema = {
      "@context":    "https://schema.org",
      "@type":       anime.type === "movie" ? "Movie" : "TVSeries",
      "name":        anime.title,
      "description": anime.description || "",
      "image":       anime.poster || "",
      "url":         `${base}/details.html?id=${anime.slug}`,
      "genre":       genres,
      "inLanguage":  anime.language || "Hindi",
      "aggregateRating": anime.rating ? {
        "@type":       "AggregateRating",
        "ratingValue": anime.rating,
        "bestRating":  "10",
        "worstRating": "1"
      } : undefined,
    }
    if (anime.year) schema.dateCreated = String(anime.year)

    return c.json(ok(schema))
  } catch (err) { return c.json(fail(err.message), 500) }
})

export default app
