/* ================================================
   ANIMEHUNT — SEO ADMIN (FINAL — ALL ISSUES FIXED)
   File: src/routes/seoAdmin.js
   Auth handled by adminAuth middleware in index.js

   BUGS FIXED:
   ✅ Bug #254: auto-generate loop → D1 batch()
   ✅ FIXED: auto-generate — ensureRow() called before query
   ✅ FIXED: auto-generate — c.req.query("offset") Hono style
              (was: new URL(c.req.url).searchParams — unreliable in Workers)
   ✅ FIXED: auto-generate — seoRow null-safe with DEFAULTS fallback
   ✅ FIXED: seo/sitemap/regenerate — KV list prefix correct
   ✅ FIXED: metaDesc undefined?.slice bug via safeDesc helper
   ✅ FIXED: schema JSON — aggregateRating undefined removed with filter
   ✅ FIXED: GET /seo/robots admin preview now reads system_settings.robots_txt
              override (was hardcoded, disagreed with what publicSEO.js actually serves)

   ROUTES:
   GET  /seo                   — Get settings
   POST /seo                   — Save settings
   POST /seo/reset             — Reset defaults
   POST /seo/auto-generate     — Batch SEO gen (FIXED)
   GET  /seo/sitemap           — Preview sitemap
   GET  /seo/robots            — Preview robots.txt
   GET  /seo/meta/:id          — Get SEO meta for anime
   GET  /seo/stats             — Coverage stats
   POST /seo/sitemap/regenerate — Clear sitemap KV cache
   POST /seo/robots/update     — Update custom robots.txt
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()

/* ================================================
   DEFAULTS
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
  tpl_search:        'Search "{query}" – Hindi Dubbed Anime | AnimeHunt',
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
  lang:              "hi-IN"
}

/* ================================================
   HELPER — safe description (no "undefined..." bug)
================================================ */

