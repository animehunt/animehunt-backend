import { Hono } from 'hono'

const animeRoute = new Hono()

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

// ==========================
// CREATE ANIME
// ==========================
animeRoute.post('/anime', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json()

    if (!body.title) {
      return c.json(failure("Title required"), 400)
    }

    const slugCheck = await db.prepare(
      `SELECT id FROM anime WHERE slug = ?`
    ).bind(body.slug).first()

    if (slugCheck) {
      return c.json(failure("Slug already exists", "SLUG_EXISTS"), 400)
    }

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO anime (
        id, title, slug, type, status,
        poster, banner, year, rating,
        language, duration, genres, tags,
        isHome, isTrending, isMostViewed,
        isBanner, isHidden,
        description, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.title,
      body.slug,
      body.type,
      body.status,
      body.poster,
      body.banner,
      body.year,
      body.rating,
      body.language,
      body.duration,
      JSON.stringify(body.genres || []),
      JSON.stringify(body.tags || []),
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,
      body.isHidden ? 1 : 0,
      body.description,
      now(),
      now()
    ).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})

// ==========================
// GET ALL ANIME
// ==========================
animeRoute.get('/anime', async (c) => {
  try {
    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT * FROM anime
      ORDER BY created_at DESC
    `).all()

    const parsed = results.map(a => ({
      ...a,
      genres: JSON.parse(a.genres || "[]"),
      tags: JSON.parse(a.tags || "[]"),
      isHome: !!a.isHome,
      isTrending: !!a.isTrending,
      isMostViewed: !!a.isMostViewed,
      isBanner: !!a.isBanner,
      isHidden: !!a.isHidden
    }))

    return c.json(success(parsed))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})

// ==========================
// UPDATE
// ==========================
animeRoute.put('/anime/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json()

    const slugCheck = await db.prepare(
      `SELECT id FROM anime WHERE slug = ? AND id != ?`
    ).bind(body.slug, id).first()

    if (slugCheck) {
      return c.json(failure("Slug already exists"), 400)
    }

    await db.prepare(`
      UPDATE anime SET
        title = ?, slug = ?, type = ?, status = ?,
        poster = ?, banner = ?, year = ?, rating = ?,
        language = ?, duration = ?, genres = ?, tags = ?,
        isHome = ?, isTrending = ?, isMostViewed = ?,
        isBanner = ?, isHidden = ?,
        description = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.title,
      body.slug,
      body.type,
      body.status,
      body.poster,
      body.banner,
      body.year,
      body.rating,
      body.language,
      body.duration,
      JSON.stringify(body.genres || []),
      JSON.stringify(body.tags || []),
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,
      body.isHidden ? 1 : 0,
      body.description,
      now(),
      id
    ).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})

// ==========================
// DELETE
// ==========================
animeRoute.delete('/anime/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    await db.prepare(`DELETE FROM anime WHERE id = ?`)
      .bind(id)
      .run()

    return c.json(success({ id }))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})

export default animeRoute
