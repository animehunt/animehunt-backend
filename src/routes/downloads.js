import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL DOWNLOADS (ADMIN)
========================= */
app.get("/admin/downloads", verifyAdmin, async (c)=>{

  const { results } = await c.env.DB
  .prepare(`
    SELECT *
    FROM downloads
    ORDER BY created_at DESC
  `)
  .all()

  return c.json(results)

})

/* =========================
GET DOWNLOADS BY EPISODE (PUBLIC)
========================= */
app.get("/downloads", async (c)=>{

  const anime = c.req.query("anime")
  const season = c.req.query("season")
  const episode = c.req.query("episode")

  if(!anime || !episode){
    return c.json({error:"Missing params"},400)
  }

  const { results } = await c.env.DB
  .prepare(`
    SELECT host,type,quality,link
    FROM downloads
    WHERE anime=? AND season=? AND episode=?
    ORDER BY host ASC
  `)
  .bind(anime, season || "1", episode)
  .all()

  return c.json(results)

})

/* =========================
CREATE SINGLE
========================= */
app.post("/admin/downloads", verifyAdmin, async (c)=>{

  const body = await c.req.json()

  if(!body.anime || !body.episode || !body.link){
    return c.json({error:"Missing fields"},400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO downloads
    (id,anime,season,episode,host,type,quality,link,clicks,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))
  `)
  .bind(
    id,
    body.anime,
    body.season || "1",
    body.episode,
    body.host || "default",
    body.type || "direct",
    body.quality || "720p",
    body.link,
    0
  )
  .run()

  return c.json({success:true,id})

})

/* =========================
BULK INSERT (CMS)
========================= */
app.post("/admin/downloads/bulk", verifyAdmin, async (c)=>{

  const rows = await c.req.json()

  const db = c.env.DB

  for(const d of rows){

    if(!d.link) continue

    await db.prepare(`
      INSERT INTO downloads
      (id,anime,season,episode,host,type,quality,link,clicks,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))
    `)
    .bind(
      crypto.randomUUID(),
      d.anime,
      d.season || "1",
      d.episode,
      d.host || "default",
      d.type || "direct",
      d.quality || "720p",
      d.link,
      0
    )
    .run()

  }

  return c.json({success:true})

})

/* =========================
UPDATE (EDIT SUPPORT)
========================= */
app.put("/admin/downloads/:id", verifyAdmin, async (c)=>{

  const id = c.req.param("id")
  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE downloads
    SET anime=?, season=?, episode=?, host=?, type=?, quality=?, link=?
    WHERE id=?
  `)
  .bind(
    body.anime,
    body.season,
    body.episode,
    body.host,
    body.type,
    body.quality,
    body.link,
    id
  )
  .run()

  return c.json({success:true})

})

/* =========================
DELETE SINGLE
========================= */
app.delete("/admin/downloads/:id", verifyAdmin, async (c)=>{

  const id = c.req.param("id")

  await c.env.DB.prepare(`
    DELETE FROM downloads WHERE id=?
  `)
  .bind(id)
  .run()

  return c.json({success:true})

})

/* =========================
DELETE BULK (NEW)
========================= */
app.delete("/admin/downloads", verifyAdmin, async (c)=>{

  await c.env.DB.prepare(`DELETE FROM downloads`).run()

  return c.json({success:true})

})

/* =========================
CLICK TRACKING
========================= */
app.post("/downloads/click/:id", async (c)=>{

  const id = c.req.param("id")

  await c.env.DB.prepare(`
    UPDATE downloads
    SET clicks = clicks + 1
    WHERE id=?
  `)
  .bind(id)
  .run()

  return c.json({success:true})

})

export default app
