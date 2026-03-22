import { Hono } from "hono"

const app = new Hono()

/* =========================
GET ALL ANIME (FILTER + SEARCH)
========================= */

app.get("/", async (c) => {

  const { DB } = c.env

  const type = c.req.query("type")
  const status = c.req.query("status")
  const home = c.req.query("home")
  const q = c.req.query("q")

  let sql = "SELECT * FROM anime WHERE 1=1"
  let params = []

  if(type){
    sql += " AND type=?"
    params.push(type)
  }

  if(status){
    sql += " AND status=?"
    params.push(status)
  }

  if(home === "yes"){
    sql += " AND is_home=1"
  }

  if(home === "no"){
    sql += " AND is_home=0"
  }

  if(q){
    sql += " AND title LIKE ?"
    params.push(`%${q}%`)
  }

  sql += " ORDER BY created_at DESC"

  const result = await DB.prepare(sql).bind(...params).all()

  return c.json(result.results)
})

/* =========================
GET SINGLE ANIME
========================= */

app.get("/:id", async (c) => {

  const id = c.req.param("id")

  const data = await c.env.DB.prepare(`
    SELECT * FROM anime WHERE id=?
  `).bind(id).first()

  return c.json(data || {})
})

/* =========================
SAVE (CREATE + UPDATE)
========================= */

app.post("/", async (c) => {

  try{

    const body = await c.req.json()

    /* VALIDATION */
    if(!body.title){
      return c.json({ success:false, error:"Title required" },400)
    }

    /* AUTO SLUG */
    let slug = body.slug
    if(!slug){
      slug = body.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/(^-|-$)/g,'')
    }

    const id = body.id || crypto.randomUUID()

    /* DUPLICATE SLUG CHECK */
    const existing = await c.env.DB.prepare(`
      SELECT id FROM anime WHERE slug=? AND id!=?
    `).bind(slug, id).first()

    if(existing){
      slug = slug + "-" + Date.now()
    }

    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO anime (
        id,title,slug,type,status,
        poster,banner,
        year,rating,language,duration,
        genres,tags,description,
        is_home,is_trending,is_most_viewed,is_banner,
        is_hidden,created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      body.title,
      slug,
      body.type || "anime",
      body.status || "ongoing",

      body.poster || "",
      body.banner || "",

      body.year || "",
      body.rating || "",
      body.language || "",
      body.duration || "",

      body.genres || "",
      body.tags || "",
      body.description || "",

      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,

      body.isHidden ? 1 : 0,
      Date.now()
    ).run()

    return c.json({
      success:true,
      id,
      slug
    })

  }catch(err){

    console.error(err)

    return c.json({
      success:false,
      error:err.message
    },500)
  }
})

/* =========================
DELETE
========================= */

app.delete("/:id", async (c) => {

  const id = c.req.param("id")

  await c.env.DB.prepare(`
    DELETE FROM anime WHERE id=?
  `).bind(id).run()

  return c.json({ success:true })
})

/* =========================
HIDE / UNHIDE
========================= */

app.patch("/hide/:id", async (c) => {

  const id = c.req.param("id")

  await c.env.DB.prepare(`
    UPDATE anime
    SET is_hidden = CASE WHEN is_hidden=1 THEN 0 ELSE 1 END
    WHERE id=?
  `).bind(id).run()

  return c.json({ success:true })
})

export default app
