/* ================================================
   episodes.js — Admin + Public Episodes Routes
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ================= HELPERS ================= */

const success  = (data) => ({ success: true, data })
const failure  = (msg)  => ({ success: false, message: msg })
const now      = ()     => new Date().toISOString()

const safeJSON = (val) => {
  try { return JSON.parse(val || "[]") }
  catch { return [] }
}

const toJSON = (val) =>
  JSON.stringify(Array.isArray(val) ? val : [])

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body || typeof body !== "object") return "Invalid request body"
  if (!body.anime_id)                    return "anime_id required"
  if (body.episode === undefined || body.episode === null || body.episode === "")
    return "episode number required"
  const ep = Number(body.episode)
  if (isNaN(ep))  return "episode must be a number"
  if (ep < 1)     return "episode must be 1 or more"
  return null
}

/* ================= SYNC TO REPLICAS ================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    promises.push(
      fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify(buildTursoPayload(action, data))
      }).catch(e => console.error("Turso sync error:", e))
    )
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    promises.push(
      syncSupabase(env, action, data)
        .catch(e => console.error("Supabase sync error:", e))
    )
  }

  return Promise.all(promises)
}

function buildTursoPayload(action, data) {
  if (action === "insert") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql: `INSERT OR REPLACE INTO episodes (
            id,anime_id,anime_title,season,episode,
            title,description,thumbnail,servers,
            ongoing,featured,sort_order,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: String(data.id) },
            { type:"text",    value: String(data.anime_id) },
            { type:"text",    value: String(data.anime_title) },
            { type:"text",    value: String(data.season) },
            { type:"integer", value: String(data.episode) },
            { type:"text",    value: String(data.title) },
            { type:"text",    value: String(data.description) },
            { type:"text",    value: String(data.thumbnail) },
            { type:"text",    value: String(data.servers) },
            { type:"integer", value: String(data.ongoing) },
            { type:"integer", value: String(data.featured) },
            { type:"integer", value: String(data.sort_order || 0) },
            { type:"text",    value: String(data.created_at) },
            { type:"text",    value: String(data.updated_at) }
          ]
        }
      }]
    }
  }
  if (action === "delete") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql:  "DELETE FROM episodes WHERE id=?",
          args: [{ type:"text", value: String(data.id) }]
        }
      }]
    }
  }
  return { requests: [] }
}

async function syncSupabase(env, action, data) {
  const base    = `${env.SUPABASE_URL}/rest/v1/episodes`
  const headers = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates"
  }
  if (action === "insert") {
    const res = await fetch(base, { method:"POST", headers, body: JSON.stringify(data) })
    if (!res.ok) {
      const txt = await res.text()
      console.error("Supabase episodes insert failed:", res.status, txt)
    }
  }
  if (action === "delete") {
    const res = await fetch(`${base}?id=eq.${encodeURIComponent(data.id)}`, {
      method:  "DELETE",
      headers: { ...headers, Prefer: undefined }
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error("Supabase episodes delete failed:", res.status, txt)
    }
  }
}

/* ================= CREATE ================= */

