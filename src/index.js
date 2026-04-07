import { Hono } from "hono"
import { cors } from "hono/cors"

/* ================= APP ================= */

const app = new Hono()

/* ================= GLOBAL ERROR HANDLER ================= */

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

/* ================= CORS ================= */

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}))

/* ================= OPTIONS FIX ================= */

app.options("*", (c) => c.text("", 200))

/* ================= BASIC LOGGER ================= */

app.use("*", async (c, next) => {
  const start = Date.now()

  await next()

  const ms = Date.now() - start
  console.log(`${c.req.method} ${c.req.url} - ${ms}ms`)
})

/* ================= MIDDLEWARE ================= */

import { firewall } from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"

/* 🔥 ORDER IMPORTANT */
app.use("*", systemGuard)
app.use("*", firewall)

/* ================= ROUTES IMPORT ================= */

/* AUTH */
import auth from "./routes/auth.js"
import dashboard from "./routes/dashboard.js"

/* CONTENT */
import anime from "./routes/anime.js"
import episodes from "./routes/episodes.js"
import publicAnime from "./routes/publicAnime.js"
import publicEpisodes from "./routes/publicEpisodes.js"
import categories from "./routes/categories.js"
import publicCategories from "./routes/publicCategories.js"
import banners from "./routes/banners.js"
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

/* ================= AI ENGINES ================= */

import { runSystemAI as runAIEngines } from "./ai/engine.js"
import { runFooterAI } from "./ai/footerAI.js"

/* ================= HEALTH ================= */

app.get("/", (c) => {
  return c.json({
    success: true,
    status: "AnimeHunt Backend Running 🚀"
  })
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

app.route("/api", publicServers)
app.route("/api", publicEpisodes)
app.route("/api", publicCategories)
app.route("/api", publicBanners)
app.route("/api", publicAnime)

app.route("/api", publicPlayer)

app.route("/api", publicAds)
app.route("/api", adClick)

app.route("/api", searchPublic)

app.route("/api", seoPublic)

app.route("/api", analyticsTrack)

/* ================= ENV VALIDATION ================= */

app.use("*", async (c, next) => {
  if (!c.env.DB) {
    return c.json({
      success: false,
      error: "Database not configured"
    }, 500)
  }
  await next()
})

/* ================= EXPORT ================= */

export default {
  fetch: app.fetch,

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAIEngines(env))
    ctx.waitUntil(runFooterAI(env))
  }
}
