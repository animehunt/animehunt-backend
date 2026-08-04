/* ============================================================
  ANIMEHUNT — PUBLIC SEO FILE ROUTES (robots.txt, sitemaps)
  File: src/routes/publicSEORoot.js

  ✅ NEW FILE (audit fix, double-prefix + wrong-mount bug): this file
  used to be part of publicSEO.js, which was entirely mounted via
  app.route("/api", publicSEO). That's wrong for THESE routes — search
  engines request /robots.txt and /sitemap.xml at the domain root
  (e.g. https://animehunt.in/robots.txt), never under /api/. Mounting
  this file under /api made every one of these routes unreachable at
  the URL search engines and crawlers actually request.

  index.js mein mount karo AT THE ROOT (no /api prefix):
    app.route("/", publicSEORoot)

  The meta/schema routes (which genuinely belong under /api) stay in
  publicSEO.js, mounted via app.route("/api", publicSEO) — see that
  file's header for its own related fix (it also had a redundant
  hardcoded /api/ prefix baked into its route paths, doubling up with
  the mount prefix).

  ROUTES:
  GET /robots.txt
  GET /sitemap-index.xml
  GET /sitemap-anime-:page.xml
  GET /sitemap-static.xml
  GET /sitemap.xml            ← legacy 301 redirect
============================================================ */

import { Hono } from "hono"

const app = new Hono()

const SITEMAP_PAGE_SIZE = 200
const SITEMAP_CACHE_TTL = 3600
const ROBOTS_CACHE_TTL  = 86400

/* ============================================================
  HELPER — safe canonical base URL
============================================================ */

async function getBase(db) {
  try {
    const row = await db.prepare(
      "SELECT canonical FROM seo_settings WHERE id=1"
    ).first()
    return (row?.canonical || "https://animehunt.in").replace(/\/$/, "")
  } catch {
    return "https://animehunt.in"
  }
}

/* ============================================================
  GET /robots.txt — KV cached 24h
============================================================ */

