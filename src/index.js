import { Hono } from "hono"
import { cors } from "hono/cors"

/* ================= APP ================= */

const app = new Hono()

/* ================= CORS ================= */

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}))

/* ================= OPTIONS ================= */

app.options("*", (c) => c.text("", 200))

/* ================= ENV VALIDATION (VERY IMPORTANT) ================= */

app.use("*", async (c, next) => {
  if (!c.env.DB) {
    return c.json({
      success: false,
      error: "Database not configured"
    }, 500)
  }
  await next()
})

/* ================= LOGGER ================= */

app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`${c.req.method} ${c.req.url} - ${ms}ms`)
})

/* ================= GLOBAL ERROR ================= */

app.onError((err, c) => {
  console.error("🔥 GLOBAL ERROR:", err)
  return c.json({
    success: false,
    error: "Internal Server Error"
  }, 500)
})

/* ================= NOT FOUND ================= */

app.notFound((c) => {
  return c.json({
    success: false,
    error: "Route Not Found"
  }, 404)
})

/* ================= MIDDLEWARE ================= */

import { firewall } from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"

/* ✅ APPLY ONLY ADMIN ROUTES */
app.use("/api/admin/*", systemGuard)
app.use("/api/admin/*", firewall)

/* ================= ROUTES ================= */

/* AUTH */
import auth from "./routes/auth.js"
import dashboard from "./routes/dashboard.js"

/* CONTENT */
import anime from "./routes/anime.js"
import episodes from "./routes/episodes.js"
import categories from "./routes/categories.js"
import banners from "./routes/banners.js"

/* PUBLIC CONTENT */
import publicAnime from "./routes/publicAnime.js"
import publicEpisodes from "./routes/publicEpisodes.js"
import publicCategories from "./routes/publicCategories.js"
import publicBanners from "./routes/publicBanners.js"

/* SERVERS */
import adminServers from "./routes/adminServers.js"
import publicServers from "./routes/publicServers.js"

/* PLAYER */
import player from "./routes/player.js"
import publicPlayer from "./routes/publicPlayer.js"

/* DOWNLOADS */
import downloads from "./routes/downloads.js"

/* UI */
import homepage from "./routes/homepage.js"
import footer from "./routes/footer.js"

/* UPLOAD */
import upload from "./routes/upload.js"

/* SEARCH */
import searchAdmin from "./routes/searchAdmin.js"
import searchPublic from "./routes/searchPublic.js"

/* SEO */
import seoAdmin from "./routes/seoAdmin.js"
import seoPublic from "./routes/seoPublic.js"

/* SECURITY */
import securityAdmin from "./routes/securityAdmin.js"

/* PERFORMANCE */
import performance from "./routes/performance.js"

/* SYSTEM */
import system from "./routes/system.js"

/* ADS */
import ads from "./routes/ads.js"
import publicAds from "./routes/publicAds.js"
import adClick from "./routes/adClick.js"
import adsAnalytics from "./routes/adsAnalytics.js"

/* ANALYTICS */
import analyticsTrack from "./routes/analyticsTrack.js"
import analyticsAdmin from "./routes/analyticsAdmin.js"

/* AI */
import ai from "./routes/ai.js"

/* DEPLOY */
import deploy from "./routes/deploy.js"

/* SIDEBAR */
import sidebar from "./routes/sidebar.js"

/* ================= HEALTH ================= */

app.get("/", (c) => {
  return c.json({
    success: true,
    message: "AnimeHunt Backend Running 🚀"
  })
})

/* ================= DEBUG TEST ================= */

app.get("/test", (c) => {
  return c.json({ ok: true })
})

/* ================= ADMIN ROUTES ================= */

app.route("/api/admin", auth)
app.route("/api/admin", dashboard)

app.route("/api/admin", anime)
app.route("/api/admin", episodes)
app.route("/api/admin", categories)
app.route("/api/admin", banners)

app.route("/api/admin", adminServers)
app.route("/api/admin", player)
app.route("/api/admin", downloads)

app.route("/api/admin", homepage)
app.route("/api/admin", footer)

app.route("/api/admin", searchAdmin)
app.route("/api/admin", seoAdmin)

app.route("/api/admin", securityAdmin)
app.route("/api/admin", performance)
app.route("/api/admin", system)

app.route("/api/admin", ads)
app.route("/api/admin", adsAnalytics)

app.route("/api/admin", analyticsAdmin)

app.route("/api/admin", ai)
app.route("/api/admin", deploy)
app.route("/api/admin", upload)
app.route("/api/admin", sidebar)

/* ================= PUBLIC ROUTES ================= */

app.route("/api", publicAnime)
app.route("/api", publicEpisodes)
app.route("/api", publicCategories)
app.route("/api", publicBanners)
app.route("/api", publicServers)

app.route("/api", publicPlayer)

app.route("/api", publicAds)
app.route("/api", adClick)

app.route("/api", searchPublic)
app.route("/api", seoPublic)

app.route("/api", analyticsTrack)

/* ================= EXPORT ================= */

import { runSystemAI } from "./ai/engine.js"
import { runFooterAI } from "./ai/footerAI.js"

export default {
  fetch: app.fetch,

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSystemAI(env))
    ctx.waitUntil(runFooterAI(env))
  }
}
