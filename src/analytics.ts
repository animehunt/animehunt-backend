import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const analytics = new Hono<{ Bindings: Bindings }>()

/* ===============================
   DATE FILTER HELPER
================================ */
function getDateFilter(range: string) {
  if (range === "today") {
    return `date(createdAt) = date('now')`
  }

  const days = parseInt(range)
  if (!isNaN(days)) {
    return `createdAt >= datetime('now','-${days} day')`
  }

  return `1=1`
}

/* ===============================
   GET DASHBOARD DATA
================================ */
analytics.get("/", async (c) => {

  const range = c.req.query("range") || "7"
  const dateFilter = getDateFilter(range)

  const statsQuery = `
    SELECT
      COUNT(DISTINCT CASE WHEN type='page' THEN id END) as visitors,
      COUNT(CASE WHEN type='page' THEN 1 END) as pageViews,
      COUNT(CASE WHEN type='anime' THEN 1 END) as animeViews,
      COUNT(CASE WHEN type='episode' THEN 1 END) as episodeViews,
      COUNT(CASE WHEN type='download' THEN 1 END) as downloads,
      COUNT(CASE WHEN type='search' THEN 1 END) as searches
    FROM analytics_events
    WHERE ${dateFilter}
  `

  const stats = await c.env.DB.prepare(statsQuery).first()

  const topAnime = await c.env.DB.prepare(`
    SELECT ref as animeSlug, COUNT(*) as views
    FROM analytics_events
    WHERE type='anime' AND ${dateFilter}
    GROUP BY ref
    ORDER BY views DESC
    LIMIT 10
  `).all()

  const topEpisodes = await c.env.DB.prepare(`
    SELECT ref as episodeId, COUNT(*) as views
    FROM analytics_events
    WHERE type='episode' AND ${dateFilter}
    GROUP BY ref
    ORDER BY views DESC
    LIMIT 10
  `).all()

  const topSearches = await c.env.DB.prepare(`
    SELECT value as query, COUNT(*) as count
    FROM analytics_events
    WHERE type='search' AND ${dateFilter}
    GROUP BY value
    ORDER BY count DESC
    LIMIT 10
  `).all()

  const topCategories = await c.env.DB.prepare(`
    SELECT ref as category, COUNT(*) as views
    FROM analytics_events
    WHERE type='category' AND ${dateFilter}
    GROUP BY ref
    ORDER BY views DESC
    LIMIT 10
  `).all()

  const topBanners = await c.env.DB.prepare(`
    SELECT ref as banner, COUNT(*) as clicks
    FROM analytics_events
    WHERE type='banner' AND ${dateFilter}
    GROUP BY ref
    ORDER BY clicks DESC
    LIMIT 10
  `).all()

  const topServers = await c.env.DB.prepare(`
    SELECT ref as server, COUNT(*) as views
    FROM analytics_events
    WHERE type='server' AND ${dateFilter}
    GROUP BY ref
    ORDER BY views DESC
    LIMIT 10
  `).all()

  return c.json({
    stats,
    topAnime: topAnime.results,
    topEpisodes: topEpisodes.results,
    topSearches: topSearches.results,
    topCategories: topCategories.results,
    topBanners: topBanners.results,
    topServers: topServers.results
  })
})

/* ===============================
   TRACK EVENT (PUBLIC)
================================ */
analytics.post("/track", async (c) => {

  const body = await c.req.json()

  const { type, ref, value } = body

  if (!type) {
    return c.json({ error: "Invalid" }, 400)
  }

  await c.env.DB.prepare(`
    INSERT INTO analytics_events (id, type, ref, value)
    VALUES (?, ?, ?, ?)
  `)
  .bind(crypto.randomUUID(), type, ref || null, value || null)
  .run()

  return c.json({ success: true })
})

export default analytics
