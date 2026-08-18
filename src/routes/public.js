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

app.get("/anime/home", async (c) => {
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

app.get("/anime/featured", async (c) => {
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

app.get("/anime", async (c) => {
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

app.get("/anime/:slug", async (c) => {
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

app.get("/public/episodes/:animeId", async (c) => {
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

app.get("/public/seasons/:animeId", async (c) => {
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

app.get("/public/servers/:episodeId", async (c) => {
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

app.get("/categories/public", async (c) => {
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

app.get("/categories/home", async (c) => {
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

app.get("/banners/public", async (c) => {
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

app.get("/homepage/public", async (c) => {
  const db = c.env.DB

  try {
    if (c.env.KV) {
      const cached = await c.env.KV.get("public:homepage", "json").catch(() => null)
      if (cached) return c.json(ok(cached), 200, { "X-Cache": "HIT" })
    }

    // ✅ FIX (audit): this SELECT used to reference showMore/moreLink/
    // bgColor directly — homepage_rows' real schema columns are
    // show_more/more_link/bg_color (snake_case; confirmed against
    // schema.sql and homepage.js's own CREATE TABLE), so this query
    // failed with "no such column: showMore" on every single request —
    // GET /api/homepage/public, the route the public homepage actually
    // calls to render its rows, was completely broken (500 on every
    // hit). Using AS aliases keeps the snake_case columns the schema
    // actually has while still returning the camelCase shape this
    // route's own `{...row, items}` spread below sends straight to
    // the frontend, matching what homepage.js's admin-side format()
    // already returns for the same fields.
    const { results: rows } = await db.prepare(`
      SELECT id, title, type, source, layout, row_limit, row_order,
             icon, bg_color AS bgColor, show_more AS showMore, more_link AS moreLink
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

app.get("/footer/public", async (c) => {
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

app.get("/sidebar/public", async (c) => {
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
  NOTE: GET /player/public used to be defined here too, duplicating
  player.js's route at the same effective path (/api/player/public).
  This file's mount comes first in index.js, so this version was
  silently winning — despite returning a flat {autoplay, auto_next,
  ...} shape that didn't match the nested {server, playback, controls,
  subtitle} shape formatRow() in player.js produces (which GET /player,
  the admin equivalent of this exact same data, already returns).
  Removed the duplicate here; player.js's version (now with this file's
  10-minute KV caching added to it) is the one implementation.
============================================================ */

/* ============================================================
  GET /api/performance/public
============================================================ */

app.get("/performance/public", async (c) => {
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

app.get("/system/health", async (c) => {
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

/* ============================================================
  GET /api/category/:key — genre page OR A-Z letter page
  Category.html (via categoryPage.js's fetchCategory()) passes
  either a genre/category slug or a single A-Z letter as :key,
  plus optional ?page= and ?type= (anime/movies/cartoon/series).

  ✅ NEW ROUTE (audit): confirmed missing via categoryPage.js's own
  comment ("GET /api/category/:key doesn't exist on the backend
  yet") and via a frontend/backend route cross-check — Category.html
  could never load any data without this. Response shape
  ({items, total, title}) matches exactly what categoryPage.js reads
  (data.items/data.total/data.title, per that same comment, which
  says the frontend's shape was already written against the intended
  contract). :key resolution order:
    1. categories.slug (genre/category page — e.g. "action")
    2. a single A-Z letter (e.g. "A", or "#" for non-alphabetic)
  matching this file's /anime route and publicSearch.js's
  /search/genre/:genre + /search/az/:letter for the underlying
  anime-matching logic, so behavior is consistent across all three
  category-browsing entry points.
============================================================ */

app.get("/category/:key", async (c) => {
  const db     = c.env.DB
  const key    = c.req.param("key")
  const qp     = c.req.query
  const page   = Math.max(1, toInt(qp("page"), 1))
  const limit  = Math.min(50, Math.max(1, toInt(qp("limit"), 20)))
  const offset = (page - 1) * limit
  const type   = qp("type") || ""

  if (!key) return c.json(fail("key required"), 400)

  try {
    const cacheKey = `category:${key.toLowerCase()}:${type}:${page}`
    if (c.env.KV) {
      const cached = await c.env.KV.get(cacheKey, "json").catch(() => null)
      if (cached) return c.json(ok(cached))
    }

    const where = ["is_hidden=0", "active=1"]
    const binds = []
    let   title = key

    // Try key as a category slug first (genre/category page)
    const category = await db.prepare(
      "SELECT name, slug FROM categories WHERE slug=? AND active=1"
    ).bind(key.toLowerCase()).first()

    if (category) {
      where.push("genres LIKE ?")
      binds.push(`%${category.name}%`)
      title = category.name
    } else if (key === "#") {
      // A-Z nav's non-alphabetic bucket
      where.push("SUBSTR(UPPER(title), 1, 1) NOT BETWEEN 'A' AND 'Z'")
      title = "#"
    } else if (/^[A-Za-z]$/.test(key)) {
      // Single A-Z letter
      const letter = key.toUpperCase()
      where.push("title LIKE ?")
      binds.push(`${letter}%`)
      title = letter
    } else {
      // Neither a known category slug nor a single letter — fall back to
      // treating it as a free-text genre match, same as publicSearch.js's
      // /search/genre/:genre, so an unrecognized-but-plausible slug still
      // returns something useful instead of an empty page.
      where.push("genres LIKE ?")
      binds.push(`%${key}%`)
    }

    if (type) { where.push("type=?"); binds.push(type) }

    const whereSQL = where.join(" AND ")
    const orderBy  = category ? "rating DESC" : "title ASC"

    const [countRow, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as total FROM anime WHERE ${whereSQL}`).bind(...binds).first(),
      db.prepare(`
        SELECT id, title, slug, type, status, poster, rating, year, genres
        FROM anime
        WHERE ${whereSQL}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).bind(...binds, limit, offset).all()
    ])

    const response = {
      key, page, limit, title,
      total: countRow?.total || 0,
      items: rows.results.map(a => ({ ...a, genres: safeJSON(a.genres) }))
    }

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(response), {
        expirationTtl: 300
      }).catch(() => {})
    }

    return c.json(ok(response))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

export default app
