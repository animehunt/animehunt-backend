import { Hono } from "hono"

const ads = new Hono()

/* =========================================
   HELPERS
========================================= */

const ok = (data = {}) => ({
  success: true,
  data
})

const fail = (message = "Error") => ({
  success: false,
  message
})

const now = () => new Date().toISOString()

const parseJSON = (v) => {
  try {
    return JSON.parse(v || "[]")
  } catch {
    return []
  }
}

const stringify = (v) => JSON.stringify(v || [])

const randomPick = (arr = []) => {
  if (!arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

function sequencePick(arr = [], index = 0) {
  if (!arr.length) return null

  const i = index % arr.length

  return {
    value: arr[i],
    next: i + 1
  }
}

const directPick = (arr = []) => {
  if (!arr.length) return null
  return arr[0]
}

/* =========================================
   ANALYTICS TRACKER
========================================= */

async function trackEvent(db, data = {}) {

  await db.prepare(`
    INSERT INTO monetization_analytics (
      id,
      anime,
      season,
      episode,
      host,
      quality,
      monetization_id,
      event_type,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    data.anime || "",
    data.season || "",
    data.episode || "",
    data.host || "",
    data.quality || "",
    data.monetization_id || "",
    data.event_type || "",
    now()
  ).run()

}

/* =========================================
   ROTATION TRACKER
========================================= */

async function getRotationState(db, monetizationId) {

  const row = await db.prepare(`
    SELECT * FROM rotation_tracker
    WHERE monetization_id = ?
  `)
  .bind(monetizationId)
  .first()

  return row || null
}

async function updateRotationState(
  db,
  monetizationId,
  nextIndex = 0
) {

  const exists = await getRotationState(db, monetizationId)

  if (exists) {

    await db.prepare(`
      UPDATE rotation_tracker
      SET current_index = ?
      WHERE monetization_id = ?
    `)
    .bind(nextIndex, monetizationId)
    .run()

  } else {

    await db.prepare(`
      INSERT INTO rotation_tracker (
        id,
        monetization_id,
        current_index
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      crypto.randomUUID(),
      monetizationId,
      nextIndex
    )
    .run()

  }

}

/* =========================================
   ADS LIBRARY
========================================= */

/* GET ALL ADS */

ads.get("/admin/ads-library", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT *
      FROM ads_library
      ORDER BY created_at DESC
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* CREATE AD */

ads.post("/admin/ads-library", async (c) => {

  try {

    const db = c.env.DB

    const body = await c.req.json()

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO ads_library (
        id,
        name,
        ad_url,
        ad_type,
        active,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      body.name || "",
      body.ad_url || "",
      body.ad_type || "redirect",
      body.active ? 1 : 0,
      now()
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* UPDATE AD */

ads.put("/admin/ads-library/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const body = await c.req.json()

    await db.prepare(`
      UPDATE ads_library
      SET
        name = ?,
        ad_url = ?,
        ad_type = ?,
        active = ?
      WHERE id = ?
    `)
    .bind(
      body.name || "",
      body.ad_url || "",
      body.ad_type || "redirect",
      body.active ? 1 : 0,
      id
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* DELETE AD */

ads.delete("/admin/ads-library/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    await db.prepare(`
      DELETE FROM ads_library
      WHERE id = ?
    `)
    .bind(id)
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   SHORTLINKS LIBRARY
========================================= */

ads.get("/admin/shortlinks-library", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT *
      FROM shortlinks_library
      ORDER BY created_at DESC
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

ads.post("/admin/shortlinks-library", async (c) => {

  try {

    const db = c.env.DB

    const body = await c.req.json()

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO shortlinks_library (
        id,
        name,
        shortlink_url,
        active,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      body.name || "",
      body.shortlink_url || "",
      body.active ? 1 : 0,
      now()
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

ads.put("/admin/shortlinks-library/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const body = await c.req.json()

    await db.prepare(`
      UPDATE shortlinks_library
      SET
        name = ?,
        shortlink_url = ?,
        active = ?
      WHERE id = ?
    `)
    .bind(
      body.name || "",
      body.shortlink_url || "",
      body.active ? 1 : 0,
      id
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

ads.delete("/admin/shortlinks-library/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    await db.prepare(`
      DELETE FROM shortlinks_library
      WHERE id = ?
    `)
    .bind(id)
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   POPUP LIBRARY
========================================= */

ads.get("/admin/popup-library", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT *
      FROM popup_library
      ORDER BY created_at DESC
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

ads.post("/admin/popup-library", async (c) => {

  try {

    const db = c.env.DB

    const body = await c.req.json()

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO popup_library (
        id,
        name,
        popup_url,
        active,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      body.name || "",
      body.popup_url || "",
      body.active ? 1 : 0,
      now()
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

ads.put("/admin/popup-library/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const body = await c.req.json()

    await db.prepare(`
      UPDATE popup_library
      SET
        name = ?,
        popup_url = ?,
        active = ?
      WHERE id = ?
    `)
    .bind(
      body.name || "",
      body.popup_url || "",
      body.active ? 1 : 0,
      id
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

ads.delete("/admin/popup-library/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    await db.prepare(`
      DELETE FROM popup_library
      WHERE id = ?
    `)
    .bind(id)
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/*=========================================
   MONETIZATION RULES
   
=========================================*/

/*
CONTENT TYPES:

episode
season_zip
movie
series_zip

MODES:

random
sequence
direct
*/

ads.get("/admin/monetization", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT *
      FROM monetization_rules
      ORDER BY created_at DESC
    `).all()

    const data = results.map(r => ({
      ...r,

      ads: parseJSON(r.ads),
      shortlinks: parseJSON(r.shortlinks),
      popups: parseJSON(r.popups)
    }))

    return c.json(ok(data))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* CREATE RULE */

ads.post("/admin/monetization", async (c) => {

  try {

    const db = c.env.DB

    const body = await c.req.json()

    const id = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO monetization_rules (
        id,

        title,

        anime,
        season,
        episode,

        host,
        quality,

        content_type,

        knight,

        ads,
        shortlinks,
        popups,

        ads_mode,
        shortlinks_mode,
        popup_mode,

        ads_limit,
        shortlinks_limit,
        popup_limit,

        active,

        created_at
      )

      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .bind(

      id,

      body.title || "",

      body.anime || "",
      body.season || "",
      body.episode || "",

      body.host || "",
      body.quality || "",

      body.content_type || "episode",

      body.knight ? 1 : 0,

      stringify(body.ads),
      stringify(body.shortlinks),
      stringify(body.popups),

      body.ads_mode || "random",
      body.shortlinks_mode || "random",
      body.popup_mode || "random",

      Number(body.ads_limit || 1),
      Number(body.shortlinks_limit || 1),
      Number(body.popup_limit || 0),

      body.active ? 1 : 0,

      now()
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* UPDATE RULE */

ads.put("/admin/monetization/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const body = await c.req.json()

    await db.prepare(`
      UPDATE monetization_rules

      SET
        title = ?,

        anime = ?,
        season = ?,
        episode = ?,

        host = ?,
        quality = ?,

        content_type = ?,

        knight = ?,

        ads = ?,
        shortlinks = ?,
        popups = ?,

        ads_mode = ?,
        shortlinks_mode = ?,
        popup_mode = ?,

        ads_limit = ?,
        shortlinks_limit = ?,
        popup_limit = ?,

        active = ?

      WHERE id = ?
    `)
    .bind(

      body.title || "",

      body.anime || "",
      body.season || "",
      body.episode || "",

      body.host || "",
      body.quality || "",

      body.content_type || "episode",

      body.knight ? 1 : 0,

      stringify(body.ads),
      stringify(body.shortlinks),
      stringify(body.popups),

      body.ads_mode || "random",
      body.shortlinks_mode || "random",
      body.popup_mode || "random",

      Number(body.ads_limit || 1),
      Number(body.shortlinks_limit || 1),
      Number(body.popup_limit || 0),

      body.active ? 1 : 0,

      id
    )
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* DELETE RULE */

ads.delete("/admin/monetization/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    await db.prepare(`
      DELETE FROM monetization_rules
      WHERE id = ?
    `)
    .bind(id)
    .run()

    return c.json(ok({ id }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   FIND MATCHING RULE
========================================= */

async function findRule(
  db,
  anime,
  season,
  episode,
  host,
  quality
) {

  const { results } = await db.prepare(`
    SELECT *
    FROM monetization_rules
    WHERE active = 1
    ORDER BY created_at DESC
  `).all()

  const matched = results.find(r => {

    const animeOk =
      !r.anime ||
      r.anime.toLowerCase() === anime.toLowerCase()

    const seasonOk =
      !r.season ||
      String(r.season) === String(season)

    const episodeOk =
      !r.episode ||
      String(r.episode) === String(episode)

    const hostOk =
      !r.host ||
      r.host.toLowerCase() === host.toLowerCase()

    const qualityOk =
      !r.quality ||
      r.quality.toLowerCase() === quality.toLowerCase()

    return (
      animeOk &&
      seasonOk &&
      episodeOk &&
      hostOk &&
      qualityOk
    )

  })

  return matched || null
}

/* =========================================
   PICK ROTATION ITEM
========================================= */

async function pickItem(
  db,
  monetizationId,
  mode,
  items
) {

  if (!items?.length) return null

  /* RANDOM */

  if (mode === "random") {

    return randomPick(items)

  }

  /* DIRECT */

  if (mode === "direct") {

    return directPick(items)

  }

  /* SEQUENCE */

  const state = await getRotationState(
    db,
    monetizationId
  )

  const currentIndex =
    state?.current_index || 0

  const picked = sequencePick(
    items,
    currentIndex
  )

  await updateRotationState(
    db,
    monetizationId,
    picked.next
  )

  return picked.value
}

/* =========================================
   BUILD DOWNLOAD SESSION
========================================= */

ads.get("/go", async (c) => {

  try {

    const db = c.env.DB

    const anime = c.req.query("anime") || ""
    const season = c.req.query("season") || ""
    const episode = c.req.query("episode") || ""
    const host = c.req.query("host") || ""
    const quality = c.req.query("quality") || ""

    const rule = await findRule(
      db,
      anime,
      season,
      episode,
      host,
      quality
    )

    if (!rule) {

      return c.redirect(
        `/knight.html?anime=${encodeURIComponent(anime)}&season=${season}&episode=${episode}&host=${encodeURIComponent(host)}`
      )

    }

    const monetizationId = rule.id

    const adsList = parseJSON(rule.ads)
    const shortlinksList = parseJSON(rule.shortlinks)
    const popupList = parseJSON(rule.popups)

    const selectedAds = []
    const selectedShortlinks = []
    const selectedPopups = []

    /* ADS */

    for (
      let i = 0;
      i < Number(rule.ads_limit || 0);
      i++
    ) {

      const item = await pickItem(
        db,
        monetizationId + "_ads",
        rule.ads_mode,
        adsList
      )

      if (item) selectedAds.push(item)

    }

    /* SHORTLINKS */

    for (
      let i = 0;
      i < Number(rule.shortlinks_limit || 0);
      i++
    ) {

      const item = await pickItem(
        db,
        monetizationId + "_shortlinks",
        rule.shortlinks_mode,
        shortlinksList
      )

      if (item) selectedShortlinks.push(item)

    }

    /* POPUPS */

    for (
      let i = 0;
      i < Number(rule.popup_limit || 0);
      i++
    ) {

      const item = await pickItem(
        db,
        monetizationId + "_popups",
        rule.popup_mode,
        popupList
      )

      if (item) selectedPopups.push(item)

    }

    const sessionId = crypto.randomUUID()

    await db.prepare(`
      INSERT INTO download_sessions (
        id,

        anime,
        season,
        episode,

        host,
        quality,

        monetization_id,

        ads,
        shortlinks,
        popups,

        current_step,

        completed,

        created_at
      )

      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .bind(

      sessionId,

      anime,
      season,
      episode,

      host,
      quality,

      monetizationId,

      stringify(selectedAds),
      stringify(selectedShortlinks),
      stringify(selectedPopups),

      0,

      0,

      now()
    )
    .run()

    return c.redirect(`/ads.html?session=${sessionId}`)

  } catch (err) {

    return c.text(err.message)

  }

})

"
/* =========================================
   GET SESSION
========================================= */

ads.get("/session/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const row = await db.prepare(`
      SELECT *
      FROM download_sessions
      WHERE id = ?
    `)
    .bind(id)
    .first()

    if (!row) {
      return c.json(fail("Session not found"), 404)
    }

    return c.json(ok({

      ...row,

      ads: parseJSON(row.ads),
      shortlinks: parseJSON(row.shortlinks),
      popups: parseJSON(row.popups)

    }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   NEXT STEP ENGINE
========================================= */

ads.post("/session/:id/next", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const body = await c.req.json()

    const row = await db.prepare(`
      SELECT *
      FROM download_sessions
      WHERE id = ?
    `)
    .bind(id)
    .first()

    if (!row) {
      return c.json(fail("Session not found"), 404)
    }

    const adsList = parseJSON(row.ads)
    const shortlinksList = parseJSON(row.shortlinks)
    const popupsList = parseJSON(row.popups)

    let step = Number(row.current_step || 0)

    const totalSteps =
      adsList.length +
      shortlinksList.length

    /* =========================
       ALL COMPLETED
    ========================= */

    if (step >= totalSteps) {

      await db.prepare(`
        UPDATE download_sessions
        SET completed = 1
        WHERE id = ?
      `)
      .bind(id)
      .run()

      return c.json(ok({
        completed: true,
        redirect: `/knight.html?anime=${encodeURIComponent(row.anime)}&season=${row.season}&episode=${row.episode}&host=${encodeURIComponent(row.host)}`
      }))

    }

    /* =========================
       ADS FIRST
    ========================= */

    if (step < adsList.length) {

      const adId = adsList[step]

      const ad = await db.prepare(`
        SELECT *
        FROM ads_library
        WHERE id = ?
      `)
      .bind(adId)
      .first()

      step++

      await db.prepare(`
        UPDATE download_sessions
        SET current_step = ?
        WHERE id = ?
      `)
      .bind(step, id)
      .run()

      await trackEvent(db, {
        anime: row.anime,
        season: row.season,
        episode: row.episode,
        host: row.host,
        quality: row.quality,
        monetization_id: row.monetization_id,
        event_type: "ad_open"
      })

      return c.json(ok({

        completed: false,

        type: "ad",

        url: ad?.ad_url || "",

        next_step: step

      }))

    }

    /* =========================
       SHORTLINKS
    ========================= */

    const shortIndex =
      step - adsList.length

    if (shortIndex < shortlinksList.length) {

      const shortId = shortlinksList[shortIndex]

      const short = await db.prepare(`
        SELECT *
        FROM shortlinks_library
        WHERE id = ?
      `)
      .bind(shortId)
      .first()

      step++

      await db.prepare(`
        UPDATE download_sessions
        SET current_step = ?
        WHERE id = ?
      `)
      .bind(step, id)
      .run()

      await trackEvent(db, {
        anime: row.anime,
        season: row.season,
        episode: row.episode,
        host: row.host,
        quality: row.quality,
        monetization_id: row.monetization_id,
        event_type: "shortlink_open"
      })

      return c.json(ok({

        completed: false,

        type: "shortlink",

        url: short?.shortlink_url || "",

        next_step: step

      }))

    }

    return c.json(ok({
      completed: true
    }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   POPUP EVENT
========================================= */

ads.post("/session/:id/popup", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    const row = await db.prepare(`
      SELECT *
      FROM download_sessions
      WHERE id = ?
    `)
    .bind(id)
    .first()

    if (!row) {
      return c.json(fail("Session not found"), 404)
    }

    await trackEvent(db, {
      anime: row.anime,
      season: row.season,
      episode: row.episode,
      host: row.host,
      quality: row.quality,
      monetization_id: row.monetization_id,
      event_type: "popup_open"
    })

    return c.json(ok())

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   FINAL DOWNLOAD
========================================= */

ads.get("/final-download", async (c) => {

  try {

    const db = c.env.DB

    const anime = c.req.query("anime") || ""
    const season = c.req.query("season") || ""
    const episode = c.req.query("episode") || ""
    const host = c.req.query("host") || ""
    const quality = c.req.query("quality") || ""

    const row = await db.prepare(`
      SELECT *
      FROM downloads
      WHERE
        anime = ?
        AND season = ?
        AND episode = ?
        AND LOWER(host) = LOWER(?)
        AND LOWER(quality) = LOWER(?)
      LIMIT 1
    `)
    .bind(
      anime,
      season,
      episode,
      host,
      quality
    )
    .first()

    if (!row) {

      return c.json(
        fail("Download not found"),
        404
      )

    }

    await trackEvent(db, {
      anime,
      season,
      episode,
      host,
      quality,
      monetization_id: "final_download",
      event_type: "final_download"
    })

    return c.json(ok({
      url: row.url
    }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   DOWNLOAD CLICK TRACK
========================================= */

ads.post("/host-click", async (c) => {

  try {

    const db = c.env.DB

    const body = await c.req.json()

    await trackEvent(db, {
      anime: body.anime,
      season: body.season,
      episode: body.episode,
      host: body.host,
      quality: body.quality,
      monetization_id: body.monetization_id || "",
      event_type: "host_click"
    })

    return c.json(ok())

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   ANALYTICS
========================================= */

ads.get("/admin/analytics", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT
        event_type,
        COUNT(*) as total
      FROM monetization_analytics
      GROUP BY event_type
      ORDER BY total DESC
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   ANALYTICS BY ANIME
========================================= */

ads.get("/admin/analytics/anime", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT
        anime,
        COUNT(*) as total
      FROM monetization_analytics
      GROUP BY anime
      ORDER BY total DESC
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   ANALYTICS BY HOST
========================================= */

ads.get("/admin/analytics/host", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT
        host,
        COUNT(*) as total
      FROM monetization_analytics
      GROUP BY host
      ORDER BY total DESC
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

"
/* =========================================
   TOP MONETIZATION
========================================= */

ads.get("/admin/top-monetization", async (c) => {

  try {

    const db = c.env.DB

    const { results } = await db.prepare(`
      SELECT
        monetization_id,
        COUNT(*) as total
      FROM monetization_analytics
      GROUP BY monetization_id
      ORDER BY total DESC
      LIMIT 20
    `).all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   RECENT EVENTS
========================================= */

ads.get("/admin/recent-events", async (c) => {

  try {

    const db = c.env.DB

    const limit = Number(c.req.query("limit") || 50)

    const { results } = await db.prepare(`
      SELECT *
      FROM monetization_analytics
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all()

    return c.json(ok(results))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   DELETE SESSION
========================================= */

ads.delete("/session/:id", async (c) => {

  try {

    const db = c.env.DB

    const id = c.req.param("id")

    await db.prepare(`
      DELETE FROM download_sessions
      WHERE id = ?
    `)
    .bind(id)
    .run()

    return c.json(ok({
      deleted: true,
      id
    }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   CLEAN OLD SESSIONS
========================================= */

ads.post("/admin/cleanup-sessions", async (c) => {

  try {

    const db = c.env.DB

    await db.prepare(`
      DELETE FROM download_sessions
      WHERE created_at < datetime('now','-2 day')
    `).run()

    return c.json(ok({
      cleaned: true
    }))

  } catch (err) {

    return c.json(fail(err.message), 500)

  }

})

/* =========================================
   HEALTH CHECK
========================================= */

ads.get("/health", async (c) => {

  return c.json(ok({
    service: "ads",
    status: "running",
    time: new Date().toISOString()
  }))

})

/* =========================================
   EXPORT
========================================= */

export default ads