function safeDesc(desc, title, maxLen = 155) {
  if (desc && desc.trim()) {
    const s = desc.trim()
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s
  }
  return `Watch ${title} Hindi Dubbed online free in HD quality on AnimeHunt.`
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
        DEFAULTS.canonical,  DEFAULTS.indexing,
        DEFAULTS.home_title, DEFAULTS.home_desc, DEFAULTS.home_keywords, DEFAULTS.home_og,
        DEFAULTS.tpl_anime,  DEFAULTS.tpl_category, DEFAULTS.tpl_episode,
        DEFAULTS.tpl_search, DEFAULTS.tpl_movie,    DEFAULTS.tpl_cartoon,
        DEFAULTS.og_title,   DEFAULTS.og_desc,
        DEFAULTS.tw_title,   DEFAULTS.tw_desc,       DEFAULTS.tw_card,
        DEFAULTS.schema_org, DEFAULTS.auto_meta,     DEFAULTS.auto_sitemap,
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
      title:     r.site_title    || DEFAULTS.site_title,
      desc:      r.site_desc     || DEFAULTS.site_desc,
      keywords:  r.site_keywords || DEFAULTS.site_keywords,
      canonical: r.canonical     || DEFAULTS.canonical,
      indexing:  r.indexing      || "index",
      lang:      r.lang          || "hi-IN"
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
      ogTitle: r.og_title || DEFAULTS.og_title,
      ogDesc:  r.og_desc  || DEFAULTS.og_desc,
      twTitle: r.tw_title || DEFAULTS.tw_title,
      twDesc:  r.tw_desc  || DEFAULTS.tw_desc,
      twCard:  r.tw_card  || "summary_large_image"
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
   SYNC TO REPLICAS (non-blocking)
================================================ */

function syncToReplicas(env, row) {
  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
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
              row.site_title, row.site_desc, row.site_keywords, row.canonical, row.indexing,
              row.home_title, row.home_desc, row.home_keywords, row.home_og,
              row.tpl_anime, row.tpl_category, row.tpl_episode,
              row.tpl_search, row.tpl_movie, row.tpl_cartoon,
              row.og_title, row.og_desc, row.tw_title, row.tw_desc, row.tw_card,
              row.schema_org, row.auto_meta, row.auto_sitemap,
              row.sitemap_freq, row.sitemap_priority,
              row.robots_index, row.robots_noindex, row.lang, row.updated_at
            ].map(v => ({
              type:  typeof v === "number" ? "integer" : "text",
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

    if (!body.global?.title?.trim()) {
      return c.json(failure("Site title required"), 400)
    }

    const timestamp = now()
    const row = {
      site_title:       body.global?.title?.trim()     || DEFAULTS.site_title,
      site_desc:        body.global?.desc?.trim()      || DEFAULTS.site_desc,
      site_keywords:    body.global?.keywords?.trim()  || DEFAULTS.site_keywords,
      canonical:        (body.global?.canonical?.trim() || DEFAULTS.canonical).replace(/\/$/, ""),
      indexing:         body.global?.indexing           || "index",
      home_title:       body.home?.title?.trim()        || DEFAULTS.home_title,
      home_desc:        body.home?.desc?.trim()         || DEFAULTS.home_desc,
      home_keywords:    body.home?.keywords?.trim()     || DEFAULTS.home_keywords,
      home_og:          body.home?.og?.trim()           || "",
      tpl_anime:        body.templates?.anime    || DEFAULTS.tpl_anime,
      tpl_category:     body.templates?.category || DEFAULTS.tpl_category,
      tpl_episode:      body.templates?.episode  || DEFAULTS.tpl_episode,
      tpl_search:       body.templates?.search   || DEFAULTS.tpl_search,
      tpl_movie:        body.templates?.movie    || DEFAULTS.tpl_movie,
      tpl_cartoon:      body.templates?.cartoon  || DEFAULTS.tpl_cartoon,
      og_title:         body.social?.ogTitle     || DEFAULTS.og_title,
      og_desc:          body.social?.ogDesc      || DEFAULTS.og_desc,
      tw_title:         body.social?.twTitle     || DEFAULTS.tw_title,
      tw_desc:          body.social?.twDesc      || DEFAULTS.tw_desc,
      tw_card:          body.social?.twCard      || "summary_large_image",
      schema_org:       body.automation?.schemaOrg    !== false ? 1 : 0,
      auto_meta:        body.automation?.autoMeta     !== false ? 1 : 0,
      auto_sitemap:     body.automation?.autoSitemap  !== false ? 1 : 0,
      sitemap_freq:     body.automation?.sitemapFreq      || "daily",
      sitemap_priority: body.automation?.sitemapPriority  || "0.8",
      robots_index:     body.automation?.robotsIndex      || "index, follow",
      robots_noindex:   body.automation?.robotsNoindex    || "noindex, nofollow",
      lang:             body.global?.lang  || "hi-IN",
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

    // Invalidate sitemap + robots KV cache
    if (c.env.KV) {
      await Promise.all([
        c.env.KV.delete("seo:robots").catch(() => {}),
        c.env.KV.delete("seo:sitemap-index").catch(() => {})
      ])
    }

    syncToReplicas(c.env, row)
    return c.json(success({ saved: true, updated_at: timestamp }))
  } catch (err) {
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
      DEFAULTS.canonical,  DEFAULTS.indexing,
      DEFAULTS.home_title, DEFAULTS.home_desc, DEFAULTS.home_keywords, DEFAULTS.home_og,
      DEFAULTS.tpl_anime,  DEFAULTS.tpl_category, DEFAULTS.tpl_episode,
      DEFAULTS.tpl_search, DEFAULTS.tpl_movie,    DEFAULTS.tpl_cartoon,
      DEFAULTS.og_title,   DEFAULTS.og_desc,
      DEFAULTS.tw_title,   DEFAULTS.tw_desc, DEFAULTS.tw_card,
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
   POST /seo/auto-generate — Batch SEO meta generation
   FIXED: c.req.query("offset") — Hono native style
   FIXED: ensureRow() called first
   FIXED: seoRow null-safe (uses DEFAULTS fallback)
   FIXED: safeDesc prevents "undefined..." metaDesc bug
   FIXED: schema aggregateRating undefined removed cleanly
   Processes 20 per call; client calls with nextOffset
================================================ */

app.post("/seo/auto-generate", async (c) => {
  try {
    const db    = c.env.DB
    const BATCH = 20
    // FIXED: Hono way to get query param + NaN-safe parseInt
    const rawOffset = parseInt(c.req.query("offset") || "0")
    const offset    = (isNaN(rawOffset) || rawOffset < 0) ? 0 : rawOffset

    // FIXED: ensureRow before querying seo_settings
    await ensureRow(db)

    // Ensure seo_meta table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS seo_meta (
        id          TEXT PRIMARY KEY,
        type        TEXT,
        meta_title  TEXT,
        meta_desc   TEXT,
        keywords    TEXT,
        og_image    TEXT,
        schema_json TEXT,
        updated_at  TEXT
      )
    `).run()

    // FIXED: seoRow guaranteed non-null (ensureRow above ensures row exists)
    const seoRow = await db.prepare("SELECT * FROM seo_settings WHERE id=1").first()
    const base   = (seoRow?.canonical || DEFAULTS.canonical).replace(/\/$/, "")

    const { results: animeList } = await db.prepare(`
      SELECT id, title, slug, type, status, description, genres,
             rating, year, poster, banner, language
      FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(BATCH, offset).all()

    if (!animeList.length) {
      return c.json(success({
        done:      true,
        processed: 0,
        message:   "All anime SEO generated"
      }))
    }

    const timestamp = now()

    const statements = animeList.map(anime => {
      let genres = []
      try { genres = JSON.parse(anime.genres || "[]") } catch {}
      const genreStr = genres.slice(0, 3).join(", ")

      // FIXED: seoRow null-safe — uses DEFAULTS if seoRow field is null
      const template = anime.type === "movie"
        ? (seoRow?.tpl_movie   || DEFAULTS.tpl_movie)
        : anime.type === "cartoon"
          ? (seoRow?.tpl_cartoon || DEFAULTS.tpl_cartoon)
          : (seoRow?.tpl_anime   || DEFAULTS.tpl_anime)

      const metaTitle = template
        .replace("{title}",  anime.title  || "")
        .replace("{type}",   anime.type   || "")
        .replace("{year}",   String(anime.year  || ""))
        .replace("{status}", anime.status || "")
        .slice(0, 65)

      // FIXED: safeDesc — no more "undefined..." metaDesc bug
      const metaDesc = safeDesc(anime.description, anime.title, 130) +
        ` Genre: ${genreStr || "Anime"}. Rating: ${anime.rating || "N/A"}/10.`

      const keywords = [
        anime.title,
        `${anime.title || ""} hindi dubbed`,
        `${anime.title || ""} watch online`,
        `${anime.title || ""} download`,
        ...genres.map(g => `${g} anime`),
        "animehunt",
        "hindi dubbed anime"
      ].filter(Boolean).join(", ")

      // FIXED: aggregateRating undefined cleaned — use null check, not undefined key
      const schemaObj = {
        "@context":   "https://schema.org",
        "@type":      anime.type === "movie" ? "Movie" : "TVSeries",
        "name":       anime.title || "",
        "description": safeDesc(anime.description, anime.title, 200),
        "image":      anime.poster || anime.banner || "",
        "url":        `${base}/details.html?id=${anime.slug}`,
        "genre":      genres,
        "inLanguage": "hi"
      }

      if (anime.rating) {
        schemaObj.aggregateRating = {
          "@type":       "AggregateRating",
          "ratingValue": String(anime.rating),
          "bestRating":  "10",
          "worstRating": "1"
        }
      }

      if (anime.year) schemaObj.dateCreated = String(anime.year)

      return db.prepare(`
        INSERT OR REPLACE INTO seo_meta
          (id, type, meta_title, meta_desc, keywords, og_image, schema_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        String(anime.id),
        anime.type || "anime",
        metaTitle,
        metaDesc.slice(0, 160),
        keywords,
        anime.poster || anime.banner || "",
        JSON.stringify(schemaObj),
        timestamp
      )
    })

    // D1 batch — one round-trip, no sequential await
    await db.batch(statements)

    const nextOffset = offset + BATCH

    return c.json(success({
      done:       false,
      processed:  animeList.length,
      nextOffset,
      message:    `Processed ${animeList.length} anime. Call again with ?offset=${nextOffset}`
    }))

  } catch (err) {
    console.error("seo auto-generate:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/sitemap — Admin preview (LIMIT 1000)
================================================ */

app.get("/seo/sitemap", async (c) => {
  try {
    const db     = c.env.DB
    await ensureRow(db)
    const seoRow = await db.prepare("SELECT * FROM seo_settings WHERE id=1").first()
    const base   = (seoRow?.canonical     || DEFAULTS.canonical).replace(/\/$/, "")
    const freq   = seoRow?.sitemap_freq   || "daily"
    const prio   = seoRow?.sitemap_priority || "0.8"
    const today  = new Date().toISOString().slice(0, 10)

    const { results: animeList } = await db.prepare(`
      SELECT slug, updated_at FROM anime
      WHERE is_hidden=0 AND active=1
      ORDER BY updated_at DESC
      LIMIT 1000
    `).all()

    const statics = [
      { url: "/",           priority: "1.0", freq: "daily"  },
      { url: "/anime.html", priority: "0.9", freq: "daily"  },
      { url: "/movies.html",priority: "0.9", freq: "daily"  },
      { url: "/series.html",priority: "0.9", freq: "weekly" },
      { url: "/cartoon.html",priority:"0.9", freq: "weekly" }
    ]

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`

    for (const s of statics) {
      xml += `
  <url>
    <loc>${base}${s.url}</loc>
    <changefreq>${s.freq}</changefreq>
    <priority>${s.priority}</priority>
  </url>`
    }

    for (const anime of animeList) {
      const lastmod = anime.updated_at?.slice(0, 10) || today
      xml += `
  <url>
    <loc>${base}/details.html?id=${anime.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${prio}</priority>
  </url>`
    }

    xml += "\n</urlset>"

    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" }
    })
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/robots — Admin preview
================================================ */

app.get("/seo/robots", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)

    // Read custom robots.txt if one was saved via /seo/robots/update.
    // This mirrors exactly what publicSEO.js's public /robots.txt serves,
    // so the admin preview never disagrees with what crawlers actually see.
    // MIGRATION FIX: this used to CREATE TABLE system_settings with a
    // key/value shape, which conflicts with routes/system.js's own
    // CREATE TABLE for the SAME table name (a single wide row, id=1) —
    // whichever ran first would win and the other would break with "no
    // such column" errors. Removed the conflicting CREATE TABLE here;
    // system.js already owns creating this table.
    let custom = null
    try {
      const setting = await db.prepare(
        "SELECT robots_txt FROM system_settings WHERE id=1"
      ).first()
      if (setting?.robots_txt?.trim()) custom = setting.robots_txt.trim()
    } catch {}

    if (custom) {
      return new Response(custom, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      })
    }

    const seoRow = await db.prepare("SELECT canonical FROM seo_settings WHERE id=1").first()
    const base   = (seoRow?.canonical || DEFAULTS.canonical).replace(/\/$/, "")

    const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/admin/
Disallow: /login.html
Disallow: /api/go

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${base}/sitemap-index.xml`

    return new Response(robots, {
      headers: { "Content-Type": "text/plain" }
    })
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/meta/:id
================================================ */

app.get("/seo/meta/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT * FROM seo_meta WHERE id=?").bind(id).first()

    if (!row) return c.json(failure("SEO meta not found"), 404)

    return c.json(success({
      metaTitle:  row.meta_title  || "",
      metaDesc:   row.meta_desc   || "",
      keywords:   row.keywords    || "",
      ogImage:    row.og_image    || "",
      schemaJson: row.schema_json || null,
      updatedAt:  row.updated_at
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /seo/stats
================================================ */

app.get("/seo/stats", async (c) => {
  try {
    const db = c.env.DB

    const [totalRow, seoRow] = await Promise.all([
      db.prepare("SELECT COUNT(*) as c FROM anime WHERE is_hidden=0 AND active=1").first(),
      db.prepare("SELECT updated_at,auto_meta,auto_sitemap FROM seo_settings WHERE id=1").first().catch(() => null)
    ])

    let metaCount = 0
    try {
      const m = await db.prepare("SELECT COUNT(*) as c FROM seo_meta").first()
      metaCount = m?.c || 0
    } catch {}

    const total    = totalRow?.c || 0
    const coverage = total ? Math.round((metaCount / total) * 100) : 0

    return c.json(success({
      totalAnime:    total,
      metaGenerated: metaCount,
      coverage,
      autoMeta:      !!seoRow?.auto_meta,
      autoSitemap:   !!seoRow?.auto_sitemap,
      lastUpdated:   seoRow?.updated_at || "Never"
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /seo/sitemap/regenerate — Clear sitemap KV cache
   FIXED: KV list prefix correct ("seo:sitemap" covers all pages)
================================================ */

app.post("/seo/sitemap/regenerate", async (c) => {
  try {
    if (!c.env.KV) {
      return c.json(success({ cleared: 0, message: "KV not configured" }))
    }

    // FIXED: list with prefix to get all sitemap cache keys
    const { keys } = await c.env.KV.list({ prefix: "seo:sitemap" })
    const deletes  = keys.map(k => c.env.KV.delete(k.name).catch(() => {}))
    await Promise.all(deletes)

    // Also clear robots cache
    await c.env.KV.delete("seo:robots").catch(() => {})

    return c.json(success({
      cleared: keys.length,
      message: `Cleared ${keys.length} sitemap cache entries + robots`
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /seo/robots/update — Save custom robots.txt
================================================ */

app.post("/seo/robots/update", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    if (!body.content?.trim()) {
      return c.json(failure("content required"), 400)
    }

    // MIGRATION FIX: same collision as the GET handler above — this used
    // to CREATE TABLE + INSERT OR REPLACE against a key/value shape that
    // conflicts with system.js's own CREATE TABLE for the same name.
    // system.js already guarantees a row with id=1 exists (ensureRow-style
    // init on that router), so this is now a plain UPDATE.
    await db.prepare(`
      UPDATE system_settings SET robots_txt = ?, updated_at = ? WHERE id = 1
    `).bind(body.content.trim(), now()).run()

    if (c.env.KV) {
      await c.env.KV.delete("seo:robots").catch(() => {})
    }

    return c.json(success({ saved: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
