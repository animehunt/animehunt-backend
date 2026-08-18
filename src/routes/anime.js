/* ================================================
   anime.js — Admin Anime CRUD (FIXED)
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"
import { tursoHttpUrl } from "../utils/tursoUrl.js"
import { uploadBufferToImageKit } from "./upload.js"
import {
  resolveTmdbTarget,
  tmdbFetch,
  tmdbImageUrl,
  mapTmdbGenres,
  mapTmdbStatus,
  extractYear
} from "../utils/tmdb.js"

const animeRoute = new Hono()

/* ========================= */
/* HELPERS                   */
/* ========================= */

const success  = (data)  => ({ success: true,  data })
const failure  = (msg)   => ({ success: false, message: msg })
const now      = ()      => new Date().toISOString()

const makeSlug = (text) =>
  (text || "").toLowerCase().trim()
    .replace(/[^a-z0-9\s-]+/g, "")   // ✅ FIX: strip non-slug chars but keep spaces for next replace
    .replace(/[\s-]+/g, "-")          // ✅ FIX: collapse all whitespace+dashes into single dash
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
  // ✅ FIX (audit ISSUE-029): active is a real schema column, read in
  // WHERE clauses across public.js/publicSEO.js/publicSearch.js/
  // recommendations.js/seoAdmin.js/trending.js, but was never exposed
  // anywhere in this admin CRUD file — there was no way for an admin to
  // ever set it, and no way to recover a row if it were ever set to 0 by
  // any other means. Default true when undefined (legacy rows / rows
  // created before this fix), matching the schema's own default.
  isActive:     a.active === undefined || a.active === null ? true : !!a.active,
  description:  a.description,
  created_at:   a.created_at,
  updated_at:   a.updated_at
})

/* ✅ FIX: build a clean DB row object from request body (shared by POST/PUT) */
const buildRow = (body, id, createdAt, updatedAt) => ({
  id,
  title:          String(body.title).trim(),
  slug:           String(body.slug?.trim() || makeSlug(body.title)),
  type:           body.type          || "anime",
  status:         body.status        || "ongoing",
  poster:         String(body.poster || ""),
  banner:         String(body.banner || ""),
  year:           (body.year !== null && body.year !== undefined && body.year !== "" && !isNaN(Number(body.year)))
                    ? Number(body.year) : null,   // ✅ FIX: explicit null when empty, not 0
  rating:         (body.rating !== null && body.rating !== undefined && body.rating !== "" && !isNaN(Number(body.rating)))
                    ? Number(body.rating) : null, // ✅ FIX: explicit null when empty, not 0
  language:       String(body.language  || ""),
  duration:       String(body.duration  || ""),
  genres:         safeJSON(body.genres),
  tags:           safeJSON(body.tags),
  is_home:        body.isHome        ? 1 : 0,
  is_trending:    body.isTrending    ? 1 : 0,
  is_most_viewed: body.isMostViewed  ? 1 : 0,
  is_banner:      body.isBanner      ? 1 : 0,
  is_hidden:      body.isHidden      ? 1 : 0,
  // ✅ FIX (audit ISSUE-029): defaults to active=1 (matching the schema
  // default) unless explicitly set to false — so existing PUT requests
  // that don't send isActive at all won't accidentally deactivate a row.
  active:         body.isActive === false ? 0 : 1,
  description:    String(body.description || ""),
  created_at:     createdAt,
  updated_at:     updatedAt
})

/* ========================= */
/* VALIDATION                */
/* ========================= */

function validate(body) {
  if (!body || typeof body !== "object") return "Invalid request body"
  if (!body.title?.trim())        return "Title required"
  if (!body.poster?.trim())       return "Poster URL required"
  const rating = body.rating
  if (rating !== undefined && rating !== null && rating !== "" &&
      (isNaN(Number(rating)) || Number(rating) < 0 || Number(rating) > 10))
    return "Rating must be between 0 and 10"   // ✅ FIX: range validation added, not just isNaN
  const year = body.year
  if (year !== undefined && year !== null && year !== "" &&
      (isNaN(Number(year)) || Number(year) < 1900 || Number(year) > 2100))
    return "Year must be between 1900 and 2100"   // ✅ FIX: range validation added
  return null
}

