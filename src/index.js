/* ================================================
   ANIMEHUNT BACKEND — Main Entry Point
   File: src/index.js
   Cloudflare Workers (Hono)

   CHANGES (Downloads + Ads module added):
     - downloads router mount kiya (public + admin)
     - ads router mount kiya (public + admin)
   Baaki sab unchanged hai
================================================ */

import { Hono } from "hono"
import { cors }  from "hono/cors"

/* ================= MIDDLEWARE IMPORTS ================= */

import { dbSync }      from "./middleware/dbSync.js"
import { firewall }    from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"
import adminAuthApp, { requireAuth } from "./middleware/adminAuth.js"

/* ================= ROUTE IMPORTS ================= */

import auth            from "./routes/auth.js"
import dashboard       from "./routes/dashboard.js"
import anime           from "./routes/anime.js"
import publicAnime     from "./routes/public.js"
import episodes        from "./routes/episodes.js"
import categories      from "./routes/categories.js"
import banners         from "./routes/banners.js"
import adminServers    from "./routes/adminServers.js"
import player          from "./routes/player.js"
import downloads       from "./routes/downloads.js"   // ← NEW
import ads             from "./routes/ads.js"          // ← NEW
import analytics       from "./routes/analytics.js"
import searchAdmin     from "./routes/searchAdmin.js"
import publicSearch    from "./routes/publicSearch.js"
import seoAdmin        from "./routes/seoAdmin.js"
import publicSEO       from "./routes/publicSEO.js"
import sidebar         from "./routes/sidebar.js"
import footer          from "./routes/footer.js"
import homepage        from "./routes/homepage.js"
import ai              from "./routes/ai.js"
import securityAdmin   from "./routes/securityAdmin.js"
import performance     from "./routes/performance.js"
import system          from "./routes/system.js"
import deploy          from "./routes/deploy.js"
import upload          from "./routes/upload.js"
import recommendations from "./routes/recommendations.js"
import robots          from "./routes/robots.js"
import sitemap         from "./routes/sitemap.js"
import trending        from "./routes/trending.js"
import dbRestore       from "./routes/dbRestore.js"
import bulkUpload      from "./routes/bulk-upload.js"    // ← CRITICAL FIX #4

/* ================= AI ENGINES ================= */

import { runPlayerAI } from "./ai/playerEngine.js"
import { runFooterAI } from "./ai/footerAI.js"

/* ================= APP ================= */

const app = new Hono()

/* ================= CORS ================= */
/* Domain Cloudflare env var se aata hai — code edit nahi karna padega.
   wrangler.toml ya dashboard mein ALLOWED_ORIGINS set karo, comma-separated:
   ALLOWED_ORIGINS = "https://animehunt.in,https://www.animehunt.in,https://admin.animehunt.in"
   Naya domain add/change karna ho to sirf env var update karo aur redeploy karo — yeh file touch nahi hogi. */
app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)

  const corsMiddleware = cors({
    origin: allowed.length ? allowed : "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials:  allowed.length > 0,   // wildcard "*" ke saath credentials:true invalid hai
    maxAge:       86400
  })

  return corsMiddleware(c, next)
})

app.options("*", (c) => c.text("", 200))

/* ================= DB CHECK ================= */
app.use("*", async (c, next) => {
  if (!c.env.DB) {
    return c.json({ success: false, message: "DB NOT CONFIGURED" }, 500)
  }
  await next()
})

/* ================= DB SYNC ================= */
app.use("*", dbSync)

