import { Hono } from 'hono'

const animeRoute = new Hono()

/* ========================= */
/* 🔐 SIMPLE AUTH MIDDLEWARE */
/* ========================= */

animeRoute.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')

  // ⚠️ change this in production
  const ADMIN_TOKEN = c.env.ADMIN_TOKEN || "my-secret-token"

  if (!token || token !== ADMIN_TOKEN) {
    return c.json({
      success: false,
      message: "Unauthorized"
    }, 401)
  }

  await next()
})

/* ========================= */
/* HELPERS */
/* ========================= */

const success = (data) => ({ success: true, data })
const failure = (msg) => ({ success: false, message: msg })

const now = () => new Date().toISOString()

const makeSlug = (text) =>
  text?.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const safeJSON = (val) => JSON.stringify(Array.isArray(val) ? val : [])

const parseJSON = (val) => {
  try { return JSON.parse(val || "[]") }
  catch { return [] }
}

/* ========================= */
/* VALIDATION */
/* ========================= */

function validate(body) {
  if (!body.title?.trim()) return "Title required"
  if (!body.poster) return "Poster required"
  if (body.rating && isNaN(body.rating)) return "Invalid rating"
  return null
}

/* ========================= */
/* CREATE */
/* ========================= */

animeRoute.post('/anime', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const slug = body.slug || makeSlug(body.title)

    const exists = await db.prepare(
      `SELECT id FROM anime WHERE LOWER(slug)=LOWER(?)`
    ).bind(slug).first()

    if (exists) {
      return c.json(failure("Slug already exists"), 400)
    }

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO anime (
        id, title, slug, type, status,
        poster, banner, year, rating,
        language, duration, genres, tags,
        is_home, is_trending, is_most_viewed,
        is_banner, is_hidden,
        description, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.title.trim(),
      slug,
      body.type || "anime",
      body.status || "ongoing",
      body.poster || "",
      body.banner || "",
      Number(body.year) || null,
      Number(body.rating) || null,
      body.language || "",
      body.duration || "",
      safeJSON(body.genres),
      safeJSON(body.tags),
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,
      body.isHidden ? 1 : 0,
      body.description || "",
      now(),
      now()
    ).run()

    return c.json(success({ id }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* GET (PAGINATION + FILTER) */
/* ========================= */

animeRoute.get('/anime', async (c) => {
  try {
    const db = c.env.DB

    const page = Number(c.req.query("page") || 1)
    const limit = Math.min(Number(c.req.query("limit") || 20), 50)
    const offset = (page - 1) * limit

    const search = c.req.query("search") || ""
    const type = c.req.query("type") || ""
    const status = c.req.query("status") || ""

    let where = "WHERE 1=1"
    const params = []

    if (search) {
      where += " AND title LIKE ?"
      params.push(`%${search}%`)
    }

    if (type) {
      where += " AND type = ?"
      params.push(type)
    }

    if (status) {
      where += " AND status = ?"
      params.push(status)
    }

    const { results } = await db.prepare(`
      SELECT * FROM anime
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    const data = results.map(a => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      type: a.type,
      status: a.status,
      poster: a.poster,
      banner: a.banner,
      year: a.year,
      rating: a.rating,
      language: a.language,
      duration: a.duration,
      genres: parseJSON(a.genres),
      tags: parseJSON(a.tags),

      isHome: !!a.is_home,
      isTrending: !!a.is_trending,
      isMostViewed: !!a.is_most_viewed,
      isBanner: !!a.is_banner,
      isHidden: !!a.is_hidden,

      description: a.description,
      created_at: a.created_at
    }))

    return c.json(success({
      page,
      limit,
      count: data.length,
      data
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* UPDATE */
/* ========================= */

animeRoute.put('/anime/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const slug = body.slug || makeSlug(body.title)

    const exists = await db.prepare(
      `SELECT id FROM anime WHERE LOWER(slug)=LOWER(?) AND id!=?`
    ).bind(slug, id).first()

    if (exists) {
      return c.json(failure("Slug exists"), 400)
    }

    await db.prepare(`
      UPDATE anime SET
        title=?, slug=?, type=?, status=?,
        poster=?, banner=?, year=?, rating=?,
        language=?, duration=?, genres=?, tags=?,
        is_home=?, is_trending=?, is_most_viewed=?,
        is_banner=?, is_hidden=?,
        description=?, updated_at=?
      WHERE id=?
    `).bind(
      body.title.trim(),
      slug,
      body.type || "anime",
      body.status || "ongoing",
      body.poster || "",
      body.banner || "",
      Number(body.year) || null,
      Number(body.rating) || null,
      body.language || "",
      body.duration || "",
      safeJSON(body.genres),
      safeJSON(body.tags),
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,
      body.isHidden ? 1 : 0,
      body.description || "",
      now(),
      id
    ).run()

    return c.json(success({ id }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ========================= */
/* DELETE */
/* ========================= */

animeRoute.delete('/anime/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    await db.prepare(`DELETE FROM anime WHERE id=?`)
      .bind(id)
      .run()

    return c.json(success({ id }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default animeRoute
