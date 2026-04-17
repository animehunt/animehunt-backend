import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL DOWNLOADS (ADMIN)
========================= */

app.get("/downloads", verifyAdmin, async (c)=>{

  const data = await c.env.DB
  .prepare(`
    SELECT *
    FROM downloads
    ORDER BY created_at DESC
  `)
  .all()

  return c.json(data.results)

})

/* =========================
GET ALL DOWNLOADS BY ANIME
(🔥 NEW - PUBLIC PAGE USE)
========================= */

app.get("/downloads/:anime", async (c)=>{

  const anime = c.req.param("anime")

  const data = await c.env.DB
  .prepare(`
    SELECT season, episode, host, quality, link
    FROM downloads
    WHERE anime=?
    ORDER BY season ASC, episode ASC
  `)
  .bind(anime)
  .all()

  return c.json(data.results)

})

/* =========================
GET DOWNLOADS BY EPISODE
========================= */

app.get("/downloads/:anime/:season/:episode", async (c)=>{

  const {anime,season,episode} = c.req.param()

  const data = await c.env.DB
  .prepare(`
    SELECT host,quality,link
    FROM downloads
    WHERE anime=? AND season=? AND episode=?
  `)
  .bind(anime,season,episode)
  .all()

  return c.json(data.results)

})

/* =========================
CREATE SINGLE DOWNLOAD
========================= */

app.post("/downloads", verifyAdmin, async (c)=>{

  const body = await c.req.json()

  if(!body.anime || !body.episode || !body.host || !body.quality || !body.link){
    return c.json({error:"Missing fields"},400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO downloads
    (id,anime,season,episode,host,quality,link,created_at)
    VALUES(?,?,?,?,?,?,?,datetime('now'))
  `)
  .bind(
    id,
    body.anime,
    body.season || "1",
    body.episode,
    body.host,
    body.quality,
    body.link
  )
  .run()

  return c.json({success:true,id})

})

/* =========================
BULK INSERT
========================= */

app.post("/downloads/bulk", verifyAdmin, async (c)=>{

  const rows = await c.req.json()
  const db = c.env.DB

  if(!Array.isArray(rows)){
    return c.json({error:"Invalid data"},400)
  }

  for(const d of rows){

    if(!d.anime || !d.episode || !d.host || !d.quality || !d.link){
      continue
    }

    await db.prepare(`
      INSERT INTO downloads
      (id,anime,season,episode,host,quality,link,created_at)
      VALUES(?,?,?,?,?,?,?,datetime('now'))
    `)
    .bind(
      crypto.randomUUID(),
      d.anime,
      d.season || "1",
      d.episode,
      d.host,
      d.quality,
      d.link
    )
    .run()

  }

  return c.json({success:true})

})

/* =========================
UPDATE DOWNLOAD (🔥 NEW)
========================= */

app.put("/downloads/:id", verifyAdmin, async (c)=>{

  const {id} = c.req.param()
  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE downloads
    SET anime=?, season=?, episode=?, host=?, quality=?, link=?
    WHERE id=?
  `)
  .bind(
    body.anime,
    body.season,
    body.episode,
    body.host,
    body.quality,
    body.link,
    id
  )
  .run()

  return c.json({success:true})

})

/* =========================
DELETE DOWNLOAD
========================= */

app.delete("/downloads/:id", verifyAdmin, async (c)=>{

  const {id} = c.req.param()

  await c.env.DB.prepare(`
    DELETE FROM downloads
    WHERE id=?
  `)
  .bind(id)
  .run()

  return c.json({success:true})

})

/* =========================
DELETE BY EPISODE (🔥 NEW)
========================= */

app.delete("/downloads/episode/:anime/:season/:episode", verifyAdmin, async (c)=>{

  const {anime,season,episode} = c.req.param()

  await c.env.DB.prepare(`
    DELETE FROM downloads
    WHERE anime=? AND season=? AND episode=?
  `)
  .bind(anime,season,episode)
  .run()

  return c.json({success:true})

})

export default app
