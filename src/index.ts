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
import cloudinary from './cloudinary'

const app = new Hono()

// =====================================================
// ROOT CHECK
// =====================================================
app.get('/', (c) => {
  return c.text('🔥 AnimeHunt Backend Running')
})


// =====================================================
// LOGIN (MUST BE BEFORE AUTH MIDDLEWARE)
// =====================================================
app.post('/api/admin/login', async (c) => {

  const { username, password } = await c.req.json()

  if (
    username === 'anime_moderator_007' &&
    password === 'Nim3Chanchal2026UltraSecure'
  ) {

    setCookie(c, 'session', 'admin_logged_in', {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      path: '/',
      maxAge: 60 * 60 * 24
    })

    return c.json({ success: true })
  }

  return c.json({ error: 'Invalid credentials' }, 401)
})


// =====================================================
// LOGOUT
// =====================================================
app.post('/api/admin/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ success: true })
})


// =====================================================
// AUTH MIDDLEWARE (ADMIN ONLY)
// =====================================================
app.use('/api/admin/*', async (c, next) => {

  // Allow login route without auth
  if (c.req.path === '/api/admin/login') {
    return next()
  }

  const session = getCookie(c, 'session')

  if (session !== 'admin_logged_in') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})


// =====================================================
// GLOBAL SYSTEM CHECK (KILL SWITCH)
// =====================================================
app.use('*', async (c, next) => {

  // Skip admin APIs
  if (c.req.path.startsWith('/api/admin')) {
    return next()
  }

  try {
    const row = await c.env.DB
      .prepare("SELECT config FROM system_config WHERE id='master'")
      .first()

    if (!row) return next()

    const config = JSON.parse(row.config)

    if (!config.systemOn || config.maintenanceHard) {
      return c.text("Platform Under Maintenance", 503)
    }

  } catch {
    // If DB not ready, ignore
  }

  await next()
})


// =====================================================
// ADMIN ROUTES
// =====================================================
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


// =====================================================
// PUBLIC ROUTES
// =====================================================
app.route("/api/security/stats", securityStats)
app.route("/", cloudinary)

export default app
