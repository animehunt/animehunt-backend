/**
 * downloads.js — AnimeHunt CMS  (Hono)
 * Handles: Download Entries, Host Entries, Quick Add,
 *          Season Structure, Download Stats
 *
 * Usage:
 *   import downloadsRoutes from './downloads.js'
 *   app.route('/api', downloadsRoutes)
 *
 * Expects:
 *   - c.var.db   → your DB instance (set via middleware)
 *   - c.var.user → set by your auth middleware
 */

import { Hono } from 'hono'

const downloads = new Hono()

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

function ok(c, data, status = 200) {
  return c.json({ success: true, data }, status)
}

function fail(c, message, status = 400) {
  return c.json({ success: false, message: String(message) }, status)
}

function db(c) {
  const d = c.var.db ?? c.env?.db
  if (!d) throw new Error('DB not initialised — set c.var.db in middleware')
  return d
}

/* ─────────────────────────────────────────
   AUTH MIDDLEWARE
───────────────────────────────────────── */

downloads.use('*', async (c, next) => {
  const user = c.var.user ?? c.get('user')
  if (!user) return fail(c, 'Unauthorized', 401)
  await next()
})

/* ═════════════════════════════════════════
   DOWNLOAD STATS
   GET /downloads/stats
═════════════════════════════════════════ */

downloads.get('/downloads/stats', async (c) => {
  const d = db(c)
  const [entriesRow, hostsRow, linksRow, knightRow, clicksRow] = await Promise.all([
    d.get('SELECT COUNT(*) AS cnt FROM download_entries'),
    d.get('SELECT COUNT(DISTINCT host_id) AS cnt FROM download_host_entries'),
    d.get('SELECT COUNT(*) AS cnt FROM download_host_entries'),
    d.get(`SELECT COUNT(*) AS cnt FROM download_host_entries WHERE knight = 1`),
    d.get('SELECT COALESCE(SUM(clicks), 0) AS cnt FROM download_host_entries')
  ])

  return ok(c, {
    total_entries:  entriesRow?.cnt || 0,
    active_hosts:   hostsRow?.cnt   || 0,
    total_links:    linksRow?.cnt   || 0,
    knight_entries: knightRow?.cnt  || 0,
    total_clicks:   clicksRow?.cnt  || 0
  })
})

/* ═════════════════════════════════════════
   STRUCTURE  (seasons skeleton)
   GET /downloads/structure/:animeId
═════════════════════════════════════════ */

downloads.get('/downloads/structure/:animeId', async (c) => {
  const animeId = parseInt(c.req.param('animeId'))
  if (!animeId) return fail(c, 'Invalid anime id')

  const d = db(c)

  const seasonsRaw = await d.all(
    `SELECT DISTINCT season FROM download_entries
     WHERE anime_id = ? AND season IS NOT NULL
     ORDER BY season ASC`,
    [animeId]
  )
  const seasons = seasonsRaw.map(r => r.season)
  if (!seasons.length) seasons.push(1)

  const anime = await d.get('SELECT type FROM anime WHERE id = ?', [animeId])
  const type  = (anime?.type || 'anime').toLowerCase()

  return ok(c, { seasons, type })
})

/* ═════════════════════════════════════════
   DOWNLOAD ENTRIES  (episode list)
   GET    /downloads/entries?anime_id=&content_type=&season=
   POST   /downloads/entries
   PUT    /downloads/entries/:id
   DELETE /downloads/entries/:id
═════════════════════════════════════════ */

downloads.get('/downloads/entries', async (c) => {
  const { anime_id, content_type, season } = c.req.query()
  if (!anime_id) return fail(c, 'anime_id is required')

  const params = [parseInt(anime_id)]
  let query    = `SELECT de.*,
    (SELECT COUNT(*) FROM download_host_entries dh WHERE dh.entry_id = de.id) AS host_count
    FROM download_entries de
    WHERE de.anime_id = ?`

  if (content_type) { query += ' AND de.content_type = ?'; params.push(content_type) }
  if (season)       { query += ' AND de.season = ?';       params.push(parseInt(season)) }

  query += ' ORDER BY de.season ASC, de.episode ASC'

  const rows = await db(c).all(query, params)
  return ok(c, rows)
})

downloads.post('/downloads/entries', async (c) => {
  const body = await c.req.json()
  const { anime_id, content_type, season, episode, episode_title } = body

  if (!anime_id)     return fail(c, 'anime_id is required')
  if (!content_type) return fail(c, 'content_type is required')

  const result = await db(c).run(
    `INSERT INTO download_entries (anime_id, content_type, season, episode, episode_title, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      parseInt(anime_id), content_type,
      season  ? parseInt(season)  : null,
      episode ? parseInt(episode) : null,
      episode_title || null
    ]
  )
  const row = await db(c).get('SELECT * FROM download_entries WHERE id = ?', [result.lastID])
  return ok(c, row, 201)
})

downloads.put('/downloads/entries/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT * FROM download_entries WHERE id = ?', [id])
  if (!existing) return fail(c, 'Entry not found', 404)

  const body = await c.req.json()
  const { content_type, season, episode, episode_title } = body

  await db(c).run(
    `UPDATE download_entries
     SET content_type=?, season=?, episode=?, episode_title=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      content_type    || existing.content_type,
      season  != null ? parseInt(season)  : null,
      episode != null ? parseInt(episode) : null,
      episode_title ?? null,
      id
    ]
  )
  const row = await db(c).get('SELECT * FROM download_entries WHERE id = ?', [id])
  return ok(c, row)
})

