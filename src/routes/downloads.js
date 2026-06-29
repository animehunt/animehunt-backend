/**
 * downloads.js — AnimeHunt Backend
 * ════════════════════════════════════════════════════════
 * Download management router (Hono + Cloudflare D1)
 *
 * index.js mein mount karo:
 *   app.route("/api", downloads)              ← public routes
 *   adminRoutes.route("/", downloads)         ← admin routes (adminAuth already applied)
 *
 * Auth: adminAuth middleware index.js mein apply hota hai
 *       Yahan sirf business logic hai
 * ════════════════════════════════════════════════════════
 */

import { Hono } from "hono"

const downloads = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

/* ══════════════════════════════════════════════════════════
   PUBLIC ROUTES — /api/...
   (index.js: app.route("/api", downloads))
══════════════════════════════════════════════════════════ */

/* GET /api/public/download-hosts — download.html host buttons */
downloads.get("/public/download-hosts", async (c) => {
  const db = c.env.DB
  const { entry_id, anime_id, season, episode, content_type } = c.req.query()
  try {
    let entryRow = null
    if (entry_id) {
      entryRow = await db.prepare("SELECT id FROM download_entries WHERE id=?").bind(entry_id).first()
    } else if (anime_id && season && episode) {
      entryRow = await db.prepare(
        `SELECT id FROM download_entries WHERE anime_id=? AND season=? AND episode=? AND content_type=? LIMIT 1`
      ).bind(anime_id, season, episode, content_type || "episode").first()
    }
    if (!entryRow) return ok(c, [])
    const rows = await db.prepare(
      `SELECT dhe.id, h.name as host_name, h.storage, h.knight
       FROM download_host_entries dhe
       JOIN hosts h ON h.id = dhe.host_id
       WHERE dhe.entry_id=? AND h.active=1
       ORDER BY dhe.id ASC`
    ).bind(entryRow.id).all()
    return ok(c, rows.results)
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/public/anime/:id — anime hero info (title, poster, banner, meta) */
downloads.get("/public/anime/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const row = await db.prepare(
      "SELECT id, title, poster, banner, type, genres, status, year, rating, description FROM anime WHERE id=?"
    ).bind(id).first()
    if (!row) return fail(c, "Not found", 404)
    let genres = []
    try { genres = JSON.parse(row.genres || "[]") } catch {}
    return ok(c, { ...row, genres })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/public/download-structure — seasons list + anime type for download.html */
downloads.get("/public/download-structure", async (c) => {
  const db       = c.env.DB
  const anime_id = parseInt(c.req.query("anime_id"))
  if (!anime_id) return fail(c, "anime_id required")
  try {
    const anime = await db.prepare("SELECT id, type FROM anime WHERE id=?").bind(anime_id).first()
    if (!anime) return fail(c, "Anime not found", 404)
    const seasons = await db.prepare(
      `SELECT DISTINCT season FROM download_entries WHERE anime_id=? AND season IS NOT NULL ORDER BY season`
    ).bind(anime_id).all()
    return ok(c, { anime_id, type: anime.type || "anime", seasons: seasons.results.map(r => r.season) })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/public/download-entries — episodes/zip/movie/collection/pack/batch list (public, no host data) */
downloads.get("/public/download-entries", async (c) => {
  const db = c.env.DB
  const { anime_id, content_type, season } = c.req.query()
  if (!anime_id || !content_type) return fail(c, "anime_id and content_type required")
  try {
    let sql  = `SELECT id, content_type, season, episode, episode_title
                FROM download_entries WHERE anime_id=? AND content_type=?`
    const args = [anime_id, content_type]
    if (season) { sql += " AND season=?"; args.push(season) }
    sql += " ORDER BY episode ASC"
    const res = await db.prepare(sql).bind(...args).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

/* POST /api/go — host click → session create */
downloads.post("/go", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { host_entry_id, anime_id, season, episode } = body
  if (!host_entry_id) return fail(c, "host_entry_id required")
  try {
    const hostEntry = await db.prepare(
      `SELECT dhe.*, h.name as host_name, h.storage, h.knight
       FROM download_host_entries dhe
       JOIN hosts h ON h.id = dhe.host_id
       WHERE dhe.id=?`
    ).bind(host_entry_id).first()
    if (!hostEntry) return fail(c, "Host entry not found", 404)

    const mon = await db.prepare(
      "SELECT * FROM host_monetization WHERE host_id=?"
    ).bind(hostEntry.host_id).first()

    let sessionPayload = {
      host_entry_id,
      host_id:    hostEntry.host_id,
      host_name:  hostEntry.host_name,
      storage:    hostEntry.storage,
      knight:     hostEntry.knight ? 1 : 0,
      final_link: hostEntry.direct_download || null,
      anime_id:   anime_id  || null,
      season:     season    || null,
      episode:    episode   || null,
      popup_script:         null,
      ad_code:              null,
      ad_type:              null,
      ad_delay:             0,
      shortlink_url:        null,
      verify_popup_script:  null,
      verify_redirect_url:  null,
      verify_shortlink_url: null,
      redirect_chain:       "[]"
    }

    if (mon) {
      const mode   = mon.mode || "random"
      const clicks = mon.clicks || 0
      let adIds=[], popupIds=[], slIds=[], rdIds=[]
      try { adIds    = JSON.parse(mon.ads        || "[]") } catch {}
      try { popupIds = JSON.parse(mon.popups     || "[]") } catch {}
      try { slIds    = JSON.parse(mon.shortlinks || "[]") } catch {}
      try { rdIds    = JSON.parse(mon.redirects  || "[]") } catch {}

      const pickId = (arr) => {
        if (!arr.length) return null
        if (mode === "direct")   return arr[0]
        if (mode === "sequence") return arr[clicks % arr.length]
        return arr[Math.floor(Math.random() * arr.length)]
      }

      if (adIds.length) {
        const ad = await db.prepare("SELECT * FROM ads_library WHERE id=? AND active=1").bind(pickId(adIds)).first()
        if (ad) { sessionPayload.ad_code = ad.code; sessionPayload.ad_type = ad.type; sessionPayload.ad_delay = ad.delay ?? 0 }
      }
      if (popupIds.length) {
        const popup = await db.prepare("SELECT * FROM popup_library WHERE id=? AND active=1").bind(pickId(popupIds)).first()
        if (popup) sessionPayload.popup_script = popup.script
      }
      if (slIds.length) {
        const sl = await db.prepare("SELECT * FROM shortlinks_library WHERE id=? AND active=1").bind(pickId(slIds)).first()
        if (sl) sessionPayload.shortlink_url = buildShortlink(sl, hostEntry.direct_download)
      }
      if (rdIds.length) {
        const rd = await db.prepare("SELECT * FROM redirect_library WHERE id=? AND active=1").bind(pickId(rdIds)).first()
        if (rd) sessionPayload.verify_redirect_url = rd.url
      }
      if (popupIds.length > 1) {
        const vp = await db.prepare("SELECT * FROM popup_library WHERE id=? AND active=1").bind(popupIds[1]).first()
        if (vp) sessionPayload.verify_popup_script = vp.script
      }
      if (slIds.length > 1) {
        const vs = await db.prepare("SELECT * FROM shortlinks_library WHERE id=? AND active=1").bind(slIds[1]).first()
        if (vs) sessionPayload.verify_shortlink_url = buildShortlink(vs, hostEntry.direct_download)
      }
      if (rdIds.length > 1) {
        const chainRows = await db.prepare(
          `SELECT url FROM redirect_library WHERE id IN (${rdIds.map(() => "?").join(",")}) AND active=1 ORDER BY id`
        ).bind(...rdIds).all()
        sessionPayload.redirect_chain = JSON.stringify(chainRows.results.map(r => r.url))
      }
      await db.prepare("UPDATE host_monetization SET clicks=clicks+1 WHERE host_id=?").bind(hostEntry.host_id).run()
    }

    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    await db.prepare(
      `INSERT INTO download_sessions (id, data, expires_at, created_at) VALUES (?,?,?,datetime('now'))`
    ).bind(sessionId, JSON.stringify(sessionPayload), expiresAt).run()

    await db.prepare("UPDATE download_host_entries SET clicks=clicks+1 WHERE id=?").bind(host_entry_id).run()
    trackEvent(db, "host_click", { host_entry_id, host_id: hostEntry.host_id })

    return ok(c, { session_id: sessionId })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/session/:id — go.html session load */
downloads.get("/session/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")
  try {
    const row = await db.prepare("SELECT * FROM download_sessions WHERE id=?").bind(id).first()
    if (!row) return fail(c, "Session not found", 404)
    if (new Date() > new Date(row.expires_at)) return fail(c, "Session expired", 410)
    let data = {}
    try { data = JSON.parse(row.data) } catch {}
    return ok(c, data)
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/knight-data — knight.html quality links */
downloads.get("/knight-data", async (c) => {
  const db      = c.env.DB
  const host_id = c.req.query("host_id")
  if (!host_id) return fail(c, "host_id required")
  try {
    const session = await db.prepare("SELECT * FROM download_sessions WHERE id=?").bind(host_id).first()
    if (!session) return fail(c, "Session not found", 404)
    let sData = {}
    try { sData = JSON.parse(session.data) } catch {}

    const qualities = await db.prepare(
      "SELECT quality, link FROM download_links WHERE host_entry_id=? ORDER BY id"
    ).bind(sData.host_entry_id).all()

    let anime_title = null, poster = null, episode_title = null
    if (sData.anime_id) {
      const anime = await db.prepare("SELECT title, poster FROM anime WHERE id=?").bind(sData.anime_id).first()
      if (anime) { anime_title = anime.title; poster = anime.poster }
    }
    if (sData.anime_id && sData.season && sData.episode) {
      const ep = await db.prepare(
        "SELECT episode_title FROM download_entries WHERE anime_id=? AND season=? AND episode=? LIMIT 1"
      ).bind(sData.anime_id, sData.season, sData.episode).first()
      if (ep) episode_title = ep.episode_title
    }
    return ok(c, { qualities: qualities.results, anime_title, poster, episode_title, season: sData.season, episode: sData.episode })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/public/episodes — download.html episode nav */
downloads.get("/public/episodes", async (c) => {
  const db = c.env.DB
  const { anime_id, season } = c.req.query()
  if (!anime_id) return fail(c, "anime_id required")
  try {
    let sql  = `SELECT DISTINCT episode, episode_title FROM download_entries WHERE anime_id=? AND content_type='episode'`
    const args = [anime_id]
    if (season) { sql += " AND season=?"; args.push(season) }
    sql += " ORDER BY episode ASC"
    const res = await db.prepare(sql).bind(...args).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

/* POST /api/analytics — event tracking */
downloads.post("/analytics", async (c) => {
  const db = c.env.DB
  try {
    const body       = await c.req.json()
    const event_type = body.event_type || "unknown"
    const event_data = typeof body.event_data === "string" ? body.event_data : JSON.stringify(body.event_data || {})
    await trackEvent(db, event_type, {}, event_data)
    return ok(c, { tracked: true })
  } catch { return ok(c, { tracked: false }) }
})

/* GET /api/download/:episodeId — MEDIUM FIX #5: missing public route
   frontend fetchDownloadLinks() calls this endpoint
   Returns: quality links for the episode via download_host_entries + download_links */
downloads.get("/download/:episodeId", async (c) => {
  const db         = c.env.DB
  const episodeId  = c.req.param("episodeId")
  if (!episodeId) return fail(c, "episodeId required")
  try {
    /* Find the download entry for this episode */
    const entry = await db.prepare(
      `SELECT id FROM download_entries WHERE episode=? AND content_type='episode' LIMIT 1`
    ).bind(episodeId).first()

    if (!entry) return ok(c, [])

    /* Get all host entries with their quality links */
    const { results: hostEntries } = await db.prepare(
      `SELECT dhe.id, dhe.quality, dhe.direct_download, dhe.status,
              h.name as host_name, h.storage, h.knight
       FROM download_host_entries dhe
       JOIN hosts h ON h.id = dhe.host_id
       WHERE dhe.entry_id=? AND h.active=1 AND dhe.status != 'broken'
       ORDER BY dhe.id ASC`
    ).bind(entry.id).all()

    if (!hostEntries.length) return ok(c, [])

    /* Attach quality links for each host entry */
    const results = await Promise.all(hostEntries.map(async (he) => {
      const { results: links } = await db.prepare(
        `SELECT quality, link FROM download_links WHERE host_entry_id=? ORDER BY quality DESC`
      ).bind(he.id).all()
      return { ...he, links }
    }))

    return ok(c, results)
  } catch(e) { return fail(c, e.message) }
})

/* ══════════════════════════════════════════════════════════
   ADMIN ROUTES — /api/admin/...
   (index.js: adminRoutes.route("/", downloads) — adminAuth already applied)
══════════════════════════════════════════════════════════ */

/* GET /api/admin/downloads/stats */
downloads.get("/downloads/stats", async (c) => {
  const db = c.env.DB
  try {
    const [entries, hosts, links, knight, clicks] = await Promise.all([
      db.prepare("SELECT COUNT(*) as n FROM download_entries").first(),
      db.prepare("SELECT COUNT(*) as n FROM hosts WHERE active=1").first(),
      db.prepare("SELECT COUNT(*) as n FROM download_links").first(),
      db.prepare("SELECT COUNT(*) as n FROM download_host_entries WHERE knight=1").first(),
      db.prepare("SELECT COALESCE(SUM(clicks),0) as n FROM download_host_entries").first()
    ])
    return ok(c, {
      total_entries:  entries?.n  ?? 0,
      active_hosts:   hosts?.n    ?? 0,
      total_links:    links?.n    ?? 0,
      knight_entries: knight?.n   ?? 0,
      total_clicks:   clicks?.n   ?? 0
    })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/admin/downloads/structure/:anime_id */
downloads.get("/downloads/structure/:anime_id", async (c) => {
  const db       = c.env.DB
  const anime_id = parseInt(c.req.param("anime_id"))
  try {
    const anime = await db.prepare("SELECT id, title, type FROM anime WHERE id=?").bind(anime_id).first()
    if (!anime) return fail(c, "Anime not found", 404)
    const seasons = await db.prepare(
      `SELECT DISTINCT season FROM download_entries WHERE anime_id=? AND season IS NOT NULL ORDER BY season`
    ).bind(anime_id).all()
    return ok(c, { anime_id, type: anime.type || "anime", seasons: seasons.results.map(r => r.season) })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/admin/downloads/entries */
downloads.get("/downloads/entries", async (c) => {
  const db = c.env.DB
  const { anime_id, content_type, season } = c.req.query()
  if (!anime_id) return fail(c, "anime_id required")
  try {
    let sql  = `SELECT de.*, (SELECT COUNT(*) FROM download_host_entries WHERE entry_id=de.id) as host_count
                FROM download_entries de WHERE de.anime_id=?`
    const args = [anime_id]
    if (content_type) { sql += " AND de.content_type=?"; args.push(content_type) }
    if (season)       { sql += " AND de.season=?";       args.push(season) }
    sql += " ORDER BY de.episode ASC NULLS LAST"
    const res = await db.prepare(sql).bind(...args).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

/* POST /api/admin/downloads/entries */
downloads.post("/downloads/entries", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { anime_id, content_type, season, episode, episode_title } = body
  if (!anime_id || !content_type) return fail(c, "anime_id and content_type required")
  try {
    const res = await db.prepare(
      `INSERT INTO download_entries (anime_id, content_type, season, episode, episode_title, created_at)
       VALUES (?,?,?,?,?,datetime('now'))`
    ).bind(anime_id, content_type, season || null, episode || null, episode_title || null).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

/* PUT /api/admin/downloads/entries/:id */
downloads.put("/downloads/entries/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { episode_title, season, episode } = body
  try {
    await db.prepare(
      `UPDATE download_entries SET episode_title=?, season=?, episode=?, updated_at=datetime('now') WHERE id=?`
    ).bind(episode_title || null, season || null, episode || null, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

/* DELETE /api/admin/downloads/entries/:id */
downloads.delete("/downloads/entries/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM download_links WHERE host_entry_id IN (SELECT id FROM download_host_entries WHERE entry_id=?)").bind(id).run()
    await db.prepare("DELETE FROM download_host_entries WHERE entry_id=?").bind(id).run()
    await db.prepare("DELETE FROM download_entries WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* GET /api/admin/downloads/hosts/:entry_id */
downloads.get("/downloads/hosts/:entry_id", async (c) => {
  const db       = c.env.DB
  const entry_id = parseInt(c.req.param("entry_id"))
  try {
    const rows = await db.prepare(
      `SELECT dhe.*, h.name as host_name, h.storage, h.knight, h.active as host_active
       FROM download_host_entries dhe
       JOIN hosts h ON h.id = dhe.host_id
       WHERE dhe.entry_id=? ORDER BY dhe.id ASC`
    ).bind(entry_id).all()
    const results = await Promise.all(rows.results.map(async (row) => {
      if (row.knight) {
        const qs = await db.prepare("SELECT quality, link FROM download_links WHERE host_entry_id=? ORDER BY id").bind(row.id).all()
        row.qualities = qs.results
      }
      return row
    }))
    return ok(c, results)
  } catch(e) { return fail(c, e.message) }
})

/* POST /api/admin/downloads/hosts */
downloads.post("/downloads/hosts", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { entry_id, host_id, direct_download, qualities } = body
  if (!entry_id || !host_id) return fail(c, "entry_id and host_id required")
  try {
    const host = await db.prepare("SELECT knight, storage FROM hosts WHERE id=?").bind(host_id).first()
    if (!host) return fail(c, "Host not found", 404)
    const res = await db.prepare(
      `INSERT INTO download_host_entries (entry_id, host_id, knight, storage, direct_download, clicks, created_at)
       VALUES (?,?,?,?,?,0,datetime('now'))`
    ).bind(entry_id, host_id, host.knight ? 1 : 0, host.storage || "", direct_download || null).run()
    const hostEntryId = res.meta.last_row_id
    if (host.knight && qualities?.length) {
      const stmts = qualities.map(q =>
        db.prepare("INSERT INTO download_links (host_entry_id, quality, link) VALUES (?,?,?)").bind(hostEntryId, q.quality, q.link)
      )
      await db.batch(stmts)
    }
    return ok(c, { id: hostEntryId })
  } catch(e) { return fail(c, e.message) }
})

/* PUT /api/admin/downloads/hosts/:id */
downloads.put("/downloads/hosts/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { direct_download, qualities } = body
  try {
    await db.prepare(
      `UPDATE download_host_entries SET direct_download=?, updated_at=datetime('now') WHERE id=?`
    ).bind(direct_download || null, id).run()
    if (qualities?.length) {
      await db.prepare("DELETE FROM download_links WHERE host_entry_id=?").bind(id).run()
      const stmts = qualities.map(q =>
        db.prepare("INSERT INTO download_links (host_entry_id, quality, link) VALUES (?,?,?)").bind(id, q.quality, q.link)
      )
      await db.batch(stmts)
    }
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

/* DELETE /api/admin/downloads/hosts/:id */
downloads.delete("/downloads/hosts/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM download_links WHERE host_entry_id=?").bind(id).run()
    await db.prepare("DELETE FROM download_host_entries WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* POST /api/admin/downloads/quick-add */
downloads.post("/downloads/quick-add", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { anime_id, content_type, season, episode, episode_title, host_id, direct_download, qualities } = body
  if (!anime_id || !content_type || !host_id) return fail(c, "anime_id, content_type, host_id required")
  try {
    const host = await db.prepare("SELECT knight, storage FROM hosts WHERE id=?").bind(host_id).first()
    if (!host) return fail(c, "Host not found", 404)
    const entryRes = await db.prepare(
      `INSERT INTO download_entries (anime_id, content_type, season, episode, episode_title, created_at)
       VALUES (?,?,?,?,?,datetime('now'))`
    ).bind(anime_id, content_type, season || null, episode || null, episode_title || null).run()
    const entryId = entryRes.meta.last_row_id
    const hostRes = await db.prepare(
      `INSERT INTO download_host_entries (entry_id, host_id, knight, storage, direct_download, clicks, created_at)
       VALUES (?,?,?,?,?,0,datetime('now'))`
    ).bind(entryId, host_id, host.knight ? 1 : 0, host.storage || "", direct_download || null).run()
    const hostEntryId = hostRes.meta.last_row_id
    if (host.knight && qualities?.length) {
      const stmts = qualities.map(q =>
        db.prepare("INSERT INTO download_links (host_entry_id, quality, link) VALUES (?,?,?)").bind(hostEntryId, q.quality, q.link)
      )
      await db.batch(stmts)
    }
    return ok(c, { entry_id: entryId, host_entry_id: hostEntryId })
  } catch(e) { return fail(c, e.message) }
})

/* ── HOSTS CRUD (admin) ── */

downloads.get("/hosts", async (c) => {
  const db = c.env.DB
  const { active } = c.req.query()
  try {
    let sql = "SELECT * FROM hosts"
    if (active !== undefined) sql += ` WHERE active=${parseInt(active) ? 1 : 0}`
    sql += " ORDER BY id ASC"
    const res = await db.prepare(sql).all()
    return ok(c, res.results)
  } catch(e) { return fail(c, e.message) }
})

downloads.post("/hosts", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { name, storage, knight, active } = body
  if (!name) return fail(c, "name required")
  try {
    const res = await db.prepare(
      `INSERT INTO hosts (name, storage, knight, active, created_at) VALUES (?,?,?,?,datetime('now'))`
    ).bind(name, storage || name, knight ? 1 : 0, active ?? 1).run()
    return ok(c, { id: res.meta.last_row_id })
  } catch(e) { return fail(c, e.message) }
})

downloads.put("/hosts/:id", async (c) => {
  const db   = c.env.DB
  const id   = parseInt(c.req.param("id"))
  const body = await c.req.json()
  const { name, storage, knight, active } = body
  try {
    await db.prepare(
      `UPDATE hosts SET name=?, storage=?, knight=?, active=?, updated_at=datetime('now') WHERE id=?`
    ).bind(name, storage || name, knight ? 1 : 0, active ?? 1, id).run()
    return ok(c, { id })
  } catch(e) { return fail(c, e.message) }
})

downloads.delete("/hosts/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM hosts WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── HELPERS ── */
function buildShortlink(sl, targetUrl) {
  if (!sl?.base_url) return null
  try {
    const base = sl.base_url.replace(/\/$/, "")
    if (sl.api_key) return `${base}?api=${encodeURIComponent(sl.api_key)}&url=${encodeURIComponent(targetUrl || "")}`
    return `${base}?url=${encodeURIComponent(targetUrl || "")}`
  } catch { return sl.base_url }
}

async function trackEvent(db, event_type, extra = {}, raw_data = null) {
  try {
    const data = raw_data || JSON.stringify(extra)
    await db.prepare(
      `INSERT INTO analytics (event_type, event_data, created_at) VALUES (?,?,datetime('now'))`
    ).bind(event_type, data).run()

    const fieldMap = {
      popup_open:       "popup_opens",
      popup_view:       "popup_views",
      popup_close:      "popup_closes",
      shortlink_click:  "shortlink_clicks",
      redirect_click:   "redirect_clicks",
      ad_click:         "ad_clicks",
      ad_view:          "ad_views",
      page_view:        "impressions",
      page_ad_view:     "page_ad_views",
      page_ad_click:    "page_ad_clicks",
      verify_click:     "verify_clicks",
      go_link_click:    "go_link_clicks",
      host_click:       "host_clicks",
      download:         "downloads",
      knight_download:  "knight_downloads",
      knight_page_view: "knight_downloads",
      revenue_event:    "revenue_events"
    }

    const field = fieldMap[event_type]
    if (field) {
      await db.prepare(
        `INSERT INTO ad_stats (id, ${field}) VALUES (1,1)
         ON CONFLICT(id) DO UPDATE SET ${field}=${field}+1`
      ).run()
    }
  } catch {}
}

/* ── BROKEN LINK REPORT (MISSING FEATURE — ADDED) ───────────────────────────
   Blueprint §2 Item 6 — admin report broken download links
   BUG FIX (Blueprint Line 463): shortlink null crash already fixed above
   in buildShortlink() — if (!sl?.base_url) return null
────────────────────────────────────────────────────────────────────────────── */

// POST /api/admin/downloads/report-broken
downloads.post("/downloads/report-broken", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { downloadId, url, reason } = body || {}

  if (!downloadId) return fail(c, "downloadId required")

  try {
    // Insert broken link report
    await db.prepare(
      `INSERT INTO broken_link_reports (download_id, url, reason, reported_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).bind(
      downloadId,
      url     || null,
      reason  || "Link not working"
    ).run()

    // Mark the host entry as reported_broken so admin sees it flagged
    await db.prepare(
      "UPDATE download_host_entries SET status='reported_broken', updated_at=datetime('now') WHERE id=?"
    ).bind(downloadId).run()

    return ok(c, { reported: true, downloadId })
  } catch(e) { return fail(c, e.message) }
})

// GET /api/admin/downloads/broken  — list all broken link reports
downloads.get("/downloads/broken", async (c) => {
  const db = c.env.DB
  try {
    const page   = Math.max(1, parseInt(c.req.query("page")  || "1"))
    const limit  = Math.min(100, parseInt(c.req.query("limit") || "50"))
    const offset = (page - 1) * limit

    const rows = await db.prepare(
      `SELECT
         blr.id, blr.download_id, blr.url, blr.reason, blr.reported_at,
         dhe.direct_download,
         h.name as host_name,
         de.anime_id, de.content_type, de.season, de.episode, de.episode_title
       FROM broken_link_reports blr
       LEFT JOIN download_host_entries dhe ON dhe.id = blr.download_id
       LEFT JOIN hosts h ON h.id = dhe.host_id
       LEFT JOIN download_entries de ON de.id = dhe.entry_id
       ORDER BY blr.reported_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all()

    const total = await db.prepare(
      "SELECT COUNT(*) as n FROM broken_link_reports"
    ).first()

    return ok(c, {
      reports: rows.results,
      total:   total?.n ?? 0,
      page,
      limit
    })
  } catch(e) { return fail(c, e.message) }
})

// DELETE /api/admin/downloads/broken/:id  — dismiss a broken link report
downloads.delete("/downloads/broken/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM broken_link_reports WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

export default downloads
