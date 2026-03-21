import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

/* ==========================================
   HELPERS
   ========================================== */
const getList = async (env) => await env.ANIME_DB.get("anime_list", { type: "json" }) || []
const saveList = async (env, data) => await env.ANIME_DB.put("anime_list", JSON.stringify(data))

/* ==========================================
   ROUTES
   ========================================== */

// GET ALL & SEARCH
app.get('/', async (c) => {
  const { type, status, home, q } = c.req.query()
  let list = await getList(c.env)

  if (type) list = list.filter(a => a.type === type)
  if (status) list = list.filter(a => a.status === status)
  if (home === "yes") list = list.filter(a => a.is_home === true)
  if (q) list = list.filter(a => a.title.toLowerCase().includes(q.toLowerCase()))

  return c.json(list)
})

// GET SINGLE
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const list = await getList(c.env)
  const anime = list.find(a => a.id === id)
  return anime ? c.json(anime) : c.json({ error: "Not Found" }, 404)
})

// SAVE / UPDATE
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    let list = await getList(c.env)

    const animeData = {
      title: body.title,
      slug: body.slug,
      type: body.type,
      status: body.status,
      poster: body.poster,
      banner: body.banner,
      year: body.year,
      rating: body.rating,
      language: body.language,
      duration: body.duration,
      genres: body.genres,
      tags: body.tags,
      description: body.description,
      is_home: Boolean(body.isHome),
      is_trending: Boolean(body.isTrending),
      is_most_viewed: Boolean(body.isMostViewed),
      is_banner: Boolean(body.isBanner),
      updated_at: Date.now()
    }

    if (body.id) {
      list = list.map(a => a.id === body.id ? { ...a, ...animeData } : a)
    } else {
      list.unshift({ ...animeData, id: crypto.randomUUID(), created_at: Date.now(), is_hidden: false })
    }

    await saveList(c.env, list)
    return c.json({ success: true })
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  let list = await getList(c.env)
  await saveList(c.env, list.filter(a => a.id !== id))
  return c.json({ success: true })
})

// HIDE
app.patch('/hide/:id', async (c) => {
  const id = c.req.param('id')
  let list = await getList(c.env)
  list = list.map(a => a.id === id ? { ...a, is_hidden: !a.is_hidden } : a)
  await saveList(c.env, list)
  return c.json({ success: true })
})

export default app
