/* ============================================================
  ANIMEHUNT — DOWNLOADS ROUTES (COMPLETE - FIXED)
  File: src/routes/downloads.js

  PUBLIC routes (no auth):
    GET  /api/downloads/:animeId                   - All downloads for anime
    GET  /api/downloads/:animeId/:season/:episode  - Episode downloads
    POST /api/downloads/count/:id                  - Increment download count
    GET  /api/downloads-by-slug/:slug              - By anime slug (FIXED)
    GET  /api/knight-data?host_id=                 - Knight page data
    GET  /api/download-final?host_id=&quality=     - Final download redirect

  ADMIN routes (auth required):
    GET  /api/admin/anime-list                     - Anime dropdown
    GET  /api/admin/downloads-v2                   - Full downloads list
    POST /api/admin/downloads-v2                   - Create download entry
    PUT  /api/admin/downloads-v2/:entryId          - Update entry
    DELETE /api/admin/downloads-v2/:entryId        - Delete entry
    DELETE /api/admin/download-host/:hostId        - Delete host entry
    GET  /api/admin/host-monetization              - Host configs (for dropdown)
    GET  /api/admin/downloads-health               - Health check
============================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ── Helpers ── */
const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })
const uid  = () => crypto.randomUUID()
const now  = () => new Date().toISOString()

function jsonParse(v, fallback=[]) {
  try { return JSON.parse(v || "[]") } catch { return fallback }
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const v = item[key]
    if (!acc[v]) acc[v] = []
    acc[v].push(item)
    return acc
  }, {})
}

