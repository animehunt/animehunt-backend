import { Hono } from 'hono'

const bannerRoute = new Hono()

// ==========================
// UTILS
// ==========================
const success = (data) => ({ success: true, data })
const failure = (msg, code = "ERROR") => ({
  success: false,
  message: msg,
  error_code: code
})

const now = () => new Date().toISOString()

// ==========================
// CREATE
// ==========================
bannerRoute.post('/', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json()

    if (!body.title || !body.image) {
      return c.json(failure("Title & Image required"), 400)
    }

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO banners (
        id, page, category, position,
        title, image, banner_order,
        active, rotate,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.page,
      body.category || "",
      body.position,
      body.title,
      body.image,
      body.order || 0,
      body.active ? 1 : 0,
      body.rotate ? 1 : 0,
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
// GET ALL (ADMIN)
// ==========================
bannerRoute.get('/', async (c) => {
  try {
    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT * FROM banners
      ORDER BY banner_order ASC
    `).all()

    const data = results.map(b => ({
      ...b,
      active: !!b.active,
      rotate: !!b.rotate,
      order: b.banner_order
    }))

    return c.json(success(data))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})


// ==========================
// PUBLIC FETCH (SMART)
// ==========================
// /banner/public?page=home&position=hero&category=action
bannerRoute.get('/public', async (c) => {
  try {
    const db = c.env.DB

    const page = c.req.query('page')
    const position = c.req.query('position')
    const category = c.req.query('category')

    let query = `SELECT * FROM banners WHERE active = 1`
    const params = []

    if (page) {
      query += ` AND page = ?`
      params.push(page)
    }

    if (position) {
      query += ` AND position = ?`
      params.push(position)
    }

    // category optional logic
    if (category) {
      query += ` AND (category = ? OR category = '')`
      params.push(category)
    }

    query += ` ORDER BY banner_order ASC`

    const { results } = await db.prepare(query).bind(...params).all()

    const data = results.map(b => ({
      id: b.id,
      title: b.title,
      image: b.image,
      page: b.page,
      position: b.position,
      rotate: !!b.rotate
    }))

    return c.json(success(data))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})


// ==========================
// UPDATE (PARTIAL SAFE)
// ==========================
bannerRoute.put('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json()

    const fields = []
    const values = []

    const map = {
      page: "page",
      category: "category",
      position: "position",
      title: "title",
      image: "image",
      order: "banner_order",
      active: "active",
      rotate: "rotate"
    }

    for (const key in map) {
      if (body[key] !== undefined) {
        fields.push(`${map[key]} = ?`)
        values.push(
          typeof body[key] === "boolean"
            ? (body[key] ? 1 : 0)
            : body[key]
        )
      }
    }

    if (!fields.length) {
      return c.json(failure("Nothing to update"), 400)
    }

    fields.push(`updated_at = ?`)
    values.push(now())

    await db.prepare(`
      UPDATE banners SET ${fields.join(", ")}
      WHERE id = ?
    `).bind(...values, id).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})


// ==========================
// DELETE
// ==========================
bannerRoute.delete('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    await db.prepare(`DELETE FROM banners WHERE id = ?`)
      .bind(id)
      .run()

    return c.json(success({ id }))

  } catch (err) {
    console.error(err)
    return c.json(failure(err.message), 500)
  }
})

export default bannerRoute