downloads.delete('/downloads/entries/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM download_entries WHERE id = ?', [id])
  if (!existing) return fail(c, 'Entry not found', 404)

  const d = db(c)
  const hostRows = await d.all('SELECT id FROM download_host_entries WHERE entry_id = ?', [id])
  for (const h of hostRows) {
    await d.run('DELETE FROM download_qualities WHERE host_entry_id = ?', [h.id])
  }
  await d.run('DELETE FROM download_host_entries WHERE entry_id = ?', [id])
  await d.run('DELETE FROM download_entries WHERE id = ?', [id])

  return ok(c, { deleted: true, id: parseInt(id) })
})

/* ═════════════════════════════════════════
   HOST ENTRIES  (per download entry)
   GET    /downloads/hosts/:entryId
   POST   /downloads/hosts
   PUT    /downloads/hosts/:id
   DELETE /downloads/hosts/:id
═════════════════════════════════════════ */

downloads.get('/downloads/hosts/:entryId', async (c) => {
  const entryId = parseInt(c.req.param('entryId'))
  if (!entryId) return fail(c, 'Invalid entry id')

  const d     = db(c)
  const entry = await d.get('SELECT id FROM download_entries WHERE id = ?', [entryId])
  if (!entry) return fail(c, 'Entry not found', 404)

  const hostRows = await d.all(
    `SELECT dh.*, h.name AS host_name, h.storage, h.knight
     FROM download_host_entries dh
     LEFT JOIN hosts h ON h.id = dh.host_id
     WHERE dh.entry_id = ?
     ORDER BY dh.id ASC`,
    [entryId]
  )

  const result = []
  for (const h of hostRows) {
    const isKnight = h.knight == 1
    const qualities = isKnight
      ? await d.all(
          'SELECT quality, link FROM download_qualities WHERE host_entry_id = ? ORDER BY id ASC',
          [h.id]
        )
      : []
    result.push({ ...h, qualities })
  }

  return ok(c, result)
})

downloads.post('/downloads/hosts', async (c) => {
  const body = await c.req.json()
  const { entry_id, host_id, direct_download, qualities } = body

  if (!entry_id) return fail(c, 'entry_id is required')
  if (!host_id)  return fail(c, 'host_id is required')

  const d     = db(c)
  const entry = await d.get('SELECT id FROM download_entries WHERE id = ?', [entry_id])
  if (!entry) return fail(c, 'Download entry not found', 404)

  const host = await d.get('SELECT id, knight, storage FROM hosts WHERE id = ?', [host_id])
  if (!host) return fail(c, 'Host not found', 404)

  const isKnight = host.knight == 1

  if (isKnight) {
    if (!Array.isArray(qualities) || !qualities.length)
      return fail(c, 'Quality links are required for knight hosts')
  } else {
    if (!direct_download?.trim())
      return fail(c, 'direct_download link is required for non-knight hosts')
  }

  const result = await d.run(
    `INSERT INTO download_host_entries
     (entry_id, host_id, knight, storage, direct_download, clicks, created_at)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
    [
      parseInt(entry_id), parseInt(host_id),
      isKnight ? 1 : 0,
      host.storage || '',
      isKnight ? null : direct_download.trim()
    ]
  )
  const hostEntryId = result.lastID

  if (isKnight) {
    for (const q of qualities) {
      if (!q.quality || !q.link) continue
      await d.run(
        'INSERT INTO download_qualities (host_entry_id, quality, link) VALUES (?, ?, ?)',
        [hostEntryId, q.quality, q.link.trim()]
      )
    }
  }

  const row   = await d.get(
    `SELECT dh.*, h.name AS host_name FROM download_host_entries dh
     LEFT JOIN hosts h ON h.id = dh.host_id WHERE dh.id = ?`,
    [hostEntryId]
  )
  const quals = isKnight
    ? await d.all('SELECT quality, link FROM download_qualities WHERE host_entry_id = ?', [hostEntryId])
    : []

  return ok(c, { ...row, qualities: quals }, 201)
})

downloads.put('/downloads/hosts/:id', async (c) => {
  const id       = c.req.param('id')
  const d        = db(c)
  const existing = await d.get('SELECT * FROM download_host_entries WHERE id = ?', [id])
  if (!existing) return fail(c, 'Host entry not found', 404)

  const body = await c.req.json()
  const { host_id, direct_download, qualities } = body

  const finalHostId = host_id ? parseInt(host_id) : existing.host_id
  const host = await d.get('SELECT id, knight, storage FROM hosts WHERE id = ?', [finalHostId])
  if (!host) return fail(c, 'Host not found', 404)

  const isKnight = host.knight == 1

  if (isKnight) {
    if (!Array.isArray(qualities) || !qualities.length)
      return fail(c, 'Quality links are required for knight hosts')
  } else {
    if (!direct_download?.trim())
      return fail(c, 'direct_download link is required')
  }

  await d.run(
    `UPDATE download_host_entries
     SET host_id=?, knight=?, storage=?, direct_download=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      finalHostId,
      isKnight ? 1 : 0,
      host.storage || '',
      isKnight ? null : direct_download.trim(),
      id
    ]
  )

  await d.run('DELETE FROM download_qualities WHERE host_entry_id = ?', [id])
  if (isKnight) {
    for (const q of qualities) {
      if (!q.quality || !q.link) continue
      await d.run(
        'INSERT INTO download_qualities (host_entry_id, quality, link) VALUES (?, ?, ?)',
        [id, q.quality, q.link.trim()]
      )
    }
  }

  const row   = await d.get(
    `SELECT dh.*, h.name AS host_name FROM download_host_entries dh
     LEFT JOIN hosts h ON h.id = dh.host_id WHERE dh.id = ?`,
    [id]
  )
  const quals = isKnight
    ? await d.all('SELECT quality, link FROM download_qualities WHERE host_entry_id = ?', [id])
    : []

  return ok(c, { ...row, qualities: quals })
})

