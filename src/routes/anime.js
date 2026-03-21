import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

// GET LIST
app.get('/', async (c) => {
  const { type, status, home, q } = c.req.query()
  let query = "SELECT * FROM anime WHERE 1=1"
  const params = []

  if (type) { query += " AND type = ?"; params.push(type); }
  if (status) { query += " AND status = ?"; params.push(status); }
  if (home === "yes") query += " AND is_home = 1";
  if (home === "no") query += " AND is_home = 0";
  if (q) { query += " AND title LIKE ?"; params.push(`%${q}%`); }

  query += " ORDER BY created_at DESC"
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

// GET SINGLE
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare("SELECT * FROM anime WHERE id = ?").bind(id).first()
  return c.json(result || {})
})

// POST: SAVE/UPDATE
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const isUpdate = body.id ? true : false
    const id = isUpdate ? body.id : crypto.randomUUID()

    const sql = isUpdate 
      ? `UPDATE anime SET title=?, slug=?, type=?, status=?, poster=?, banner=?, year=?, rating=?, language=?, duration=?, genres=?, tags=?, description=?, is_home=?, is_trending=?, is_most_viewed=?, is_banner=?, updated_at=? WHERE id=?`
      : `INSERT INTO anime (title, slug, type, status, poster, banner, year, rating, language, duration, genres, tags, description, is_home, is_trending, is_most_viewed, is_banner, created_at, is_hidden, id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`;

    const values = [
      body.title, body.slug, body.type, body.status, body.poster, body.banner,
      body.year, body.rating, body.language, body.duration, body.genres, body.tags,
      body.description, 
      body.isHome ? 1 : 0, 
      body.isTrending ? 1 : 0, 
      body.isMostViewed ? 1 : 0, 
      body.isBanner ? 1 : 0,
      Date.now()
    ];

    if(isUpdate) values.push(id); else values.push(id);

    await c.env.DB.prepare(sql).bind(...values).run()
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
// --- ADD THIS ROUTE TO YOUR anime.js ---

// PATCH: Toggle Hide Status
app.patch('/hide/:id', async (c) => {
  const id = c.req.param('id')
  try {
    // SQLite query to flip 0 to 1 or 1 to 0
    await c.env.DB.prepare(`
      UPDATE anime 
      SET is_hidden = CASE WHEN is_hidden = 1 THEN 0 ELSE 1 END 
      WHERE id = ?
    `).bind(id).run()
    
    return c.json({ success: true })
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// Also ensure your POST (INSERT) logic has is_hidden = 0 by default

export default app
