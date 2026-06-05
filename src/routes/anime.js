/* ================================================
   anime.js — Admin Anime CRUD (FIXED)
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const animeRoute = new Hono()

/* ========================= */
/* HELPERS                   */
/* ========================= */

const success  = (data)  => ({ success: true,  data })
const failure  = (msg)   => ({ success: false, message: msg })
const now      = ()      => new Date().toISOString()

const makeSlug = (text) =>
  (text || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || ""

const safeJSON  = (val) => JSON.stringify(Array.isArray(val) ? val : [])
const parseJSON = (val) => {
  try { const p = JSON.parse(val || "[]"); return Array.isArray(p) ? p : [] }
  catch { return [] }
}

/* ✅ FIX: single source of truth for mapping DB row -> API object (no duplicate code) */
const mapAnime = (a) => ({
  id:           a.id,
  title:        a.title,
  slug:         a.slug,
  type:         a.type,
  status:       a.status,
  poster:       a.poster,
  banner:       a.banner,
  year:         a.year,
  rating:       a.rating,
  language:     a.language,
  duration:     a.duration,
  genres:       parseJSON(a.genres),
  tags:         parseJSON(a.tags),
  isHome:       !!a.is_home,
  isTrending:   !!a.is_trending,
  isMostViewed: !!a.is_most_viewed,
  isBanner:     !!a.is_banner,
  isHidden:     !!a.is_hidden,
  description:  a.description,
  created_at:   a.created_at,
  updated_at:   a.updated_at
})

/* ✅ FIX: build a clean DB row object from request body (shared by POST/PUT) */
const buildRow = (body, id, createdAt, updatedAt) => ({
  id,
  title:          body.title.trim(),
  slug:           body.slug?.trim() || makeSlug(body.title),
  type:           body.type          || "anime",
  status:         body.status        || "ongoing",
  poster:         body.poster        || "",
  banner:         body.banner        || "",
  year:           Number(body.year)   || null,
  rating:         Number(body.rating) || null,
  language:       body.language      || "",
  duration:       body.duration      || "",
  genres:         safeJSON(body.genres),
  tags:           safeJSON(body.tags),
  is_home:        body.isHome        ? 1 : 0,
  is_trending:    body.isTrending    ? 1 : 0,
  is_most_viewed: body.isMostViewed  ? 1 : 0,
  is_banner:      body.isBanner      ? 1 : 0,
  is_hidden:      body.isHidden      ? 1 : 0,
  description:    body.description   || "",
  created_at:     createdAt,
  updated_at:     updatedAt
})

/* ========================= */
/* VALIDATION                */
/* ========================= */

function validate(body) {
  if (!body || typeof body !== "object") return "Invalid request body"   // ✅ FIX
  if (!body.title?.trim())        return "Title required"
  if (!body.poster?.trim())       return "Poster URL required"
  if (body.rating !== undefined && body.rating !== null && body.rating !== "" && isNaN(Number(body.rating)))
    return "Invalid rating"
  if (body.year !== undefined && body.year !== null && body.year !== "" && isNaN(Number(body.year)))
    return "Invalid year"
  return null
}

/* ========================= */
/* SYNC TO TURSO + SUPABASE  */
/* ========================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  /* ---- Turso ---- */
  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    promises.push(
      fetch(`${env.TURSO_URL}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildTursoPayload(action, data))
      }).catch(e => console.error("Turso sync error:", e))
    )
  }

  /* ---- Supabase ---- */
  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    promises.push(
      syncToSupabase(env, action, data)
        .catch(e => console.error("Supabase sync error:", e))
    )
  }

  /* ✅ FIX: return the promise so callers CAN waitUntil() if they want.
     Still non-blocking by default. */
  return Promise.all(promises)
}

function buildTursoPayload(action, data) {
  if (action === "insert") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql: `INSERT OR REPLACE INTO anime (
            id,title,slug,type,status,poster,banner,year,rating,
            language,duration,genres,tags,
            is_home,is_trending,is_most_viewed,is_banner,is_hidden,
            description,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            {type:"text",value:data.id},
            {type:"text",value:data.title},
            {type:"text",value:data.slug},
            {type:"text",value:data.type},
            {type:"text",value:data.status},
            {type:"text",value:data.poster},
            {type:"text",value:data.banner},
            data.year    ? {type:"integer",value:String(data.year)}  : {type:"null"},   // ✅ FIX: Turso wants string values
            data.rating  ? {type:"float",  value:String(data.rating)}: {type:"null"},   // ✅ FIX
            {type:"text",value:data.language},
            {type:"text",value:data.duration},
            {type:"text",value:data.genres},
            {type:"text",value:data.tags},
            {type:"integer",value:String(data.is_home)},          // ✅ FIX
            {type:"integer",value:String(data.is_trending)},      // ✅ FIX
            {type:"integer",value:String(data.is_most_viewed)},   // ✅ FIX
            {type:"integer",value:String(data.is_banner)},        // ✅ FIX
            {type:"integer",value:String(data.is_hidden)},        // ✅ FIX
            {type:"text",value:data.description},
            {type:"text",value:data.created_at},
            {type:"text",value:data.updated_at}
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
          sql: "DELETE FROM anime WHERE id=?",
          args: [{type:"text",value:data.id}]
        }
      }]
    }
  }

  return { requests: [] }
}

