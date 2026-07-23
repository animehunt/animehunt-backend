/* ================================================
   ANIMEHUNT BACKEND — Main Entry Point
   File: src/index.js
   Node.js (via @hono/node-server) — migrated from Cloudflare Workers

   MIGRATION NOTES (everything below the "AI ENGINES" import block,
   i.e. from "NODE ENV OBJECT" onward, is new/changed for the VPS
   migration. Every route import and every app.route(...)/adminRoutes
   registration below is byte-for-byte unchanged from the Workers
   version — they didn't need to change, because c.env.DB and c.env.KV
   are populated by the adapters instead of Workers bindings.

   CHANGES (Downloads + Ads module added):
     - downloads router mount kiya (public + admin)
     - ads router mount kiya (public + admin)
   Baaki sab unchanged hai
================================================ */

// MUST be the very first import — loads .env into process.env before
// anything below reads from it. No-op in prod if you instead set real
// environment variables via systemd/PM2 (dotenv only fills in values
// that aren't already set).
import "dotenv/config"

import { Hono } from "hono"
import { cors }  from "hono/cors"
import { serve } from "@hono/node-server"
import Redis from "ioredis"

/* ================= MIDDLEWARE IMPORTS ================= */

import { dbSync }      from "./middleware/dbSync.js"
import { firewall }    from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"
import adminAuthApp, { requireAuth } from "./middleware/adminAuth.js"

/* ================= ROUTE IMPORTS ================= */

// (public site-user auth removed — confirmed no visitor login exists on
// the live site, admin-only login stays via adminAuth.js/adminAuthApp below)
import dashboard       from "./routes/dashboard.js"
import anime           from "./routes/anime.js"
import publicAnime     from "./routes/public.js"
import episodes        from "./routes/episodes.js"
import categories      from "./routes/categories.js"
import banners         from "./routes/banners.js"
import bannersPublic   from "./routes/bannersPublic.js"  // ✅ FIX (audit ISSUE-025): public click-tracking route only
import adminServers    from "./routes/adminServers.js"
import player          from "./routes/player.js"
import playerAdmin     from "./routes/playerAdmin.js"  // ✅ FIX (audit ISSUE-020): admin-only player write routes
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
import { runAIEngines } from "./routes/ai.js"  // ✅ FIX (audit ISSUE-010): named export, wired into /internal/run-cron below
import securityAdmin   from "./routes/securityAdmin.js"
import performance     from "./routes/performance.js"
import system          from "./routes/system.js"
import deploy          from "./routes/deploy.js"
import upload          from "./routes/upload.js"
import recommendations from "./routes/recommendations.js"
// (robots.js and sitemap.js removed — publicSEO.js already had complete,
// more capable implementations of both routes that were silently winning
// over these two anyway; found during the final QA pass, see README)
import trending        from "./routes/trending.js"
import dbRestore       from "./routes/dbRestore.js"
import bulkUpload      from "./routes/bulk-upload.js"    // ← CRITICAL FIX #4

/* ================= AI ENGINES ================= */

import { runPlayerAI } from "./ai/playerEngine.js"
import { playerProgressRoutes } from "./ai/playerEngine.js"  // ✅ FIX (audit ISSUE-017): watch-progress/video-config routes, now mountable
import { runFooterAI } from "./ai/footerAI.js"

/* ================= NODE ENV OBJECT (replaces Workers bindings) =================
   On Workers, c.env.DB / c.env.KV / c.env.SOMETHING_SECRET were populated
   automatically from wrangler.toml bindings + `wrangler secret put`. On
   Node nothing does that for you, so we build the same-shaped object once
   here from process.env and inject it via middleware below.

   FINAL ARCHITECTURE (100% cloud, no local SQLite file, no Bun runtime):
     DB1 Primary  -> Turso (existing DB)      -> c.env.DB          (via d1Libsql.js adapter)
     DB2 Replica  -> Supabase (unchanged)      -> c.env.SUPABASE_URL/KEY, used by each route
                                                   file's own syncToSupabase() helper, untouched
     DB3 Replica  -> Turso (SECOND, independent DB) -> c.env.TURSO_REPLICA / TURSO_REPLICA_URL

   Scope note on DB3: this env object makes the second Turso database
   available as a working connection (env.TURSO_REPLICA, plus the raw
   URL/token below). Actually repointing the existing per-route
   syncToReplicas()/syncToTurso() write-path helpers (in anime.js,
   categories.js, banners.js, adminServers.js, episodes.js, dashboard.js)
   to push to *this* database instead of re-hitting the primary is a
   separate, bounded follow-up — say the word and I'll go do that pass;
   holding off here since it touches files beyond what was asked for in
   this round (adapters + index.js + deploy.yml). */

