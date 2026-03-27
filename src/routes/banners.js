import { Hono } from 'hono'

const bannerRoute = new Hono()

/* ========================== */
/* HELPERS */
/* ========================== */

const success = (data) => ({
  success: true,
  data
})

const failure = (message, code = "ERROR") => ({
  success: false,
  message,
  error_code: code
})

const now = () => Date.now()

/* ========================== */
/* CREATE */
/* ========================== */

bannerRoute.post('/', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json()

    // VALIDATION
    if (!body.title?.trim()) {
      return c.json(failure("Title required"), 400)
    }

    if (!body.image) {
      return c.json(failure("Image required"), 400)
    }

    // VALID URL CHECK
    try {
      new URL(body.image)
    } catch {
      return c.json(failure("Invalid image URL"), 400)
    }

    // ORDER LOGIC (SAFE)
    let order = Number(body.order)

    if (!order || order < 0) {
      const last = await db.prepare(`
        SELECT MAX(banner_order) as max FROM banners
      `).first()

      order = (last?.max || 0) + 1
    } else {
      await db.prepare(`
        UPDATE banners
        SET banner_order = banner_order + 1
        WHERE banner_order >= ?
      `).bind(order).run()
    }

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO banners (
        id, page, category, position,
        title, image, banner_order,
        active, auto_rotate,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.page || "home",
      body.category || "",
      body.position || "hero",
      body.title.trim(),
      body.image,
      order,
      body.active !== false ? 1 : 0,
      body.rotate ? 1 : 0,
      now(),
      now()
    ).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error("CREATE ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================== */
/* GET ALL (ADMIN) */
/* ========================== */

bannerRoute.get('/', async (c) => {
  try {
    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT * FROM banners
      ORDER BY banner_order ASC
    `).all()

    const data = results.map(b => ({
      id: b.id,
      page: b.page,
      category: b.category,
      position: b.position,
      title: b.title,
      image: b.image,
      order: b.banner_order,

      active: !!b.active,
      rotate: !!b.auto_rotate,

      created_at: b.created_at,
      updated_at: b.updated_at
    }))

    return c.json(success(data))

  } catch (err) {
    console.error("GET ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================== */
/* PUBLIC FETCH */
/* ========================== */

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
      rotate: !!b.auto_rotate
    }))

    return c.json(success(data))

  } catch (err) {
    console.error("PUBLIC ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================== */
/* UPDATE */
/* ========================== */

bannerRoute.put('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    const body = await c.req.json()

    // ORDER SHIFT FIX
    if (body.order !== undefined) {
      const newOrder = Number(body.order) || 0

      await db.prepare(`
        UPDATE banners
        SET banner_order = banner_order + 1
        WHERE banner_order >= ?
          AND id != ?
      `).bind(newOrder, id).run()
    }

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
      rotate: "auto_rotate"
    }

    for (const key in map) {
      if (body[key] !== undefined) {
        fields.push(`${map[key]} = ?`)

        values.push(
          key === "order"
            ? Number(body[key]) || 0
            : typeof body[key] === "boolean"
              ? (body[key] ? 1 : 0)
              : body[key]
        )
      }
    }

    if (!fields.length) {
      return c.json(failure("Nothing to update"), 400)
    }

    fields.push("updated_at = ?")
    values.push(now())

    await db.prepare(`
      UPDATE banners SET ${fields.join(", ")}
      WHERE id = ?
    `).bind(...values, id).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error("UPDATE ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ========================== */
/* DELETE */
/* ========================== */

bannerRoute.delete('/:id', async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')

    await db.prepare(`
      DELETE FROM banners WHERE id = ?
    `).bind(id).run()

    return c.json(success({ id }))

  } catch (err) {
    console.error("DELETE ERROR:", err)
    return c.json(failure(err.message), 500)
  }
})

export default bannerRoute
