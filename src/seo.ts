import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const seo = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ENSURE DEFAULT ROW
================================ */
async function ensureRow(db: D1Database){

  const row = await db
    .prepare("SELECT id FROM seo_settings WHERE id = 1")
    .first()

  if(!row){

    await db.prepare(`
      INSERT INTO seo_settings (

        id,

        global_title,
        global_desc,
        global_keywords,
        global_canonical,
        global_indexing,

        home_title,
        home_desc,
        home_keywords,
        home_og,

        tpl_anime,
        tpl_category,
        tpl_episode,
        tpl_search,

        social_ogTitle,
        social_ogDesc,
        social_twTitle,
        social_twDesc,
        social_twCard

      )
      VALUES (

        1,

        '',
        '',
        '',
        '',
        'index',

        '',
        '',
        '',
        '',

        '',
        '',
        '',
        '',

        '',
        '',
        '',
        '',
        'summary_large_image'

      )
    `).run()

  }

}

/* ===============================
   GET SEO CONFIG
================================ */
seo.get("/", async (c) => {

  try{

    await ensureRow(c.env.DB)

    const row:any = await c.env.DB
      .prepare("SELECT * FROM seo_settings WHERE id = 1")
      .first()

    return c.json({

      global:{
        title:row.global_title,
        desc:row.global_desc,
        keywords:row.global_keywords,
        canonical:row.global_canonical,
        indexing:row.global_indexing
      },

      home:{
        title:row.home_title,
        desc:row.home_desc,
        keywords:row.home_keywords,
        og:row.home_og
      },

      templates:{
        anime:row.tpl_anime,
        category:row.tpl_category,
        episode:row.tpl_episode,
        search:row.tpl_search
      },

      social:{
        ogTitle:row.social_ogTitle,
        ogDesc:row.social_ogDesc,
        twTitle:row.social_twTitle,
        twDesc:row.social_twDesc,
        twCard:row.social_twCard
      }

    })

  }catch(err){

    console.error("SEO GET error:",err)
    return c.json({})

  }

})

/* ===============================
   SAVE SEO CONFIG
================================ */
seo.post("/", async (c) => {

  try{

    const body = await c.req.json()

    await ensureRow(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE seo_settings SET

      global_title=?,
      global_desc=?,
      global_keywords=?,
      global_canonical=?,
      global_indexing=?,

      home_title=?,
      home_desc=?,
      home_keywords=?,
      home_og=?,

      tpl_anime=?,
      tpl_category=?,
      tpl_episode=?,
      tpl_search=?,

      social_ogTitle=?,
      social_ogDesc=?,
      social_twTitle=?,
      social_twDesc=?,
      social_twCard=?

      WHERE id=1
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

    return c.json({success:true})

  }catch(err){

    console.error("SEO SAVE error:",err)
    return c.json({error:"Save failed"},500)

  }

})

export default seo
