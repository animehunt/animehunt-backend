import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const download = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET ALL DOWNLOADS
================================ */
download.get("/", async (c) => {

  const data = await c.env.DB
    .prepare(`
      SELECT * FROM downloads
      ORDER BY createdAt DESC
    `)
    .all()

  return c.json(data.results)
})

/* ===============================
   BULK INSERT
================================ */
download.post("/bulk", async (c) => {

  const body = await c.req.json()

  if (!Array.isArray(body)) {
    return c.json({ error: "Invalid payload" }, 400)
  }

  const now = new Date().toISOString()

  const stmt = c.env.DB.prepare(`
    INSERT INTO downloads (
      id, anime, season, episode,
      host, quality, link, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const batch = body.map((d: any) =>
    stmt.bind(
      crypto.randomUUID(),
      d.anime || "",
      d.season || "",
      d.episode || "",
      d.host || "",
      d.quality || "",
      d.link || "",
      now
    )
  )

  await c.env.DB.batch(batch)

  return c.json({ success: true })
})

/* ===============================
   DELETE
================================ */
download.delete("/:id", async (c) => {

  const { id } = c.req.param()

  await c.env.DB.prepare(`
    DELETE FROM downloads WHERE id = ?
  `).bind(id).run()

  return c.json({ success: true })
})

export default download
