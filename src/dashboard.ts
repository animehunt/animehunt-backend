<script>
async function checkAuth(){

  const res = await fetch(
    "https://animehunt-backend.animehunt715.workers.dev/api/admin/dashboard",
    {
      credentials:"include"
    }
  )

  if(!res.ok){
    location.href="index.html"
  }
}

checkAuth()
</script>
import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const dashboard = new Hono<{ Bindings: Bindings }>()

dashboard.get("/", async (c) => {

  const db = c.env.DB

  /* ===============================
     CORE COUNTS
  ============================== */

  const animeCount     = await count(db, "anime")
  const episodeCount   = await count(db, "episodes")
  const categoryCount  = await count(db, "categories")
  const bannerCount    = await count(db, "banners")
  const downloadCount  = await count(db, "downloads")
  const serverCount    = await count(db, "servers")

  /* ===============================
     GROWTH DATA
  ============================== */

  const trendingAnime = await db
    .prepare("SELECT COUNT(*) as c FROM anime WHERE isTrending = 1")
    .first()

  const ongoingAnime = await db
    .prepare("SELECT COUNT(*) as c FROM anime WHERE status = 'ongoing'")
    .first()

  const topRated = await db
    .prepare("SELECT COUNT(*) as c FROM anime WHERE rating >= 8")
    .first()

  /* Ads (if table exists) */
  const activeAds = await safeCount(db, "ads")

  /* ===============================
     RETURN CLEAN JSON
  ============================== */

  return c.json({
    core: {
      animeCount,
      episodeCount,
      categoryCount,
      bannerCount,
      downloadCount,
      serverCount
    },
    growth: {
      activeAds,
      todayRevenue: 0,        // future upgrade
      adClicks: 0,            // future upgrade
      trendingAnime: trendingAnime?.c || 0,
      ongoingAnime: ongoingAnime?.c || 0,
      topRated: topRated?.c || 0
    },
    system: {
      cmsStatus: "OK",
      serverLoad: "Low",
      apiStatus: "Online",
      aiStatus: "Active",
      searchStatus: "Ready",
      backupStatus: "Synced"
    }
  })

})

/* ===============================
   HELPERS
================================ */

async function count(db: D1Database, table: string) {
  const row = await db
    .prepare(`SELECT COUNT(*) as c FROM ${table}`)
    .first()
  return row?.c || 0
}

async function safeCount(db: D1Database, table: string) {
  try {
    return await count(db, table)
  } catch {
    return 0
  }
}

export default dashboard