import { createD1Compatible } from "./adapters/d1Libsql.js"
import { RedisKV }            from "./adapters/kvRedis.js"
import { createR2Compatible } from "./adapters/r2S3.js"
import { createClient as createLibsqlClient } from "@libsql/client"

const redisClient = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379")

redisClient.on("error", (err) => console.error("Redis connection error:", err.message))

// DB3 — the second, independent Turso database. Optional: if you haven't
// created it yet, leave these two env vars blank and this just stays null
// (same "gracefully absent" pattern as R2_BUCKET below) rather than crashing.
const tursoReplicaClient =
  process.env.TURSO_REPLICA_URL && process.env.TURSO_REPLICA_AUTH_TOKEN
    ? createLibsqlClient({
        url:       process.env.TURSO_REPLICA_URL,
        authToken: process.env.TURSO_REPLICA_AUTH_TOKEN
      })
    : null

const nodeEnv = {
  DB: createD1Compatible({
    url:       process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  }),
  KV: new RedisKV(redisClient),

  // R2_BUCKET stays undefined (same as an unbound Workers binding) unless
  // all four R2_* vars are set — dbRestore.js's existing `if (!env.R2_BUCKET)`
  // guards already handle that case gracefully, no changes needed there.
  R2_BUCKET: createR2Compatible({
    accountId:       process.env.R2_ACCOUNT_ID,
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket:          process.env.R2_BUCKET_NAME
  }),

  ALLOWED_ORIGINS:       process.env.ALLOWED_ORIGINS,
  ENVIRONMENT:           process.env.ENVIRONMENT || "production",
  JWT_SECRET:            process.env.JWT_SECRET,
  ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD,

  IMAGEKIT_PRIVATE_KEY:   process.env.IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_PUBLIC_KEY:    process.env.IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_URL_ENDPOINT:  process.env.IMAGEKIT_URL_ENDPOINT,

  TURSO_URL:        process.env.TURSO_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  SUPABASE_URL:     process.env.SUPABASE_URL,
  SUPABASE_KEY:     process.env.SUPABASE_KEY,

  // DB3 — raw credentials (for any route file's own fetch()-based sync
  // helpers, matching how TURSO_URL/SUPABASE_URL are exposed above) plus a
  // ready @libsql/client instance (for direct querying, e.g. from a health
  // check or a future dbRestore.js three-way comparison).
  TURSO_REPLICA_URL:        process.env.TURSO_REPLICA_URL,
  TURSO_REPLICA_AUTH_TOKEN: process.env.TURSO_REPLICA_AUTH_TOKEN,
  TURSO_REPLICA:            tursoReplicaClient,

  CRON_SECRET: process.env.CRON_SECRET
}

// Fail loudly at boot rather than silently signing JWTs with the fallback
// string baked into adminAuth.js if this is ever left unset.
if (!nodeEnv.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not set in the environment. Refusing to start.")
  process.exit(1)
}
if (!nodeEnv.TURSO_URL || !nodeEnv.TURSO_AUTH_TOKEN) {
  console.error("❌ FATAL: TURSO_URL / TURSO_AUTH_TOKEN are not set. Refusing to start.")
  process.exit(1)
}

/* ================= APP ================= */

const app = new Hono()

/* ================= ENV INJECTOR (must run before everything else —
   CORS below reads c.env.ALLOWED_ORIGINS on the very first request) ================= */
app.use("*", async (c, next) => {
  c.env = nodeEnv
  await next()
})

/* ================= CORS ================= */
/* Domain Cloudflare env var se aata hai — code edit nahi karna padega.
   wrangler.toml ya dashboard mein ALLOWED_ORIGINS set karo, comma-separated:
   ALLOWED_ORIGINS = "https://animehunt.in,https://www.animehunt.in,https://admin.animehunt.in"
   Naya domain add/change karna ho to sirf env var update karo aur redeploy karo — yeh file touch nahi hogi.
   (Unchanged from Workers version — on Node this now reads from the .env
   file / systemd environment instead of a wrangler.toml [vars] block, but
   the code here doesn't need to know the difference.) */
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

/* ================= FIREWALL + SYSTEM GUARD =================
   The /api/auth exemption that used to live here is gone along with
   routes/auth.js — nothing is mounted at that path anymore, so there's
   nothing left to exempt. /api/admin/auth/login (the real, admin-only
   login) was never exempted from these and still isn't — it has its own
   tight rate limit instead (firewall.js: 5 attempts / 5 minutes). */
app.use("*", firewall)
app.use("*", systemGuard)

