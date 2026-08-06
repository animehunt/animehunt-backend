/* ================================================
   ANIMEHUNT BACKEND — Main Entry Point
   File: src/index.js
   Node.js (via @hono/node-server) — migrated from Cloudflare Workers

   ── SCOPE NOTE — READ BEFORE DEPLOYING ──────────────────────────
   This revision is built only from the files actually provided in
   this round. Six imports from the version this was based on point
   at files that were NOT included here, so they've been removed
   rather than left as dangling imports that would crash on boot:

     ./routes/player.js            ./routes/downloads.js
     ./routes/playerAdmin.js       ./routes/downloadsAdmin.js
     ./routes/ads.js               ./ai/playerEngine.js
     ./routes/adsAdmin.js

   Nothing else in this codebase imports any of those six files, so
   removing them here is self-contained — verified by grepping every
   provided file for references to each path. When you have those
   files, restore their import lines + `app.route(...)` /
   `adminRoutes.route(...)` registrations (search this file for
   "NOT INCLUDED" below to find exactly where each one plugs back
   in). Two things worth carrying forward when you do:

     1. Public/admin split — if player.js/downloads.js/ads.js still
        contain BOTH public and admin-only routes in one file, mount
        that same Hono() instance in only one place (public app.route
        OR adminRoutes.route, never both) — mounting one router
        object in two places exposes every route in it at both
        prefixes, auth included.
     2. c.executionCtx.waitUntil() — now works on Node via the shim
        below, so playerEngine.js's own waitUntil() calls (if any)
        need no changes either.

   Everything else below is otherwise a routing/infra pass over what
   Workers gave you for free: c.env.DB / c.env.KV are populated by
   the adapters instead of Workers bindings, c.executionCtx.waitUntil
   is polyfilled (see EXECUTION CONTEXT below), and the Cron Trigger
   is replaced by a secret-gated HTTP route (see /internal/run-cron).
================================================ */

// MUST be the very first import — loads .env into process.env before
// anything below reads from it. No-op in prod if you instead set real
// environment variables via systemd/PM2 (dotenv only fills in values
// that aren't already set).
import "dotenv/config"

import { createHash, timingSafeEqual } from "node:crypto"
import { Hono } from "hono"
import { cors }  from "hono/cors"
import { serve } from "@hono/node-server"
import Redis from "ioredis"

/* ================= MIDDLEWARE IMPORTS ================= */

import { dbSync }      from "./middleware/dbSync.js"
import { firewall }    from "./middleware/firewall.js"
import { systemGuard } from "./middleware/systemGuard.js"
import adminAuthApp, { requireAuth } from "./middleware/adminAuth.js"
import { executionCtxShim } from "./adapters/executionCtx.js"

/* ================= ROUTE IMPORTS ================= */

// No public/visitor login is mounted anywhere in this file — only the
// admin panel authenticates, via adminAuth.js/adminAuthApp below.
import dashboard       from "./routes/dashboard.js"
import anime           from "./routes/anime.js"
import publicAnime     from "./routes/public.js"
import episodes        from "./routes/episodes.js"
import categories      from "./routes/categories.js"
import banners         from "./routes/banners.js"
import bannersPublic   from "./routes/bannersPublic.js"    // ← public click-tracking route only
import adminServers    from "./routes/adminServers.js"
// NOT INCLUDED in this round: ./routes/player.js, ./routes/playerAdmin.js
// NOT INCLUDED in this round: ./routes/downloads.js, ./routes/downloadsAdmin.js
// NOT INCLUDED in this round: ./routes/ads.js, ./routes/adsAdmin.js
import analytics       from "./routes/analytics.js"        // ← public tracking routes only
import analyticsAdmin  from "./routes/analyticsAdmin.js"   // ← admin dashboard routes only
import searchAdmin     from "./routes/searchAdmin.js"
import publicSearch    from "./routes/publicSearch.js"
import seoAdmin        from "./routes/seoAdmin.js"
import publicSEO       from "./routes/publicSEO.js"          // ← /api/seo/meta, /api/seo/schema
import publicSEORoot   from "./routes/publicSEORoot.js"      // ← robots.txt, sitemap*.xml — mounted at domain root, NOT /api
import sidebar         from "./routes/sidebar.js"
import footer          from "./routes/footer.js"
import homepage        from "./routes/homepage.js"
import ai              from "./routes/ai.js"
import { runAIEngines } from "./routes/ai.js"  // named export, wired into /internal/run-cron below
import securityAdmin   from "./routes/securityAdmin.js"
import performance     from "./routes/performance.js"
import system          from "./routes/system.js"
import deploy          from "./routes/deploy.js"
import upload          from "./routes/upload.js"
import recommendations from "./routes/recommendations.js"
import trending        from "./routes/trending.js"
import dbRestore       from "./routes/dbRestore.js"
import bulkUpload      from "./routes/bulk-upload.js"