app.get("/robots.txt", async (c) => {
  try {
    const cached = await c.env.KV?.get("seo:robots").catch(() => null)
    if (cached) {
      return new Response(cached, {
        headers: {
          "Content-Type":  "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
          "X-Cache":       "HIT"
        }
      })
    }

    const db   = c.env.DB
    const base = await getBase(db)

    // Check custom robots.txt from system_settings
    // MIGRATION FIX: system_settings is a single wide row (id=1, many named
    // columns — see routes/system.js's own CREATE TABLE), not a key/value
    // table. This used to query `WHERE key='robots_txt'`, which never
    // matched anything against that design — real bug found during the
    // final schema audit, not something the migration introduced.
    let content = null
    try {
      const setting = await db.prepare(
        "SELECT robots_txt FROM system_settings WHERE id=1"
      ).first()
      if (setting?.robots_txt?.trim()) content = setting.robots_txt.trim()
    } catch {}

    if (!content) {
      content = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/admin/
Disallow: /api/go
Disallow: /go.html
Crawl-delay: 2

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${base}/sitemap-index.xml`
    }

    if (c.env.KV) {
      await c.env.KV.put("seo:robots", content, {
        expirationTtl: ROBOTS_CACHE_TTL
      }).catch(() => {})
    }

    return new Response(content, {
      headers: {
        "Content-Type":  "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        "X-Cache":       "MISS"
      }
    })
  } catch (err) {
    return new Response("User-agent: *\nAllow: /\n", {
      headers: { "Content-Type": "text/plain" }
    })
  }
})

/* ============================================================
  GET /sitemap-index.xml — KV cached 1h
============================================================ */

app.get("/sitemap-index.xml", async (c) => {
  try {
    const cached = await c.env.KV?.get("seo:sitemap-index").catch(() => null)
    if (cached) {
      return new Response(cached, {
        headers: {
          "Content-Type":  "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Cache":       "HIT"
        }
      })
    }

    const db    = c.env.DB
    const base  = await getBase(db)
    const today = new Date().toISOString().slice(0, 10)

    const countRow = await db.prepare(
      "SELECT COUNT(*) as total FROM anime WHERE is_hidden=0 AND active=1"
    ).first()
    const total      = countRow?.total || 0
    const totalPages = Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE))

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${base}/sitemap-static.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`

    for (let i = 1; i <= totalPages; i++) {
      xml += `
  <sitemap>
    <loc>${base}/sitemap-anime-${i}.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`
    }

    xml += "\n</sitemapindex>"

    if (c.env.KV) {
      await c.env.KV.put("seo:sitemap-index", xml, {
        expirationTtl: SITEMAP_CACHE_TTL
      }).catch(() => {})
    }

    return new Response(xml, {
      headers: {
        "Content-Type":  "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache":       "MISS"
      }
    })
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>`,
      { headers: { "Content-Type": "application/xml" } }
    )
  }
})

/* ============================================================
  GET /sitemap-anime-:page.xml — Bug #20 Fix: 200/page not 5000
============================================================ */

app.get("/sitemap-anime-:page.xml", async (c) => {
  const rawPage = parseInt(c.req.param("page") || "1")
  const page    = (isNaN(rawPage) || rawPage < 1) ? 1 : rawPage
  const offset  = (page - 1) * SITEMAP_PAGE_SIZE
  const cacheKey = `seo:sitemap-anime-${page}`

  try {
    const cached = await c.env.KV?.get(cacheKey).catch(() => null)
    if (cached) {
      return new Response(cached, {
        headers: {
          "Content-Type":  "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "X-Cache":       "HIT"
        }
      })
    }

    const db     = c.env.DB
    const base   = await getBase(db)
    const seoRow = await db.prepare(
      "SELECT sitemap_freq, sitemap_priority FROM seo_settings WHERE id=1"
    ).first().catch(() => null)

    const freq  = seoRow?.sitemap_freq     || "daily"
    const prio  = seoRow?.sitemap_priority || "0.8"
    const today = new Date().toISOString().slice(0, 10)

    const { results: animeList } = await db.prepare(`
      SELECT slug, updated_at
      FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).bind(SITEMAP_PAGE_SIZE, offset).all()

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`

    for (const a of animeList) {
      const lastmod = a.updated_at?.slice(0, 10) || today
      xml += `
  <url>
    <loc>${base}/details.html?id=${encodeURIComponent(a.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
  </url>`
    }

    xml += "\n</urlset>"

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, xml, {
        expirationTtl: SITEMAP_CACHE_TTL
      }).catch(() => {})
    }

    return new Response(xml, {
      headers: {
        "Content-Type":  "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Cache":       "MISS"
      }
    })
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      { headers: { "Content-Type": "application/xml" } }
    )
  }
})

/* ============================================================
  GET /sitemap-static.xml
============================================================ */

app.get("/sitemap-static.xml", async (c) => {
  try {
    const base  = await getBase(c.env.DB)
    const today = new Date().toISOString().slice(0, 10)

    const statics = [
      { loc: "/",             priority: "1.0", freq: "daily"  },
      { loc: "/anime.html",   priority: "0.9", freq: "daily"  },
      { loc: "/movies.html",  priority: "0.9", freq: "daily"  },
      { loc: "/cartoon.html", priority: "0.9", freq: "weekly" },
      { loc: "/series.html",  priority: "0.9", freq: "weekly" },
    ]

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`

    for (const s of statics) {
      xml += `
  <url>
    <loc>${base}${s.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${s.freq}</changefreq>
    <priority>${s.priority}</priority>
  </url>`
    }

    xml += "\n</urlset>"

    return new Response(xml, {
      headers: {
        "Content-Type":  "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      }
    })
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      { headers: { "Content-Type": "application/xml" } }
    )
  }
})

/* ============================================================
  GET /sitemap.xml — Legacy 301 redirect
============================================================ */

app.get("/sitemap.xml", async (c) => {
  try {
    const base = await getBase(c.env.DB)
    return Response.redirect(`${base}/sitemap-index.xml`, 301)
  } catch {
    return Response.redirect("https://animehunt.in/sitemap-index.xml", 301)
  }
})

export default app