/* ================= ROOT ================= */
app.get("/", (c) => c.json({
  success:   true,
  message:   "AnimeHunt Backend Running 🚀",
  version:   "2.0.1-node",
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

// ================= CRON REPLACEMENT (was Workers `scheduled()`) =================
// Cloudflare Workers Cron Triggers called scheduled(event, env, ctx) every
// 5 minutes (see wrangler.toml's old [triggers] block). A plain Node
// process has no equivalent export, so this becomes a real, secret-
// protected HTTP route that an actual OS cron job hits on the same
// schedule. Add this to the VPS's crontab (`crontab -e`):
//
//   */5 * * * * curl -s -X POST https://your-domain/internal/run-cron \
//     -H "Authorization: Bearer YOUR_CRON_SECRET" >> /var/log/animehunt-cron.log 2>&1
//
// (NOTE: the crontab line above is why this whole block uses `//` line
// comments instead of a /* */ block — a literal "*/" inside a block
// comment terminates it early and breaks the file, which is exactly
// what the "*/5" in that schedule does.)
//
// Set CRON_SECRET in your .env to any long random string and use the
// same value in the crontab line above. This route is intentionally
// registered before the firewall/systemGuard middleware below has any
// effect on it — it's a small, fixed, secret-gated surface, not a public
// endpoint.
//
// Note: this only replicates what the old scheduled() actually called
// (runPlayerAI + runFooterAI). routes/ai.js exports a separate
// runAIEngines() that its own comment says is "called by cron every 5
// minutes", but nothing in the original scheduled() handler actually
// called it — that gap already existed before this migration.
//
// ✅ FIX (audit ISSUE-010): added below. runAIEngines() covers the
// server/analytics/category/banner/seo/homepage/backup/search/deploy/
// download engines (see ai.js) — previously these only ran when an admin
// manually clicked "Run Now" on the AI Brain page, including the
// auto-failover logic that's supposed to activate a backup server when
// all others are down (see the ISSUE-016 fix in ai.js) — a feature whose
// entire value is in running unattended, on schedule, not on-demand.
app.post("/internal/run-cron", async (c) => {
  const authHeader = c.req.header("Authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

  if (!c.env.CRON_SECRET || token !== c.env.CRON_SECRET) {
    return c.json({ success: false, message: "Unauthorized" }, 401)
  }

  console.log(`⏰ Cron: manual trigger at ${new Date().toISOString()}`)
  const results = await Promise.allSettled([
    runPlayerAI(c.env),
    runFooterAI(c.env),
    runAIEngines(c.env)
  ])

  return c.json({
    success: true,
    ran_at: new Date().toISOString(),
    results: results.map(r => r.status)
  })
})

/* ================= PUBLIC ROUTES ================= */
app.route("/api", publicAnime)
app.route("/api", player)
app.route("/api", playerProgressRoutes)  // ✅ FIX (audit ISSUE-017): /api/player/validate, /progress, /config — previously dead, never mounted
app.route("/api", bannersPublic)  // ✅ FIX (audit ISSUE-025): /api/banners/:id/click — was admin-only, so real visitor clicks never recorded
app.route("/api", downloads)      // ← /api/go, /api/session/:id, /api/knight-data, /api/public/download-hosts, /api/public/episodes, /api/analytics
app.route("/api", ads)            // ← /api/public/page-ads
app.route("/api", publicSearch)
app.route("/api", publicSEO)
app.route("/api", recommendations)
app.route("/api", trending)

/* ================= ADMIN LOGIN (NO AUTH MIDDLEWARE — this IS the login endpoint) ================= */
app.route("/api/admin", adminAuthApp)        // ← FIX: adminAuthApp's internal routes already start with /auth/, so mount at /api/admin (not /api/admin/auth) to compose correctly: /api/admin + /auth/login = /api/admin/auth/login

/* ================= ADMIN ROUTES (AUTH REQUIRED) ================= */
const adminRoutes = new Hono()
adminRoutes.use("*", (c, next) => requireAuth(c.env)(c, next))

adminRoutes.route("/", dashboard)
adminRoutes.route("/", anime)
adminRoutes.route("/", episodes)
adminRoutes.route("/", categories)
adminRoutes.route("/", banners)
adminRoutes.route("/", playerAdmin)  // ✅ FIX (audit ISSUE-020): POST /player, POST /player/reset now require auth
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

/* ================= START SERVER (replaces `export default { fetch, scheduled }`) ================= */
const port = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 AnimeHunt backend listening on http://localhost:${info.port}`)
})

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing Redis connection...")
  await redisClient.quit()
  process.exit(0)
})

