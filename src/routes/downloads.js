import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
ADMIN: GET ALL DOWNLOADS
========================= */
app.get("/downloads", verifyAdmin, async (c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM downloads
    ORDER BY anime ASC, season ASC, episode ASC
  `).all()

  return c.json(results)

})

/* =========================
ADMIN: BULK INSERT
========================= */
app.post("/downloads/bulk", verifyAdmin, async (c)=>{

  const rows = await c.req.json()
  const db = c.env.DB

  if(!Array.isArray(rows) || !rows.length){
    return c.json({error:"No data"},400)
  }

  const stmt = db.prepare(`
    INSERT INTO downloads
    (id, anime, season, episode, host, storage, quality, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)

  for(const d of rows){

    if(!d.anime || !d.episode || !d.link) continue

    await stmt.bind(
      crypto.randomUUID(),
      d.anime,
      d.season || "1",
      d.episode,
      d.host || "unknown",
      d.storage || null,
      d.quality || "unknown",
      d.link
    ).run()
  }

  return c.json({success:true})

})

/* =========================
ADMIN: DELETE SINGLE
========================= */
app.delete("/downloads/:id", verifyAdmin, async (c)=>{

  await c.env.DB.prepare(`
    DELETE FROM downloads WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run()

  return c.json({success:true})

})

/* =========================
ADMIN: DELETE BULK
========================= */
app.post("/downloads/delete-bulk", verifyAdmin, async (c)=>{

  const ids = await c.req.json()
  const db = c.env.DB

  if(!Array.isArray(ids)){
    return c.json({error:"Invalid ids"},400)
  }

  for(const id of ids){
    await db.prepare("DELETE FROM downloads WHERE id=?")
    .bind(id)
    .run()
  }

  return c.json({success:true})

})

/* =========================
ADMIN: UPDATE
========================= */
app.put("/downloads/:id", verifyAdmin, async (c)=>{

  const id = c.req.param("id")
  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE downloads
    SET anime=?, season=?, episode=?, host=?, storage=?, quality=?, link=?
    WHERE id=?
  `)
  .bind(
    body.anime,
    body.season,
    body.episode,
    body.host,
    body.storage,
    body.quality,
    body.link,
    id
  )
  .run()

  return c.json({success:true})

})

/* =========================
PUBLIC: GET FULL ANIME DATA
(Frontend Render Engine)
========================= */
app.get("/downloads-full/:anime", async (c)=>{

  const anime = c.req.param("anime")

  const { results } = await c.env.DB.prepare(`
    SELECT anime, season, episode, host, storage, quality, link
    FROM downloads
    WHERE anime=?
    ORDER BY season ASC, episode ASC
  `)
  .bind(anime)
  .all()

  /* 🔥 STRUCTURE BUILD */
  const structured = {}

  results.forEach(d=>{

    if(!structured[d.season]){
      structured[d.season] = {}
    }

    if(!structured[d.season][d.episode]){
      structured[d.season][d.episode] = []
    }

    structured[d.season][d.episode].push({
      host: d.host,
      storage: d.storage,
      quality: d.quality,
      link: d.link
    })

  })

  return c.json(structured)

})

/* =========================
PUBLIC: GET EPISODES LIST
========================= */
app.get("/downloads-list/:anime", async (c)=>{

  const anime = c.req.param("anime")

  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT season, episode
    FROM downloads
    WHERE anime=?
    ORDER BY season ASC, episode ASC
  `)
  .bind(anime)
  .all()

  return c.json(results)

})

/* =========================
PUBLIC: GET SINGLE EPISODE
========================= */
app.get("/downloads/:anime/:season/:episode", async (c)=>{

  const { anime, season, episode } = c.req.param()

  const { results } = await c.env.DB.prepare(`
    SELECT host, storage, quality, link
    FROM downloads
    WHERE anime=? AND season=? AND episode=?
  `)
  .bind(anime, season, episode)
  .all()

  return c.json(results)

})

export default app