/* ================= AI ENGINES ================= */

// NOT INCLUDED in this round: ./ai/playerEngine.js (runPlayerAI, playerProgressRoutes)
// — confirmed nothing else in the provided codebase imports it, so this is a
// clean removal, not a partial one. See the scope note at the top of this file.
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
   URL/token below). Whether each route file's own syncToReplicas()/
   syncToTurso() write-path helper (anime.js, categories.js, banners.js,
   adminServers.js, episodes.js, dashboard.js) actually targets this
   database internally is that file's own concern — this object just
   makes the credentials/client available under the same env.TURSO_REPLICA_*
   names each of those helpers already expects. */

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

  CRON_SECRET: process.env.CRON_SECRET,

  // Used by anime.js's POST /anime/auto-add and episodes.js's POST
  // /episodes/auto-add (TMDB metadata import). Despite the name, this
  // should be TMDB's "API Read Access Token" (a long JWT starting
  // "eyJ...", from your TMDB account under Settings → API) — see
  // src/utils/tmdb.js's header comment for why. Optional: if unset,
  // those two routes return a clear "not configured" error; nothing
  // else in this app depends on it.
  TMDB_API_KEY: process.env.TMDB_API_KEY,

  // Optional signed-token alternative to playerEngine.js's Origin/Referer
  // embed check, for legitimate non-browser callers. Harmless to leave wired
  // even while playerEngine.js itself isn't part of this round's files.
  STREAM_TOKEN_SECRET: process.env.STREAM_TOKEN_SECRET
}

