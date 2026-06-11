/**
 * ads.js — AnimeHunt CMS  (Hono)
 * Handles: Ads Library, Shortlinks, Popups, Host Monetization,
 *          Page Ads Config, Poster Targeting, Ad Stats
 *
 * Usage:
 *   import adsRoutes from './ads.js'
 *   app.route('/api', adsRoutes)
 *
 * Expects:
 *   - ctx.var.db   → your DB instance (set via middleware)
 *   - ctx.var.user → set by your auth middleware
 */

import { Hono } from 'hono'

const ads = new Hono()

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

/** Convert input to a JSON array string safely */
function safeJsonArray(val) {
  if (!val) return '[]'
  if (Array.isArray(val)) return JSON.stringify(val)
  if (typeof val === 'string') {
    try { if (Array.isArray(JSON.parse(val))) return val } catch {}
  }
  return '[]'
}

/* ─────────────────────────────────────────
   AUTH MIDDLEWARE (applied to all routes)
───────────────────────────────────────── */

ads.use('*', async (c, next) => {
  const user = c.var.user ?? c.get('user')
  if (!user) return fail(c, 'Unauthorized', 401)
  await next()
})

/* ═════════════════════════════════════════
   ADS LIBRARY
   GET    /ads-library
   POST   /ads-library
   PUT    /ads-library/:id
   DELETE /ads-library/:id
═════════════════════════════════════════ */

ads.get('/ads-library', async (c) => {
  const rows = await db(c).all('SELECT * FROM ads_library ORDER BY id DESC')
  return ok(c, rows)
})

ads.post('/ads-library', async (c) => {
  const body = await c.req.json()
  const { name, code, type, delay, weight, active } = body

  if (!name?.trim()) return fail(c, 'name is required')
  if (!code?.trim()) return fail(c, 'code is required')

  const result = await db(c).run(
    `INSERT INTO ads_library (name, code, type, delay, weight, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      name.trim(), code.trim(),
      type   || 'popup',
      parseInt(delay)  || 0,
      parseInt(weight) || 1,
      active != null ? parseInt(active) : 1
    ]
  )
  const row = await db(c).get('SELECT * FROM ads_library WHERE id = ?', [result.lastID])
  return ok(c, row, 201)
})

ads.put('/ads-library/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM ads_library WHERE id = ?', [id])
  if (!existing) return fail(c, 'Ad not found', 404)

  const body = await c.req.json()
  const { name, code, type, delay, weight, active } = body

  if (!name?.trim()) return fail(c, 'name is required')
  if (!code?.trim()) return fail(c, 'code is required')

  await db(c).run(
    `UPDATE ads_library
     SET name=?, code=?, type=?, delay=?, weight=?, active=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      name.trim(), code.trim(),
      type   || 'popup',
      parseInt(delay)  || 0,
      parseInt(weight) || 1,
      active != null ? parseInt(active) : 1,
      id
    ]
  )
  const row = await db(c).get('SELECT * FROM ads_library WHERE id = ?', [id])
  return ok(c, row)
})

ads.delete('/ads-library/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM ads_library WHERE id = ?', [id])
  if (!existing) return fail(c, 'Ad not found', 404)

  await db(c).run('DELETE FROM ads_library WHERE id = ?', [id])
  return ok(c, { deleted: true, id: parseInt(id) })
})

/* ═════════════════════════════════════════
   SHORTLINKS LIBRARY
   GET    /shortlinks-library
   POST   /shortlinks-library
   PUT    /shortlinks-library/:id
   DELETE /shortlinks-library/:id
═════════════════════════════════════════ */

ads.get('/shortlinks-library', async (c) => {
  const rows = await db(c).all('SELECT * FROM shortlinks_library ORDER BY id DESC')
  return ok(c, rows)
})

ads.post('/shortlinks-library', async (c) => {
  const body = await c.req.json()
  const { name, base_url, api_key, active, weight } = body

  if (!name?.trim())     return fail(c, 'name is required')
  if (!base_url?.trim()) return fail(c, 'base_url is required')

  const result = await db(c).run(
    `INSERT INTO shortlinks_library (name, base_url, api_key, active, weight, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      name.trim(), base_url.trim(),
      api_key || '',
      active  != null ? parseInt(active)  : 1,
      parseInt(weight) || 1
    ]
  )
  const row = await db(c).get('SELECT * FROM shortlinks_library WHERE id = ?', [result.lastID])
  return ok(c, row, 201)
})

ads.put('/shortlinks-library/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM shortlinks_library WHERE id = ?', [id])
  if (!existing) return fail(c, 'Shortlink not found', 404)

  const body = await c.req.json()
  const { name, base_url, api_key, active, weight } = body

  if (!name?.trim())     return fail(c, 'name is required')
  if (!base_url?.trim()) return fail(c, 'base_url is required')

  await db(c).run(
    `UPDATE shortlinks_library
     SET name=?, base_url=?, api_key=?, active=?, weight=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      name.trim(), base_url.trim(),
      api_key || '',
      active  != null ? parseInt(active)  : 1,
      parseInt(weight) || 1,
      id
    ]
  )
  const row = await db(c).get('SELECT * FROM shortlinks_library WHERE id = ?', [id])
  return ok(c, row)
})

