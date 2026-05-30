/* ================================================
   anime.js — Admin Anime CRUD
   Auth handled by adminAuth middleware in index.js
   NO local auth middleware here
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
  text?.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || ""

const safeJSON  = (val) => JSON.stringify(Array.isArray(val) ? val : [])
const parseJSON = (val) => {
  try { return JSON.parse(val || "[]") }
  catch { return [] }
}

/* ========================= */
/* VALIDATION                */
/* ========================= */

function validate(body) {
  if (!body.title?.trim())        return "Title required"
  if (!body.poster?.trim())       return "Poster URL required"
  if (body.rating !== undefined && body.rating !== null && isNaN(Number(body.rating)))
    return "Invalid rating"
  if (body.year !== undefined && body.year !== null && isNaN(Number(body.year)))
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

  /* Fire-and-forget — don't block main response */
  Promise.all(promises)
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
            data.year    ? {type:"integer",value:data.year}   : {type:"null"},
            data.rating  ? {type:"float",  value:data.rating} : {type:"null"},
            {type:"text",value:data.language},
            {type:"text",value:data.duration},
            {type:"text",value:data.genres},
            {type:"text",value:data.tags},
            {type:"integer",value:data.is_home},
            {type:"integer",value:data.is_trending},
            {type:"integer",value:data.is_most_viewed},
            {type:"integer",value:data.is_banner},
            {type:"integer",value:data.is_hidden},
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
    await fetch(base, {
      method:  "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(data)
    })
  }

  if (action === "delete") {
    await fetch(`${base}?id=eq.${data.id}`, {
      method: "DELETE",
      headers
    })
  }
}

/* ========================= */
/* CREATE                    */
/* ========================= */

animeRoute.post("/anime", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

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

    const row = {
      id,
      title:         body.title.trim(),
      slug,
      type:          body.type          || "anime",
      status:        body.status        || "ongoing",
      poster:        body.poster        || "",
      banner:        body.banner        || "",
      year:          Number(body.year)  || null,
      rating:        Number(body.rating)|| null,
      language:      body.language      || "",
      duration:      body.duration      || "",
      genres:        safeJSON(body.genres),
      tags:          safeJSON(body.tags),
      is_home:       body.isHome        ? 1 : 0,
      is_trending:   body.isTrending    ? 1 : 0,
      is_most_viewed:body.isMostViewed  ? 1 : 0,
      is_banner:     body.isBanner      ? 1 : 0,
      is_hidden:     body.isHidden      ? 1 : 0,
      description:   body.description   || "",
      created_at:    timestamp,
      updated_at:    timestamp
    }

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

    /* Sync to Turso + Supabase (non-blocking) */
    syncToReplicas(c.env, "insert", row)

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
    const limit  = Math.min(50, Number(c.req.query("limit") || 20))
    const offset = (page - 1) * limit

    const search = c.req.query("search") || ""
    const type   = c.req.query("type")   || ""
    const status = c.req.query("status") || ""

    let where  = "WHERE 1=1"
    const params = []

    if (search) { where += " AND title LIKE ?";  params.push(`%${search}%`) }
    if (type)   { where += " AND type = ?";       params.push(type) }
    if (status) { where += " AND status = ?";     params.push(status) }

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

    const data = results.map(a => ({
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
    }))

    return c.json(success({ page, limit, total, count: data.length, data }))

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

    return c.json(success({
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
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* UPDATE                    */
/* ========================= */

animeRoute.put("/anime/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const existing = await db.prepare("SELECT id FROM anime WHERE id=?").bind(id).first()
    if (!existing) return c.json(failure("Anime not found"), 404)

    const slug = body.slug?.trim() || makeSlug(body.title)

    const slugConflict = await db.prepare(
      "SELECT id FROM anime WHERE LOWER(slug)=LOWER(?) AND id!=?"
    ).bind(slug, id).first()

    if (slugConflict) return c.json(failure("Slug already used by another anime"), 400)

    const timestamp = now()

    const row = {
      id,
      title:         body.title.trim(),
      slug,
      type:          body.type          || "anime",
      status:        body.status        || "ongoing",
      poster:        body.poster        || "",
      banner:        body.banner        || "",
      year:          Number(body.year)  || null,
      rating:        Number(body.rating)|| null,
      language:      body.language      || "",
      duration:      body.duration      || "",
      genres:        safeJSON(body.genres),
      tags:          safeJSON(body.tags),
      is_home:       body.isHome        ? 1 : 0,
      is_trending:   body.isTrending    ? 1 : 0,
      is_most_viewed:body.isMostViewed  ? 1 : 0,
      is_banner:     body.isBanner      ? 1 : 0,
      is_hidden:     body.isHidden      ? 1 : 0,
      description:   body.description   || "",
      updated_at:    timestamp
    }

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

    syncToReplicas(c.env, "insert", { ...row, created_at: now() })

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

    syncToReplicas(c.env, "delete", { id })

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("anime DELETE error:", err)
    return c.json(failure(err.message), 500)
  }
})

export default animeRoute