// Fail loudly at boot rather than silently signing JWTs with an insecure
// fallback if this is ever left unset (adminAuth.js also refuses to sign
// or verify anything without a real secret — see that file for why this
// isn't the only line of defense).
if (!nodeEnv.JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not set in the environment. Refusing to start.")
  process.exit(1)
}
if (!nodeEnv.TURSO_URL || !nodeEnv.TURSO_AUTH_TOKEN) {
  console.error("❌ FATAL: TURSO_URL / TURSO_AUTH_TOKEN are not set. Refusing to start.")
  process.exit(1)
}
if (!nodeEnv.CRON_SECRET) {
  console.error("❌ FATAL: CRON_SECRET is not set in the environment. Refusing to start.")
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

/* ================= EXECUTION CONTEXT (Node equivalent of Workers'
   ctx.waitUntil — see src/adapters/executionCtx.js for why this exists) ================= */
app.use("*", executionCtxShim)

/* ================= CORS =================
   ALLOWED_ORIGINS comes from the environment (.env / systemd / PM2), comma-
   separated, e.g.:
     ALLOWED_ORIGINS=https://animehunt.in,https://www.animehunt.in,https://admin.animehunt.in
   Add or change a domain by updating that env var and restarting the
   process — this file doesn't need to change. */
app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)

  const corsMiddleware = cors({
    origin: allowed.length ? allowed : "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials:  allowed.length > 0,   // wildcard "*" is invalid together with credentials:true
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
   No public /api/auth route is mounted anywhere in this file, so there's
   nothing to exempt at that path. /api/admin/auth/login (the real,
   admin-only login) has never been exempted from these and isn't now
   either — it has its own tight rate limit instead (firewall.js: 5
   attempts / 5 minutes). */
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
// registered before the firewall/systemGuard middleware above has any
// effect on it — it's a small, fixed, secret-gated surface, not a public
// endpoint.
//
// Secret comparison is constant-time (same standard adminAuth.js already
// holds itself to for password verification) rather than a plain !== —
// bearer-token checks are exactly the kind of comparison a timing
// side-channel can target.
//
// Note: playerEngine.js's runPlayerAI() isn't wired in here because
// ai/playerEngine.js wasn't part of this round's files — see the scope
// note at the top of this file for how to add it back.
app.post("/internal/run-cron", async (c) => {
  const authHeader = c.req.header("Authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

  if (!token || !secretsMatch(token, c.env.CRON_SECRET)) {
    return c.json({ success: false, message: "Unauthorized" }, 401)
  }

  console.log(`⏰ Cron: manual trigger at ${new Date().toISOString()}`)
  const results = await Promise.allSettled([
    runFooterAI(c.env),
    runAIEngines(c.env)
  ])

  return c.json({
    success: true,
    ran_at: new Date().toISOString(),
    results: results.map(r => r.status)
  })
})

// Constant-time string comparison for the cron bearer token. Node's
// timingSafeEqual() throws on mismatched buffer lengths, so both inputs
// are hashed to a fixed-length digest first — this also means the
// comparison itself never leaks the real secret's length.
function secretsMatch(a, b) {
  if (!a || !b) return false
  const bufA = createHash("sha256").update(a).digest()
  const bufB = createHash("sha256").update(b).digest()
  return timingSafeEqual(bufA, bufB)
}

/* ================= PUBLIC ROUTES ================= */
app.route("/api", publicAnime)
// NOT INCLUDED in this round: app.route("/api", player) — ./routes/player.js
// NOT INCLUDED in this round: app.route("/api", playerProgressRoutes) — ./ai/playerEngine.js
app.route("/api", bannersPublic)  // ← /api/banners/:id/click
// NOT INCLUDED in this round: app.route("/api", downloads) — ./routes/downloads.js
// NOT INCLUDED in this round: app.route("/api", ads) — ./routes/ads.js
app.route("/api", analytics)      // ← /api/track/view, /api/track/download, /api/track/search, /api/track/banner
app.route("/api", publicSearch)
app.route("/api", publicSEO)
app.route("/", publicSEORoot)     // ← root-mounted: /robots.txt, /sitemap.xml, /sitemap-index.xml, /sitemap-static.xml, /sitemap-anime-:page.xml
app.route("/api", recommendations)
app.route("/api", trending)

/* ================= ADMIN LOGIN (NO AUTH MIDDLEWARE — this IS the login endpoint) ================= */
app.route("/api/admin", adminAuthApp)        // ← adminAuthApp's internal routes start with /auth/, so mounting at /api/admin (not /api/admin/auth) composes to /api/admin/auth/login

/* ================= ADMIN ROUTES (AUTH REQUIRED) ================= */
const adminRoutes = new Hono()
adminRoutes.use("*", (c, next) => requireAuth(c.env)(c, next))

adminRoutes.route("/", dashboard)
adminRoutes.route("/", anime)
adminRoutes.route("/", episodes)
adminRoutes.route("/", categories)
adminRoutes.route("/", banners)
// NOT INCLUDED in this round: adminRoutes.route("/", playerAdmin) — ./routes/playerAdmin.js
adminRoutes.route("/", adminServers)
// NOT INCLUDED in this round: adminRoutes.route("/", downloadsAdmin) — ./routes/downloadsAdmin.js
// NOT INCLUDED in this round: adminRoutes.route("/", adsAdmin) — ./routes/adsAdmin.js
adminRoutes.route("/", analyticsAdmin)
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
adminRoutes.route("/", bulkUpload)

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


