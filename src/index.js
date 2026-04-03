import { Hono } from "hono"
import { cors } from "hono/cors"

const app = new Hono()

/* ================= CORS ================= */

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}))

/* 🔥 MIDDLEWARE */
import { firewall } from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"

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

/* AI ROUTE */
import ai from "./routes/ai.js"

/* DEPLOY */
import deploy from "./routes/deploy.js"

/* SIDEBAR */
import sidebar from "./routes/sidebar.js"

/* ================= AI ENGINES ================= */

import { runAIEngines } from "./ai/runAIEngines.js"
import { runFooterAI } from "./ai/footerAI.js"

/* ================= HEALTH ================= */

app.get("/", (c) => {
  return c.json({
    status: "AnimeHunt Backend Running 🚀"
  })
})

/* ================= ADMIN ================= */

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

app.route("/api/admin", searchAdmin)

app.route("/api/admin", seoAdmin)

app.route("/api/admin", securityAdmin)

app.route("/api/admin", performance)

app.route("/api/admin", system)

app.route("/api/admin", ads)
app.route("/api/admin", adsAnalytics)

app.route("/api/admin", analyticsAdmin)

/* AI */
app.route("/api/admin", ai)

/* DEPLOY */
app.route("/api/admin", deploy)

/* UPLOAD */
app.route("/api/admin", upload)

/* SIDEBAR */
app.route("/api/admin", sidebar)

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

app.route("/api", analyticsTrack)

app.route("/api", footer)

/* ================= GLOBAL SECURITY ================= */

app.use("*", systemGuard)
app.use("*", firewall)

/* ================= EXPORT (ONLY ONE) ================= */

export default {
  fetch: app.fetch,

  async scheduled(event, env, ctx) {

    // 🔥 ALL AI SYSTEMS RUN HERE
    ctx.waitUntil(runAIEngines(env))
    ctx.waitUntil(runFooterAI(env))

  }
}
