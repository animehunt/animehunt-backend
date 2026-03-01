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
import episodeRoutes from "./episodes"
import footerRoutes from "./footer"
import homepageRoutes from "./homepage"
import dashboardRoutes from "./dashboard"
import performanceRoutes from "./performance"
import playerRoutes from "./player"
import searchRoutes from "./search"
import securityRoutes from "./security"
import securityStats from "./securityStats"
import seoRoutes from "./seo"
import serverRoutes from "./servers"
import sidebarRoutes from "./sidebar"
import systemRoutes from "./system"

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
  app.route("/api/admin/episodes", episodeRoutes)
  app.route("/api/admin/footer", footerRoutes)
  app.route("/api/admin/homepage", homepageRoutes)
  app.route("/api/admin/dashboard", dashboardRoutes)
  app.route("/api/admin/performance", performanceRoutes)
  app.route("/api/admin/player", playerRoutes)
  app.route("/api/admin/search", searchRoutes)
  app.route("/api/admin/security", securityRoutes)
app.route("/api/security/stats", securityStats)
  app.route("/api/admin/seo", seoRoutes)
  app.route("/api/admin/servers", serverRoutes)
  app.route("/api/admin/sidebar", sidebarRoutes)
  app.route("/api/admin/system", systemRoutes)
 
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
