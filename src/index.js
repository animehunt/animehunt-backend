import { Hono } from "hono"
import { cors } from "hono/cors"

/* ================= APP ================= */

const app = new Hono()

/* ================= CORS ================= */

app.use("*", cors({
  origin: ["https://animehunt.in", "https://www.animehunt.in", "https://admin.animehunt.in"],
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
  maxAge: 86400
}))

app.options("*", (c) => c.text("", 200))

/* ================= DB CHECK ================= */

app.use("*", async (c, next) => {
  if (!c.env.DB) {
    return c.json({ success: false, message: "DB NOT CONFIGURED" }, 500)
  }
  await next()
})

/* ================= DB SYNC MIDDLEWARE ================= */

import { dbSync } from "./middleware/dbSync.js"
app.use("*", dbSync)

/* ================= LOGGER ================= */

app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path} ${c.res.status} - ${ms}ms`)
})

/* ================= MIDDLEWARE ================= */

import { firewall }    from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"
import { adminAuth }   from "./middleware/adminAuth.js"

app.use("*", firewall)
app.use("*", systemGuard)

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
import downloads       from "./routes/downloads.js"
import ads             from "./routes/ads.js"
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

/* ================= AI ENGINES ================= */

import { runPlayerAI } from "./ai/playerEngine.js"
import { runFooterAI } from "./ai/footerAI.js"

/* ================= ROOT ================= */

app.get("/", (c) => c.json({
  success: true,
  message: "AnimeHunt Backend Running 🚀",
  version: "2.0.1",
  timestamp: new Date().toISOString()
}))

/* ================= HEALTH CHECK ================= */

app.get("/health", async (c) => {
  let dbOk = false
  try {
    await c.env.DB.prepare("SELECT 1").run()
    dbOk = true
  } catch {}

  return c.json({
    success: true,
    status: "ok",
    db: dbOk ? "connected" : "error",
    timestamp: new Date().toISOString()
  }, dbOk ? 200 : 503)
})

/* ===================================================== */
/* ================= PUBLIC ROUTES ==================== */
/* ===================================================== */

app.route("/api", publicAnime)
app.route("/api", player)
app.route("/api", downloads)
app.route("/api", ads)
app.route("/api", publicSearch)
app.route("/api", publicSEO)
app.route("/api", recommendations)
app.route("/api", robots)
app.route("/api", sitemap)
app.route("/api", trending)

/* ===================================================== */
/* ================= AUTH ROUTE ======================= */
/* ===================================================== */

app.route("/api/admin", auth)

/* ===================================================== */
/* ================= ADMIN ROUTES ===================== */
/* ===================================================== */

const adminRoutes = new Hono()
adminRoutes.use("*", adminAuth)

adminRoutes.route("/", dashboard)
adminRoutes.route("/", anime)
adminRoutes.route("/", episodes)
adminRoutes.route("/", categories)
adminRoutes.route("/", banners)
adminRoutes.route("/", adminServers)
adminRoutes.route("/", downloads)
adminRoutes.route("/", ads)
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
    console.log(`⏰ Cron triggered: ${event.cron} at ${new Date().toISOString()}`)
    ctx.waitUntil(runPlayerAI(env))
    ctx.waitUntil(runFooterAI(env))
  }
}