async function syncToSupabase(env, action, data) {
  const base = `${env.SUPABASE_URL}/rest/v1/anime`
  const headers = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates"
  }

  if (action === "insert") {
    /* ✅ FIX: data already has snake_case columns matching the table.
       Supabase REST expects the same column names as the table. */
    const res = await fetch(base, {
      method:  "POST",
      headers,
      body: JSON.stringify(data)
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error("Supabase insert failed:", res.status, txt)   // ✅ FIX: log failures
    }
  }

  if (action === "delete") {
    const res = await fetch(`${base}?id=eq.${data.id}`, {
      method: "DELETE",
      headers
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error("Supabase delete failed:", res.status, txt)
    }
  }
}

/* ========================= */
/* CREATE                    */
/* ========================= */

animeRoute.post("/anime", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }                          // ✅ FIX: guard bad JSON
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const slug = body.slug?.trim() || makeSlug(body.title)
    if (!slug) return c.json(failure("Could not generate slug"), 400)

    const exists = await db.prepare(
      "SELECT id FROM anime WHERE LOWER(slug)=LOWER(?)"
    ).bind(slug).first()

    if (exists) return c.json(failure("Slug already exists — use a different title or slug"), 400)

    const id = crypto.randomUUID()
    const timestamp = now()

    const row = buildRow({ ...body, slug }, id, timestamp, timestamp)

    await db.prepare(`
      INSERT INTO anime (
        id,title,slug,type,status,poster,banner,year,rating,
        language,duration,genres,tags,
        is_home,is_trending,is_most_viewed,is_banner,is_hidden,
        description,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.title, row.slug, row.type, row.status,
      row.poster, row.banner, row.year, row.rating,
      row.language, row.duration, row.genres, row.tags,
      row.is_home, row.is_trending, row.is_most_viewed,
      row.is_banner, row.is_hidden,
      row.description, row.created_at, row.updated_at
    ).run()

    /* ✅ FIX: use waitUntil so sync completes even after response is sent */
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id, slug }), 201)

  } catch (err) {
    console.error("anime POST error:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* GET LIST (paginated)      */
/* ========================= */

animeRoute.get("/anime", async (c) => {
  try {
    const db = c.env.DB

    const page   = Math.max(1, Number(c.req.query("page")  || 1))
    const limit  = Math.min(50, Math.max(1, Number(c.req.query("limit") || 20)))   // ✅ FIX: floor at 1
    const offset = (page - 1) * limit

    const search = c.req.query("search") || ""
    const type   = c.req.query("type")   || ""
    const status = c.req.query("status") || ""
    const home   = c.req.query("home")   || ""   // ✅ FIX: home filter support

    let where  = "WHERE 1=1"
    const params = []

    if (search) { where += " AND title LIKE ?"; params.push(`%${search}%`) }
    if (type)   { where += " AND type = ?";     params.push(type) }
    if (status) { where += " AND status = ?";   params.push(status) }
    if (home === "yes") { where += " AND is_home = 1" }   // ✅ FIX
    if (home === "no")  { where += " AND is_home = 0" }   // ✅ FIX

    const { results } = await db.prepare(`
      SELECT * FROM anime
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    const countRow = await db.prepare(`
      SELECT COUNT(*) as total FROM anime ${where}
    `).bind(...params).first()

    const total = countRow?.total || 0

    /* ✅ FIX: global stats (whole table, not just current page) for accurate dashboard cards */
    const stats = await db.prepare(`
      SELECT
        COUNT(*)                           as total,
        COALESCE(SUM(is_trending), 0)      as totalTrending,
        COALESCE(SUM(is_home), 0)          as totalHome,
        COALESCE(SUM(is_hidden), 0)        as totalHidden
      FROM anime
    `).first()

    const data = (results || []).map(mapAnime)

    return c.json(success({
      page, limit, total, count: data.length, data,
      totalTrending: stats?.totalTrending || 0,
      totalHome:     stats?.totalHome     || 0,
      totalHidden:   stats?.totalHidden   || 0
    }))

  } catch (err) {
    console.error("anime GET error:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* GET SINGLE                */
/* ========================= */

animeRoute.get("/anime/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const a = await db.prepare(
      "SELECT * FROM anime WHERE id=? OR slug=?"
    ).bind(id, id).first()

    if (!a) return c.json(failure("Anime not found"), 404)

    return c.json(success(mapAnime(a)))

  } catch (err) {
    console.error("anime GET single error:", err)   // ✅ FIX: log
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* UPDATE                    */
/* ========================= */

animeRoute.put("/anime/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    let body
    try { body = await c.req.json() }                          // ✅ FIX
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    /* ✅ FIX: fetch original row to PRESERVE created_at on sync */
    const existing = await db.prepare(
      "SELECT id, created_at FROM anime WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Anime not found"), 404)

    const slug = body.slug?.trim() || makeSlug(body.title)

    const slugConflict = await db.prepare(
      "SELECT id FROM anime WHERE LOWER(slug)=LOWER(?) AND id!=?"
    ).bind(slug, id).first()

    if (slugConflict) return c.json(failure("Slug already used by another anime"), 400)

    const timestamp = now()
    const createdAt = existing.created_at || timestamp   // ✅ FIX: keep original creation date

    const row = buildRow({ ...body, slug }, id, createdAt, timestamp)

    await db.prepare(`
      UPDATE anime SET
        title=?,slug=?,type=?,status=?,
        poster=?,banner=?,year=?,rating=?,
        language=?,duration=?,genres=?,tags=?,
        is_home=?,is_trending=?,is_most_viewed=?,
        is_banner=?,is_hidden=?,
        description=?,updated_at=?
      WHERE id=?
    `).bind(
      row.title, row.slug, row.type, row.status,
      row.poster, row.banner, row.year, row.rating,
      row.language, row.duration, row.genres, row.tags,
      row.is_home, row.is_trending, row.is_most_viewed,
      row.is_banner, row.is_hidden,
      row.description, row.updated_at,
      id
    ).run()

    /* ✅ FIX: sync with correct (preserved) created_at */
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id, slug }))

  } catch (err) {
    console.error("anime PUT error:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* DELETE                    */
/* ========================= */

animeRoute.delete("/anime/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare("SELECT id FROM anime WHERE id=?").bind(id).first()
    if (!existing) return c.json(failure("Anime not found"), 404)

    await db.prepare("DELETE FROM anime WHERE id=?").bind(id).run()

    if (c.executionCtx?.waitUntil) {                           // ✅ FIX
      c.executionCtx.waitUntil(syncToReplicas(c.env, "delete", { id }))
    } else {
      syncToReplicas(c.env, "delete", { id })
    }

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("anime DELETE error:", err)
    return c.json(failure(err.message), 500)
  }
})

export default animeRoute