downloads.delete('/downloads/hosts/:id', async (c) => {
  const id       = c.req.param('id')
  const d        = db(c)
  const existing = await d.get('SELECT id FROM download_host_entries WHERE id = ?', [id])
  if (!existing) return fail(c, 'Host entry not found', 404)

  await d.run('DELETE FROM download_qualities WHERE host_entry_id = ?', [id])
  await d.run('DELETE FROM download_host_entries WHERE id = ?', [id])

  return ok(c, { deleted: true, id: parseInt(id) })
})

/* ═════════════════════════════════════════
   QUICK ADD
   POST /downloads/quick-add
   Entry + host ek shot mein
═════════════════════════════════════════ */

downloads.post('/downloads/quick-add', async (c) => {
  const body = await c.req.json()
  const {
    anime_id, content_type, season, episode,
    episode_title, host_id, direct_download, qualities
  } = body

  if (!anime_id)     return fail(c, 'anime_id is required')
  if (!content_type) return fail(c, 'content_type is required')
  if (!host_id)      return fail(c, 'host_id is required')

  const d    = db(c)
  const host = await d.get('SELECT id, knight, storage FROM hosts WHERE id = ?', [host_id])
  if (!host) return fail(c, 'Host not found', 404)

  const isKnight = host.knight == 1

  if (isKnight) {
    if (!Array.isArray(qualities) || !qualities.length)
      return fail(c, 'Quality links required for knight host')
  } else {
    if (!direct_download?.trim())
      return fail(c, 'direct_download link is required')
  }

  // Find or create download entry
  let entry = null
  if (episode != null) {
    entry = await d.get(
      `SELECT * FROM download_entries
       WHERE anime_id=? AND content_type=? AND season=? AND episode=?`,
      [parseInt(anime_id), content_type, season ? parseInt(season) : null, parseInt(episode)]
    )
  }

  if (!entry) {
    const res2 = await d.run(
      `INSERT INTO download_entries (anime_id, content_type, season, episode, episode_title, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        parseInt(anime_id), content_type,
        season  ? parseInt(season)  : null,
        episode ? parseInt(episode) : null,
        episode_title || null
      ]
    )
    entry = { id: res2.lastID }
  }

  // Duplicate host check
  const dupHost = await d.get(
    'SELECT id FROM download_host_entries WHERE entry_id=? AND host_id=?',
    [entry.id, parseInt(host_id)]
  )
  if (dupHost) return fail(c, 'This host is already linked to this episode entry')

  // Insert host entry
  const hostRes = await d.run(
    `INSERT INTO download_host_entries
     (entry_id, host_id, knight, storage, direct_download, clicks, created_at)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
    [
      entry.id, parseInt(host_id),
      isKnight ? 1 : 0,
      host.storage || '',
      isKnight ? null : direct_download.trim()
    ]
  )

  if (isKnight) {
    for (const q of qualities) {
      if (!q.quality || !q.link) continue
      await d.run(
        'INSERT INTO download_qualities (host_entry_id, quality, link) VALUES (?, ?, ?)',
        [hostRes.lastID, q.quality, q.link.trim()]
      )
    }
  }

  return ok(c, {
    entry_id:      entry.id,
    host_entry_id: hostRes.lastID,
    created:       true
  }, 201)
})

/* ─────────────────────────────────────────
   ERROR HANDLER
───────────────────────────────────────── */
downloads.onError((err, c) => {
  console.error('[downloads.js]', err)
  return c.json({ success: false, message: 'Internal server error' }, 500)
})

export default downloads
