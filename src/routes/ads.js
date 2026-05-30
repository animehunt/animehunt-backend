/* ============================================================
  ANIMEHUNT — ADS ROUTES (COMPLETE - FIXED)
  File: src/routes/ads.js

  PUBLIC routes (no auth):
    GET  /api/ads/public                  - Active ads for page/position
    POST /api/ads/click/:id               - Track click
    POST /api/ads/impression/:id          - Track impression
    GET  /api/go                          - Monetization flow engine
    GET  /api/session/:id                 - Session data for go.html

  ADMIN routes (auth required):
    GET/POST/PUT/DELETE /api/admin/ads              - Page ads
    GET/POST/PUT/DELETE /api/admin/ads-library      - Ads library
    GET/POST/PUT/DELETE /api/admin/shortlinks-library
    GET/POST/PUT/DELETE /api/admin/popup-library
    GET/POST/PUT/DELETE /api/admin/host-monetization
    GET/POST            /api/admin/page-ads
    GET/DELETE          /api/admin/ads-analytics    - Analytics
    GET                 /api/admin/ads-analytics/:id
    DELETE              /api/admin/ads-analytics-clear
============================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ── Helpers ── */
const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })
const now  = () => new Date().toISOString()
const uid  = () => crypto.randomUUID()

function jsonParse(v, fallback=[]) {
  try { return JSON.parse(v || "[]") } catch { return fallback }
}
const jsonStr = v => JSON.stringify(v || [])

