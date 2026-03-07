import { Hono } from 'hono'
import { cors } from 'hono/cors'

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

import sitemap from "./routes/sitemap"
import robots from "./routes/robots"

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

/* =====================
   GLOBAL CORS
===================== */
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']
}))

/* =====================
   ROOT CHECK
===================== */
app.get('/', (c) => {
  return c.text('🔥 AnimeHunt Backend Running')
})

/* =====================
   ADMIN LOGIN
===================== */
app.post('/api/admin/login', async (c) => {

  const { username, password } = await c.req.json()

  if (
    username === 'anime_moderator_007' &&
    password === 'Nim3Chanchal2026UltraSecure'
  ) {

    const token = crypto.randomUUID()

    return c.json({
      success: true,
      token
    })

  }

  return c.json({ error: 'Invalid credentials' }, 401)

})

/* =====================
   AUTH MIDDLEWARE
===================== */
app.use('/api/admin/*', async (c, next) => {

  if (c.req.path === '/api/admin/login') {
    return next()
  }

  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.split(' ')[1]

  if (!token || token.length < 10) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  await next()

})

/* =====================
   ADMIN ROUTES
===================== */

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
app.route("/api/admin/seo", seoRoutes)
app.route("/api/admin/servers", serverRoutes)
app.route("/api/admin/sidebar", sidebarRoutes)
app.route("/api/admin/system", systemRoutes)

/* =====================
   PUBLIC ANIME API
===================== */
app.get("/api/anime", async (c) => {

  try {

    const result = await c.env.DB
      .prepare("SELECT * FROM anime")
      .all()

    return c.json({
      success: true,
      data: result.results
    })

  } catch (err) {

    console.error(err)

    return c.json({
      success: false,
      error: "Failed to fetch anime"
    }, 500)

  }

})

/* =====================
   HEALTH CHECK
===================== */
app.get("/api/health", async (c) => {

  try {

    const dbTest = await c.env.DB
      .prepare("SELECT COUNT(*) as total FROM anime")
      .first()

    return c.json({
      status: "OK",
      database: "Connected",
      totalAnime: dbTest?.total || 0,
      timestamp: new Date().toISOString()
    })

  } catch (err) {

    return c.json({
      status: "ERROR",
      database: "Disconnected",
      error: String(err)
    }, 500)

  }

})

/* =====================
   PUBLIC ROUTES
===================== */

app.route("/api/security/stats", securityStats)
app.route("/", sitemap)
app.route("/", robots)

export default app