function toNum(v) {
  if (v===null || v===undefined || v==="") return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

/* ============================================================
  PUBLIC — GET DOWNLOADS FOR ANIME
============================================================ */

app.get("/api/downloads/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    const anime = await db.prepare(
      "SELECT id, title, slug FROM anime WHERE id=? OR slug=? LIMIT 1"
    ).bind(animeId, animeId).first()

    if (!anime) return c.json(fail("Anime not found"), 404)

    const { results: entries } = await db.prepare(`
      SELECT id, content_type, season, episode, episode_title
      FROM download_entries
      WHERE anime_id=?
      ORDER BY CAST(season AS INTEGER) ASC, CAST(episode AS INTEGER) ASC
    `).bind(anime.id).all()

    if (!entries.length) return c.json(ok({ anime_title: anime.title, episodes: [] }))

    const entryIds = entries.map(e => e.id)
    const ph = entryIds.map(()=>"?").join(",")

    const { results: hosts } = await db.prepare(`
      SELECT dh.id, dh.entry_id, dh.host, dh.storage, dh.knight, dh.monetization_id
      FROM download_hosts dh
      WHERE dh.entry_id IN (${ph})
    `).bind(...entryIds).all()

    const hostIds = hosts.map(h => h.id)
    let links = []

    if (hostIds.length) {
      const hph = hostIds.map(()=>"?").join(",")
      const { results: l } = await db.prepare(`
        SELECT id, host_id, quality, link
        FROM download_links
        WHERE host_id IN (${hph})
      `).bind(...hostIds).all()
      links = l
    }

    const linkMap = groupBy(links, "host_id")
    const hostMap = groupBy(hosts, "entry_id")

    const episodes = entries.map(entry => ({
      season:        entry.season,
      episode:       entry.episode,
      episode_title: entry.episode_title,
      content_type:  entry.content_type,
      hosts: (hostMap[entry.id] || []).map(h => ({
        id:      h.id,
        name:    h.host,
        storage: h.storage,
        knight:  h.knight === 1 || h.knight === true,
        links:   (linkMap[h.id] || []).map(l => ({
          id:      l.id,
          quality: l.quality,
          link:    l.link
        }))
      }))
    }))

    return c.json(ok({ anime_title: anime.title, episodes }))

  } catch (err) {
    console.error("downloads/:animeId error:", err)
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  PUBLIC — EPISODE SPECIFIC DOWNLOADS
============================================================ */

app.get("/api/downloads/:animeId/:season/:episode", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")
  const season  = c.req.param("season")
  const episode = c.req.param("episode")

  try {
    const entry = await db.prepare(`
      SELECT de.id, de.episode_title, de.content_type
      FROM download_entries de
      INNER JOIN anime a ON a.id = de.anime_id
      WHERE (a.id=? OR a.slug=?) AND de.season=? AND de.episode=?
      LIMIT 1
    `).bind(animeId, animeId, season, episode).first()

    if (!entry) return c.json(ok({ hosts: [] }))

    const { results: hosts } = await db.prepare(`
      SELECT id, host, storage, knight
      FROM download_hosts
      WHERE entry_id=?
    `).bind(entry.id).all()

    const hostIds = hosts.map(h => h.id)
    let links = []

    if (hostIds.length) {
      const ph = hostIds.map(()=>"?").join(",")
      const { results: l } = await db.prepare(
        `SELECT host_id, quality, link FROM download_links WHERE host_id IN (${ph})`
      ).bind(...hostIds).all()
      links = l
    }

    const linkMap = groupBy(links, "host_id")

    const data = {
      episode_title: entry.episode_title,
      content_type:  entry.content_type,
      hosts: hosts.map(h => ({
        id:      h.id,
        name:    h.host,
        storage: h.storage,
        knight:  h.knight === 1 || h.knight === true,
        links:   (linkMap[h.id] || [])
      }))
    }

    return c.json(ok(data))

  } catch (err) {
    console.error("downloads episode specific error:", err)
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  PUBLIC — INCREMENT DOWNLOAD COUNT
============================================================ */

app.post("/api/downloads/count/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")
  try {
    await db.prepare(
      "UPDATE download_links SET downloads=COALESCE(downloads,0)+1 WHERE id=?"
    ).bind(id).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  PUBLIC — DOWNLOADS BY SLUG (FIXED — no internal fetch)
============================================================ */

app.get("/api/downloads-by-slug/:slug", async (c) => {
  const db   = c.env.DB
  const slug = c.req.param("slug")

  try {
    const anime = await db.prepare(
      "SELECT id, title FROM anime WHERE slug=? LIMIT 1"
    ).bind(slug).first()

    if (!anime) return c.json(fail("Anime not found"), 404)

    // Direct query instead of internal fetch
    const { results: entries } = await db.prepare(`
      SELECT id, content_type, season, episode, episode_title
      FROM download_entries
      WHERE anime_id=?
      ORDER BY CAST(season AS INTEGER) ASC, CAST(episode AS INTEGER) ASC
    `).bind(anime.id).all()

    if (!entries.length) return c.json(ok({ anime_title: anime.title, episodes: [] }))

    const entryIds = entries.map(e => e.id)
    const ph = entryIds.map(()=>"?").join(",")

    const { results: hosts } = await db.prepare(`
      SELECT dh.id, dh.entry_id, dh.host, dh.storage, dh.knight, dh.monetization_id
      FROM download_hosts dh WHERE dh.entry_id IN (${ph})
    `).bind(...entryIds).all()

    const hostIds = hosts.map(h => h.id)
    let links = []
    if (hostIds.length) {
      const hph = hostIds.map(()=>"?").join(",")
      const { results: l } = await db.prepare(
        `SELECT id, host_id, quality, link FROM download_links WHERE host_id IN (${hph})`
      ).bind(...hostIds).all()
      links = l
    }

    const linkMap = groupBy(links, "host_id")
    const hostMap = groupBy(hosts, "entry_id")

    const episodes = entries.map(entry => ({
      season: entry.season, episode: entry.episode,
      episode_title: entry.episode_title, content_type: entry.content_type,
      hosts: (hostMap[entry.id] || []).map(h => ({
        id: h.id, name: h.host, storage: h.storage,
        knight: h.knight === 1 || h.knight === true,
        links: (linkMap[h.id] || []).map(l => ({ id: l.id, quality: l.quality, link: l.link }))
      }))
    }))

    return c.json(ok({ anime_title: anime.title, episodes }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  PUBLIC — KNIGHT DATA
  knight.html pe quality buttons ke liye
============================================================ */

app.get("/api/knight-data", async (c) => {
  const db     = c.env.DB
  const hostId = c.req.query("host_id")

  if (!hostId) return c.json(fail("Missing host_id"), 400)

  try {
    const host = await db.prepare(
      "SELECT id, host, knight FROM download_hosts WHERE id=? LIMIT 1"
    ).bind(hostId).first()

    if (!host)        return c.json(fail("Host not found"), 404)
    if (!host.knight) return c.json(fail("Not a knight host"), 400)

    const { results: links } = await db.prepare(`
      SELECT quality, link
      FROM download_links
      WHERE host_id=?
      ORDER BY CASE quality
        WHEN '480p'  THEN 1
        WHEN '720p'  THEN 2
        WHEN '1080p' THEN 3
        WHEN '4K'    THEN 4
        ELSE 99 END ASC
    `).bind(hostId).all()

    if (!links.length) return c.json(fail("No links found"), 404)

    return c.json(ok({ host: { id: host.id, name: host.host }, links }))

  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  PUBLIC — FINAL DOWNLOAD REDIRECT
  /api/download-final?host_id=xxx&quality=720p
============================================================ */

app.get("/api/download-final", async (c) => {
  const db      = c.env.DB
  const hostId  = c.req.query("host_id")
  const quality = c.req.query("quality")

  if (!hostId) return c.text("Missing host_id", 400)

  try {
    const host = await db.prepare(
      "SELECT id, monetization_id FROM download_hosts WHERE id=? LIMIT 1"
    ).bind(hostId).first()

    if (!host) return c.text("Host not found", 404)

    let row = null

    if (quality) {
      row = await db.prepare(
        "SELECT link FROM download_links WHERE host_id=? AND quality=? LIMIT 1"
      ).bind(hostId, quality).first()
    }

    if (!row) {
      row = await db.prepare(
        "SELECT link FROM download_links WHERE host_id=? LIMIT 1"
      ).bind(hostId).first()
    }

    if (!row?.link) return c.text("Download not found", 404)

    // Update click count on host_monetization
    if (host.monetization_id) {
      await db.prepare(
        "UPDATE host_monetization SET clicks=COALESCE(clicks,0)+1 WHERE id=?"
      ).bind(host.monetization_id).run().catch(()=>{})
    }

    return c.redirect(row.link)

  } catch (err) { return c.text(err.message, 500) }
})

/* ============================================================
  ADMIN — ANIME LIST (for dropdown)
============================================================ */

app.get("/api/admin/anime-list", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, title, slug, poster, type
      FROM anime
      ORDER BY title ASC
    `).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — LIST DOWNLOADS (full structure)
============================================================ */

app.get("/api/admin/downloads-v2", async (c) => {
  const db = c.env.DB

  try {
    const { results: entries } = await db.prepare(`
      SELECT
        de.id, de.anime_id, de.content_type, de.season, de.episode, de.episode_title, de.created_at,
        a.title as anime_title, a.poster as anime_poster, a.slug as anime_slug, a.type as anime_type
      FROM download_entries de
      LEFT JOIN anime a ON a.id = de.anime_id
      ORDER BY a.title ASC, CAST(de.season AS INTEGER) ASC, CAST(de.episode AS INTEGER) ASC
    `).all()

    if (!entries.length) return c.json(ok([]))

    const entryIds = entries.map(e => e.id)
    const ph = entryIds.map(()=>"?").join(",")

    const { results: hosts } = await db.prepare(`
      SELECT dh.id, dh.entry_id, dh.host, dh.storage, dh.knight, dh.direct_download, dh.monetization_id,
             hm.mode, hm.ads, hm.shortlinks, hm.popups
      FROM download_hosts dh
      LEFT JOIN host_monetization hm ON hm.id = dh.monetization_id
      WHERE dh.entry_id IN (${ph})
    `).bind(...entryIds).all()

    const hostIds = hosts.map(h => h.id)
    let links = []

    if (hostIds.length) {
      const hph = hostIds.map(()=>"?").join(",")
      const { results: l } = await db.prepare(
        `SELECT id, host_id, quality, link FROM download_links WHERE host_id IN (${hph})`
      ).bind(...hostIds).all()
      links = l
    }

    const hostMap = groupBy(hosts, "entry_id")
    const linkMap = groupBy(links, "host_id")

    const final = entries.map(entry => ({
      id: entry.id,
      anime_id: entry.anime_id,
      anime_title: entry.anime_title,
      anime_poster: entry.anime_poster,
      anime_slug: entry.anime_slug,
      anime_type: entry.anime_type,
      content_type: entry.content_type,
      season: entry.season,
      episode: entry.episode,
      episode_title: entry.episode_title,
      created_at: entry.created_at,
      hosts: (hostMap[entry.id] || []).map(h => ({
        id: h.id,
        host: h.host,
        storage: h.storage,
        knight: h.knight === 1 || h.knight === true,
        direct_download: h.direct_download === 1 || h.direct_download === true,
        monetization_id: h.monetization_id,
        mode: h.mode || "random",
        ads: jsonParse(h.ads),
        shortlinks: jsonParse(h.shortlinks),
        popups: jsonParse(h.popups),
        links: linkMap[h.id] || []
      }))
    }))

    return c.json(ok(final))

  } catch (err) {
    console.error("downloads-v2 GET error:", err)
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  ADMIN — CREATE DOWNLOAD ENTRY
============================================================ */

app.post("/api/admin/downloads-v2", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()

  if (!body.anime_id || !Array.isArray(body.hosts) || !body.hosts.length) {
    return c.json(fail("anime_id and hosts[] required"), 400)
  }

  try {
    const entryId = uid()

    await db.prepare(`
      INSERT INTO download_entries (id, anime_id, content_type, season, episode, episode_title, created_at)
      VALUES (?,?,?,?,?,?,datetime('now'))
    `).bind(
      entryId,
      body.anime_id,
      body.content_type || "episode",
      toNum(body.season),
      toNum(body.episode),
      body.episode_title || null
    ).run()

    for (const host of body.hosts) {
      const hostId = uid()

      await db.prepare(`
        INSERT INTO download_hosts (id, entry_id, host, storage, knight, direct_download, monetization_id, created_at)
        VALUES (?,?,?,?,?,?,?,datetime('now'))
      `).bind(
        hostId,
        entryId,
        host.host          || "",
        host.storage       || "",
        (host.knight === 1 || host.knight === true) ? 1 : 0,
        (host.direct_download === 1 || host.direct_download === true) ? 1 : 0,
        host.monetization_id || host.host_config_id || null
      ).run()

      const links = Array.isArray(host.links) ? host.links : []
      for (const link of links) {
        if (!link.link) continue
        await db.prepare(`
          INSERT INTO download_links (id, host_id, quality, link, downloads, created_at)
          VALUES (?,?,?,?,0,datetime('now'))
        `).bind(uid(), hostId, link.quality || null, link.link).run()
      }
    }

    return c.json(ok({ id: entryId }))

  } catch (err) {
    console.error("downloads-v2 POST error:", err)
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  ADMIN — UPDATE ENTRY
============================================================ */

app.put("/api/admin/downloads-v2/:id", async (c) => {
  const db   = c.env.DB
  const id   = c.req.param("id")
  const body = await c.req.json()

  try {
    await db.prepare(`
      UPDATE download_entries
      SET content_type=?, season=?, episode=?, episode_title=?
      WHERE id=?
    `).bind(
      body.content_type || "episode",
      toNum(body.season),
      toNum(body.episode),
      body.episode_title || null,
      id
    ).run()

    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — DELETE ENTRY (cascades hosts + links)
============================================================ */

app.delete("/api/admin/downloads-v2/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")

  try {
    const { results: hosts } = await db.prepare(
      "SELECT id FROM download_hosts WHERE entry_id=?"
    ).bind(id).all()

    for (const h of hosts) {
      await db.prepare("DELETE FROM download_links WHERE host_id=?").bind(h.id).run()
      await db.prepare("DELETE FROM download_hosts WHERE id=?").bind(h.id).run()
    }

    await db.prepare("DELETE FROM download_entries WHERE id=?").bind(id).run()

    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — DELETE SINGLE HOST ENTRY
============================================================ */

app.delete("/api/admin/download-host/:hostId", async (c) => {
  const db     = c.env.DB
  const hostId = c.req.param("hostId")

  try {
    await db.prepare("DELETE FROM download_links WHERE host_id=?").bind(hostId).run()
    await db.prepare("DELETE FROM download_hosts WHERE id=?").bind(hostId).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  HEALTH CHECK
============================================================ */

app.get("/api/downloads-health", async (c) => {
  return c.json(ok({ service: "downloads", status: "running" }))
})

export default app
     
