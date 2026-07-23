/* ============================================================
  ANIMEHUNT — PUBLIC SEO ROUTES (FINAL — ALL ISSUES FIXED)
  File: src/routes/publicSEO.js

  BUGS FIXED:
  ✅ Bug #19: sitemap.js + robots.js route conflicts → absorbed here
  ✅ Bug #20: LIMIT 5000 → paginated 200/page
  ✅ FIXED: metaDesc undefined?.slice(0,155)+"..." = "undefined..." bug
              → proper null check before concat
  ✅ FIXED: KV cache on all heavy routes

  ROUTES:
  GET /robots.txt
  GET /sitemap-index.xml
  GET /sitemap-anime-:page.xml
  GET /sitemap-static.xml
  GET /sitemap.xml            ← legacy 301 redirect
  GET /api/seo/meta/:animeId
  GET /api/seo/schema/:animeId
============================================================ */

import { Hono } from "hono"

const app = new Hono()

const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

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
  HELPER — safe description slice (FIXED: no "undefined..." bug)
============================================================ */

function safeDesc(desc, title, maxLen = 155) {
  if (desc && desc.trim()) {
    const s = desc.trim()
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s
  }
  return `Watch ${title} Hindi Dubbed online free on AnimeHunt.`
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

/* ============================================================
  GET /api/seo/meta/:animeId — OG + Twitter meta
  FIXED: metaDesc "undefined..." bug
  KV cached 1h
============================================================ */

app.get("/api/seo/meta/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    const cacheKey = `seo:meta:${animeId}`
    const cached   = await c.env.KV?.get(cacheKey, "json").catch(() => null)
    if (cached) return c.json(ok(cached))

    // Try pre-generated seo_meta first
    const meta = await db.prepare(
      "SELECT * FROM seo_meta WHERE id=?"
    ).bind(animeId).first().catch(() => null)

    if (meta) {
      const result = {
        metaTitle:  meta.meta_title  || "",
        metaDesc:   meta.meta_desc   || "",
        keywords:   meta.keywords    || "",
        ogImage:    meta.og_image    || "",
        schemaJson: meta.schema_json || null
      }
      if (c.env.KV) {
        await c.env.KV.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 3600
        }).catch(() => {})
      }
      return c.json(ok(result))
    }

    // Fallback: generate from anime table
    // ✅ FIX (audit ISSUE-032): added is_hidden=0 — this file's own sitemap
    // routes (GET /api/seo/sitemap) correctly check both is_hidden=0 AND
    // active=1, but this metadata fallback only checked active=1. Matching
    // the pairing used consistently everywhere else in this codebase
    // (public.js, publicSearch.js, recommendations.js, trending.js) so a
    // hidden anime's OG/Twitter meta can't be generated even when the
    // exact animeId/slug is known directly.
    const anime = await db.prepare(
      "SELECT id, title, slug, description, poster, banner, rating, year, type, genres, language FROM anime WHERE (id=? OR slug=?) AND active=1 AND is_hidden=0 LIMIT 1"
    ).bind(animeId, animeId).first()

    if (!anime) return c.json(fail("Not found"), 404)

    const seoRow = await db.prepare(
      "SELECT canonical, tpl_anime, tpl_movie, tpl_cartoon FROM seo_settings WHERE id=1"
    ).first().catch(() => null)

    const base = (seoRow?.canonical || "https://animehunt.in").replace(/\/$/, "")

    const template = anime.type === "movie"
      ? (seoRow?.tpl_movie   || "{title} Hindi Dubbed Movie — AnimeHunt")
      : anime.type === "cartoon"
        ? (seoRow?.tpl_cartoon || "{title} Hindi Dubbed Cartoon — AnimeHunt")
        : (seoRow?.tpl_anime   || "{title} Hindi Dubbed — Watch Free | AnimeHunt")

    const metaTitle = template.replace("{title}", anime.title || "").slice(0, 65)

    let genres = []
    try { genres = JSON.parse(anime.genres || "[]") } catch {}

    // FIXED: no more "undefined..." bug — safeDesc handles null/undefined desc
    const result = {
      metaTitle,
      metaDesc:   safeDesc(anime.description, anime.title, 155),
      keywords:   [anime.title, `${anime.title || ""} hindi dubbed`, ...genres.slice(0,3), "anime", "animehunt"].filter(Boolean).join(", "),
      ogImage:    anime.poster || anime.banner || "",
      schemaJson: null,
      og: {
        type:        anime.type === "movie" ? "video.movie" : "video.tv_show",
        title:       metaTitle,
        description: safeDesc(anime.description, anime.title, 200),
        image:       anime.poster || anime.banner || "",
        url:         `${base}/details.html?id=${anime.slug}`
      }
    }

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 3600
      }).catch(() => {})
    }

    return c.json(ok(result))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/seo/schema/:animeId — JSON-LD schema.org
============================================================ */

app.get("/api/seo/schema/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    // ✅ FIX (audit ISSUE-032): same is_hidden=0 addition as the /seo/meta
    // route above.
    const anime = await db.prepare(
      "SELECT id, title, slug, description, poster, rating, year, type, genres, language FROM anime WHERE (id=? OR slug=?) AND active=1 AND is_hidden=0 LIMIT 1"
    ).bind(animeId, animeId).first()

    if (!anime) return c.json(fail("Not found"), 404)

    const base = await getBase(db)

    let genres = []
    try { genres = JSON.parse(anime.genres || "[]") } catch {}

    const schema = {
      "@context":    "https://schema.org",
      "@type":       anime.type === "movie" ? "Movie" : "TVSeries",
      "name":        anime.title || "",
      "description": anime.description || "",
      "image":       anime.poster || "",
      "url":         `${base}/details.html?id=${anime.slug}`,
      "genre":       genres,
      "inLanguage":  anime.language || "hi"
    }

    if (anime.rating) {
      schema.aggregateRating = {
        "@type":       "AggregateRating",
        "ratingValue": String(anime.rating),
        "bestRating":  "10",
        "worstRating": "1"
      }
    }

    if (anime.year) schema.dateCreated = String(anime.year)

    return c.json(ok(schema))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

export default app
