import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

/* ==========================================
   ROUTES (Using D1 Database)
   ========================================== */

// GET ALL & SEARCH
app.get('/', async (c) => {
  const { type, status, home, q } = c.req.query()
  
  let query = "SELECT * FROM anime WHERE 1=1"
  const params = []

  if (type) { query += " AND type = ?"; params.push(type); }
  if (status) { query += " AND status = ?"; params.push(status); }
  if (home === "yes") { query += " AND is_home = 1"; }
  if (q) { query += " AND title LIKE ?"; params.push(`%${q}%`); }

  query += " ORDER BY created_at DESC"

  try {
    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json(results)
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// GET SINGLE
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare("SELECT * FROM anime WHERE id = ?").bind(id).first()
  return result ? c.json(result) : c.json({ error: "Not Found" }, 404)
})

// SAVE / UPDATE
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const id = body.id || crypto.randomUUID()
    
    // Check if exists
    const existing = body.id ? await c.env.DB.prepare("SELECT id FROM anime WHERE id = ?").bind(body.id).first() : null

    if (existing) {
      // UPDATE QUERY
      await c.env.DB.prepare(`
        UPDATE anime SET 
        title=?, slug=?, type=?, status=?, poster=?, banner=?, 
        year=?, rating=?, language=?, duration=?, genres=?, tags=?, 
        description=?, is_home=?, is_trending=?, is_most_viewed=?, is_banner=?, updated_at=?
        WHERE id=?
      `).bind(
        body.title, body.slug, body.type, body.status, body.poster, body.banner,
        body.year, body.rating, body.language, body.duration, body.genres, body.tags,
        body.description, body.isHome ? 1 : 0, body.isTrending ? 1 : 0, 
        body.isMostViewed ? 1 : 0, body.isBanner ? 1 : 0, Date.now(), body.id
      ).run()
    } else {
      // INSERT QUERY
      await c.env.DB.prepare(`
        INSERT INTO anime (
          id, title, slug, type, status, poster, banner, year, rating, 
          language, duration, genres, tags, description, is_home, 
          is_trending, is_most_viewed, is_banner, is_hidden, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).bind(
        id, body.title, body.slug, body.type, body.status, body.poster, body.banner,
        body.year, body.rating, body.language, body.duration, body.genres, body.tags,
        body.description, body.isHome ? 1 : 0, body.isTrending ? 1 : 0, 
        body.isMostViewed ? 1 : 0, body.isBanner ? 1 : 0, Date.now()
      ).run()
    }

    return c.json({ success: true })
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare("DELETE FROM anime WHERE id = ?").bind(id).run()
  return c.json({ success: true })
})

// HIDE
app.patch('/hide/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare("UPDATE anime SET is_hidden = 1 - is_hidden WHERE id = ?").bind(id).run()
  return c.json({ success: true })
})

export default app
