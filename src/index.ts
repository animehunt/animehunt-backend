import { Hono } from 'hono'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
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
import cloudinary from './cloudinary'

const app = new Hono()

// =============================
// CORS (IMPORTANT FOR PAGES)
// =============================
app.use('*', cors({
  origin: [
    "https://animehunt-admin.pages.dev",
    "https://animehunt-admin.pages.dev",
    "https://animehunt.netlify.app"
  ],
  credentials: true
}))

// =============================
// ROOT CHECK
// =============================
app.get('/', (c) => {
  return c.text('🔥 AnimeHunt Backend Running')
})

// =============================
// ADMIN LOGIN (D1 BASED)
// =============================
app.post('/api/admin/login', async (c) => {

  try {

    const { username, password } = await c.req.json()

    if (!username || !password) {
      return c.json({ error: "Missing fields" }, 400)
    }

    const admin = await c.env.DB
      .prepare("SELECT * FROM admins WHERE username=?")
      .bind(username)
      .first()

    if (!admin) {
      return c.json({ error: "Invalid credentials" }, 401)
    }

    if (admin.password !== password) {
      return c.json({ error: "Invalid credentials" }, 401)
    }

    setCookie(c, 'session', 'admin_logged_in', {
      httpOnly: true,
      secure: true,
      sameSite: "None",
      path: '/',
      maxAge: 60 * 60 * 24
    })

    return c.json({ success: true })

  } catch (err) {
    return c.json({ error: "Server error" }, 500)
  }
})

// =============================
// LOGOUT
// =============================
app.post('/api/admin/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ success: true })
})

// =============================
// AUTH MIDDLEWARE
// =============================
app.use('/api/admin/*', async (c, next) => {

  if (c.req.path === '/api/admin/login') {
    return next()
  }

  const session = getCookie(c, 'session')

  if (session !== 'admin_logged_in') {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

// =============================
// SYSTEM GLOBAL CHECK
// =============================
app.use('*', async (c, next) => {

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

  } catch (e) {
    // ignore if table not ready
  }

  await next()
})

// =============================
// ROUTE REGISTRATION
// =============================
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

// Cloudinary Upload
app.route('/api/cloudinary', cloudinary)

export default app
