/* ================================================
   seoAdmin.js — SEO Settings + Auto Generation
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ================================================
   DEFAULT SEO SETTINGS
================================================ */

const DEFAULTS = {
  site_title:        "AnimeHunt – Watch Hindi Dubbed Anime Online Free",
  site_desc:         "Watch and download the latest Hindi dubbed anime, movies, series and cartoons for free on AnimeHunt. HD quality, fast streaming.",
  site_keywords:     "anime, hindi dubbed anime, animehunt, watch anime online, anime streaming, download anime hindi, cartoon hindi dubbed",
  canonical:         "https://animehunt.in",
  indexing:          "index",
  home_title:        "AnimeHunt – #1 Hindi Dubbed Anime Streaming Site",
  home_desc:         "Stream and download Hindi dubbed anime movies, series and cartoons in HD quality for free. New episodes daily.",
  home_keywords:     "hindi anime, dubbed anime, animehunt, free anime, anime download",
  home_og:           "",
  tpl_anime:         "{title} Hindi Dubbed – Watch Online Free | AnimeHunt",
  tpl_category:      "{category} Anime – Watch Hindi Dubbed | AnimeHunt",
  tpl_episode:       "{anime} Episode {ep} Season {season} Hindi Dubbed – AnimeHunt",
  tpl_search:        "Search \"{query}\" – Hindi Dubbed Anime | AnimeHunt",
  tpl_movie:         "{title} Hindi Dubbed Movie – Watch Online | AnimeHunt",
  tpl_cartoon:       "{title} Hindi Dubbed Cartoon – Watch Online | AnimeHunt",
  og_title:          "AnimeHunt – Hindi Dubbed Anime Streaming",
  og_desc:           "Watch Hindi dubbed anime online free in HD quality on AnimeHunt.",
  tw_title:          "AnimeHunt",
  tw_desc:           "Hindi dubbed anime streaming platform – watch free",
  tw_card:           "summary_large_image",
  schema_org:        1,
  auto_meta:         1,
  auto_sitemap:      1,
  sitemap_freq:      "daily",
  sitemap_priority:  "0.8",
  robots_index:      "index, follow",
  robots_noindex:    "noindex, nofollow",
  lang:              "hi-IN",
  updated_at:        ""
}

/* ================================================
   ENSURE TABLE + DEFAULT ROW
================================================ */

async function ensureRow(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_settings (
        id               INTEGER PRIMARY KEY DEFAULT 1,
        site_title       TEXT,
        site_desc        TEXT,
        site_keywords    TEXT,
        canonical        TEXT,
        indexing         TEXT DEFAULT 'index',
        home_title       TEXT,
        home_desc        TEXT,
        home_keywords    TEXT,
        home_og          TEXT,
        tpl_anime        TEXT,
        tpl_category     TEXT,
        tpl_episode      TEXT,
        tpl_search       TEXT,
        tpl_movie        TEXT,
        tpl_cartoon      TEXT,
        og_title         TEXT,
        og_desc          TEXT,
        tw_title         TEXT,
        tw_desc          TEXT,
        tw_card          TEXT DEFAULT 'summary_large_image',
        schema_org       INTEGER DEFAULT 1,
        auto_meta        INTEGER DEFAULT 1,
        auto_sitemap     INTEGER DEFAULT 1,
        sitemap_freq     TEXT DEFAULT 'daily',
        sitemap_priority TEXT DEFAULT '0.8',
        robots_index     TEXT DEFAULT 'index, follow',
        robots_noindex   TEXT DEFAULT 'noindex, nofollow',
        lang             TEXT DEFAULT 'hi-IN',
        updated_at       TEXT
      )
    `).run()

    const row = await db.prepare("SELECT id FROM seo_settings WHERE id=1").first()
    if (!row) {
      await db.prepare(`
        INSERT INTO seo_settings (
          id,site_title,site_desc,site_keywords,canonical,indexing,
          home_title,home_desc,home_keywords,home_og,
          tpl_anime,tpl_category,tpl_episode,tpl_search,tpl_movie,tpl_cartoon,
          og_title,og_desc,tw_title,tw_desc,tw_card,
          schema_org,auto_meta,auto_sitemap,
          sitemap_freq,sitemap_priority,
          robots_index,robots_noindex,lang,updated_at
        ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        DEFAULTS.site_title, DEFAULTS.site_desc, DEFAULTS.site_keywords,
        DEFAULTS.canonical, DEFAULTS.indexing,
        DEFAULTS.home_title, DEFAULTS.home_desc, DEFAULTS.home_keywords, DEFAULTS.home_og,
        DEFAULTS.tpl_anime, DEFAULTS.tpl_category, DEFAULTS.tpl_episode,
        DEFAULTS.tpl_search, DEFAULTS.tpl_movie, DEFAULTS.tpl_cartoon,
        DEFAULTS.og_title, DEFAULTS.og_desc,
        DEFAULTS.tw_title, DEFAULTS.tw_desc, DEFAULTS.tw_card,
        DEFAULTS.schema_org, DEFAULTS.auto_meta, DEFAULTS.auto_sitemap,
        DEFAULTS.sitemap_freq, DEFAULTS.sitemap_priority,
        DEFAULTS.robots_index, DEFAULTS.robots_noindex,
        DEFAULTS.lang, now()
      ).run()
    }
  } catch (err) {
    console.error("seo ensureRow:", err)
  }
}

