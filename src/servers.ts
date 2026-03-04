import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const servers = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET ALL SERVERS
================================ */
servers.get("/", async (c) => {

  try {

    const result = await c.env.DB
      .prepare(`
        SELECT * FROM servers
        ORDER BY priority ASC, name ASC
      `)
      .all()

    const rows = result.results || []

    return c.json(
      rows.map((r: any) => ({
        _id: r.id,
        name: r.name,
        anime: r.anime,
        season: r.season || "",
        episode: r.episode || "",
        embed: r.embed || "",
        priority: r.priority ?? 99,
        active: !!r.active
      }))
    )

  } catch (err) {

    console.error("Servers GET error:", err)
    return c.json([])

  }

})

/* ===============================
   ADD / UPDATE SERVER
================================ */
servers.post("/", async (c) => {

  try {

    const body = await c.req.json()

    if (!body.name || !body.anime) {
      return c.json({ error: "Missing required fields" }, 400)
    }

    const id = body._id || crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO servers (
        id, name, anime, season, episode,
        embed, priority, active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        anime = excluded.anime,
        season = excluded.season,
        episode = excluded.episode,
        embed = excluded.embed,
        priority = excluded.priority,
        active = excluded.active
    `).bind(

      id,
      String(body.name).trim(),
      String(body.anime).trim(),
      body.season || "",
      body.episode || "",
      body.embed || "",
      Number(body.priority ?? 99),
      body.active ? 1 : 0

    ).run()

    return c.json({ success: true, id })

  } catch (err) {

    console.error("Servers SAVE error:", err)
    return c.json({ error: "Server save failed" }, 500)

  }

})

/* ===============================
   DELETE SERVER
================================ */
servers.delete("/", async (c) => {

  try {

    const body = await c.req.json()

    if (!body.id) {
      return c.json({ error: "ID required" }, 400)
    }

    await c.env.DB
      .prepare("DELETE FROM servers WHERE id = ?")
      .bind(body.id)
      .run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Servers DELETE error:", err)
    return c.json({ error: "Delete failed" }, 500)

  }

})

export default servers
