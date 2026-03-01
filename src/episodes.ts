import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const episodes = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET ALL
================================ */
episodes.get("/", async (c) => {

  const data = await c.env.DB
    .prepare(`
      SELECT * FROM episodes
      ORDER BY createdAt DESC
    `)
    .all()

  const result = data.results.map((e: any) => ({
    ...e,
    servers: JSON.parse(e.servers || "[]"),
    downloads: JSON.parse(e.downloads || "[]")
  }))

  return c.json(result)
})

/* ===============================
   GET SINGLE
================================ */
episodes.get("/:id", async (c) => {

  const { id } = c.req.param()

  const row = await c.env.DB
    .prepare(`SELECT * FROM episodes WHERE id = ?`)
    .bind(id)
    .first()

  if (!row) return c.json({ error: "Not found" }, 404)

  return c.json({
    ...row,
    servers: JSON.parse(row.servers || "[]"),
    downloads: JSON.parse(row.downloads || "[]")
  })
})

/* ===============================
   CREATE
================================ */
episodes.post("/", async (c) => {

  const body = await c.req.json()

  await c.env.DB.prepare(`
    INSERT INTO episodes (
      id, anime, season, episode,
      title, description,
      servers, downloads,
      ongoing, featured, createdAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    body.anime || "",
    body.season || "",
    body.episode || "",
    body.title || "",
    body.description || "",
    JSON.stringify(body.servers || []),
    JSON.stringify(body.downloads || []),
    body.ongoing ? 1 : 0,
    body.featured ? 1 : 0,
    new Date().toISOString()
  ).run()

  return c.json({ success: true })
})

/* ===============================
   UPDATE
================================ */
episodes.patch("/:id", async (c) => {

  const { id } = c.req.param()
  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE episodes SET
      anime = ?,
      season = ?,
      episode = ?,
      title = ?,
      description = ?,
      servers = ?,
      downloads = ?,
      ongoing = ?,
      featured = ?
    WHERE id = ?
  `).bind(
    body.anime || "",
    body.season || "",
    body.episode || "",
    body.title || "",
    body.description || "",
    JSON.stringify(body.servers || []),
    JSON.stringify(body.downloads || []),
    body.ongoing ? 1 : 0,
    body.featured ? 1 : 0,
    id
  ).run()

  return c.json({ success: true })
})

/* ===============================
   DELETE
================================ */
episodes.delete("/:id", async (c) => {

  const { id } = c.req.param()

  await c.env.DB.prepare(`
    DELETE FROM episodes WHERE id = ?
  `).bind(id).run()

  return c.json({ success: true })
})

export default episodes