ads.delete('/shortlinks-library/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM shortlinks_library WHERE id = ?', [id])
  if (!existing) return fail(c, 'Shortlink not found', 404)

  await db(c).run('DELETE FROM shortlinks_library WHERE id = ?', [id])
  return ok(c, { deleted: true, id: parseInt(id) })
})

/* ═════════════════════════════════════════
   POPUP LIBRARY
   GET    /popup-library
   POST   /popup-library
   PUT    /popup-library/:id
   DELETE /popup-library/:id
═════════════════════════════════════════ */

ads.get('/popup-library', async (c) => {
  const rows = await db(c).all('SELECT * FROM popup_library ORDER BY id DESC')
  return ok(c, rows)
})

ads.post('/popup-library', async (c) => {
  const body = await c.req.json()
  const { name, script, active, trigger } = body

  if (!name?.trim())   return fail(c, 'name is required')
  if (!script?.trim()) return fail(c, 'script is required')

  const result = await db(c).run(
    `INSERT INTO popup_library (name, script, active, trigger, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [
      name.trim(), script.trim(),
      active  != null ? parseInt(active) : 1,
      trigger || 'onload'
    ]
  )
  const row = await db(c).get('SELECT * FROM popup_library WHERE id = ?', [result.lastID])
  return ok(c, row, 201)
})

ads.put('/popup-library/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM popup_library WHERE id = ?', [id])
  if (!existing) return fail(c, 'Popup not found', 404)

  const body = await c.req.json()
  const { name, script, active, trigger } = body

  if (!name?.trim())   return fail(c, 'name is required')
  if (!script?.trim()) return fail(c, 'script is required')

  await db(c).run(
    `UPDATE popup_library
     SET name=?, script=?, active=?, trigger=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      name.trim(), script.trim(),
      active != null ? parseInt(active) : 1,
      trigger || 'onload',
      id
    ]
  )
  const row = await db(c).get('SELECT * FROM popup_library WHERE id = ?', [id])
  return ok(c, row)
})

ads.delete('/popup-library/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM popup_library WHERE id = ?', [id])
  if (!existing) return fail(c, 'Popup not found', 404)

  await db(c).run('DELETE FROM popup_library WHERE id = ?', [id])
  return ok(c, { deleted: true, id: parseInt(id) })
})

/* ═════════════════════════════════════════
   HOST MONETIZATION
   GET    /host-monetization
   POST   /host-monetization
   PUT    /host-monetization/:id
   DELETE /host-monetization/:id
═════════════════════════════════════════ */

ads.get('/host-monetization', async (c) => {
  const rows = await db(c).all('SELECT * FROM host_monetization ORDER BY id DESC')
  return ok(c, rows)
})

