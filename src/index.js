/* ================================================
   ANIMEHUNT BACKEND — Main Entry Point
   File: src/index.js
   Node.js (via @hono/node-server) — migrated from Cloudflare Workers
================================================ */

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
import dashboard       from "./routes/dashboard.js"
import anime           from "./routes/anime.js"
import publicAnime     from "./routes/public.js"
import episodes        from "./routes/episodes.js"
import categories      from "./routes/categories.js"
import banners         from "./routes/banners.js"
import bannersPublic   from "./routes/bannersPublic.js"    
import adminServers    from "./routes/adminServers.js"
import player          from "./routes/player.js"           
import playerAdmin     from "./routes/playerAdmin.js"      
import downloads       from "./routes/downloads.js"        
import downloadsAdmin  from "./routes/downloadsAdmin.js"   
import ads             from "./routes/ads.js"              
import adsAdmin        from "./routes/adsAdmin.js"         
import analytics       from "./routes/analytics.js"        
import analyticsAdmin  from "./routes/analyticsAdmin.js"   
import searchAdmin     from "./routes/searchAdmin.js"
import publicSearch    from "./routes/publicSearch.js"
import seoAdmin        from "./routes/seoAdmin.js"
import publicSEO       from "./routes/publicSEO.js"          
import publicSEORoot   from "./routes/publicSEORoot.js"      
import sidebar         from "./routes/sidebar.js"
import footer          from "./routes/footer.js"
import homepage        from "./routes/homepage.js"
import ai              from "./routes/ai.js"
import { runAIEngines } from "./routes/ai.js"  
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
import { runFooterAI } from "./ai/footerAI.js"
import { runPlayerAI, playerProgressRoutes } from "./ai/playerEngine.js"

/* ================= NODE ENV OBJECT ================= */
import { createD1Compatible } from "./adapters/d1Libsql.js"
import { RedisKV }            from "./adapters/kvRedis.js"
import { createClient as createLibsqlClient } from "@libsql/client"

const redisClient = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379")
redisClient.on("error", (err) => console.error("Redis connection error:", err.message))

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

  TURSO_REPLICA_URL:        process.env.TURSO_REPLICA_URL,
  TURSO_REPLICA_AUTH_TOKEN: process.env.TURSO_REPLICA_AUTH_TOKEN,
  TURSO_REPLICA:            tursoReplicaClient,

  CRON_SECRET: process.env.CRON_SECRET,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  STREAM_TOKEN_SECRET: process.env.STREAM_TOKEN_SECRET
}

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

app.use("*", async (c, next) => {
  c.env = nodeEnv
  await next()
})

app.use("*", executionCtxShim)

app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)

  const corsMiddleware = cors({
    origin: allowed.length ? allowed : "*",
    allowHeaders: ["Content-Type", "Authorization", "x-stream-token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials:  allowed.length > 0,
    maxAge:       86400
  })

  return corsMiddleware(c, next)
})

app.options("*", (c) => c.text("", 200))

app.use("*", async (c, next) => {
  if (!c.env.DB) {
    return c.json({ success: false, message: "DB NOT CONFIGURED" }, 500)
  }
  await next()
})

app.use("*", dbSync)

app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path} ${c.res.status} — ${ms}ms`)
})

app.use("*", firewall)
app.use("*", systemGuard)

app.get("/", (c) => c.json({
  success:   true,
  message:   "AnimeHunt Backend Running 🚀",
  version:   "2.0.1-node",
  timestamp: new Date().toISOString()
}))

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

app.post("/internal/run-cron", async (c) => {
  const authHeader = c.req.header("Authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null

  if (!token || !secretsMatch(token, c.env.CRON_SECRET)) {
    return c.json({ success: false, message: "Unauthorized" }, 401)
  }

  console.log(`⏰ Cron: manual trigger at ${new Date().toISOString()}`)
  const results = await Promise.allSettled([
    runFooterAI(c.env),
    runAIEngines(c.env),
    runPlayerAI(c.env)
  ])

  return c.json({
    success: true,
    ran_at: new Date().toISOString(),
    results: results.map(r => r.status)
  })
})

function secretsMatch(a, b) {
  if (!a || !b) return false
  const bufA = createHash("sha256").update(a).digest()
  const bufB = createHash("sha256").update(b).digest()
  return timingSafeEqual(bufA, bufB)
}

/* ================= PUBLIC ROUTES ================= */
app.route("/api", publicAnime)
app.route("/api", player)             
app.route("/api", playerProgressRoutes) 
app.route("/api", bannersPublic)  
app.route("/api", downloads)          
app.route("/api", ads)                
app.route("/api", analytics)      
app.route("/api", publicSearch)
app.route("/api", publicSEO)
app.route("/", publicSEORoot)     
app.route("/api", recommendations)
app.route("/api", trending)

/* ================= ADMIN LOGIN ================= */
app.route("/api/admin", adminAuthApp)        

/* ================= ADMIN ROUTES (AUTH REQUIRED) ================= */
const adminRoutes = new Hono()
adminRoutes.use("*", (c, next) => requireAuth(c.env)(c, next))

adminRoutes.route("/", dashboard)
adminRoutes.route("/", anime)
adminRoutes.route("/", episodes)
adminRoutes.route("/", categories)
adminRoutes.route("/", banners)
adminRoutes.route("/", playerAdmin)     
adminRoutes.route("/", adminServers)
adminRoutes.route("/", downloadsAdmin)  
adminRoutes.route("/", adsAdmin)        
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

/* ================= START SERVER ================= */
const port = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 AnimeHunt backend listening on http://localhost:${info.port}`)
})

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing Redis connection...")
  await redisClient.quit()
  process.exit(0)
})