function randomPick(arr=[]) {
  if (!arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

function sequencePick(arr=[], index=0) {
  if (!arr.length) return null
  const i = index % arr.length
  return { value: arr[i], next: i + 1 }
}

const directPick = (arr=[]) => arr[0] || null

/* ── Rotation state helpers ── */
async function getRotation(db, key) {
  try {
    return await db.prepare(
      "SELECT current_index FROM rotation_tracker WHERE monetization_id=? LIMIT 1"
    ).bind(key).first()
  } catch { return null }
}

async function setRotation(db, key, nextIndex) {
  try {
    const exists = await getRotation(db, key)
    if (exists) {
      await db.prepare(
        "UPDATE rotation_tracker SET current_index=? WHERE monetization_id=?"
      ).bind(nextIndex, key).run()
    } else {
      await db.prepare(
        "INSERT INTO rotation_tracker (id, monetization_id, current_index) VALUES (?,?,?)"
      ).bind(uid(), key, nextIndex).run()
    }
  } catch (e) {
    // rotation_tracker table might not exist — create it
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS rotation_tracker (
          id TEXT PRIMARY KEY,
          monetization_id TEXT,
          current_index INTEGER DEFAULT 0
        )
      `).run()
      await db.prepare(
        "INSERT OR REPLACE INTO rotation_tracker (id, monetization_id, current_index) VALUES (?,?,?)"
      ).bind(uid(), key, nextIndex).run()
    } catch {}
  }
}

async function pickItem(db, key, mode, items) {
  if (!items?.length) return null
  if (mode === "random")  return randomPick(items)
  if (mode === "direct")  return directPick(items)

  // sequence
  const state = await getRotation(db, key)
  const idx   = state?.current_index || 0
  const picked = sequencePick(items, idx)
  if (picked) await setRotation(db, key, picked.next)
  return picked?.value || null
}

/* ── Ensure download_sessions table ── */
async function ensureSessionsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS download_sessions (
      id           TEXT PRIMARY KEY,
      host_id      TEXT,
      final_link   TEXT,
      knight       INTEGER DEFAULT 0,
      ad_code      TEXT,
      ad_type      TEXT,
      ad_delay     INTEGER DEFAULT 0,
      shortlink_url TEXT,
      popup_script TEXT,
      created_at   TEXT
    )
  `).run().catch(()=>{})
}

/* ============================================================
  PUBLIC — ADS SERVING
============================================================ */

app.get("/api/ads/public", async (c) => {
  const db       = c.env.DB
  const page     = c.req.query("page")     || "all"
  const position = c.req.query("position") || ""

  try {
    let query = `
      SELECT id, name, type, position, page, code, image, link
      FROM ads
      WHERE active=1
      AND (start_date IS NULL OR start_date <= datetime('now'))
      AND (end_date   IS NULL OR end_date   >= datetime('now'))
      AND (page=? OR page='all')
    `
    const binds = [page]

    if (position) {
      query += ` AND (position=? OR position='all')`
      binds.push(position)
    }

    const { results } = await db.prepare(query).bind(...binds).all()

    // Track impressions in background
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(
        Promise.all(results.map(ad =>
          db.prepare("UPDATE ads SET impressions=COALESCE(impressions,0)+1 WHERE id=?")
            .bind(ad.id).run().catch(()=>{})
        ))
      )
    }

    return c.json(ok(results))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* POST /api/ads/click/:id */
app.post("/api/ads/click/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")
  try {
    await db.prepare("UPDATE ads SET clicks=COALESCE(clicks,0)+1 WHERE id=?").bind(id).run()
    const ip = c.req.header("CF-Connecting-IP") || "unknown"
    const ua = c.req.header("User-Agent") || ""
    await db.prepare(`
      INSERT INTO ads_logs (ad_id, type, ip, ua, created_at)
      VALUES (?, 'click', ?, ?, datetime('now'))
    `).bind(id, ip, ua).run().catch(()=>{})
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* POST /api/ads/impression/:id */
app.post("/api/ads/impression/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")
  try {
    await db.prepare("UPDATE ads SET impressions=COALESCE(impressions,0)+1 WHERE id=?").bind(id).run()
    const ip = c.req.header("CF-Connecting-IP") || "unknown"
    const ua = c.req.header("User-Agent") || ""
    await db.prepare(`
      INSERT INTO ads_logs (ad_id, type, ip, ua, created_at)
      VALUES (?, 'impression', ?, ?, datetime('now'))
    `).bind(id, ip, ua).run().catch(()=>{})
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  PUBLIC — /api/go — MONETIZATION FLOW ENGINE (FIXED)
============================================================ */

app.get("/api/go", async (c) => {
  const db = c.env.DB
  const q  = c.req.query

  const hostId  = q("host_id")  || ""
  const quality = q("quality")  || ""

  if (!hostId) return c.redirect("/404.html")

  try {
    await ensureSessionsTable(db)

    // 1. Fetch host config
    const hostEntry = await db.prepare(`
      SELECT dh.id, dh.host, dh.knight, dh.monetization_id, dh.direct_download
      FROM download_hosts dh
      WHERE dh.id=?
    `).bind(hostId).first()

    if (!hostEntry) return c.redirect("/404.html")

    // 2. Fetch monetization config
    let mon = null
    if (hostEntry.monetization_id) {
      mon = await db.prepare(
        "SELECT * FROM host_monetization WHERE id=? LIMIT 1"
      ).bind(hostEntry.monetization_id).first().catch(()=>null)
    }

    // 3. Pick ads/shortlinks/popups
    let selectedAd        = null
    let selectedShortlink = null
    let selectedPopup     = null

    if (mon) {
      const adIds    = jsonParse(mon.ads)
      const shortIds = jsonParse(mon.shortlinks)
      const popupIds = jsonParse(mon.popups)
      const mode     = mon.mode || "random"
      const mId      = mon.id

      if (adIds.length) {
        const adObjs = []
        for (const id of adIds) {
          const ad = await db.prepare(
            "SELECT * FROM ads_library WHERE id=? AND active=1"
          ).bind(id).first().catch(()=>null)
          if (ad) adObjs.push(ad)
        }
        selectedAd = await pickItem(db, mId+"_ad", mode, adObjs)
      }

      if (shortIds.length) {
        const shObjs = []
        for (const id of shortIds) {
          const sh = await db.prepare(
            "SELECT * FROM shortlinks_library WHERE id=? AND active=1"
          ).bind(id).first().catch(()=>null)
          if (sh) shObjs.push(sh)
        }
        selectedShortlink = await pickItem(db, mId+"_short", mode, shObjs)
      }

      if (popupIds.length) {
        const popObjs = []
        for (const id of popupIds) {
          const pop = await db.prepare(
            "SELECT * FROM popup_library WHERE id=? AND active=1"
          ).bind(id).first().catch(()=>null)
          if (pop) popObjs.push(pop)
        }
        selectedPopup = await pickItem(db, mId+"_popup", mode, popObjs)
      }

      // Update click count
      await db.prepare(
        "UPDATE host_monetization SET clicks=COALESCE(clicks,0)+1 WHERE id=?"
      ).bind(mon.id).run().catch(()=>{})
    }

    // 4. Get final link
    let finalLink = ""
    const isKnight = hostEntry.knight === 1 || hostEntry.knight === true

    if (isKnight) {
      // Knight page — quality buttons will be shown
      finalLink = `/knight.html?host_id=${hostId}`
    } else {
      if (quality) {
        const link = await db.prepare(
          "SELECT link FROM download_links WHERE host_id=? AND quality=? LIMIT 1"
        ).bind(hostId, quality).first().catch(()=>null)
        finalLink = link?.link || ""
      }
      if (!finalLink) {
        const link = await db.prepare(
          "SELECT link FROM download_links WHERE host_id=? LIMIT 1"
        ).bind(hostId).first().catch(()=>null)
        finalLink = link?.link || ""
      }
    }

    // 5. Build shortlink URL (wraps final link)
    let shortlinkUrl = null
    if (selectedShortlink?.base_url && finalLink) {
      shortlinkUrl = selectedShortlink.base_url + encodeURIComponent(finalLink)
    }

    // 6. Save session
    const sessionId = uid()
    await db.prepare(`
      INSERT INTO download_sessions (
        id, host_id, final_link, knight,
        ad_code, ad_type, ad_delay,
        shortlink_url, popup_script, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    `).bind(
      sessionId,
      hostId,
      finalLink,
      isKnight ? 1 : 0,
      selectedAd?.code   || null,
      selectedAd?.type   || null,
      selectedAd?.delay  || 0,
      shortlinkUrl,
      selectedPopup?.script || null
    ).run()

    // 7. Redirect to go.html
    return c.redirect(`/go.html?session=${sessionId}`)

  } catch (err) {
    console.error("/api/go error:", err)
    return c.redirect(`/go.html?error=1`)
  }
})

/* GET /api/session/:id — frontend go.html reads this */
app.get("/api/session/:id", async (c) => {
  const db = c.env.DB
  const id = c.req.param("id")
  try {
    await ensureSessionsTable(db)
    const row = await db.prepare(
      "SELECT * FROM download_sessions WHERE id=? LIMIT 1"
    ).bind(id).first()
    if (!row) return c.json(fail("Session not found"), 404)
    return c.json(ok(row))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  ADMIN — PAGE ADS (ads placed on site pages)
============================================================ */

app.get("/api/admin/ads", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM ads ORDER BY created_at DESC"
    ).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.post("/api/admin/ads", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    const id   = uid()
    await db.prepare(`
      INSERT INTO ads (id, name, type, position, page, code, image, link, active, start_date, end_date, impressions, clicks, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,datetime('now'),datetime('now'))
    `).bind(
      id,
      body.name     || "",
      body.type     || "banner",
      body.position || "header",
      body.page     || "all",
      body.code     || "",
      body.image    || "",
      body.link     || "",
      body.active !== false ? 1 : 0,
      body.start_date || null,
      body.end_date   || null
    ).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.put("/api/admin/ads/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()
    await db.prepare(`
      UPDATE ads SET name=?,type=?,position=?,page=?,code=?,image=?,link=?,active=?,start_date=?,end_date=?,updated_at=datetime('now')
      WHERE id=?
    `).bind(
      body.name||"", body.type||"banner", body.position||"header", body.page||"all",
      body.code||"", body.image||"", body.link||"",
      body.active!==false?1:0, body.start_date||null, body.end_date||null, id
    ).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.delete("/api/admin/ads/:id", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM ads WHERE id=?").bind(c.req.param("id")).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — PAGE ADS CONTROL
============================================================ */

app.get("/api/admin/page-ads", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM page_ads ORDER BY page ASC"
    ).all().catch(() => ({ results: [] }))
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.post("/api/admin/page-ads", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    const existing = await db.prepare(
      "SELECT id FROM page_ads WHERE page=? LIMIT 1"
    ).bind(body.page).first().catch(()=>null)

    if (existing) {
      await db.prepare(
        "UPDATE page_ads SET enabled=?, ad_id=?, updated_at=datetime('now') WHERE page=?"
      ).bind(body.enabled?1:0, body.ad_id||null, body.page).run()
    } else {
      await db.prepare(
        "INSERT INTO page_ads (id, page, enabled, ad_id, created_at, updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now'))"
      ).bind(uid(), body.page, body.enabled?1:0, body.ad_id||null).run()
    }

    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — ADS LIBRARY
============================================================ */

app.get("/api/admin/ads-library", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM ads_library ORDER BY created_at DESC"
    ).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.post("/api/admin/ads-library", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    const id   = uid()
    await db.prepare(`
      INSERT INTO ads_library (id, name, type, code, weight, delay, active, created_at)
      VALUES (?,?,?,?,?,?,?,datetime('now'))
    `).bind(id, body.name||"", body.type||"redirect", body.code||"",
            Number(body.weight||1), Number(body.delay||0), body.active!==false?1:0).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.put("/api/admin/ads-library/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()
    await db.prepare(`
      UPDATE ads_library SET name=?,type=?,code=?,weight=?,delay=?,active=? WHERE id=?
    `).bind(body.name||"", body.type||"redirect", body.code||"",
            Number(body.weight||1), Number(body.delay||0), body.active!==false?1:0, id).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.delete("/api/admin/ads-library/:id", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM ads_library WHERE id=?").bind(c.req.param("id")).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — SHORTLINKS LIBRARY
============================================================ */

app.get("/api/admin/shortlinks-library", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM shortlinks_library ORDER BY created_at DESC"
    ).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.post("/api/admin/shortlinks-library", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    const id   = uid()
    await db.prepare(`
      INSERT INTO shortlinks_library (id, name, base_url, api_key, active, created_at)
      VALUES (?,?,?,?,?,datetime('now'))
    `).bind(id, body.name||"", body.base_url||"", body.api_key||"", body.active!==false?1:0).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.put("/api/admin/shortlinks-library/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()
    await db.prepare(`
      UPDATE shortlinks_library SET name=?,base_url=?,api_key=?,active=? WHERE id=?
    `).bind(body.name||"", body.base_url||"", body.api_key||"", body.active!==false?1:0, id).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.delete("/api/admin/shortlinks-library/:id", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM shortlinks_library WHERE id=?").bind(c.req.param("id")).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — POPUP LIBRARY
============================================================ */

app.get("/api/admin/popup-library", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM popup_library ORDER BY created_at DESC"
    ).all()
    return c.json(ok(results))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.post("/api/admin/popup-library", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    const id   = uid()
    await db.prepare(`
      INSERT INTO popup_library (id, name, script, active, created_at)
      VALUES (?,?,?,?,datetime('now'))
    `).bind(id, body.name||"", body.script||"", body.active!==false?1:0).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.put("/api/admin/popup-library/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()
    await db.prepare(`
      UPDATE popup_library SET name=?,script=?,active=? WHERE id=?
    `).bind(body.name||"", body.script||"", body.active!==false?1:0, id).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.delete("/api/admin/popup-library/:id", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM popup_library WHERE id=?").bind(c.req.param("id")).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — HOST MONETIZATION
============================================================ */

app.get("/api/admin/host-monetization", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM host_monetization ORDER BY created_at DESC"
    ).all()
    const data = results.map(h => ({
      ...h,
      ads:        jsonParse(h.ads),
      shortlinks: jsonParse(h.shortlinks),
      popups:     jsonParse(h.popups)
    }))
    return c.json(ok(data))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.post("/api/admin/host-monetization", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    const id   = uid()
    await db.prepare(`
      INSERT INTO host_monetization (id, host, storage, knight, mode, ads, shortlinks, popups, active, clicks, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now'))
    `).bind(
      id,
      body.host    || "",
      body.storage || "",
      body.knight  ? 1 : 0,
      body.mode    || "random",
      jsonStr(body.ads),
      jsonStr(body.shortlinks),
      jsonStr(body.popups),
      body.active !== false ? 1 : 0
    ).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.put("/api/admin/host-monetization/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()
    await db.prepare(`
      UPDATE host_monetization SET host=?,storage=?,knight=?,mode=?,ads=?,shortlinks=?,popups=?,active=?
      WHERE id=?
    `).bind(
      body.host    || "",
      body.storage || "",
      body.knight  ? 1 : 0,
      body.mode    || "random",
      jsonStr(body.ads),
      jsonStr(body.shortlinks),
      jsonStr(body.popups),
      body.active !== false ? 1 : 0,
      id
    ).run()
    return c.json(ok({ id }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.delete("/api/admin/host-monetization/:id", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM host_monetization WHERE id=?").bind(c.req.param("id")).run()
    return c.json(ok())
  } catch (err) { return c.json(fail(err.message), 500) }
})

/* ============================================================
  ADMIN — ADS ANALYTICS (merged from adsAnalytics.js)
  IMPORTANT: /clear PEHLE register karo /:id se — warna conflict
============================================================ */

app.delete("/api/admin/ads-analytics-clear", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM ads_logs").run().catch(()=>{})
    await c.env.DB.prepare("UPDATE ads SET impressions=0, clicks=0").run().catch(()=>{})
    return c.json(ok({ message: "Analytics cleared" }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/admin/ads-analytics", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        a.id, a.name, a.type, a.position, a.page, a.active,
        COALESCE(a.impressions,0) as impressions,
        COALESCE(a.clicks,0) as clicks,
        CASE WHEN COALESCE(a.impressions,0) > 0
          THEN ROUND((COALESCE(a.clicks,0) * 100.0) / a.impressions, 2)
          ELSE 0 END as ctr,
        a.created_at
      FROM ads a
      ORDER BY a.impressions DESC
    `).all()

    const data = results.map(r => ({
      ...r,
      ctr: r.ctr + "%",
      active: !!r.active
    }))
    return c.json(ok(data))
  } catch (err) { return c.json(fail(err.message), 500) }
})

app.get("/api/admin/ads-analytics/:adId", async (c) => {
  const db   = c.env.DB
  const adId = c.req.param("adId")
  try {
    const ad = await db.prepare(
      "SELECT id, name, type, position, page, impressions, clicks, active FROM ads WHERE id=? LIMIT 1"
    ).bind(adId).first()
    if (!ad) return c.json(fail("Ad not found"), 404)

    const { results: daily } = await db.prepare(`
      SELECT substr(created_at, 1, 10) as date, type, COUNT(*) as count
      FROM ads_logs
      WHERE ad_id=? AND created_at >= datetime('now', '-30 days')
      GROUP BY date, type
      ORDER BY date DESC
    `).bind(adId).all().catch(()=>({ results: [] }))

    const dayMap = {}
    daily.forEach(row => {
      if (!dayMap[row.date]) dayMap[row.date] = { date: row.date, impressions: 0, clicks: 0 }
      if (row.type === "impression") dayMap[row.date].impressions = row.count
      if (row.type === "click")      dayMap[row.date].clicks      = row.count
    })

    const breakdown = Object.values(dayMap)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(d => ({
        ...d,
        ctr: d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) + "%" : "0%"
      }))

    return c.json(ok({
      ad: {
        ...ad,
        ctr: (ad.impressions||0) > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) + "%" : "0%",
        active: !!ad.active
      },
      breakdown
    }))
  } catch (err) { return c.json(fail(err.message), 500) }
})

export default app
