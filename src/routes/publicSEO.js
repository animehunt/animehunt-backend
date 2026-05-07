import { Hono } from "hono"

const app = new Hono()

app.get("/seo", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM seo_settings WHERE id=1")
    .first()

  return c.json({
    success: true,

    global: {
      title: row.site_title,
      desc: row.site_desc,
      keywords: row.site_keywords,
      canonical: row.canonical,
      indexing: row.indexing
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
      ogTitle: row.og_title,
      ogDesc: row.og_desc,
      twTitle: row.tw_title,
      twDesc: row.tw_desc,
      twCard: row.tw_card
    }
  })
})

export default app
