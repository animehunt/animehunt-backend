/* ============================================================
  ANIMEHUNT — PUBLIC ANIME ROUTES (FIXED)
  File: src/routes/public.js
  No auth required.

  GET /api/anime                    - List with filters + pagination
  GET /api/anime/home               - is_home=1 anime
  GET /api/anime/featured           - is_banner=1 anime (hero)
  GET /api/anime/:slug              - Single anime full detail
  GET /api/public/episodes/:animeId - Episodes for anime
  GET /api/public/seasons/:animeId  - Season list
  GET /api/public/servers/:epId     - Streaming servers for episode
  GET /api/categories/public        - Active categories
  GET /api/banners/public           - Active banners
  GET /api/homepage/public          - Homepage rows with items
  GET /api/footer/public            - Footer config
  GET /api/sidebar/public           - Sidebar menu
  GET /api/player/public            - Player settings
  GET /api/performance/public       - Performance config
  GET /api/seo/meta/:animeId        - SEO meta for anime
  GET /api/system/health            - Health check
  GET /api/search                   - Live search
  GET /api/search/popular           - Popular searches
  POST /api/search/log              - Log search query
============================================================ */

import { Hono } from "hono"

const app = new Hono()

const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })

function toInt(v, def=1)  { const n = parseInt(v);  return isNaN(n) ? def : n }
function safeJSON(v, fb=[]) { try { return JSON.parse(v||"[]") } catch { return fb } }

/* ============================================================
  IMPORTANT: /api/anime/home + /api/anime/featured
  MUST be registered BEFORE /api/anime/:slug
============================================================ */

