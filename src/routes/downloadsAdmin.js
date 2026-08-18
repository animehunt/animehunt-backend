/**
 * downloadsAdmin.js — AnimeHunt Backend
 * ════════════════════════════════════════════════════════
 * Download management router (Hono + Cloudflare D1) — ADMIN ROUTES ONLY
 *
 * index.js mein mount karo:
 *   adminRoutes.route("/", downloadsAdmin)   ← adminAuth already applied
 *
 * ✅ NEW FILE (security audit, dual-mount vulnerability): split out of
 * downloads.js. Every route below used to live in downloads.js, which
 * was mounted BOTH publicly (app.route("/api", downloads), no auth) AND
 * under adminRoutes (adminRoutes.route("/", downloads), auth required) —
 * because it's the same underlying Hono() router object in both places,
 * every one of these admin write routes (create/edit/delete hosts,
 * download entries, host-download links, bulk CSV upload, broken-link
 * management) was reachable completely unauthenticated at /api/...,
 * bypassing adminAuth entirely. See downloads.js's header comment for
 * the full explanation — same root cause and fix pattern already used
 * for player.js/playerAdmin.js (ISSUE-020).
 *
 * All public/read routes stay in downloads.js (mounted only under
 * app.route("/api", ...)).
 * ════════════════════════════════════════════════════════
 */

import { Hono } from "hono"

const downloadsAdmin = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

/* ══════════════════════════════════════════════════════════
   ADMIN ROUTES — /api/admin/...
   (index.js: adminRoutes.route("/", downloadsAdmin) — adminAuth already applied)
══════════════════════════════════════════════════════════ */

