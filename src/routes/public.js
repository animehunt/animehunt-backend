/* ============================================================
  ANIMEHUNT — PUBLIC ROUTES (FINAL — ALL ISSUES FIXED)
  File: src/routes/public.js

  BUGS FIXED:
  ✅ FIXED: /api/search REMOVED — now ONLY in publicSearch.js
  ✅ FIXED: /api/search/popular REMOVED — now ONLY in publicSearch.js
            (duplicate route conflict between public.js + publicSearch.js eliminated)
  ✅ FIXED: /api/footer/public returns raw DB row — now uses format() helper
  ✅ FIXED: /api/anime/:slug — tags safeJSON already applied before KV cache store,
            no double-parse when fetching from cache
  ✅ FIXED: /api/public/servers/:episodeId now queries servers.episode_id
            (column added in adminServers schema) before falling back to
            episodes.servers JSON column
  ✅ KV cache on all high-traffic routes
  ✅ Parallel DB queries via Promise.all

  IMPORTANT: In your index.js / worker.js mount order must be:
    router.use(publicSearchRoutes)  ← register first (handles /api/search/*)
    router.use(publicRoutes)        ← register after

  ROUTES:
  GET /api/anime/home              — is_home=1 anime
  GET /api/anime/featured          — is_banner=1 anime (hero)
  GET /api/anime                   — Paginated + filtered list
  GET /api/anime/:slug             — Full detail + view count
  GET /api/public/episodes/:animeId
  GET /api/public/seasons/:animeId
  GET /api/public/servers/:episodeId
  GET /api/categories/public
  GET /api/categories/home
  GET /api/banners/public
  GET /api/homepage/public
  GET /api/footer/public           — Formatted (FIXED)
  GET /api/sidebar/public
  GET /api/player/public
  GET /api/performance/public
  GET /api/system/health
  ⛔ /api/seo/meta/:animeId — REMOVED (handled by publicSEO.js — register that first)
  ⛔ /api/search         — REMOVED (in publicSearch.js)
  ⛔ /api/search/popular — REMOVED (in publicSearch.js)
============================================================ */

import { Hono } from "hono"

const app = new Hono()

const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })

function toInt(v, def=1)  { const n = parseInt(v); return isNaN(n) ? def : n }
function safeJSON(v, fb=[]) { try { return JSON.parse(v || "[]") } catch { return fb } }

/* ============================================================
  HELPER — Format footer_config row for API response
  FIXED: was returning raw DB row without formatting
============================================================ */

function formatFooter(r) {
  if (!r || !r.id) return null

  let customLinks = []
  try { customLinks = JSON.parse(r.customLinks || "[]") } catch {}

  return {
    footer: {
      on:    r.footerOn  !== undefined ? !!r.footerOn  : true,
      lazy:  !!r.footerLazy,
      blur:  !!r.footerBlur,
      lock:  !!r.footerLock,
      theme: r.footerTheme || "Dark",
      text:  r.footerText  || "© 2026 AnimeHunt. All Rights Reserved."
    },
    links: {
      about:      r.about      !== undefined ? !!r.about      : true,
      privacy:    r.privacy    !== undefined ? !!r.privacy    : true,
      disclaimer: r.disclaimer !== undefined ? !!r.disclaimer : true,
      dmca:       r.dmca       !== undefined ? !!r.dmca       : true,
      telegram:   r.telegram   !== undefined ? !!r.telegram   : true,
      badges:     !!r.linkBadges,
      custom:     customLinks
    },
    social: {
      telegram:  r.socialTelegram  || "",
      twitter:   r.socialTwitter   || "",
      youtube:   r.socialYoutube   || "",
      instagram: r.socialInstagram || ""
    },
    az: {
      on:      r.azOn      !== undefined ? !!r.azOn      : true,
      auto:    r.azAuto    !== undefined ? !!r.azAuto    : true,
      sticky:  !!r.azSticky,
      compact: !!r.azCompact,
      mode:    r.azMode || "Scroll"
    },
    mobile: {
      nav:        r.mobileNav        !== undefined ? !!r.mobileNav        : true,
      float:      !!r.mobileFloat,
      blur:       !!r.mobileBlur,
      hideScroll: r.mobileHideScroll !== undefined ? !!r.mobileHideScroll : true
    },
    promo: {
      on:       !!r.promoOn,
      text:     r.promoText     || "",
      link:     r.promoLink     || "",
      autoHide: !!r.promoAutoHide,
      bg:       r.promoBg       || "#ffcc00",
      color:    r.promoColor    || "#000000"
    },
    updated_at: r.updated_at
  }
}

