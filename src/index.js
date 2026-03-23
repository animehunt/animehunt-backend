import { Hono } from "hono"
import { cors } from "hono/cors"

const app = new Hono()

/* ================= CORS ================= */

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}))

/* ✅ OPTIONS FIX */
app.options("*", (c) => c.text("", 204))

/* ================= ROUTES ================= */

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
import securityStats from "./routes/securityStats.js"

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
import { runAIEngines } from "./services/aiScheduler.js"

/* DEPLOY */
import deploy from "./routes/deploy.js"

/* ================= HEALTH ================= */

app.get("/", (c) => {
  return c.json({
    status: "AnimeHunt Backend Running 🚀"
  })
})

/* ================= ADMIN ================= */

/* 🔥 AUTH (DUAL SUPPORT) */
app.route("/api/admin", auth)          // OLD (important)
app.route("/api/admin/auth", auth)     // NEW

app.route("/api/admin/dashboard", dashboard)

/* CORE */
app.route("/api/admin/anime", anime)
app.route("/api/admin/episodes", episodes)
app.route("/api/admin/categories", categories)
app.route("/api/admin/banners", banners)

/* SERVERS */
app.route("/api/admin/servers", adminServers)

/* DOWNLOADS */
app.route("/api/admin/downloads", downloads)

/* UI */
app.route("/api/admin/homepage", homepage)
app.route("/api/admin/footer", footer)

/* SEARCH */
app.route("/api/admin/search", searchAdmin)

/* SEO */
app.route("/api/admin/seo", seoAdmin)

/* SECURITY */
app.route("/api/admin/security", securityAdmin)

/* PERFORMANCE */
app.route("/api/admin/performance", performance)

/* SYSTEM */
app.route("/api/admin/system", system)

/* ADS */
app.route("/api/admin/ads", ads)
app.route("/api/admin/ads-analytics", adsAnalytics)

/* ANALYTICS */
app.route("/api/admin/analytics", analyticsAdmin)

/* AI */
app.route("/api/admin/ai", ai)

/* DEPLOY */
app.route("/api/admin/deploy", deploy)

/* ✅ UPLOAD (FIXED) */
app.route("/api/upload", upload)

/* ================= PUBLIC ================= */

app.route("/api/anime", publicAnime)
app.route("/api/episodes", publicEpisodes)
app.route("/api/categories", publicCategories)
app.route("/api/banners", publicBanners)

app.route("/api/servers", publicServers)

app.route("/api/ads", publicAds)
app.route("/api/ad-click", adClick)

app.route("/api/search", searchPublic)

app.route("/api/seo", seoPublic)

app.route("/api/security", securityStats)

app.route("/api/analytics", analyticsTrack)

/* ================= EXPORT ================= */

export default {
  fetch: app.fetch,

  async scheduled(event, env) {
    await runAIEngines(env)
  }
}