app.get("/api/anime/home", async (c) => {
  const db = c.env.DB
  try {
    const { results } = await db.prepare(`
      SELECT id, title, slug, type, status, poster, banner, rating, year, genres, language, duration
      FROM anime
      WHERE is_home=1 AND is_hidden=0 AND active=1
      ORDER BY rating DESC
      LIMIT 30
    `).all()
    return c.json(ok(results.map(a => ({ ...a, genres: safeJSON(a.genres) }))))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/anime/featured", async (c) => {
  const db = c.env.DB
  try {
    const { results } = await db.prepare(`
      SELECT id, title, slug, type, status, poster, banner, rating, year, genres, description, language
      FROM anime
      WHERE is_banner=1 AND is_hidden=0 AND active=1
      ORDER BY rating DESC
      LIMIT 10
    `).all()
    return c.json(ok(results.map(a => ({ ...a, genres: safeJSON(a.genres) }))))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/anime — Paginated list with filters
============================================================ */

app.get("/api/anime", async (c) => {
  const db     = c.env.DB
  const q      = c.req.query
  const page   = Math.max(1, toInt(q("page"), 1))
  const limit  = Math.min(50, Math.max(1, toInt(q("limit"), 20)))
  const offset = (page - 1) * limit
  const type   = q("type")   || ""
  const status = q("status") || ""
  const genre  = q("genre")  || ""
  const search = q("search") || q("q") || ""
  const sort   = q("sort")   || "latest"

  const where  = ["is_hidden=0", "active=1"]
  const binds  = []

  if (type)   { where.push("type=?");             binds.push(type) }
  if (status) { where.push("status=?");           binds.push(status) }
  if (genre)  { where.push("genres LIKE ?");      binds.push("%" + genre + "%") }
  if (search) { where.push("(title LIKE ? OR genres LIKE ?)"); binds.push("%" + search + "%", "%" + search + "%") }

  const orderMap = {
    latest:  "created_at DESC",
    rating:  "rating DESC",
    title:   "title ASC",
    year:    "year DESC",
    oldest:  "created_at ASC",
  }
  const orderBy = orderMap[sort] || "created_at DESC"
  const whereSQL = where.join(" AND ")

  try {
    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM anime WHERE ${whereSQL}`
    ).bind(...binds).first()

    const { results } = await db.prepare(`
      SELECT id, title, slug, type, status, poster, rating, year, genres, language, duration, season_count, episode_count
      FROM anime
      WHERE ${whereSQL}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all()

    return c.json(ok({
      page, limit,
      total: countRow?.total || 0,
      count: results.length,
      data:  results.map(a => ({ ...a, genres: safeJSON(a.genres) }))
    }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/anime/:slug — Full detail
============================================================ */

app.get("/api/anime/:slug", async (c) => {
  const db   = c.env.DB
  const slug = c.req.param("slug")

  try {
    const anime = await db.prepare(`
      SELECT id, title, slug, type, status, poster, banner, rating, year,
             genres, tags, description, language, duration, ageRating,
             season_count, episode_count, studio,
             is_trending, is_home, is_banner, featured,
             created_at, updated_at
      FROM anime
      WHERE slug=? AND is_hidden=0 AND active=1
      LIMIT 1
    `).bind(slug).first()

    if (!anime) return c.json(fail("Anime not found"), 404)

    // Increment view count
    await db.prepare("UPDATE anime SET views=COALESCE(views,0)+1 WHERE id=?")
      .bind(anime.id).run().catch(()=>{})

    return c.json(ok({
      ...anime,
      genres: safeJSON(anime.genres),
      tags:   safeJSON(anime.tags),
    }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/public/episodes/:animeId
============================================================ */

app.get("/api/public/episodes/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")
  const season  = c.req.query("season") || ""

  try {
    // animeId can be id or slug
    const anime = await db.prepare(
      "SELECT id FROM anime WHERE id=? OR slug=? LIMIT 1"
    ).bind(animeId, animeId).first()

    const aId = anime?.id || animeId

    let query = `
      SELECT id, anime_id, season, episode, title, thumbnail, description, servers, air_date, active
      FROM episodes
      WHERE anime_id=? AND active=1
    `
    const binds = [aId]

    if (season) {
      query += " AND season=?"
      binds.push(season)
    }

    query += " ORDER BY CAST(season AS INTEGER) ASC, CAST(episode AS INTEGER) ASC"

    const { results } = await db.prepare(query).bind(...binds).all()

    return c.json(ok(results.map(ep => ({
      ...ep,
      servers: safeJSON(ep.servers),
    }))))
  } catch (err) { return c.json(fail(err.message), 500) }
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
      WHERE anime_id=? AND active=1
      ORDER BY season ASC
    `).bind(aId).all()

    return c.json(ok(results.map(r => r.season).filter(s => s > 0)))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/public/servers/:episodeId
============================================================ */

app.get("/api/public/servers/:episodeId", async (c) => {
  const db        = c.env.DB
  const episodeId = c.req.param("episodeId")

  try {
    // Try servers table first (dedicated server rows)
    const { results: serverRows } = await db.prepare(`
      SELECT id, name, embed, type, priority
      FROM servers
      WHERE episode_id=? AND active=1
      ORDER BY priority ASC
    `).bind(episodeId).all().catch(() => ({ results: [] }))

    if (serverRows.length) return c.json(ok(serverRows))

    // Fallback: servers JSON array in episodes table
    const ep = await db.prepare(
      "SELECT servers FROM episodes WHERE id=? LIMIT 1"
    ).bind(episodeId).first()

    if (!ep) return c.json(ok([]))

    const servers = safeJSON(ep.servers)
    if (!servers.length) return c.json(ok([]))

    // Normalize to objects
    const normalized = servers.map((s, i) => {
      if (typeof s === "string") return { id: `s${i}`, name: `Server ${i+1}`, embed: s, type: "iframe", priority: i }
      return { id: s.id||`s${i}`, name: s.name||`Server ${i+1}`, embed: s.embed||s.url||s, type: s.type||"iframe", priority: s.priority||i }
    })

    return c.json(ok(normalized))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/categories/public
============================================================ */

app.get("/api/categories/public", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, slug, icon, color, category_order
      FROM categories
      WHERE active=1
      ORDER BY category_order ASC, priority DESC
    `).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/categories/home", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, name, slug, icon, color
      FROM categories
      WHERE active=1 AND show_home=1
      ORDER BY category_order ASC
    `).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/banners/public
============================================================ */

app.get("/api/banners/public", async (c) => {
  const db       = c.env.DB
  const page     = c.req.query("page")     || "all"
  const position = c.req.query("position") || ""

  try {
    let query  = `SELECT id, title, subtitle, image, link, banner_order, page, position FROM banners WHERE active=1`
    const bind = []

    if (page && page !== "all") {
      query += ` AND (page=? OR page='all')`
      bind.push(page)
    }
    if (position) {
      query += ` AND (position=? OR position='all')`
      bind.push(position)
    }

    query += " ORDER BY banner_order ASC LIMIT 10"
    const { results } = await db.prepare(query).bind(...bind).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/homepage/public
============================================================ */

app.get("/api/homepage/public", async (c) => {
  const db = c.env.DB

  try {
    const { results: rows } = await db.prepare(`
      SELECT id, title, type, source, layout, row_limit, row_order, icon, bgColor, showMore, moreLink
      FROM homepage_rows
      WHERE active=1
      ORDER BY row_order ASC
    `).all()

    const populated = await Promise.all(rows.map(async (row) => {
      const limit = row.row_limit || 20
      let items = []

      try {
        if (row.type === "trending") {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE is_trending=1 AND is_hidden=0 AND active=1
            ORDER BY rating DESC LIMIT ?
          `).bind(limit).all()
          items = results
        } else if (row.type === "ongoing") {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE status='ongoing' AND is_hidden=0 AND active=1
            ORDER BY updated_at DESC LIMIT ?
          `).bind(limit).all()
          items = results
        } else if (row.type === "movies") {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE type='movie' AND is_hidden=0 AND active=1
            ORDER BY year DESC LIMIT ?
          `).bind(limit).all()
          items = results
        } else if (row.type === "cartoon") {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE type='cartoon' AND is_hidden=0 AND active=1
            ORDER BY rating DESC LIMIT ?
          `).bind(limit).all()
          items = results
        } else if (row.type === "top_rated") {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE is_hidden=0 AND active=1
            ORDER BY rating DESC LIMIT ?
          `).bind(limit).all()
          items = results
        } else if (row.type === "completed") {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE status='completed' AND is_hidden=0 AND active=1
            ORDER BY rating DESC LIMIT ?
          `).bind(limit).all()
          items = results
        } else if (row.type === "genre" && row.source) {
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE genres LIKE ? AND is_hidden=0 AND active=1
            ORDER BY rating DESC LIMIT ?
          `).bind("%" + row.source + "%", limit).all()
          items = results
        } else {
          // auto / manual / default
          const { results } = await db.prepare(`
            SELECT id, title, slug, poster, rating, year, type, status
            FROM anime WHERE is_hidden=0 AND active=1
            ORDER BY created_at DESC LIMIT ?
          `).bind(limit).all()
          items = results
        }
      } catch (e) { items = [] }

      return { ...row, items }
    }))

    return c.json(ok(populated))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/footer/public
============================================================ */

app.get("/api/footer/public", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT * FROM footer_config WHERE id=1").first()
    return c.json(ok(row || {}))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/sidebar/public
============================================================ */

app.get("/api/sidebar/public", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, title, icon, url, highlight, badge, newTab, device, priority
      FROM sidebar
      WHERE active=1
      ORDER BY priority ASC
    `).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/player/public
============================================================ */

app.get("/api/player/public", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT * FROM player_settings WHERE id=1").first()
    return c.json(ok(row || {
      autoplay: 1, auto_next: 1, auto_next_delay: 5,
      skip_intro: 0, seek_seconds: 10,
      subtitle_enabled: 1, default_server: "Server 1",
      show_download_btn: 1
    }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/performance/public
============================================================ */

app.get("/api/performance/public", async (c) => {
  try {
    const row = await c.env.DB.prepare("SELECT * FROM performance_settings WHERE id=1").first()
    return c.json(ok(row || { lazyLoad: 1, smartCache: 1, imgOptimize: 1, cacheTTL: 3600, imgQuality: 80 }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/seo/meta/:animeId
============================================================ */

app.get("/api/seo/meta/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    // Try seo_meta table first
    const meta = await db.prepare("SELECT * FROM seo_meta WHERE id=? LIMIT 1").bind(animeId).first().catch(()=>null)
    if (meta) return c.json(ok({
      metaTitle:  meta.meta_title,
      metaDesc:   meta.meta_desc,
      keywords:   meta.keywords,
      ogImage:    meta.og_image,
      schemaJson: meta.schema_json,
    }))

    // Fallback: generate from anime data
    const anime = await db.prepare("SELECT title, description, poster, genres FROM anime WHERE id=? OR slug=? LIMIT 1")
      .bind(animeId, animeId).first()
    if (!anime) return c.json(fail("Not found"), 404)

    const seo = await db.prepare("SELECT site_title, tpl_anime FROM seo_settings WHERE id=1").first().catch(()=>null)
    const tpl = seo?.tpl_anime || "{title} Hindi Dubbed — Watch Free | AnimeHunt"
    const metaTitle = tpl.replace("{title}", anime.title)

    return c.json(ok({
      metaTitle,
      metaDesc:   anime.description?.slice(0, 160) || `Watch ${anime.title} Hindi Dubbed online free on AnimeHunt.`,
      keywords:   `${anime.title}, hindi dubbed, anime, watch online free`,
      ogImage:    anime.poster,
      schemaJson: null,
    }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  GET /api/system/health
============================================================ */

app.get("/api/system/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first()
    return c.json(ok({ status: "ok", db: "connected", ts: new Date().toISOString() }))
  } catch (err) { return c.json(fail("DB error"), 500) }
})

/* ============================================================
  GET /api/search
============================================================ */

app.get("/api/search", async (c) => {
  const db    = c.env.DB
  const q     = (c.req.query("q") || "").trim()
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query("limit") || "8")))

  if (q.length < 2) return c.json(ok({ query: q, results: [], count: 0 }))

  try {
    const { results } = await db.prepare(`
      SELECT id, title, slug, poster, type, status, rating, year
      FROM anime
      WHERE is_hidden=0 AND active=1
      AND (title LIKE ? OR genres LIKE ?)
      ORDER BY
        CASE WHEN title LIKE ? THEN 1 ELSE 2 END,
        rating DESC
      LIMIT ?
    `).bind("%" + q + "%", "%" + q + "%", q + "%", limit).all()

    return c.json(ok({ query: q, results, count: results.length }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/search/popular", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT query, COUNT(*) as count
      FROM search_logs
      WHERE query IS NOT NULL AND query != ''
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10
    `).all()
    return c.json(ok(results))
  } catch (err) { return c.json(ok([])) }
})

app.post("/api/search/log", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body.query) return c.json(ok())
  try {
    await c.env.DB.prepare(
      "INSERT INTO search_logs (query, results, created_at) VALUES (?, ?, datetime('now'))"
    ).bind(body.query, body.results || 0).run()
  } catch {}
  return c.json(ok())
})

export default app
