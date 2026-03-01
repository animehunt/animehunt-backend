import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import adsRoutes from './ads'
import aiRoutes from "./ai"
import analyticsRoutes from "./analytics"
import animeRoutes from "./anime"
import bannerRoutes from "./banners"
import categoryRoutes from "./categories"
import deployRoutes from "./deploy"
import downloadRoutes from "./download"

const app = new Hono()

// ===== ENV TYPES =====
type Bindings = {
  DB: D1Database
  R2: R2Bucket
}

app.get('/', (c) => {
  return c.text('🔥 AnimeHunt Backend Running')
})

// =====================
// SIMPLE LOGIN
// =====================
app.post('/login', async (c) => {
  const { username, password } = await c.req.json()

  if (username === 'admin' && password === 'admin123') {
    setCookie(c, 'session', 'admin_logged_in', {
      httpOnly: true,
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24
    })

    return c.json({ success: true })
  }

  return c.json({ success: false }, 401)
})

app.post('/logout', (c) => {
  deleteCookie(c, 'session')
  return c.json({ success: true })
})

// =====================
// AUTH CHECK MIDDLEWARE
// =====================
app.use('/admin/*', async (c, next) => {
  const session = getCookie(c, 'session')

  if (session !== 'admin_logged_in') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

// =====================
// CREATE ANIME
// =====================
app.post('/admin/anime', async (c) => {
  const body = await c.req.json()
app.route('/api/admin/ads', adsRoutes)
  app.route("/api/admin/ai", aiRoutes)
  app.route("/api/admin/analytics", analyticsRoutes)
  app.route("/api/admin/anime", animeRoutes)
  app.route("/api/admin/banners", bannerRoutes)
  app.route("/api/admin/categories", categoryRoutes)
  app.route("/api/admin/deploy", deployRoutes)
  app.route("/api/admin/download", downloadRoutes)
  
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    `INSERT INTO animes (
      id, title, slug, type, status, poster, banner
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .bind(
    id,
    body.title,
    body.slug,
    body.type,
    body.status,
    body.poster || '',
    body.banner || ''
  )
  .run()

  return c.json({ success: true })
})

// =====================
// GET ALL ANIME
// =====================
app.get('/admin/anime', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM animes ORDER BY createdAt DESC`
  ).all()

  return c.json(results)
})

export default app
