import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =====================================================
ADMIN: GET ALL DOWNLOADS
===================================================== */
app.get("/downloads", verifyAdmin, async (c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM downloads
    ORDER BY anime ASC, season ASC, episode ASC
  `).all()

  return c.json(results)
})

/* =====================================================
ADMIN: BULK INSERT (SMART INSERT)
===================================================== */
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

    const exists = await db.prepare(`
      SELECT id FROM downloads
      WHERE anime=? AND season=? AND episode=? AND host=? AND quality=?
      LIMIT 1
    `)
    .bind(d.anime, d.season || "1", d.episode, d.host, d.quality)
    .first()

    if(exists) continue

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

/* =====================================================
ADMIN: DELETE
===================================================== */
app.delete("/downloads/:id", verifyAdmin, async (c)=>{

  await c.env.DB.prepare(`
    DELETE FROM downloads WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run()

  return c.json({success:true})
})

/* =====================================================
ADMIN: UPDATE
===================================================== */
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

/* =====================================================
PUBLIC: FULL STRUCTURE (DOWNLOAD PAGE)
===================================================== */
app.get("/downloads-full/:anime", async (c)=>{

  const anime = c.req.param("anime")

  const { results } = await c.env.DB.prepare(`
    SELECT season, episode, host, quality
    FROM downloads
    WHERE anime=?
    ORDER BY season ASC, episode ASC
  `)
  .bind(anime)
  .all()

  const structured = {}

  results.forEach(d=>{

    if(!structured[d.season]) structured[d.season] = {}
    if(!structured[d.season][d.episode]) structured[d.season][d.episode] = {}
    if(!structured[d.season][d.episode][d.host]) structured[d.season][d.episode][d.host] = []

    structured[d.season][d.episode][d.host].push({
      quality: d.quality
    })

  })

  return c.json(structured)
})

/* =====================================================
PUBLIC: KNIGHT PAGE DATA (IMPORTANT FIX)
===================================================== */
app.get("/downloads/:anime/:season/:episode", async (c)=>{

  const { anime, season, episode } = c.req.param()

  const { results } = await c.env.DB.prepare(`
    SELECT host, quality, link
    FROM downloads
    WHERE anime=? AND season=? AND episode=?
  `)
  .bind(anime, season, episode)
  .all()

  return c.json(results)
})

/* =====================================================
PUBLIC: FINAL LINK (OPTIONAL SAFE API)
===================================================== */
app.get("/download-final", async (c)=>{

  const anime = c.req.query("anime")
  const season = c.req.query("season")
  const episode = c.req.query("episode")
  const host = c.req.query("host")
  const quality = c.req.query("quality")

  const data = await c.env.DB.prepare(`
    SELECT link FROM downloads
    WHERE anime=? AND season=? AND episode=? AND host=? AND quality=?
    LIMIT 1
  `)
  .bind(anime, season, episode, host, quality)
  .first()

  if(!data) return c.text("Link not found")

  return c.redirect(data.link)
})

export default app
