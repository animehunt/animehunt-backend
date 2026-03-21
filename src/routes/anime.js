import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

// ---------------- GET LIST ----------------
app.get('/', async (c) => {
  const { type, status, home, q } = c.req.query()

  let query = "SELECT * FROM anime WHERE 1=1"
  const params = []

  if (type) { query += " AND type=?"; params.push(type) }
  if (status) { query += " AND status=?"; params.push(status) }
  if (home === "yes") query += " AND is_home=1"
  if (home === "no") query += " AND is_home=0"
  if (q) { query += " AND title LIKE ?"; params.push(`%${q}%`) }

  query += " ORDER BY created_at DESC"

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

// ---------------- GET ONE ----------------
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare(
    "SELECT * FROM anime WHERE id=?"
  ).bind(id).first()

  return c.json(result || {})
})

// ---------------- SAVE ----------------
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const isUpdate = !!body.id
    const id = body.id || crypto.randomUUID()

    if (isUpdate) {

      await c.env.DB.prepare(`
        UPDATE anime SET
        title=?, slug=?, type=?, status=?, poster=?, banner=?,
        year=?, rating=?, language=?, duration=?,
        genres=?, tags=?, description=?,
        is_home=?, is_trending=?, is_most_viewed=?, is_banner=?,
        created_at=?
        WHERE id=?
      `).bind(
        body.title, body.slug, body.type, body.status,
        body.poster, body.banner,
        body.year, body.rating, body.language, body.duration,
        body.genres, body.tags, body.description,
        body.isHome ? 1:0,
        body.isTrending ? 1:0,
        body.isMostViewed ? 1:0,
        body.isBanner ? 1:0,
        Date.now(),
        id
      ).run()

    } else {

      await c.env.DB.prepare(`
        INSERT INTO anime (
          title, slug, type, status, poster, banner,
          year, rating, language, duration,
          genres, tags, description,
          is_home, is_trending, is_most_viewed, is_banner,
          created_at, is_hidden, id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        body.title, body.slug, body.type, body.status,
        body.poster, body.banner,
        body.year, body.rating, body.language, body.duration,
        body.genres, body.tags, body.description,
        body.isHome ? 1:0,
        body.isTrending ? 1:0,
        body.isMostViewed ? 1:0,
        body.isBanner ? 1:0,
        Date.now(),
        0,
        id
      ).run()

    }

    return c.json({ success:true })

  } catch (err) {
    return c.json({ success:false, error:err.message })
  }
})

// ---------------- DELETE ----------------
app.delete('/:id', async (c) => {
  const id = c.req.param('id')

  await c.env.DB.prepare(
    "DELETE FROM anime WHERE id=?"
  ).bind(id).run()

  return c.json({ success:true })
})

// ---------------- TOGGLE HIDE ----------------
app.patch('/hide/:id', async (c) => {
  const id = c.req.param('id')

  await c.env.DB.prepare(`
    UPDATE anime
    SET is_hidden = CASE WHEN is_hidden=1 THEN 0 ELSE 1 END
    WHERE id=?
  `).bind(id).run()

  return c.json({ success:true })
})

export default app
