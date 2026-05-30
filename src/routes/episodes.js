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
  if (!body.anime_id)              return "anime_id required"
  if (!body.episode)               return "episode number required"
  if (isNaN(Number(body.episode))) return "episode must be a number"
  return null
}

/* ================= SYNC TO REPLICAS ================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    promises.push(
      fetch(`${env.TURSO_URL}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
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

  Promise.all(promises)
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
            ongoing,featured,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: data.id },
            { type:"text",    value: data.anime_id },
            { type:"text",    value: data.anime_title },
            { type:"text",    value: data.season },
            { type:"integer", value: data.episode },
            { type:"text",    value: data.title },
            { type:"text",    value: data.description },
            { type:"text",    value: data.thumbnail },
            { type:"text",    value: data.servers },
            { type:"integer", value: data.ongoing },
            { type:"integer", value: data.featured },
            { type:"text",    value: data.created_at },
            { type:"text",    value: data.updated_at }
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
          args: [{ type:"text", value: data.id }]
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
    await fetch(base, { method:"POST", headers, body: JSON.stringify(data) })
  }
  if (action === "delete") {
    await fetch(`${base}?id=eq.${data.id}`, { method:"DELETE", headers })
  }
}

/* ================= CREATE ================= */

app.post("/episodes", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const dup = await db.prepare(`
      SELECT id FROM episodes
      WHERE anime_id=? AND season=? AND episode=?
    `).bind(body.anime_id, body.season || "1", Number(body.episode)).first()

    if (dup) return c.json(
      failure(`S${body.season}E${body.episode} already exists for this anime`), 400
    )

    const id        = crypto.randomUUID()
    const timestamp = now()

    const row = {
      id,
      anime_id:    body.anime_id,
      anime_title: body.anime_title  || "",
      season:      String(body.season  || "1"),
      episode:     Number(body.episode),
      title:       body.title          || "",
      description: body.description    || "",
      thumbnail:   body.thumbnail      || "",
      servers:     toJSON(body.servers),
      ongoing:     body.ongoing  ? 1 : 0,
      featured:    body.featured ? 1 : 0,
      created_at:  timestamp,
      updated_at:  timestamp
    }

    await db.prepare(`
      INSERT INTO episodes (
        id,anime_id,anime_title,season,episode,
        title,description,thumbnail,servers,
        ongoing,featured,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.anime_id, row.anime_title,
      row.season, row.episode, row.title, row.description,
      row.thumbnail, row.servers,
      row.ongoing, row.featured,
      row.created_at, row.updated_at
    ).run()

    syncToReplicas(c.env, "insert", row)

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

    const data = results.map(e => ({
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
      created_at:  e.created_at,
      updated_at:  e.updated_at
    }))

    return c.json(success({
      page, limit,
      total: countRow?.total || 0,
      count: data.length,
      data
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
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const existing = await db.prepare(
      "SELECT id FROM episodes WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Episode not found"), 404)

    const dup = await db.prepare(`
      SELECT id FROM episodes
      WHERE anime_id=? AND season=? AND episode=? AND id!=?
    `).bind(body.anime_id, body.season || "1", Number(body.episode), id).first()

    if (dup) return c.json(
      failure(`S${body.season}E${body.episode} already exists`), 400
    )

    const timestamp = now()
    const row = {
      id,
      anime_id:    body.anime_id,
      anime_title: body.anime_title  || "",
      season:      String(body.season  || "1"),
      episode:     Number(body.episode),
      title:       body.title          || "",
      description: body.description    || "",
      thumbnail:   body.thumbnail      || "",
      servers:     toJSON(body.servers),
      ongoing:     body.ongoing  ? 1 : 0,
      featured:    body.featured ? 1 : 0,
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

    syncToReplicas(c.env, "insert", { ...row, created_at: now() })

    return c.json(success({ id }))

  } catch (err) {
    console.error("episodes PUT:", err)
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

    syncToReplicas(c.env, "delete", { id })

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

    await db.prepare(
      "DELETE FROM episodes WHERE anime_id=?"
    ).bind(animeId).run()

    results.forEach(r => syncToReplicas(c.env, "delete", { id: r.id }))

    return c.json(success({ deleted: results.length }))

  } catch (err) {
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
