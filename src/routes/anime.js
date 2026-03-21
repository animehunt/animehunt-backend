import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// 1. CORS Middleware - Isse Frontend errors nahi aayenge
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

/* ==========================================
   HELPER: JSON FETCH FROM KV
   ========================================== */
const getList = async (env) => {
  return await env.ANIME_DB.get("anime_list", { type: "json" }) || []
}

const saveList = async (env, data) => {
  await env.ANIME_DB.put("anime_list", JSON.stringify(data))
}

/* ==========================================
   ROUTES
   ========================================== */

// GET: Sabhi Anime ki list nikalne ke liye (Filters ke saath)
app.get('/', async (c) => {
  const type = c.req.query('type')
  const status = c.req.query('status')
  const home = c.req.query('home')
  const q = c.req.query('q')

  let list = await getList(c.env)

  if (type) list = list.filter(a => a.type === type)
  if (status) list = list.filter(a => a.status === status)
  if (home === "yes") list = list.filter(a => a.is_home === true)
  if (home === "no") list = list.filter(a => a.is_home === false)
  if (q) {
    const search = q.toLowerCase()
    list = list.filter(a => a.title.toLowerCase().includes(search))
  }

  return c.json(list)
})

// GET: Ek specific anime fetch karne ke liye (Edit mode ke liye)
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const list = await getList(c.env)
  const anime = list.find(a => a.id === id)
  
  if (!anime) return c.json({ error: "Anime not found" }, 404)
  return c.json(anime)
})

// POST: Naya Anime Save karna ya Purana Update karna
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    let list = await getList(c.env)

    // Data Mapping (Frontend CamelCase to Backend SnakeCase)
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
      // --- UPDATE LOGIC ---
      list = list.map(a => a.id === body.id ? { ...a, ...animeData } : a)
    } else {
      // --- CREATE LOGIC ---
      const newEntry = {
        ...animeData,
        id: crypto.randomUUID(),
        created_at: Date.now(),
        is_hidden: false
      }
      list.unshift(newEntry) // Naya anime sabse upar dikhega
    }

    await saveList(c.env, list)
    return c.json({ success: true, message: "Anime saved successfully" })
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// DELETE: Anime ko list se delete karna
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  let list = await getList(c.env)
  
  const newList = list.filter(a => a.id !== id)
  await saveList(c.env, newList)
  
  return c.json({ success: true })
})

// PATCH: Anime ko Hide ya Unhide karna (Eye Icon logic)
app.patch('/hide/:id', async (c) => {
  const id = c.req.param('id')
  let list = await getList(c.env)
  
  list = list.map(a => {
    if (a.id === id) a.is_hidden = !a.is_hidden
    return a
  })

  await saveList(c.env, list)
  return c.json({ success: true })
})

export default app