/* ============================================================
  NOTE: /api/anime/home and /api/anime/featured
  MUST be registered BEFORE /api/anime/:slug
  Hono matches routes in registration order
============================================================ */

app.get("/api/anime/home", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:home", "json").catch(() => null)
      if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })
    }

    const { results } = await c.env.DB.prepare(`
      SELECT id, title, slug, type, status, poster, banner, rating, year, genres, language, duration
      FROM anime
      WHERE is_home=1 AND is_hidden=0 AND active=1
      ORDER BY rating DESC
      LIMIT 30
    `).all()

    const data = results.map(a => ({ ...a, genres: safeJSON(a.genres) }))

    if (c.env.KV) {
      await c.env.KV.put("public:home", JSON.stringify(data), {
        expirationTtl: 120
      }).catch(() => {})
    }

    return c.json(ok(data), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

app.get("/api/anime/featured", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:featured", "json").catch(() => null)
      if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })
    }

    const { results } = await c.env.DB.prepare(`
      SELECT id, title, slug, type, status, poster, banner, rating, year, genres, description, language
      FROM anime
      WHERE is_banner=1 AND is_hidden=0 AND active=1
      ORDER BY rating DESC
      LIMIT 10
    `).all()

    const data = results.map(a => ({ ...a, genres: safeJSON(a.genres) }))

    if (c.env.KV) {
      await c.env.KV.put("public:featured", JSON.stringify(data), {
        expirationTtl: 120
      }).catch(() => {})
    }

    return c.json(ok(data), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/anime — Paginated list with filters
============================================================ */

app.get("/api/anime", async (c) => {
  const db     = c.env.DB
  const qp     = c.req.query
  const page   = Math.max(1, toInt(qp("page"), 1))
  const limit  = Math.min(50, Math.max(1, toInt(qp("limit"), 20)))
  const offset = (page - 1) * limit
  const type   = qp("type")   || ""
  const status = qp("status") || ""
  const genre  = qp("genre")  || ""
  const search = qp("search") || qp("q") || ""
  const sort   = qp("sort")   || "latest"

  const where = ["is_hidden=0", "active=1"]
  const binds = []

  if (type)   { where.push("type=?");                          binds.push(type) }
  if (status) { where.push("status=?");                        binds.push(status) }
  if (genre)  { where.push("genres LIKE ?");                   binds.push(`%${genre}%`) }
  if (search) { where.push("(title LIKE ? OR genres LIKE ?)"); binds.push(`%${search}%`, `%${search}%`) }

  const orderMap = {
    latest:  "created_at DESC",
    rating:  "rating DESC",
    title:   "title ASC",
    year:    "year DESC",
    oldest:  "created_at ASC"
  }
  const orderBy  = orderMap[sort] || "created_at DESC"
  const whereSQL = where.join(" AND ")

  try {
    const [countRow, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as total FROM anime WHERE ${whereSQL}`).bind(...binds).first(),
      db.prepare(`
        SELECT id, title, slug, type, status, poster, rating, year,
               genres, language, duration, season_count, episode_count
        FROM anime
        WHERE ${whereSQL}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).bind(...binds, limit, offset).all()
    ])

    return c.json(ok({
      page, limit,
      total: countRow?.total || 0,
      data:  rows.results.map(a => ({ ...a, genres: safeJSON(a.genres) }))
    }))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/anime/:slug — Full detail
  FIXED: genres + tags parsed before KV store — no double-parse on HIT
  View count incremented async (non-blocking)
  KV cached 10 min
============================================================ */

app.get("/api/anime/:slug", async (c) => {
  const db   = c.env.DB
  const slug = c.req.param("slug")

  try {
    const cacheKey = `public:anime:${slug}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) {
        // Increment view async — don't block response
        if (cached.id) {
          db.prepare("UPDATE anime SET views=COALESCE(views,0)+1 WHERE id=?")
            .bind(cached.id).run().catch(() => {})
        }
        return c.json(ok(cached), 200, { "X-Cache": "HIT" })
      }
    }

    const anime = await db.prepare(`
      SELECT id, title, slug, type, status, poster, banner, rating, year,
             genres, tags, description, language, duration, ageRating,
             season_count, episode_count, studio,
             is_trending, is_home, is_banner, featured, views,
             created_at, updated_at
      FROM anime
      WHERE slug=? AND is_hidden=0 AND active=1
      LIMIT 1
    `).bind(slug).first()

    if (!anime) return c.json(fail("Anime not found"), 404)

    // FIXED: parse genres + tags BEFORE storing to KV
    // So cached data already has arrays — no double-parse on HIT
    const data = {
      ...anime,
      genres: safeJSON(anime.genres),
      tags:   safeJSON(anime.tags)
    }

    // Increment view count async
    db.prepare("UPDATE anime SET views=COALESCE(views,0)+1 WHERE id=?")
      .bind(anime.id).run().catch(() => {})

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(data), {
        expirationTtl: 600
      }).catch(() => {})
    }

    return c.json(ok(data), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/public/episodes/:animeId
============================================================ */

app.get("/api/public/episodes/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")
  const season  = c.req.query("season") || ""

  try {
    const anime = await db.prepare(
      "SELECT id FROM anime WHERE id=? OR slug=? LIMIT 1"
    ).bind(animeId, animeId).first()
    const aId = anime?.id || animeId

    let sql   = `
      SELECT id, anime_id, season, episode, title, thumbnail, description, servers, sort_order
      FROM episodes
      WHERE anime_id=?`
    const binds = [aId]

    if (season) { sql += " AND season=?"; binds.push(season) }
    sql += " ORDER BY CAST(season AS INTEGER) ASC, CAST(episode AS INTEGER) ASC"

    const { results } = await db.prepare(sql).bind(...binds).all()
    return c.json(ok(results.map(ep => ({ ...ep, servers: safeJSON(ep.servers) }))))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/public/seasons/:animeId
============================================================ */

app.get("/api/public/seasons/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    const anime = await db.prepare(
      "SELECT id FROM anime WHERE id=? OR slug=? LIMIT 1"
    ).bind(animeId, animeId).first()
    const aId = anime?.id || animeId

    const { results } = await db.prepare(`
      SELECT DISTINCT CAST(season AS INTEGER) as season
      FROM episodes
      WHERE anime_id=?
      ORDER BY season ASC
    `).bind(aId).all()

    return c.json(ok(results.map(r => r.season).filter(s => s > 0)))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/public/servers/:episodeId
  FIXED: dedicated servers table now filters on episode_id column
  (added to servers schema) instead of a non-existent column
============================================================ */

app.get("/api/public/servers/:episodeId", async (c) => {
  const db        = c.env.DB
  const episodeId = c.req.param("episodeId")

  try {
    // Try dedicated servers table first
    const { results: serverRows } = await db.prepare(`
      SELECT id, name, embed, type, priority
      FROM servers
      WHERE episode_id=? AND active=1
      ORDER BY priority ASC
    `).bind(episodeId).all().catch(() => ({ results: [] }))

    if (serverRows.length) return c.json(ok(serverRows))

    // Fallback: servers JSON stored in episodes.servers column
    const ep = await db.prepare("SELECT servers FROM episodes WHERE id=? LIMIT 1")
      .bind(episodeId).first()
    if (!ep) return c.json(ok([]))

    const servers = safeJSON(ep.servers)
    if (!servers.length) return c.json(ok([]))

    const normalized = servers.map((s, i) => {
      if (typeof s === "string") {
        return { id: `s${i}`, name: `Server ${i+1}`, embed: s, type: "iframe", priority: i }
      }
      return {
        id:       s.id       || `s${i}`,
        name:     s.name     || `Server ${i+1}`,
        embed:    s.embed    || s.url || "",
        type:     s.type     || "iframe",
        priority: s.priority !== undefined ? s.priority : i
      }
    })

    return c.json(ok(normalized))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/categories/public — KV cached 10 min
============================================================ */

app.get("/api/categories/public", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:categories", "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    // ✅ FIX (audit ISSUE-030): icon/color are not real columns on
    // categories (confirmed against schema.sql) — this query always threw
    // "no such column: icon", caught by the try/catch below and returned
    // as a 500, meaning this endpoint never actually worked. categories.html
    // (the only admin UI for this table) has no icon/color fields anywhere,
    // confirming these were never a real feature — removed rather than added
    // to the schema.
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, slug, category_order
      FROM categories
      WHERE active=1
      ORDER BY category_order ASC, priority DESC
    `).all()

    if (c.env.KV) {
      await c.env.KV.put("public:categories", JSON.stringify(results), {
        expirationTtl: 600
      }).catch(() => {})
    }

    return c.json(ok(results))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

app.get("/api/categories/home", async (c) => {
  try {
    // ✅ FIX (audit ISSUE-030): same icon/color removal as above.
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, slug, category_order
      FROM categories
      WHERE active=1 AND show_home=1
      ORDER BY category_order ASC
    `).all()
    return c.json(ok(results))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/banners/public — KV cached 5 min
============================================================ */

app.get("/api/banners/public", async (c) => {
  const db       = c.env.DB
  const page     = c.req.query("page")     || "all"
  const position = c.req.query("position") || ""

  try {
    const cacheKey = `public:banners:${page}:${position}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    let query = `SELECT id, title, subtitle, image, link, banner_order, page, position FROM banners WHERE active=1`
    const bind = []

    if (page && page !== "all") { query += ` AND (page=? OR page='all')`; bind.push(page) }
    if (position)               { query += ` AND (position=? OR position='all')`; bind.push(position) }
    query += " ORDER BY banner_order ASC LIMIT 10"

    const { results } = await db.prepare(query).bind(...bind).all()

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(results), {
        expirationTtl: 300
      }).catch(() => {})
    }

    return c.json(ok(results))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/homepage/public — KV cached 2 min
  Parallel row population via Promise.all
============================================================ */

app.get("/api/homepage/public", async (c) => {
  const db = c.env.DB

  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:homepage", "json").catch(() => null)
      if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })
    }

    const { results: rows } = await db.prepare(`
      SELECT id, title, type, source, layout, row_limit, row_order,
             icon, bgColor, showMore, moreLink
      FROM homepage_rows
      WHERE active=1
      ORDER BY row_order ASC
    `).all()

    const populated = await Promise.all(rows.map(async (row) => {
      const limit = row.row_limit || 20
      let items = []

      try {
        const typeQueries = {
          trending:  `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE is_trending=1 AND is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ?`,
          ongoing:   `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE status='ongoing' AND is_hidden=0 AND active=1 ORDER BY updated_at DESC LIMIT ?`,
          movies:    `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE type='movie' AND is_hidden=0 AND active=1 ORDER BY year DESC LIMIT ?`,
          cartoon:   `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE type='cartoon' AND is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ?`,
          top_rated: `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ?`,
          completed: `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE status='completed' AND is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ?`,
          series:    `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE type='series' AND is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ?`
        }

        if (typeQueries[row.type]) {
          const { results } = await db.prepare(typeQueries[row.type]).bind(limit).all()
          items = results
        } else if (row.type === "genre" && row.source) {
          const { results } = await db.prepare(
            `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE genres LIKE ? AND is_hidden=0 AND active=1 ORDER BY rating DESC LIMIT ?`
          ).bind(`%${row.source}%`, limit).all()
          items = results
        } else {
          // default / auto / manual
          const { results } = await db.prepare(
            `SELECT id,title,slug,poster,rating,year,type,status FROM anime WHERE is_hidden=0 AND active=1 ORDER BY created_at DESC LIMIT ?`
          ).bind(limit).all()
          items = results
        }
      } catch { items = [] }

      return { ...row, items }
    }))

    if (c.env.KV) {
      await c.env.KV.put("public:homepage", JSON.stringify(populated), {
        expirationTtl: 120
      }).catch(() => {})
    }

    return c.json(ok(populated), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/footer/public
  FIXED: was returning raw DB row, now uses formatFooter()
  KV cached 10 min
============================================================ */

app.get("/api/footer/public", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:footer", "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    const row  = await c.env.DB.prepare("SELECT * FROM footer_config WHERE id=1").first()
    // FIXED: format the row, not raw db object
    const data = row ? formatFooter(row) : null

    if (c.env.KV && data) {
      await c.env.KV.put("public:footer", JSON.stringify(data), {
        expirationTtl: 600
      }).catch(() => {})
    }

    return c.json(ok(data))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/sidebar/public — KV cached 5 min
============================================================ */

app.get("/api/sidebar/public", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:sidebar", "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    const { results } = await c.env.DB.prepare(`
      SELECT id, title, icon, url, highlight, badge, newTab, device, priority
      FROM sidebar
      WHERE active=1
      ORDER BY priority ASC
    `).all()

    if (c.env.KV) {
      await c.env.KV.put("public:sidebar", JSON.stringify(results), {
        expirationTtl: 300
      }).catch(() => {})
    }

    return c.json(ok(results))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/player/public — KV cached 10 min
============================================================ */

app.get("/api/player/public", async (c) => {
  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:player", "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    const row = await c.env.DB.prepare("SELECT * FROM player_settings WHERE id=1").first()
    const data = row || {
      autoplay:          1,
      auto_next:         1,
      auto_next_delay:   5,
      skip_intro:        0,
      seek_seconds:      10,
      subtitle_enabled:  1,
      default_server:    "Server 1",
      show_download_btn: 1
    }

    if (c.env.KV) {
      await c.env.KV.put("public:player", JSON.stringify(data), {
        expirationTtl: 600
      }).catch(() => {})
    }

    return c.json(ok(data))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/performance/public
============================================================ */

app.get("/api/performance/public", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT * FROM performance_settings WHERE id=1").first()
    return c.json(ok(row || {
      lazyLoad:    1,
      smartCache:  1,
      imgOptimize: 1,
      cacheTTL:    3600,
      imgQuality:  80
    }))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  /api/seo/meta/:animeId — REMOVED FROM HERE
  publicSEO.js handles this route (full OG meta + schema + KV cache)
  Having it here AND in publicSEO.js causes duplicate route conflict.
  publicSEO.js must be registered BEFORE this file in index.js.
============================================================ */

/* ============================================================
  GET /api/system/health
============================================================ */

app.get("/api/system/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first()
    return c.json(ok({ status: "ok", db: "connected", ts: new Date().toISOString() }))
  } catch (err) {
    return c.json(fail("DB error"), 500)
  }
})

/* ============================================================
  ⛔ /api/search        — REMOVED (now only in publicSearch.js)
  ⛔ /api/search/popular — REMOVED (now only in publicSearch.js)
  These were causing duplicate route conflicts.
  publicSearch.js must be registered BEFORE this file in index.js
============================================================ */

export default app
