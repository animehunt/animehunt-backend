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
    .prepare(`SELECT * FROM episodes ORDER BY createdAt DESC`)
    .all()

  const result = data.results.map((e: any) => ({
    ...e,
    servers: safeJSON(e.servers),
    downloads: safeJSON(e.downloads)
  }))

  return c.json(result)
})

/* ===============================
   GET SINGLE
================================ */
episodes.get("/:id", async (c) => {

  const { id } = c.req.param()

  const row: any = await c.env.DB
    .prepare(`SELECT * FROM episodes WHERE id = ?`)
    .bind(id)
    .first()

  if (!row) return c.json({ error: "Not found" }, 404)

  return c.json({
    ...row,
    servers: safeJSON(row.servers),
    downloads: safeJSON(row.downloads)
  })
})

/* ===============================
   CREATE
================================ */
episodes.post("/", async (c) => {

  try {

    const body: any = await c.req.json()

    const servers = Array.isArray(body.servers) ? body.servers : []
    const downloads = Array.isArray(body.downloads) ? body.downloads : []

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
      JSON.stringify(servers),
      JSON.stringify(downloads),
      body.ongoing ? 1 : 0,
      body.featured ? 1 : 0,
      new Date().toISOString()
    ).run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Episode insert error:", err)
    return c.json({ error: "Insert failed" }, 500)

  }

})

/* ===============================
   UPDATE
================================ */
episodes.patch("/:id", async (c) => {

  try {

    const { id } = c.req.param()
    const body: any = await c.req.json()

    const servers = Array.isArray(body.servers) ? body.servers : []
    const downloads = Array.isArray(body.downloads) ? body.downloads : []

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
      JSON.stringify(servers),
      JSON.stringify(downloads),
      body.ongoing ? 1 : 0,
      body.featured ? 1 : 0,
      id
    ).run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Episode update error:", err)
    return c.json({ error: "Update failed" }, 500)

  }

})

/* ===============================
   DELETE
================================ */
episodes.delete("/:id", async (c) => {

  try {

    const { id } = c.req.param()

    await c.env.DB
      .prepare(`DELETE FROM episodes WHERE id = ?`)
      .bind(id)
      .run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Episode delete error:", err)
    return c.json({ error: "Delete failed" }, 500)

  }

})

/* ===============================
   SAFE JSON PARSER
================================ */
function safeJSON(value: any) {

  try {
    return JSON.parse(value || "[]")
  } catch {
    return []
  }

}

export default episodes
