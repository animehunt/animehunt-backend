import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const search = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ENSURE SETTINGS ROW EXISTS
================================ */
async function ensureRow(db: D1Database) {

  const row = await db
    .prepare("SELECT id FROM search_settings WHERE id = 1")
    .first()

  if (!row) {

    await db.prepare(`
      INSERT INTO search_settings (
        id,
        enableSearch,
        liveSearch,
        mode,
        debounce,

        ranking_mode,
        ranking_boost,
        ranking_weight,

        source_anime,
        source_episode,
        source_category,
        source_pages,

        smart_typo,
        smart_alias,
        smart_language,

        ui_max,
        ui_thumb,
        ui_group,
        ui_highlight,

        safety_safe,
        safety_track,
        safety_seo,
        safety_cache
      )
      VALUES (
        1,
        1,
        1,
        'instant',
        300,
        'smart',
        1,
        5,
        1,
        1,
        0,
        0,
        1,
        1,
        'all',
        8,
        1,
        0,
        1,
        'medium',
        1,
        1,
        60
      )
    `).run()

  }
}

/* ===============================
   GET SETTINGS
================================ */
search.get("/", async (c) => {

  try {

    await ensureRow(c.env.DB)

    const row: any = await c.env.DB
      .prepare("SELECT * FROM search_settings WHERE id = 1")
      .first()

    return c.json({

      enableSearch: !!row.enableSearch,
      liveSearch: !!row.liveSearch,
      mode: row.mode,
      debounce: row.debounce,

      ranking: {
        mode: row.ranking_mode,
        boost: !!row.ranking_boost,
        weight: row.ranking_weight
      },

      sources: {
        anime: !!row.source_anime,
        episode: !!row.source_episode,
        category: !!row.source_category,
        pages: !!row.source_pages
      },

      smart: {
        typo: !!row.smart_typo,
        alias: !!row.smart_alias,
        language: row.smart_language
      },

      ui: {
        max: row.ui_max,
        thumb: !!row.ui_thumb,
        group: !!row.ui_group,
        highlight: !!row.ui_highlight
      },

      safety: {
        safe: row.safety_safe,
        track: !!row.safety_track,
        seo: !!row.safety_seo,
        cache: row.safety_cache
      }

    })

  } catch (err) {

    console.error("Search GET error:", err)
    return c.json({})

  }

})

/* ===============================
   SAVE SETTINGS
================================ */
search.post("/", async (c) => {

  try {

    const body = await c.req.json()

    await ensureRow(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE search_settings SET

      enableSearch = ?,
      liveSearch = ?,
      mode = ?,
      debounce = ?,

      ranking_mode = ?,
      ranking_boost = ?,
      ranking_weight = ?,

      source_anime = ?,
      source_episode = ?,
      source_category = ?,
      source_pages = ?,

      smart_typo = ?,
      smart_alias = ?,
      smart_language = ?,

      ui_max = ?,
      ui_thumb = ?,
      ui_group = ?,
      ui_highlight = ?,

      safety_safe = ?,
      safety_track = ?,
      safety_seo = ?,
      safety_cache = ?

      WHERE id = 1
    `).bind(

      body.enableSearch ? 1 : 0,
      body.liveSearch ? 1 : 0,
      body.mode || "instant",
      body.debounce ?? 300,

      body.ranking?.mode || "smart",
      body.ranking?.boost ? 1 : 0,
      body.ranking?.weight ?? 5,

      body.sources?.anime ? 1 : 0,
      body.sources?.episode ? 1 : 0,
      body.sources?.category ? 1 : 0,
      body.sources?.pages ? 1 : 0,

      body.smart?.typo ? 1 : 0,
      body.smart?.alias ? 1 : 0,
      body.smart?.language || "all",

      body.ui?.max ?? 8,
      body.ui?.thumb ? 1 : 0,
      body.ui?.group ? 1 : 0,
      body.ui?.highlight ? 1 : 0,

      body.safety?.safe || "medium",
      body.safety?.track ? 1 : 0,
      body.safety?.seo ? 1 : 0,
      body.safety?.cache ?? 60

    ).run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Search SAVE error:", err)
    return c.json({ error: "Save failed" }, 500)

  }

})

export default search