ads.post('/host-monetization', async (c) => {
  const body = await c.req.json()
  const { host_id, mode, ads: adsArr, shortlinks, popups, active } = body

  if (!host_id) return fail(c, 'host_id is required')

  const host = await db(c).get('SELECT id FROM hosts WHERE id = ?', [host_id])
  if (!host) return fail(c, 'Host not found', 404)

  const dup = await db(c).get('SELECT id FROM host_monetization WHERE host_id = ?', [host_id])
  if (dup) return fail(c, 'Config already exists for this host — use PUT to update')

  const result = await db(c).run(
    `INSERT INTO host_monetization (host_id, mode, ads, shortlinks, popups, active, clicks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
    [
      parseInt(host_id),
      mode   || 'random',
      safeJsonArray(adsArr),
      safeJsonArray(shortlinks),
      safeJsonArray(popups),
      active != null ? parseInt(active) : 1
    ]
  )
  const row = await db(c).get('SELECT * FROM host_monetization WHERE id = ?', [result.lastID])
  return ok(c, row, 201)
})

ads.put('/host-monetization/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM host_monetization WHERE id = ?', [id])
  if (!existing) return fail(c, 'Config not found', 404)

  const body = await c.req.json()
  const { host_id, mode, ads: adsArr, shortlinks, popups, active } = body

  if (!host_id) return fail(c, 'host_id is required')

  await db(c).run(
    `UPDATE host_monetization
     SET host_id=?, mode=?, ads=?, shortlinks=?, popups=?, active=?, updated_at=datetime('now')
     WHERE id=?`,
    [
      parseInt(host_id),
      mode || 'random',
      safeJsonArray(adsArr),
      safeJsonArray(shortlinks),
      safeJsonArray(popups),
      active != null ? parseInt(active) : 1,
      id
    ]
  )
  const row = await db(c).get('SELECT * FROM host_monetization WHERE id = ?', [id])
  return ok(c, row)
})

ads.delete('/host-monetization/:id', async (c) => {
  const id       = c.req.param('id')
  const existing = await db(c).get('SELECT id FROM host_monetization WHERE id = ?', [id])
  if (!existing) return fail(c, 'Config not found', 404)

  await db(c).run('DELETE FROM host_monetization WHERE id = ?', [id])
  return ok(c, { deleted: true, id: parseInt(id) })
})

/* ═════════════════════════════════════════
   PAGE ADS CONFIG
   GET  /page-ads-config
   POST /page-ads-config  (upsert)
═════════════════════════════════════════ */

const PAGE_ADS_BOOL = [
  'home_enabled','detail_enabled','eplist_enabled','dl_enabled',
  'knight_enabled','nav_enabled','go_popup','go_sl','go_ads',
  'mobile_ads','mobile_extra'
]
const PAGE_ADS_STR = [
  'home_position','detail_position','dl_position','knight_position',
  'home_ad','detail_ad','eplist_ad','dl_ad','knight_ad','nav_ad'
]
const PAGE_ADS_NUM = [
  'eplist_interval','nav_interval','redirect_delay',
  'redirect_skip','popup_max','popup_cooldown'
]

ads.get('/page-ads-config', async (c) => {
  const row = await db(c).get('SELECT config FROM page_ads_config WHERE id = 1')
  if (!row) return ok(c, {})
  try { return ok(c, JSON.parse(row.config)) } catch { return ok(c, {}) }
})

ads.post('/page-ads-config', async (c) => {
  const body   = await c.req.json()
  const config = {}

  PAGE_ADS_BOOL.forEach(k => { if (k in body) config[k] = !!body[k] })
  PAGE_ADS_STR.forEach(k  => { if (k in body) config[k] = String(body[k] ?? '') })
  PAGE_ADS_NUM.forEach(k  => { if (k in body) config[k] = parseInt(body[k]) || 0 })

  const existing = await db(c).get('SELECT id FROM page_ads_config WHERE id = 1')
  if (existing) {
    await db(c).run(
      `UPDATE page_ads_config SET config=?, updated_at=datetime('now') WHERE id=1`,
      [JSON.stringify(config)]
    )
  } else {
    await db(c).run(
      `INSERT INTO page_ads_config (id, config, created_at, updated_at)
       VALUES (1, ?, datetime('now'), datetime('now'))`,
      [JSON.stringify(config)]
    )
  }
  return ok(c, config)
})

/* ═════════════════════════════════════════
   POSTER AD TARGETS
   GET  /poster-ad-targets
   POST /poster-ad-targets  (bulk replace)
═════════════════════════════════════════ */

ads.get('/poster-ad-targets', async (c) => {
  const rows = await db(c).all('SELECT anime_id, ad_id FROM poster_ad_targets')
  return ok(c, rows)
})

ads.post('/poster-ad-targets', async (c) => {
  const body    = await c.req.json()
  const targets = body.targets

  if (!Array.isArray(targets)) return fail(c, 'targets must be an array')

  for (const t of targets) {
    if (!t.anime_id) return fail(c, 'Each target must have anime_id')
    if (!t.ad_id)    return fail(c, 'Each target must have ad_id')
  }

  await db(c).run('DELETE FROM poster_ad_targets')
  for (const t of targets) {
    await db(c).run(
      `INSERT INTO poster_ad_targets (anime_id, ad_id, updated_at) VALUES (?, ?, datetime('now'))`,
      [parseInt(t.anime_id), parseInt(t.ad_id)]
    )
  }
  return ok(c, { saved: targets.length })
})

/* ═════════════════════════════════════════
   AD STATS
   GET  /ads/stats
   POST /ads/stats/track
═════════════════════════════════════════ */

ads.get('/ads/stats', async (c) => {
  const row = await db(c).get('SELECT * FROM ad_stats WHERE id = 1')
  if (!row) return ok(c, { impressions: 0, ad_clicks: 0, shortlink_clicks: 0, popup_opens: 0 })
  return ok(c, {
    impressions:      row.impressions      || 0,
    ad_clicks:        row.ad_clicks        || 0,
    shortlink_clicks: row.shortlink_clicks || 0,
    popup_opens:      row.popup_opens      || 0
  })
})

ads.post('/ads/stats/track', async (c) => {
  const body = await c.req.json()
  const { event } = body

  const colMap = {
    impression:      'impressions',
    ad_click:        'ad_clicks',
    shortlink_click: 'shortlink_clicks',
    popup_open:      'popup_opens'
  }
  const col = colMap[event]
  if (!col) return fail(c, 'Unknown event type')

  const existing = await db(c).get('SELECT id FROM ad_stats WHERE id = 1')
  if (existing) {
    await db(c).run(`UPDATE ad_stats SET ${col} = ${col} + 1 WHERE id = 1`)
  } else {
    const init = { impressions: 0, ad_clicks: 0, shortlink_clicks: 0, popup_opens: 0, [col]: 1 }
    await db(c).run(
      `INSERT INTO ad_stats (id, impressions, ad_clicks, shortlink_clicks, popup_opens)
       VALUES (1, ?, ?, ?, ?)`,
      [init.impressions, init.ad_clicks, init.shortlink_clicks, init.popup_opens]
    )
  }
  return ok(c, { tracked: true })
})

/* ─────────────────────────────────────────
   ERROR HANDLER
───────────────────────────────────────── */
ads.onError((err, c) => {
  console.error('[ads.js]', err)
  return c.json({ success: false, message: 'Internal server error' }, 500)
})

export default ads
