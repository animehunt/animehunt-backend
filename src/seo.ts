import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const seo = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET SEO CONFIG
================================ */
seo.get("/", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM seo_settings WHERE id = 1")
    .first()

  if (!row) return c.json({})

  return c.json({

    global: {
      title: row.global_title,
      desc: row.global_desc,
      keywords: row.global_keywords,
      canonical: row.global_canonical,
      indexing: row.global_indexing
    },

    home: {
      title: row.home_title,
      desc: row.home_desc,
      keywords: row.home_keywords,
      og: row.home_og
    },

    templates: {
      anime: row.tpl_anime,
      category: row.tpl_category,
      episode: row.tpl_episode,
      search: row.tpl_search
    },

    social: {
      ogTitle: row.social_ogTitle,
      ogDesc: row.social_ogDesc,
      twTitle: row.social_twTitle,
      twDesc: row.social_twDesc,
      twCard: row.social_twCard
    }

  })
})

/* ===============================
   SAVE SEO CONFIG
================================ */
seo.post("/", async (c) => {

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE seo_settings SET

      global_title = ?,
      global_desc = ?,
      global_keywords = ?,
      global_canonical = ?,
      global_indexing = ?,

      home_title = ?,
      home_desc = ?,
      home_keywords = ?,
      home_og = ?,

      tpl_anime = ?,
      tpl_category = ?,
      tpl_episode = ?,
      tpl_search = ?,

      social_ogTitle = ?,
      social_ogDesc = ?,
      social_twTitle = ?,
      social_twDesc = ?,
      social_twCard = ?

    WHERE id = 1
  `).bind(

    body.global?.title ?? "",
    body.global?.desc ?? "",
    body.global?.keywords ?? "",
    body.global?.canonical ?? "",
    body.global?.indexing ?? "index",

    body.home?.title ?? "",
    body.home?.desc ?? "",
    body.home?.keywords ?? "",
    body.home?.og ?? "",

    body.templates?.anime ?? "",
    body.templates?.category ?? "",
    body.templates?.episode ?? "",
    body.templates?.search ?? "",

    body.social?.ogTitle ?? "",
    body.social?.ogDesc ?? "",
    body.social?.twTitle ?? "",
    body.social?.twDesc ?? "",
    body.social?.twCard ?? "summary_large_image"

  ).run()

  return c.json({ success: true })
})

export default seo
