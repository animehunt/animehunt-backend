import { Hono } from "hono"
import { cors } from "hono/cors"

/* ================= APP ================= */

const app = new Hono()

/* ================= CORS ================= */

app.use("*", cors({
  origin: "*",
  allowHeaders: [
    "Content-Type",
    "Authorization"
  ],
  allowMethods: [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "OPTIONS"
  ]
}))

/* ================= OPTIONS ================= */

app.options("*", (c) => c.text("", 200))

/* ================= LOGGER ================= */

app.use("*", async (c, next) => {

  const start = Date.now()

  await next()

  const ms = Date.now() - start

  console.log(
    `${c.req.method} ${c.req.path} - ${ms}ms`
  )

})

/* ================= ERROR HANDLER ================= */

app.onError((err, c) => {

  console.error("🔥 GLOBAL ERROR:", err)

  return c.json({
    success: false,
    message: err.message || "Internal Server Error"
  }, 500)

})

/* ================= NOT FOUND ================= */

app.notFound((c) => {

  return c.json({
    success: false,
    message: "Route Not Found"
  }, 404)

})

/* ================= MIDDLEWARE ================= */

import { firewall } from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"

/* ================================================= */
/* 🔥 TEMP FIX                                       */
/* ================================================= */
/* systemGuard OFF because login blocked             */
/* firewall ON                                       */
/* ================================================= */

// app.use("*", systemGuard)

app.use("*", firewall)

/* ================= ROUTES ================= */

/* AUTH */
import auth from "./routes/auth.js"

/* DASHBOARD */
import dashboard from "./routes/dashboard.js"

/* ANIME */
import anime from "./routes/anime.js"
import publicAnime from "./routes/public.js"

/* EPISODES */
import episodes from "./routes/episodes.js"

/* CATEGORIES */
import categories from "./routes/categories.js"

/* BANNERS */
import banners from "./routes/banners.js"

/* SERVERS */
import adminServers from "./routes/adminServers.js"

/* PLAYER */
import player from "./routes/player.js"

/* DOWNLOADS */
import downloads from "./routes/downloads.js"

/* ADS */
import ads from "./routes/ads.js"
import adsAnalytics from "./routes/adsAnalytics.js"

/* ANALYTICS */
import analyticsTrack from "./routes/analyticsTrack.js"
import analyticsAdmin from "./routes/analyticsAdmin.js"

/* SEARCH */
import searchAdmin from "./routes/searchAdmin.js"
import publicSearch from "./routes/publicSearch.js"

/* SEO */
import seoAdmin from "./routes/seoAdmin.js"
import publicSEO from "./routes/publicSEO.js"

/* SIDEBAR */
import sidebar from "./routes/sidebar.js"

/* FOOTER */
import footer from "./routes/footer.js"

/* HOMEPAGE */
import homepage from "./routes/homepage.js"

/* AI */
import ai from "./routes/ai.js"

/* SECURITY */
import securityAdmin from "./routes/securityAdmin.js"

/* PERFORMANCE */
import performance from "./routes/performance.js"

/* SYSTEM */
import system from "./routes/system.js"

/* DEPLOY */
import deploy from "./routes/deploy.js"

/* UPLOAD */
import upload from "./routes/upload.js"

/* ================= AI ENGINES ================= */

import { runSystemAI } from "./ai/engine.js"
import { runFooterAI } from "./ai/footerAI.js"

/* ================= ROOT ================= */

app.get("/", (c) => {

  return c.json({
    success: true,
    message: "AnimeHunt Backend Running 🚀"
  })

})

/* ===================================================== */
/* ================= ADMIN ROUTES ====================== */
/* ===================================================== */

app.route("/api/admin", auth)

app.route("/api/admin", dashboard)

app.route("/api/admin", anime)
app.route("/api/admin", episodes)
app.route("/api/admin", categories)
app.route("/api/admin", banners)

app.route("/api/admin", adminServers)

app.route("/api/admin", player)

app.route("/api/admin", downloads)

app.route("/api/admin", ads)
app.route("/api/admin", adsAnalytics)

app.route("/api/admin", analyticsAdmin)

app.route("/api/admin", homepage)
app.route("/api/admin", footer)
app.route("/api/admin", sidebar)

app.route("/api/admin", searchAdmin)

app.route("/api/admin", seoAdmin)

app.route("/api/admin", securityAdmin)

app.route("/api/admin", performance)

app.route("/api/admin", system)

app.route("/api/admin", ai)

app.route("/api/admin", deploy)

app.route("/api/admin", upload)

/* ===================================================== */
/* ================= PUBLIC ROUTES ===================== */
/* ===================================================== */

app.route("/api", publicAnime)

app.route("/api", player)

app.route("/api", downloads)

app.route("/api", ads)

app.route("/api", publicSearch)

app.route("/api", publicSEO)

app.route("/api", analyticsTrack)

/* ================= ENV CHECK ================= */

app.use("*", async (c, next) => {

  if (!c.env.DB) {

    return c.json({
      success: false,
      message: "DB NOT CONFIGURED"
    }, 500)

  }

  await next()

})

/* ================= EXPORT ================= */

export default {

  fetch: app.fetch,

  async scheduled(event, env, ctx) {

    ctx.waitUntil(
      runSystemAI(env)
    )

    ctx.waitUntil(
      runFooterAI(env)
    )

  }

}