/* ================================================
   FORMAT ROW
================================================ */

function formatRow(r) {
  return {
    global: {
      title:    r.site_title    || DEFAULTS.site_title,
      desc:     r.site_desc     || DEFAULTS.site_desc,
      keywords: r.site_keywords || DEFAULTS.site_keywords,
      canonical:r.canonical     || DEFAULTS.canonical,
      indexing: r.indexing      || "index",
      lang:     r.lang          || "hi-IN"
    },
    home: {
      title:    r.home_title    || DEFAULTS.home_title,
      desc:     r.home_desc     || DEFAULTS.home_desc,
      keywords: r.home_keywords || DEFAULTS.home_keywords,
      og:       r.home_og       || ""
    },
    templates: {
      anime:    r.tpl_anime    || DEFAULTS.tpl_anime,
      category: r.tpl_category || DEFAULTS.tpl_category,
      episode:  r.tpl_episode  || DEFAULTS.tpl_episode,
      search:   r.tpl_search   || DEFAULTS.tpl_search,
      movie:    r.tpl_movie    || DEFAULTS.tpl_movie,
      cartoon:  r.tpl_cartoon  || DEFAULTS.tpl_cartoon
    },
    social: {
      ogTitle:  r.og_title || DEFAULTS.og_title,
      ogDesc:   r.og_desc  || DEFAULTS.og_desc,
      twTitle:  r.tw_title || DEFAULTS.tw_title,
      twDesc:   r.tw_desc  || DEFAULTS.tw_desc,
      twCard:   r.tw_card  || "summary_large_image"
    },
    automation: {
      schemaOrg:       !!r.schema_org,
      autoMeta:        !!r.auto_meta,
      autoSitemap:     !!r.auto_sitemap,
      sitemapFreq:     r.sitemap_freq     || "daily",
      sitemapPriority: r.sitemap_priority || "0.8",
      robotsIndex:     r.robots_index     || "index, follow",
      robotsNoindex:   r.robots_noindex   || "noindex, nofollow"
    },
    updated_at: r.updated_at
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, row) {
  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    fetch(`${env.TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO seo_settings (
              id,site_title,site_desc,site_keywords,canonical,indexing,
              home_title,home_desc,home_keywords,home_og,
              tpl_anime,tpl_category,tpl_episode,tpl_search,tpl_movie,tpl_cartoon,
              og_title,og_desc,tw_title,tw_desc,tw_card,
              schema_org,auto_meta,auto_sitemap,
              sitemap_freq,sitemap_priority,
              robots_index,robots_noindex,lang,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              row.site_title,row.site_desc,row.site_keywords,row.canonical,row.indexing,
              row.home_title,row.home_desc,row.home_keywords,row.home_og,
              row.tpl_anime,row.tpl_category,row.tpl_episode,row.tpl_search,
              row.tpl_movie,row.tpl_cartoon,
              row.og_title,row.og_desc,row.tw_title,row.tw_desc,row.tw_card,
              row.schema_org,row.auto_meta,row.auto_sitemap,
              row.sitemap_freq,row.sitemap_priority,
              row.robots_index,row.robots_noindex,row.lang,row.updated_at
            ].map(v => ({
              type: typeof v === "number" ? "integer" : "text",
              value: String(v ?? "")
            }))
          }
        }]
      })
    }).catch(e => console.error("Turso SEO sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/seo_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    }).catch(e => console.error("Supabase SEO sync:", e))
  }
}

/* ================================================
   GET /seo
================================================ */

app.get("/seo", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare("SELECT * FROM seo_settings WHERE id=1").first()
    return c.json(success(formatRow(row || DEFAULTS)))
  } catch (err) {
    console.error("seo GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /seo — Save Settings
================================================ */

app.post("/seo", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    if (!body.global?.title?.trim()) return c.json(failure("Site title required"), 400)

    const timestamp = now()
    const row = {
      site_title:       body.global?.title?.trim()    || DEFAULTS.site_title,
      site_desc:        body.global?.desc?.trim()     || DEFAULTS.site_desc,
      site_keywords:    body.global?.keywords?.trim() || DEFAULTS.site_keywords,
      canonical:        body.global?.canonical?.trim()|| DEFAULTS.canonical,
      indexing:         body.global?.indexing         || "index",
      home_title:       body.home?.title?.trim()      || DEFAULTS.home_title,
      home_desc:        body.home?.desc?.trim()       || DEFAULTS.home_desc,
      home_keywords:    body.home?.keywords?.trim()   || DEFAULTS.home_keywords,
      home_og:          body.home?.og?.trim()         || "",
      tpl_anime:        body.templates?.anime         || DEFAULTS.tpl_anime,
      tpl_category:     body.templates?.category      || DEFAULTS.tpl_category,
      tpl_episode:      body.templates?.episode       || DEFAULTS.tpl_episode,
      tpl_search:       body.templates?.search        || DEFAULTS.tpl_search,
      tpl_movie:        body.templates?.movie         || DEFAULTS.tpl_movie,
      tpl_cartoon:      body.templates?.cartoon       || DEFAULTS.tpl_cartoon,
      og_title:         body.social?.ogTitle          || DEFAULTS.og_title,
      og_desc:          body.social?.ogDesc           || DEFAULTS.og_desc,
      tw_title:         body.social?.twTitle          || DEFAULTS.tw_title,
      tw_desc:          body.social?.twDesc           || DEFAULTS.tw_desc,
      tw_card:          body.social?.twCard           || "summary_large_image",
      schema_org:       body.automation?.schemaOrg    !== false ? 1 : 0,
      auto_meta:        body.automation?.autoMeta     !== false ? 1 : 0,
      auto_sitemap:     body.automation?.autoSitemap  !== false ? 1 : 0,
      sitemap_freq:     body.automation?.sitemapFreq      || "daily",
      sitemap_priority: body.automation?.sitemapPriority  || "0.8",
      robots_index:     body.automation?.robotsIndex      || "index, follow",
      robots_noindex:   body.automation?.robotsNoindex    || "noindex, nofollow",
      lang:             body.global?.lang                  || "hi-IN",
      updated_at:       timestamp
    }

    await db.prepare(`
      UPDATE seo_settings SET
        site_title=?,site_desc=?,site_keywords=?,canonical=?,indexing=?,
        home_title=?,home_desc=?,home_keywords=?,home_og=?,
        tpl_anime=?,tpl_category=?,tpl_episode=?,tpl_search=?,tpl_movie=?,tpl_cartoon=?,
        og_title=?,og_desc=?,tw_title=?,tw_desc=?,tw_card=?,
        schema_org=?,auto_meta=?,auto_sitemap=?,
        sitemap_freq=?,sitemap_priority=?,
        robots_index=?,robots_noindex=?,lang=?,updated_at=?
      WHERE id=1
    `).bind(
      row.site_title, row.site_desc, row.site_keywords, row.canonical, row.indexing,
      row.home_title, row.home_desc, row.home_keywords, row.home_og,
      row.tpl_anime, row.tpl_category, row.tpl_episode, row.tpl_search,
      row.tpl_movie, row.tpl_cartoon,
      row.og_title, row.og_desc, row.tw_title, row.tw_desc, row.tw_card,
      row.schema_org, row.auto_meta, row.auto_sitemap,
      row.sitemap_freq, row.sitemap_priority,
      row.robots_index, row.robots_noindex, row.lang, row.updated_at
    ).run()

    syncToReplicas(c.env, row)

    return c.json(success({ saved: true, updated_at: timestamp }))

  } catch (err) {
    console.error("seo POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /seo/reset
================================================ */

app.post("/seo/reset", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()
    await ensureRow(db)

    await db.prepare(`
      UPDATE seo_settings SET
        site_title=?,site_desc=?,site_keywords=?,canonical=?,indexing=?,
        home_title=?,home_desc=?,home_keywords=?,home_og=?,
        tpl_anime=?,tpl_category=?,tpl_episode=?,tpl_search=?,tpl_movie=?,tpl_cartoon=?,
        og_title=?,og_desc=?,tw_title=?,tw_desc=?,tw_card=?,
        schema_org=?,auto_meta=?,auto_sitemap=?,
        sitemap_freq=?,sitemap_priority=?,
        robots_index=?,robots_noindex=?,lang=?,updated_at=?
      WHERE id=1
    `).bind(
      DEFAULTS.site_title, DEFAULTS.site_desc, DEFAULTS.site_keywords,
      DEFAULTS.canonical, DEFAULTS.indexing,
      DEFAULTS.home_title, DEFAULTS.home_desc, DEFAULTS.home_keywords, DEFAULTS.home_og,
      DEFAULTS.tpl_anime, DEFAULTS.tpl_category, DEFAULTS.tpl_episode,
      DEFAULTS.tpl_search, DEFAULTS.tpl_movie, DEFAULTS.tpl_cartoon,
      DEFAULTS.og_title, DEFAULTS.og_desc,
      DEFAULTS.tw_title, DEFAULTS.tw_desc, DEFAULTS.tw_card,
      1, 1, 1,
      DEFAULTS.sitemap_freq, DEFAULTS.sitemap_priority,
      DEFAULTS.robots_index, DEFAULTS.robots_noindex,
      DEFAULTS.lang, timestamp
    ).run()

    return c.json(success({ reset: true, updated_at: timestamp }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /seo/auto-generate — AI Auto-generate SEO
   Loops all anime and generates meta from DB data
================================================ */

app.post("/seo/auto-generate", async (c) => {
  try {
    const db = c.env.DB

    /* Get SEO templates */
    const seoRow = await db.prepare("SELECT * FROM seo_settings WHERE id=1").first()

    /* Ensure seo_meta table exists */
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_meta (
        id         TEXT PRIMARY KEY,
        type       TEXT,
        meta_title TEXT,
        meta_desc  TEXT,
        keywords   TEXT,
        og_image   TEXT,
        schema_json TEXT,
        updated_at TEXT
      )
    `).run()

    const { results: animeList } = await db.prepare(`
      SELECT id,title,slug,type,status,description,genres,
             rating,year,poster,banner,language,duration
      FROM anime
      WHERE is_hidden=0
      ORDER BY created_at DESC
      LIMIT 200
    `).all()

    let generated = 0

    for (const anime of animeList) {
      const genres = (() => { try { return JSON.parse(anime.genres || "[]") } catch { return [] } })()
      const genreStr = genres.slice(0,3).join(", ")

      /* Generate title */
      const template = (anime.type === "movie")
        ? (seoRow?.tpl_movie    || DEFAULTS.tpl_movie)
        : (anime.type === "cartoon")
          ? (seoRow?.tpl_cartoon  || DEFAULTS.tpl_cartoon)
          : (seoRow?.tpl_anime    || DEFAULTS.tpl_anime)

      const metaTitle = template
        .replace("{title}",    anime.title)
        .replace("{type}",     anime.type)
        .replace("{year}",     anime.year || "")
        .replace("{status}",   anime.status)
        .slice(0, 65)

      /* Generate description */
      const baseDesc = anime.description?.trim()
        || `Watch ${anime.title} Hindi Dubbed online free in HD quality on AnimeHunt.`

      const metaDesc = (baseDesc.slice(0, 130) +
        ` Genre: ${genreStr || "Anime"}. Status: ${anime.status}. Rating: ${anime.rating || "N/A"}/10.`
      ).slice(0, 160)

      /* Generate keywords */
      const keywords = [
        anime.title,
        `${anime.title} hindi dubbed`,
        `${anime.title} watch online`,
        `${anime.title} download`,
        ...(genres.map(g => `${g} anime`)),
        "animehunt",
        "hindi dubbed anime"
      ].join(", ")

      /* Schema.org JSON-LD */
      const schema = JSON.stringify({
        "@context":    "https://schema.org",
        "@type":       anime.type === "movie" ? "Movie" : "TVSeries",
        "name":        anime.title,
        "description": baseDesc.slice(0, 200),
        "image":       anime.poster || anime.banner || "",
        "url":         `${seoRow?.canonical || DEFAULTS.canonical}/details.html?id=${anime.slug}`,
        "genre":       genres,
        "inLanguage":  "hi",
        "contentRating": "TV-PG",
        "aggregateRating": anime.rating ? {
          "@type":       "AggregateRating",
          "ratingValue": String(anime.rating),
          "bestRating":  "10",
          "worstRating": "1"
        } : undefined
      })

      await db.prepare(`
        INSERT OR REPLACE INTO seo_meta (id,type,meta_title,meta_desc,keywords,og_image,schema_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(
        anime.id, anime.type || "anime",
        metaTitle, metaDesc, keywords,
        anime.poster || anime.banner || "",
        schema, now()
      ).run()

      generated++
    }

    return c.json(success({ generated, total: animeList.length }))

  } catch (err) {
    console.error("seo auto-generate:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/sitemap — Generate XML Sitemap
================================================ */

app.get("/seo/sitemap", async (c) => {
  try {
    const db     = c.env.DB
    const seoRow = await db.prepare("SELECT * FROM seo_settings WHERE id=1").first()
    const base   = seoRow?.canonical || DEFAULTS.canonical
    const freq   = seoRow?.sitemap_freq || "daily"
    const prio   = seoRow?.sitemap_priority || "0.8"

    const { results: animeList } = await db.prepare(`
      SELECT slug, updated_at FROM anime
      WHERE is_hidden=0
      ORDER BY updated_at DESC
      LIMIT 1000
    `).all()

    const staticPages = [
      { url: "/",          priority: "1.0", freq: "daily" },
      { url: "/anime.html",    priority: "0.9", freq: "daily" },
      { url: "/movies.html",   priority: "0.9", freq: "daily" },
      { url: "/series.html",   priority: "0.9", freq: "weekly" },
      { url: "/cartoon.html",  priority: "0.9", freq: "weekly" }
    ]

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">`

    /* Static pages */
    for (const page of staticPages) {
      xml += `
  <url>
    <loc>${base}${page.url}</loc>
    <changefreq>${page.freq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    }

    /* Anime pages */
    for (const anime of animeList) {
      const lastmod = anime.updated_at
        ? anime.updated_at.slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      xml += `
  <url>
    <loc>${base}/details.html?id=${anime.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
  </url>`
    }

    xml += `\n</urlset>`

    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" }
    })

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/robots — Generate robots.txt
================================================ */

app.get("/seo/robots", async (c) => {
  try {
    const db     = c.env.DB
    const seoRow = await db.prepare("SELECT * FROM seo_settings WHERE id=1").first()
    const base   = seoRow?.canonical || DEFAULTS.canonical

    const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/admin/
Disallow: /login.html

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${base}/api/seo/sitemap
`

    return new Response(robots, {
      headers: { "Content-Type": "text/plain" }
    })

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/meta/:id — Get SEO meta for anime
================================================ */

app.get("/seo/meta/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const row = await db.prepare(
      "SELECT * FROM seo_meta WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(failure("SEO meta not found"), 404)

    return c.json(success({
      metaTitle:  row.meta_title,
      metaDesc:   row.meta_desc,
      keywords:   row.keywords,
      ogImage:    row.og_image,
      schemaJson: row.schema_json,
      updatedAt:  row.updated_at
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/stats — SEO stats
================================================ */

app.get("/seo/stats", async (c) => {
  try {
    const db = c.env.DB

    const total = await db.prepare("SELECT COUNT(*) as c FROM anime WHERE is_hidden=0").first()

    let metaCount = 0
    try {
      const m = await db.prepare("SELECT COUNT(*) as c FROM seo_meta").first()
      metaCount = m?.c || 0
    } catch { /* table might not exist yet */ }

    const seoRow = await db.prepare("SELECT updated_at,auto_meta,auto_sitemap FROM seo_settings WHERE id=1").first()

    return c.json(success({
      totalAnime:    total?.c     || 0,
      metaGenerated: metaCount,
      coverage:      total?.c ? Math.round((metaCount / total.c) * 100) : 0,
      autoMeta:      !!seoRow?.auto_meta,
      autoSitemap:   !!seoRow?.auto_sitemap,
      lastUpdated:   seoRow?.updated_at || "Never"
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
