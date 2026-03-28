import { Hono } from "hono"
import { cors } from "hono/cors"

const app = new Hono()

/* ================= CORS ================= */

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}))

/* ================= ROUTES ================= */

/* AUTH */
import auth from "./routes/auth.js"
import dashboard from "./routes/dashboard.js"

/* CONTENT */
import anime from "./routes/anime.js"
import episodes from "./routes/episodes.js"
import categories from "./routes/categories.js"
import banners from "./routes/banners.js"

/* PUBLIC */
import publicAnime from "./routes/publicAnime.js"
import publicEpisodes from "./routes/publicEpisodes.js"
import publicCategories from "./routes/publicCategories.js"
import publicBanners from "./routes/publicBanners.js"

/* SERVERS */
import adminServers from "./routes/adminServers.js"
import publicServers from "./routes/publicServers.js"

/* DOWNLOADS */
import downloads from "./routes/downloads.js"

/* UI */
import homepage from "./routes/homepage.js"
import footer from "./routes/footer.js"
import player from "./routes/player.js"

/* 🔥 UPLOAD */
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

/* ⚠️ IMPORTANT: same base route (LOGIN BREAK NAHI HOGA) */
app.route("/api/admin", auth)
app.route("/api/admin", dashboard)

app.route("/api/admin", anime)
app.route("/api/admin", episodes)
app.route("/api/admin", categories)
app.route("/api/admin", banners)

app.route("/api/admin", adminServers)

app.route("/api/admin", downloads)

app.route("/api/admin", homepage)
app.route("/api/admin", footer)
app.route("/api/admin", player)

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

/* ✅ UPLOAD (same base route, change mat karna) */
app.route("/api/admin", upload)

/* ================= PUBLIC ================= */

app.route("/api", publicServers)
app.route("/api", publicEpisodes)
app.route("/api", publicCategories)
app.route("/api", publicBanners)
app.route("/api", publicAnime)

app.route("/api", publicAds)
app.route("/api", adClick)

app.route("/api", searchPublic)

app.route("/api", seoPublic)

app.route("/api", securityStats)

app.route("/api", analyticsTrack)

/* ================= EXPORT ================= */

export default {
  fetch: app.fetch,

  async scheduled(event, env) {
    await runAIEngines(env)
  }
}