/* ========================= */
/* SYNC TO TURSO + SUPABASE  */
/* ========================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  /* ---- Turso ---- */
  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    promises.push(
      fetch(`${tursoHttpUrl(env.TURSO_REPLICA_URL)}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
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
            is_home,is_trending,is_most_viewed,is_banner,is_hidden,active,
            description,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            {type:"text",value:data.id},
            {type:"text",value:data.title},
            {type:"text",value:data.slug},
            {type:"text",value:data.type},
            {type:"text",value:data.status},
            {type:"text",value:data.poster},
            {type:"text",value:data.banner},
            // ✅ FIX (audit ISSUE-022): was `data.year ? ... : null` — buildRow()
            // already explicitly sets year/rating to null (not 0/undefined)
            // when empty, per its own "explicit null when empty" comments —
            // so `!== null` is the precise check. The truthy check treated a
            // genuinely valid rating of 0 as empty, silently syncing null to
            // the Turso replica instead of 0 for that row.
            data.year   !== null ? {type:"integer",value:String(data.year)}   : {type:"null"},
            data.rating !== null ? {type:"float",  value:String(data.rating)} : {type:"null"},
            {type:"text",value:data.language},
            {type:"text",value:data.duration},
            {type:"text",value:data.genres},
            {type:"text",value:data.tags},
            {type:"integer",value:String(data.is_home)},          // ✅ FIX
            {type:"integer",value:String(data.is_trending)},      // ✅ FIX
            {type:"integer",value:String(data.is_most_viewed)},   // ✅ FIX
            {type:"integer",value:String(data.is_banner)},        // ✅ FIX
            {type:"integer",value:String(data.is_hidden)},        // ✅ FIX
            {type:"integer",value:String(data.active)},           // ✅ FIX (audit ISSUE-029)
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
    // ✅ FIX (audit): `{ ...headers, Prefer: undefined }` does NOT remove the
    // key — object spread keeps it with value undefined, and fetch's Headers
    // constructor stringifies that to the literal header value "undefined"
    // (verified: `new Headers({ Prefer: undefined })` produces a real
    // "prefer: undefined" header), so Supabase was receiving a garbage
    // Prefer header on every delete instead of no header at all. Destructure
    // it out of a copy instead, which genuinely omits the key.
    const { Prefer, ...deleteHeaders } = headers
    const res = await fetch(`${base}?id=eq.${encodeURIComponent(data.id)}`, {   // ✅ FIX: encode id in URL to prevent injection if UUID format changes
      method: "DELETE",
      headers: deleteHeaders
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

    const slug = makeSlug(body.slug?.trim() || body.title)   // ✅ FIX: always run makeSlug to normalize user-provided slug
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
        is_home,is_trending,is_most_viewed,is_banner,is_hidden,active,
        description,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.title, row.slug, row.type, row.status,
      row.poster, row.banner, row.year, row.rating,
      row.language, row.duration, row.genres, row.tags,
      row.is_home, row.is_trending, row.is_most_viewed,
      row.is_banner, row.is_hidden, row.active,
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
      page, limit,
      total,          // filtered total (for pagination)
      count: data.length,
      data,
      // global stats (whole table) for dashboard cards — not affected by filters
      totalTrending: Number(stats?.totalTrending) || 0,
      totalHome:     Number(stats?.totalHome)     || 0,
      totalHidden:   Number(stats?.totalHidden)   || 0,
      totalAll:      Number(stats?.total)         || 0   // ✅ FIX: expose unfiltered total for stat card accuracy
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

    const slug = makeSlug(body.slug?.trim() || body.title)   // ✅ FIX: normalize slug always

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
        is_banner=?,is_hidden=?,active=?,
        description=?,updated_at=?
      WHERE id=?
    `).bind(
      row.title, row.slug, row.type, row.status,
      row.poster, row.banner, row.year, row.rating,
      row.language, row.duration, row.genres, row.tags,
      row.is_home, row.is_trending, row.is_most_viewed,
      row.is_banner, row.is_hidden, row.active,
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

/* ========================= */
/* SANITIZE PAGINATION HELPER*/
/* (exported utility)        */
/* ========================= */

// ✅ FIX (Line 254): NaN from invalid `limit` param sanitized.
//    Exported for use by other modules.
export function sanitizePagination(params) {
  const page  = Math.max(1, parseInt(params.get("page"))  || 1)
  const limit = Math.min(Math.max(1, parseInt(params.get("limit")) || 20), 100)
  return { page, limit, offset: (page - 1) * limit }
}

/* ========================= */
/* BULK UPDATE STATUS        */
/* (MISSING FEATURE — ADDED) */
/* Blueprint §2 Item 4       */
/* ========================= */

// POST /api/admin/anime/bulk-status
// Body: { animeIds: string[], status: string }
// "hidden" is treated as a visibility toggle (is_hidden=1), NOT a status value —
// status and visibility are independent columns.
animeRoute.post("/anime/bulk-status", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const { animeIds, status } = body || {}

    const validStatuses = ["airing", "completed", "upcoming", "dropped", "ongoing", "hidden"]
    if (!validStatuses.includes(status)) {
      return c.json(failure(`Invalid status — must be one of: ${validStatuses.join(", ")}`), 400)
    }

    if (!Array.isArray(animeIds) || animeIds.length === 0) {
      return c.json(failure("animeIds array required"), 400)
    }

    // Safety cap
    const ids          = animeIds.slice(0, 100)
    const placeholders = ids.map(() => "?").join(",")
    const timestamp    = now()

    let result
    if (status === "hidden") {
      result = await db.prepare(
        `UPDATE anime SET is_hidden=1, updated_at=? WHERE id IN (${placeholders})`
      ).bind(timestamp, ...ids).run()
    } else {
      result = await db.prepare(
        `UPDATE anime SET status=?, updated_at=? WHERE id IN (${placeholders})`
      ).bind(status, timestamp, ...ids).run()
    }

    return c.json(success({
      updated: result.meta?.changes || 0,
      status
    }))

  } catch (err) {
    console.error("anime bulk-status error:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* TMDB AUTO-ADD             */
/* (NEW FEATURE)             */
/* ========================= */

// TMDB "original"-size images (poster/backdrop) are occasionally
// larger than the 5 MB cap config.js enforces for manual browser
// uploads — that cap exists to stop an admin from accidentally
// uploading something huge through a form, which isn't the situation
// here (the source is TMDB's own CDN, not arbitrary user input).
// Still enforcing *some* ceiling as a sanity check against a
// malformed/unexpectedly huge response.
const TMDB_IMAGE_MAX_BYTES = 20 * 1024 * 1024 // 20 MB

async function downloadTmdbImage(imageUrl) {
  let res
  try {
    res = await fetch(imageUrl)
  } catch (networkErr) {
    // one retry — TMDB's image CDN is generally reliable, but a bare
    // single network blip shouldn't fail the whole auto-add
    res = await fetch(imageUrl)
  }

  if (!res.ok) {
    throw new Error(`TMDB image download failed: HTTP ${res.status}`)
  }

  const contentType = res.headers.get("Content-Type") || "image/jpeg"
  if (!contentType.startsWith("image/")) {
    throw new Error(`TMDB returned a non-image response (${contentType})`)
  }

  const buffer = await res.arrayBuffer()
  if (buffer.byteLength === 0) {
    throw new Error("TMDB image download returned an empty file")
  }
  if (buffer.byteLength > TMDB_IMAGE_MAX_BYTES) {
    throw new Error(`TMDB image exceeds ${TMDB_IMAGE_MAX_BYTES / 1024 / 1024}MB — refusing to upload`)
  }

  return { buffer, contentType }
}

async function downloadAndUploadTmdbImage(env, imageUrl, baseName) {
  const { buffer, contentType } = await downloadTmdbImage(imageUrl)
  const ext      = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg"
  const fileName = `${baseName}_${Date.now()}.${ext}`
  const blob     = new Blob([buffer], { type: contentType })

  const result = await uploadBufferToImageKit(env, blob, fileName, {
    folder: "/animehunt/tmdb",
    tags:   "anime-site,tmdb-import"
  })

  return result.url
}

// POST /api/admin/anime/auto-add
// Body: { tmdb_id?: string|number, title?: string, media_type?: "movie"|"tv", year?: number }
// At least one of tmdb_id or title is required. media_type/year are
// optional disambiguation hints — see resolveTmdbTarget() in
// src/utils/tmdb.js for exactly how tmdb_id-only and title-only
// lookups are resolved.
animeRoute.post("/anime/auto-add", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const { tmdb_id, title, media_type, year } = body || {}
    if (!tmdb_id && !title?.trim()) {
      return c.json(failure("tmdb_id or title is required"), 400)
    }

    /* 1) Resolve tmdb_id + movie/tv */
    let tmdbId, mediaType
    try {
      ;({ tmdbId, mediaType } = await resolveTmdbTarget(c.env, { tmdb_id, title, media_type, year }))
    } catch (err) {
      return c.json(failure(err.message), 404)
    }

    /* 2) Fetch full details + images in a single TMDB call */
    let details
    try {
      details = await tmdbFetch(c.env, `/${mediaType}/${tmdbId}`, { append_to_response: "images" })
    } catch (err) {
      console.error("auto-add TMDB fetch error:", err)
      return c.json(failure(err.message), 502)
    }

    const tmdbTitle = mediaType === "movie" ? details.title : details.name
    if (!tmdbTitle?.trim()) {
      return c.json(failure("TMDB returned no usable title for this id"), 502)
    }

    /* 3) Poster — REQUIRED (validate() below rejects a missing poster) */
    const posterSrc = tmdbImageUrl(details.poster_path, "original")
    if (!posterSrc) {
      return c.json(failure("TMDB has no poster for this title — cannot auto-add without one"), 502)
    }

    let posterUrl
    try {
      posterUrl = await downloadAndUploadTmdbImage(c.env, posterSrc, `tmdb_${tmdbId}_poster`)
    } catch (err) {
      console.error("auto-add poster upload failed:", err)
      return c.json(failure(`Poster image failed: ${err.message}`), 502)
    }

    /* 4) Backdrop — OPTIONAL, soft-fail (banner has no NOT-NULL-ish
       requirement in validate(), unlike poster) */
    let bannerUrl = ""
    const backdropSrc = tmdbImageUrl(details.backdrop_path, "original")
    if (backdropSrc) {
      try {
        bannerUrl = await downloadAndUploadTmdbImage(c.env, backdropSrc, `tmdb_${tmdbId}_backdrop`)
      } catch (err) {
        console.error("auto-add backdrop upload failed — continuing without one:", err)
      }
    }

    /* 5) Map TMDB fields onto this CMS's schema */
    const draftBody = {
      title:       tmdbTitle,
      // type: TMDB movies map to "movie"; tv maps to this schema's
      // "anime" default (the episodic/series case episodes.js's
      // auto-add is built for). Adjust if your CMS uses a finer
      // taxonomy (ova/ona/special) — TMDB doesn't distinguish those,
      // it's tv either way.
      type:        mediaType === "movie" ? "movie" : "anime",
      status:      mapTmdbStatus(details.status, mediaType),
      poster:      posterUrl,
      banner:      bannerUrl,
      year:        extractYear(details.release_date || details.first_air_date),
      // vote_average is already 0-10 — same scale validate() expects,
      // no conversion needed. null (not 0) when TMDB has no votes yet.
      rating:      (typeof details.vote_average === "number" && details.vote_average > 0)
                     ? Math.round(details.vote_average * 10) / 10 : null,
      language:    details.original_language || "",
      duration:    mediaType === "movie"
                     ? (details.runtime ? `${details.runtime} min` : "")
                     : (details.episode_run_time?.[0] ? `${details.episode_run_time[0]} min` : ""),
      genres:      mapTmdbGenres(details.genres),
      // TMDB has no equivalent of this CMS's freeform "tags" field —
      // left empty rather than guessed at.
      tags:        [],
      description: details.overview || ""
    }

    const validationErr = validate(draftBody)
    if (validationErr) {
      return c.json(failure(`TMDB data failed validation: ${validationErr}`), 502)
    }

    const slug = makeSlug(draftBody.title)
    if (!slug) return c.json(failure("Could not generate a slug from the TMDB title"), 400)

    const exists = await db.prepare(
      "SELECT id FROM anime WHERE LOWER(slug)=LOWER(?)"
    ).bind(slug).first()
    if (exists) {
      return c.json(failure("Slug already exists — this title may already be in your CMS"), 400)
    }

    /* 6) Insert — identical INSERT statement to manual POST /anime */
    const id        = crypto.randomUUID()
    const timestamp = now()
    const row = buildRow({ ...draftBody, slug }, id, timestamp, timestamp)

    await db.prepare(`
      INSERT INTO anime (
        id,title,slug,type,status,poster,banner,year,rating,
        language,duration,genres,tags,
        is_home,is_trending,is_most_viewed,is_banner,is_hidden,active,
        description,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.title, row.slug, row.type, row.status,
      row.poster, row.banner, row.year, row.rating,
      row.language, row.duration, row.genres, row.tags,
      row.is_home, row.is_trending, row.is_most_viewed,
      row.is_banner, row.is_hidden, row.active,
      row.description, row.created_at, row.updated_at
    ).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({
      ...mapAnime(row),
      tmdb_id:         tmdbId,
      media_type:      mediaType,
      banner_uploaded: !!bannerUrl
    }), 201)

  } catch (err) {
    console.error("anime auto-add error:", err)
    return c.json(failure(err.message), 500)
  }
})

// ✅ FIX: export default at true end — bulk-status route registered BEFORE export
export default animeRoute
