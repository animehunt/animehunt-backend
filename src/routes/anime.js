import { Hono } from 'hono'

const animeRoute = new Hono()

/* ==========================
UTILS
========================== */

const success = (data) => ({
  success: true,
  data
})

const failure = (message, code = "ERROR") => ({
  success: false,
  message,
  error_code: code
})

const now = () => new Date().toISOString()

const makeSlug = (text) => {
  return text
    ?.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const safeParse = (val) => {
  try {
    return JSON.parse(val || "[]")
  } catch {
    return []
  }
}

/* ==========================
CREATE ANIME
========================== */

animeRoute.post('/anime', async (c) => {
  try {

    const db = c.env.DB
    const body = await c.req.json()

    if (!body.title?.trim()) {
      return c.json(failure("Title required"), 400)
    }

    if (!body.poster) {
      return c.json(failure("Poster required"), 400)
    }

    if (!Array.isArray(body.types) || body.types.length === 0) {
      return c.json(failure("At least 1 type required"), 400)
    }

    const slug = (body.slug?.trim() || makeSlug(body.title))

    const exists = await db.prepare(
      `SELECT id FROM anime WHERE slug = ?`
    ).bind(slug).first()

    if (exists) {
      return c.json(failure("Slug already exists"), 400)
    }

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO anime (
        id, title, slug,
        types, status,
        poster, banner,
        year, rating,
        language, duration,
        genres, tags,
        is_home, is_trending, is_most_viewed,
        is_banner, is_hidden,
        description,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.title.trim(),
      slug,

      JSON.stringify(body.types),

      body.status || "ongoing",

      body.poster || "",
      body.banner || "",

      Number(body.year) || null,
      Number(body.rating) || null,

      body.language || "",
      body.duration || "",

      JSON.stringify(Array.isArray(body.genres) ? body.genres : []),
      JSON.stringify(Array.isArray(body.tags) ? body.tags : []),

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
    console.error("CREATE ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ==========================
GET ALL ANIME
========================== */

animeRoute.get('/anime', async (c) => {
  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT * FROM anime
      ORDER BY created_at DESC
    `).all()

    const data = results.map(a => ({
      id: a.id,
      title: a.title,
      slug: a.slug,

      types: safeParse(a.types),

      status: a.status,

      poster: a.poster,
      banner: a.banner,

      year: a.year,
      rating: a.rating,

      language: a.language,
      duration: a.duration,

      genres: safeParse(a.genres),
      tags: safeParse(a.tags),

      isHome: !!a.is_home,
      isTrending: !!a.is_trending,
      isMostViewed: !!a.is_most_viewed,
      isBanner: !!a.is_banner,
      isHidden: !!a.is_hidden,

      description: a.description,

      created_at: a.created_at,
      updated_at: a.updated_at
    }))

    return c.json(success(data))

  } catch (err) {
    console.error("GET ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ==========================
UPDATE ANIME
========================== */

animeRoute.put('/anime/:id', async (c) => {
  try {

    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json()

    if (!body.title?.trim()) {
      return c.json(failure("Title required"), 400)
    }

    if (!body.poster) {
      return c.json(failure("Poster required"), 400)
    }

    if (!Array.isArray(body.types) || body.types.length === 0) {
      return c.json(failure("At least 1 type required"), 400)
    }

    const slug = (body.slug?.trim() || makeSlug(body.title))

    const exists = await db.prepare(
      `SELECT id FROM anime WHERE slug = ? AND id != ?`
    ).bind(slug, id).first()

    if (exists) {
      return c.json(failure("Slug already exists"), 400)
    }

    await db.prepare(`
      UPDATE anime SET
        title = ?,
        slug = ?,
        types = ?,
        status = ?,
        poster = ?,
        banner = ?,
        year = ?,
        rating = ?,
        language = ?,
        duration = ?,
        genres = ?,
        tags = ?,
        is_home = ?,
        is_trending = ?,
        is_most_viewed = ?,
        is_banner = ?,
        is_hidden = ?,
        description = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(

      body.title.trim(),
      slug,
      JSON.stringify(body.types),

      body.status || "ongoing",

      body.poster || "",
      body.banner || "",

      Number(body.year) || null,
      Number(body.rating) || null,

      body.language || "",
      body.duration || "",

      JSON.stringify(Array.isArray(body.genres) ? body.genres : []),
      JSON.stringify(Array.isArray(body.tags) ? body.tags : []),

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
    console.error("UPDATE ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ==========================
DELETE ANIME
========================== */

animeRoute.delete('/anime/:id', async (c) => {
  try {

    const db = c.env.DB
    const id = c.req.param('id')

    await db.prepare(`
      DELETE FROM anime WHERE id = ?
    `).bind(id).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error("DELETE ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

export default animeRoute
