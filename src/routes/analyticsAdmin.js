import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

app.get("/analytics", verifyAdmin, async (c)=>{

const db = c.env.DB
const range = c.req.query("range") || "7"

let timeFilter = ""

if(range==="today")
timeFilter = "AND created_at >= date('now','start of day')"

else
timeFilter = `AND created_at >= datetime('now','-${range} days')`

/* STATS */

const stats = {}

stats.visitors = (await db.prepare(`
SELECT COUNT(DISTINCT ip) as v
FROM analytics_visitors
WHERE last_visit >= datetime('now','-${range} days')
`).first()).v

stats.pageViews = (await db.prepare(`
SELECT COUNT(*) as v
FROM analytics_events
WHERE type='page' ${timeFilter}
`).first()).v

stats.animeViews = (await db.prepare(`
SELECT COUNT(*) as v
FROM analytics_events
WHERE type='anime' ${timeFilter}
`).first()).v

stats.episodeViews = (await db.prepare(`
SELECT COUNT(*) as v
FROM analytics_events
WHERE type='episode' ${timeFilter}
`).first()).v

stats.downloads = (await db.prepare(`
SELECT COUNT(*) as v
FROM analytics_events
WHERE type='download' ${timeFilter}
`).first()).v

stats.searches = (await db.prepare(`
SELECT COUNT(*) as v
FROM analytics_events
WHERE type='search' ${timeFilter}
`).first()).v

/* TOP ANIME */

const topAnime = (await db.prepare(`
SELECT ref as slug, COUNT(*) as v
FROM analytics_events
WHERE type='anime' ${timeFilter}
GROUP BY ref
ORDER BY v DESC
LIMIT 10
`).all()).results

/* TOP EPISODES */

const topEpisodes = (await db.prepare(`
SELECT ref as id, COUNT(*) as v
FROM analytics_events
WHERE type='episode' ${timeFilter}
GROUP BY ref
ORDER BY v DESC
LIMIT 10
`).all()).results

/* SEARCHES */

const topSearches = (await db.prepare(`
SELECT value as q, COUNT(*) as c
FROM analytics_events
WHERE type='search' ${timeFilter}
GROUP BY value
ORDER BY c DESC
LIMIT 10
`).all()).results

/* CATEGORIES */

const topCategories = (await db.prepare(`
SELECT ref as cat, COUNT(*) as v
FROM analytics_events
WHERE type='category' ${timeFilter}
GROUP BY ref
ORDER BY v DESC
LIMIT 10
`).all()).results

/* BANNERS */

const topBanners = (await db.prepare(`
SELECT ref as ban, COUNT(*) as c
FROM analytics_events
WHERE type='banner' ${timeFilter}
GROUP BY ref
ORDER BY c DESC
LIMIT 10
`).all()).results

/* SERVERS */

const topServers = (await db.prepare(`
SELECT ref as srv, COUNT(*) as v
FROM analytics_events
WHERE type='server' ${timeFilter}
GROUP BY ref
ORDER BY v DESC
LIMIT 10
`).all()).results

return c.json({
stats,
topAnime,
topEpisodes,
topSearches,
topCategories,
topBanners,
topServers
})

})

export default app
