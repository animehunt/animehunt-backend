import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const dashboard = new Hono<{ Bindings: Bindings }>()

dashboard.get("/", async (c) => {

  const db = c.env.DB

  try{

    /* ===============================
       CORE COUNTS
    ============================== */

    const animeCount     = await safeCount(db,"anime")
    const episodeCount   = await safeCount(db,"episodes")
    const categoryCount  = await safeCount(db,"categories")
    const bannerCount    = await safeCount(db,"banners")
    const downloadCount  = await safeCount(db,"downloads")
    const serverCount    = await safeCount(db,"servers")

    /* ===============================
       GROWTH DATA
    ============================== */

    const trendingAnime = await safeQuery(db,
      "SELECT COUNT(*) as c FROM anime WHERE isTrending = 1"
    )

    const ongoingAnime = await safeQuery(db,
      "SELECT COUNT(*) as c FROM anime WHERE status = 'ongoing'"
    )

    const topRated = await safeQuery(db,
      "SELECT COUNT(*) as c FROM anime WHERE rating >= 8"
    )

    const activeAds = await safeCount(db,"ads")

    /* ===============================
       RESPONSE
    ============================== */

    return c.json({

      core:{
        animeCount,
        episodeCount,
        categoryCount,
        bannerCount,
        downloadCount,
        serverCount
      },

      growth:{
        activeAds,
        todayRevenue:0,
        adClicks:0,
        trendingAnime,
        ongoingAnime,
        topRated
      },

      system:{
        cmsStatus:"OK",
        serverLoad:"Low",
        apiStatus:"Online",
        aiStatus:"Active",
        searchStatus:"Ready",
        backupStatus:"Synced"
      }

    })

  }catch(err){

    console.error("Dashboard error:",err)

    return c.json({
      error:"Dashboard load failed"
    },500)

  }

})

/* ===============================
SAFE COUNT
================================ */

async function safeCount(db:D1Database,table:string){

  try{

    const row:any = await db
      .prepare(`SELECT COUNT(*) as c FROM ${table}`)
      .first()

    return Number(row?.c || 0)

  }catch{

    return 0

  }

}

/* ===============================
SAFE QUERY
================================ */

async function safeQuery(db:D1Database,sql:string){

  try{

    const row:any = await db.prepare(sql).first()

    return Number(row?.c || 0)

  }catch{

    return 0

  }

}

export default dashboard