app.post("/episodes", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const dup = await db.prepare(`
      SELECT id FROM episodes
      WHERE anime_id=? AND season=? AND episode=?
    `).bind(body.anime_id, String(body.season || "1"), Number(body.episode)).first()

    if (dup) return c.json(
      failure(`S${body.season}E${body.episode} already exists for this anime`), 400
    )

    const id        = crypto.randomUUID()
    const timestamp = now()

    const maxSort = await db.prepare(
      "SELECT COALESCE(MAX(sort_order),0) as m FROM episodes WHERE anime_id=?"
    ).bind(String(body.anime_id)).first()

    const row = {
      id,
      anime_id:    String(body.anime_id),
      anime_title: String(body.anime_title  || ""),
      season:      String(body.season       || "1"),
      episode:     Number(body.episode),
      title:       String(body.title        || ""),
      description: String(body.description  || ""),
      thumbnail:   String(body.thumbnail    || ""),
      servers:     toJSON(body.servers),
      ongoing:     body.ongoing  ? 1 : 0,
      featured:    body.featured ? 1 : 0,
      sort_order:  (maxSort?.m || 0) + 1,
      created_at:  timestamp,
      updated_at:  timestamp
    }

    await db.prepare(`
      INSERT INTO episodes (
        id,anime_id,anime_title,season,episode,
        title,description,thumbnail,servers,
        ongoing,featured,sort_order,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.anime_id, row.anime_title,
      row.season, row.episode, row.title, row.description,
      row.thumbnail, row.servers,
      row.ongoing, row.featured, row.sort_order,
      row.created_at, row.updated_at
    ).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id }), 201)

  } catch (err) {
    console.error("episodes POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ALL (ADMIN) ================= */

app.get("/episodes", async (c) => {
  try {
    const db     = c.env.DB
    const page   = Math.max(1,  Number(c.req.query("page")     || 1))
    const limit  = Math.min(50, Number(c.req.query("limit")    || 30))
    const offset = (page - 1) * limit
    const animeId = c.req.query("anime_id") || ""
    const season  = c.req.query("season")   || ""
    const search  = c.req.query("search")   || ""

    let where    = "WHERE 1=1"
    const params = []

    if (animeId) { where += " AND anime_id=?"; params.push(animeId) }
    if (season)  { where += " AND season=?";   params.push(season)  }
    if (search)  {
      where += " AND (title LIKE ? OR anime_title LIKE ?)"
      params.push(`%${search}%`, `%${search}%`)
    }

    const { results } = await db.prepare(`
      SELECT * FROM episodes
      ${where}
      ORDER BY anime_title ASC, CAST(season AS INTEGER) ASC, episode ASC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    const countRow = await db.prepare(
      `SELECT COUNT(*) as total FROM episodes ${where}`
    ).bind(...params).first()

    const globalStats = await db.prepare(`
      SELECT
        COUNT(*)                         as totalAll,
        COALESCE(SUM(featured), 0)       as totalFeatured,
        COALESCE(SUM(ongoing),  0)       as totalOngoing,
        COUNT(DISTINCT anime_id)         as totalAnime
      FROM episodes
    `).first()

    const data = (results || []).map(e => ({
      id:          e.id,
      anime_id:    e.anime_id,
      anime_title: e.anime_title,
      season:      e.season,
      episode:     e.episode,
      title:       e.title,
      description: e.description,
      thumbnail:   e.thumbnail,
      servers:     safeJSON(e.servers),
      ongoing:     !!e.ongoing,
      featured:    !!e.featured,
      sort_order:  e.sort_order || 0,
      created_at:  e.created_at,
      updated_at:  e.updated_at
    }))

    return c.json(success({
      page, limit,
      total: countRow?.total || 0,
      count: data.length,
      data,
      totalFeatured: Number(globalStats?.totalFeatured) || 0,
      totalOngoing:  Number(globalStats?.totalOngoing)  || 0,
      totalAnime:    Number(globalStats?.totalAnime)    || 0
    }))

  } catch (err) {
    console.error("episodes GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ONE ================= */

app.get("/episodes/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT * FROM episodes WHERE id=?").bind(id).first()

    if (!row) return c.json(failure("Episode not found"), 404)

    return c.json(success({
      id:          row.id,
      anime_id:    row.anime_id,
      anime_title: row.anime_title,
      season:      row.season,
      episode:     row.episode,
      title:       row.title,
      description: row.description,
      thumbnail:   row.thumbnail,
      servers:     safeJSON(row.servers),
      ongoing:     !!row.ongoing,
      featured:    !!row.featured,
      sort_order:  row.sort_order || 0,
      created_at:  row.created_at,
      updated_at:  row.updated_at
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= UPDATE ================= */

app.put("/episodes/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const existing = await db.prepare(
      "SELECT id, created_at, sort_order FROM episodes WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Episode not found"), 404)

    const dup = await db.prepare(`
      SELECT id FROM episodes
      WHERE anime_id=? AND season=? AND episode=? AND id!=?
    `).bind(body.anime_id, String(body.season || "1"), Number(body.episode), id).first()

    if (dup) return c.json(
      failure(`S${body.season}E${body.episode} already exists`), 400
    )

    const timestamp = now()
    const row = {
      id,
      anime_id:    String(body.anime_id),
      anime_title: String(body.anime_title  || ""),
      season:      String(body.season       || "1"),
      episode:     Number(body.episode),
      title:       String(body.title        || ""),
      description: String(body.description  || ""),
      thumbnail:   String(body.thumbnail    || ""),
      servers:     toJSON(body.servers),
      ongoing:     body.ongoing  ? 1 : 0,
      featured:    body.featured ? 1 : 0,
      sort_order:  existing.sort_order || 0,
      created_at:  existing.created_at || timestamp,
      updated_at:  timestamp
    }

    await db.prepare(`
      UPDATE episodes SET
        anime_id=?,anime_title=?,
        season=?,episode=?,
        title=?,description=?,
        thumbnail=?,servers=?,
        ongoing=?,featured=?,
        updated_at=?
      WHERE id=?
    `).bind(
      row.anime_id, row.anime_title,
      row.season, row.episode,
      row.title, row.description,
      row.thumbnail, row.servers,
      row.ongoing, row.featured,
      row.updated_at, id
    ).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id }))

  } catch (err) {
    console.error("episodes PUT:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= BULK DELETE by IDs ================= */
/* ROUTE ORDER FIX: Must be registered BEFORE DELETE /episodes/:id
   Otherwise Hono matches "bulk" as :id param and returns 404 */
app.delete('/episodes/bulk', async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure('Invalid JSON body'), 400) }

    const episodeIds = body?.episodeIds
    if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
      return c.json(failure('episodeIds array required'), 400)
    }

    // Safety cap — prevent runaway deletes
    const ids = episodeIds.slice(0, 100)
    const placeholders = ids.map(() => '?').join(',')

    // Fetch IDs before delete so we can sync replicas
    const { results: toDelete } = await db.prepare(
      `SELECT id FROM episodes WHERE id IN (${placeholders})`
    ).bind(...ids).all()

    if (!toDelete.length) {
      return c.json(success({ deleted: 0 }))
    }

    // Single D1 query — no loop, no subrequest overflow
    const deleteIds = toDelete.map(r => r.id)
    const delPlaceholders = deleteIds.map(() => '?').join(',')
    const result = await db.prepare(
      `DELETE FROM episodes WHERE id IN (${delPlaceholders})`
    ).bind(...deleteIds).run()

    // Sync replicas non-blocking
    const syncAll = Promise.all(deleteIds.map(id => syncToReplicas(c.env, 'delete', { id })))
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncAll)
    } else {
      syncAll.catch(() => {})
    }

    return c.json(success({ deleted: result.meta?.changes || deleteIds.length }))

  } catch (err) {
    console.error('episodes bulk DELETE by IDs:', err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= REORDER EPISODES ================= */
/* ROUTE ORDER FIX: registered before :id routes to avoid param collision
   Drag-and-drop reorder: accepts array of episode IDs in new order.
   Uses D1 batch to update sort_order in a single round-trip. */
app.post('/episodes/reorder', async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure('Invalid JSON body'), 400) }

    const { animeId, orderedIds } = body || {}

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return c.json(failure('orderedIds array required'), 400)
    }

    if (!animeId) {
      return c.json(failure('animeId required'), 400)
    }

    const timestamp = now()

    // D1 batch — one network call for all updates
    const statements = orderedIds.map((id, index) =>
      db.prepare(
        'UPDATE episodes SET sort_order=?, updated_at=? WHERE id=? AND anime_id=?'
      ).bind(index + 1, timestamp, id, animeId)
    )

    await db.batch(statements)

    return c.json(success({ reordered: orderedIds.length }))

  } catch (err) {
    console.error('episodes reorder:', err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= DELETE ================= */

app.delete("/episodes/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare(
      "SELECT id FROM episodes WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Episode not found"), 404)

    await db.prepare("DELETE FROM episodes WHERE id=?").bind(id).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "delete", { id }))
    } else {
      syncToReplicas(c.env, "delete", { id })
    }

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("episodes DELETE:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= BULK DELETE by anime ================= */

app.delete("/episodes/anime/:animeId", async (c) => {
  try {
    const db      = c.env.DB
    const animeId = c.req.param("animeId")

    const { results } = await db.prepare(
      "SELECT id FROM episodes WHERE anime_id=?"
    ).bind(animeId).all()

    if (!results.length) return c.json(success({ deleted: 0 }))

    await db.prepare(
      "DELETE FROM episodes WHERE anime_id=?"
    ).bind(animeId).run()

    const syncAll = Promise.all(results.map(r => syncToReplicas(c.env, "delete", { id: r.id })))
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncAll)
    } else {
      await syncAll
    }

    return c.json(success({ deleted: results.length }))

  } catch (err) {
    console.error("episodes bulk DELETE:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   PUBLIC ROUTES
================================================ */

app.get("/public/episodes/:animeId", async (c) => {
  try {
    const db      = c.env.DB
    const animeId = c.req.param("animeId")
    const season  = c.req.query("season") || ""

    let query  = `SELECT id,season,episode,title,thumbnail,servers
                  FROM episodes WHERE anime_id=?`
    const args = [animeId]

    if (season) { query += " AND season=?"; args.push(season) }
    query += " ORDER BY CAST(season AS INTEGER) ASC, episode ASC"

    const { results } = await db.prepare(query).bind(...args).all()

    return c.json(success(
      results.map(e => ({
        id:        e.id,
        season:    e.season,
        episode:   e.episode,
        title:     e.title,
        thumbnail: e.thumbnail,
        servers:   safeJSON(e.servers)
      }))
    ))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.get("/public/servers/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare(
      "SELECT servers FROM episodes WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(success([]))

    return c.json(success(
      safeJSON(row.servers).map((url, i) => ({ index: i, url }))
    ))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.get("/public/seasons/:animeId", async (c) => {
  try {
    const db      = c.env.DB
    const animeId = c.req.param("animeId")

    const { results } = await db.prepare(`
      SELECT season, COUNT(*) as ep_count
      FROM episodes
      WHERE anime_id=?
      GROUP BY season
      ORDER BY CAST(season AS INTEGER) ASC
    `).bind(animeId).all()

    return c.json(success(results))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