/* ================= LOGGER ================= */
app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path} ${c.res.status} — ${ms}ms`)
})

/* ================= FIREWALL + SYSTEM GUARD ================= */
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth")) return await next()
  return await firewall(c, next)
})
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth")) return await next()
  return await systemGuard(c, next)
})

/* ================= ROOT ================= */
app.get("/", (c) => c.json({
  success:   true,
  message:   "AnimeHunt Backend Running 🚀",
  version:   "2.0.1",
  timestamp: new Date().toISOString()
}))

/* ================= HEALTH CHECK ================= */
app.get("/health", async (c) => {
  let dbOk = false
  try { await c.env.DB.prepare("SELECT 1").run(); dbOk = true } catch {}
  return c.json({
    success: true,
    status:  dbOk ? "ok" : "degraded",
    db:      dbOk ? "connected" : "error",
    timestamp: new Date().toISOString()
  }, dbOk ? 200 : 503)
})

app.get("/api/health", async (c) => {
  let dbOk = false
  try { await c.env.DB.prepare("SELECT 1").run(); dbOk = true } catch {}
  return c.json({
    success: true,
    status:  dbOk ? "ok" : "degraded",
    db:      dbOk ? "connected" : "error",
    timestamp: new Date().toISOString()
  }, dbOk ? 200 : 503)
})

/* ================= PUBLIC ROUTES ================= */
app.route("/api", publicAnime)
app.route("/api", player)
app.route("/api", downloads)      // ← /api/go, /api/session/:id, /api/knight-data, /api/public/download-hosts, /api/public/episodes, /api/analytics
app.route("/api", ads)            // ← /api/public/page-ads
app.route("/api", publicSearch)
app.route("/api", publicSEO)
app.route("/api", recommendations)
app.route("/api", robots)
app.route("/api", sitemap)
app.route("/api", trending)

/* ================= AUTH ROUTE (NO AUTH MIDDLEWARE) ================= */
app.route("/api/auth", auth)
app.route("/api/admin", adminAuthApp)        // ← FIX: adminAuthApp's internal routes already start with /auth/, so mount at /api/admin (not /api/admin/auth) to compose correctly: /api/admin + /auth/login = /api/admin/auth/login

/* ================= ADMIN ROUTES (AUTH REQUIRED) ================= */
const adminRoutes = new Hono()
adminRoutes.use("*", (c, next) => requireAuth(c.env)(c, next))

adminRoutes.route("/", dashboard)
adminRoutes.route("/", anime)
adminRoutes.route("/", episodes)
adminRoutes.route("/", categories)
adminRoutes.route("/", banners)
adminRoutes.route("/", adminServers)
adminRoutes.route("/", downloads)    // ← /api/admin/downloads/*, /api/admin/hosts/*
adminRoutes.route("/", ads)          // ← /api/admin/ads-library/*, /api/admin/popup-library/*, etc.
adminRoutes.route("/", analytics)
adminRoutes.route("/", homepage)
adminRoutes.route("/", footer)
adminRoutes.route("/", sidebar)
adminRoutes.route("/", searchAdmin)
adminRoutes.route("/", seoAdmin)
adminRoutes.route("/", securityAdmin)
adminRoutes.route("/", performance)
adminRoutes.route("/", system)
adminRoutes.route("/", ai)
adminRoutes.route("/", deploy)
adminRoutes.route("/", upload)
adminRoutes.route("/", dbRestore)
adminRoutes.route("/", bulkUpload)   // ← CRITICAL FIX #4: bulk-upload admin routes

app.route("/api/admin", adminRoutes)

/* ================= ERROR HANDLER ================= */
app.onError((err, c) => {
  console.error(`🔥 GLOBAL ERROR [${c.req.method} ${c.req.path}]:`, err)
  return c.json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(c.env.ENVIRONMENT === "development" && { stack: err.stack })
  }, err.status ?? 500)
})

app.notFound((c) => c.json({ success: false, message: "Route Not Found" }, 404))

/* ================= EXPORT ================= */
export default {
  fetch: app.fetch,

  async scheduled(event, env, ctx) {
    console.log(`⏰ Cron: ${event.cron} at ${new Date().toISOString()}`)
    ctx.waitUntil(runPlayerAI(env))
    ctx.waitUntil(runFooterAI(env))
  }
}