/* GET /api/admin/downloads/stats */
downloadsAdmin.get("/downloads/stats", async (c) => {
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
downloadsAdmin.get("/downloads/structure/:anime_id", async (c) => {
  const db       = c.env.DB
  // ✅ FIX (audit ISSUE-031): anime.id is TEXT/UUID — parseInt() here broke
  // every click into an anime's download structure from downloads.html,
  // since it always produced NaN against a real anime UUID.
  const anime_id = c.req.param("anime_id")
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
downloadsAdmin.get("/downloads/entries", async (c) => {
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
downloadsAdmin.post("/downloads/entries", async (c) => {
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
downloadsAdmin.put("/downloads/entries/:id", async (c) => {
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
downloadsAdmin.delete("/downloads/entries/:id", async (c) => {
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
downloadsAdmin.get("/downloads/hosts/:entry_id", async (c) => {
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
downloadsAdmin.post("/downloads/hosts", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { entry_id, host_id, direct_download, qualities } = body
  if (!entry_id || !host_id) return fail(c, "entry_id and host_id required")
  try {
    const host = await db.prepare("SELECT knight, storage FROM hosts WHERE id=?").bind(host_id).first()
    if (!host) return fail(c, "Host not found", 404)
    if (host.knight && !(qualities?.length)) return fail(c, "At least one quality link required for knight hosts")
    if (!host.knight && !direct_download) return fail(c, "direct_download required for non-knight hosts")
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
downloadsAdmin.put("/downloads/hosts/:id", async (c) => {
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
downloadsAdmin.delete("/downloads/hosts/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM download_links WHERE host_entry_id=?").bind(id).run()
    await db.prepare("DELETE FROM download_host_entries WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* POST /api/admin/downloads/quick-add */
downloadsAdmin.post("/downloads/quick-add", async (c) => {
  const db   = c.env.DB
  const body = await c.req.json()
  const { anime_id, content_type, season, episode, episode_title, host_id, direct_download, qualities } = body
  if (!anime_id || !content_type || !host_id) return fail(c, "anime_id, content_type, host_id required")
  try {
    const host = await db.prepare("SELECT knight, storage FROM hosts WHERE id=?").bind(host_id).first()
    if (!host) return fail(c, "Host not found", 404)
    if (host.knight && !(qualities?.length)) return fail(c, "At least one quality link required for knight hosts")
    if (!host.knight && !direct_download) return fail(c, "direct_download required for non-knight hosts")
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

/* ── BULK CSV UPLOAD ───────────────────────────────────────────────────────
   downloads.html "Import CSV" button posts multipart/form-data (field "csv")
   POST /api/admin/bulk-upload/download-links
   CSV columns: anime_id,content_type,season,episode,episode_title,host_id,direct_download,quality,link
────────────────────────────────────────────────────────────────────────────── */
function parseCsvLine(line) {
  const out = []
  let cur = "", inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false }
      else cur += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { out.push(cur); cur = "" }
      else cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

downloadsAdmin.post("/bulk-upload/download-links", async (c) => {
  const db = c.env.DB
  try {
    const form = await c.req.formData()
    const file = form.get("csv")
    if (!file || typeof file === "string") {
      return c.json({ success: false, message: "csv file required" }, 400)
    }
    const text  = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim().length)
    if (lines.length < 2) return c.json({ success: false, message: "CSV has no data rows" }, 400)

    // ✅ FIX (audit): safety cap on row count — this loop runs one query
    // sequentially per data row (it does per-row anime/host lookups and
    // dedup logic that don't reduce to a simple batch insert), so an
    // unbounded CSV could time out the request or overload the DB. Matches
    // the 5000-row cap the removed bulk-upload.js used to enforce.
    const MAX_ROWS = 5000
    if (lines.length - 1 > MAX_ROWS) {
      return c.json({ success: false, message: `Too many rows — max ${MAX_ROWS} per upload (got ${lines.length - 1})` }, 400)
    }

    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase())
    const col    = name => header.indexOf(name)
    const iAnime = col("anime_id"), iType = col("content_type"), iSeason = col("season")
    const iEp    = col("episode"),  iTitle = col("episode_title")
    const iHost  = col("host_id"),  iDirect = col("direct_download")
    const iQual  = col("quality"),  iLink = col("link")

    if (iAnime < 0 || iType < 0 || iHost < 0) {
      return c.json({ success: false, message: "CSV must include anime_id, content_type, host_id columns" }, 400)
    }

    const hostCache = new Map()
    const entryCache = new Map()
    let inserted = 0, errors = 0
    const errorDetails = []

    for (let r = 1; r < lines.length; r++) {
      const row = parseCsvLine(lines[r])
      if (!row.length || row.every(v => v === "")) continue

      try {
        // ✅ FIX (audit ISSUE-031): anime.id is TEXT/UUID — parseInt() here
        // turned every valid UUID into NaN, so the "if (!anime_id...)" check
        // just below always failed and every CSV row got skipped as
        // "missing required fields," even when the CSV correctly contained
        // a real anime_id. host_id is correctly left as parseInt() — it's a
        // genuine INTEGER PRIMARY KEY on download_host_entries/hosts.
        const anime_id       = row[iAnime]
        const content_type   = row[iType] || "episode"
        const season         = iSeason >= 0 && row[iSeason] ? parseInt(row[iSeason]) : null
        const episode        = iEp     >= 0 && row[iEp]     ? parseInt(row[iEp])     : null
        const episode_title  = iTitle  >= 0 ? (row[iTitle] || null) : null
        const host_id        = parseInt(row[iHost])
        const direct_download = iDirect >= 0 ? (row[iDirect] || null) : null
        const quality          = iQual   >= 0 ? (row[iQual]   || null) : null
        const link              = iLink   >= 0 ? (row[iLink]   || null) : null

        if (!anime_id || !content_type || !host_id) {
          errors++; errorDetails.push(`Row ${r + 1}: missing required fields`); continue
        }

        let host = hostCache.get(host_id)
        if (!host) {
          host = await db.prepare("SELECT id, knight, storage FROM hosts WHERE id=?").bind(host_id).first()
          if (!host) { errors++; errorDetails.push(`Row ${r + 1}: host_id ${host_id} not found`); continue }
          hostCache.set(host_id, host)
        }

        const entryKey = `${anime_id}|${content_type}|${season ?? ""}|${episode ?? ""}`
        let entryId = entryCache.get(entryKey)
        if (!entryId) {
          const existing = await db.prepare(
            `SELECT id FROM download_entries WHERE anime_id=? AND content_type=? AND season IS ? AND episode IS ? LIMIT 1`
          ).bind(anime_id, content_type, season, episode).first()
          if (existing) {
            entryId = existing.id
          } else {
            const ins = await db.prepare(
              `INSERT INTO download_entries (anime_id, content_type, season, episode, episode_title, created_at)
               VALUES (?,?,?,?,?,datetime('now'))`
            ).bind(anime_id, content_type, season, episode, episode_title).run()
            entryId = ins.meta.last_row_id
          }
          entryCache.set(entryKey, entryId)
        }

        const hostEntry = await db.prepare(
          "SELECT id FROM download_host_entries WHERE entry_id=? AND host_id=?"
        ).bind(entryId, host_id).first()

        let hostEntryId
        if (hostEntry) {
          hostEntryId = hostEntry.id
          if (!host.knight && direct_download) {
            await db.prepare(
              "UPDATE download_host_entries SET direct_download=?, updated_at=datetime('now') WHERE id=?"
            ).bind(direct_download, hostEntryId).run()
          }
        } else {
          const insHost = await db.prepare(
            `INSERT INTO download_host_entries (entry_id, host_id, knight, storage, direct_download, clicks, created_at)
             VALUES (?,?,?,?,?,0,datetime('now'))`
          ).bind(entryId, host_id, host.knight ? 1 : 0, host.storage || "", host.knight ? null : direct_download).run()
          hostEntryId = insHost.meta.last_row_id
        }

        if (host.knight && quality && link) {
          await db.prepare(
            "INSERT INTO download_links (host_entry_id, quality, link) VALUES (?,?,?)"
          ).bind(hostEntryId, quality, link).run()
        }

        inserted++
      } catch (rowErr) {
        errors++
        errorDetails.push(`Row ${r + 1}: ${rowErr.message}`)
      }
    }

    return c.json({ success: true, inserted, errors, errorDetails: errorDetails.slice(0, 20) })
  } catch (e) {
    return c.json({ success: false, message: e.message }, 500)
  }
})

/* ── HOSTS CRUD (admin) ── */

downloadsAdmin.get("/hosts", async (c) => {
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

downloadsAdmin.post("/hosts", async (c) => {
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

downloadsAdmin.put("/hosts/:id", async (c) => {
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

downloadsAdmin.delete("/hosts/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    await db.prepare("DELETE FROM hosts WHERE id=?").bind(id).run()
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

/* ── BROKEN LINK REPORT ──────────────────────────────────────────────────
   Blueprint §2 Item 6 — admin report broken download links
────────────────────────────────────────────────────────────────────────── */

// POST /api/admin/downloads/report-broken
downloadsAdmin.post("/downloads/report-broken", async (c) => {
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
downloadsAdmin.get("/downloads/broken", async (c) => {
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
// Dismissing also restores the host entry to 'active' so it's visible again.
downloadsAdmin.delete("/downloads/broken/:id", async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param("id"))
  try {
    const report = await db.prepare("SELECT download_id FROM broken_link_reports WHERE id=?").bind(id).first()
    await db.prepare("DELETE FROM broken_link_reports WHERE id=?").bind(id).run()
    if (report?.download_id) {
      await db.prepare(
        "UPDATE download_host_entries SET status='active', updated_at=datetime('now') WHERE id=? AND status='reported_broken'"
      ).bind(report.download_id).run()
    }
    return ok(c, { deleted: id })
  } catch(e) { return fail(c, e.message) }
})

export default downloadsAdmin


