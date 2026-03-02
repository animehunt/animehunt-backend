import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const servers = new Hono<{ Bindings: Bindings }>()

/* =====================================
   GET ALL SERVERS
===================================== */
servers.get("/", async (c) => {

  const rows = await c.env.DB
    .prepare(`
      SELECT * FROM servers
      ORDER BY priority ASC
    `)
    .all()

  return c.json(
    rows.results.map((r: any) => ({
      _id: r.id,
      name: r.name,
      anime: r.anime,
      season: r.season,
      episode: r.episode,
      embed: r.embed,
      priority: r.priority,
      active: !!r.active
    }))
  )
})

/* =====================================
   ADD / UPDATE SERVER
===================================== */
servers.post("/", async (c) => {

  const body = await c.req.json()

  // 🔥 nanoid removed — using built-in Cloudflare UUID
  const id = body._id || crypto.randomUUID()

  if (!body.name || !body.anime) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  await c.env.DB.prepare(`
    INSERT INTO servers (
      id, name, anime, season, episode,
      embed, priority, active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      anime=excluded.anime,
      season=excluded.season,
      episode=excluded.episode,
      embed=excluded.embed,
      priority=excluded.priority,
      active=excluded.active
  `).bind(
    id,
    body.name,
    body.anime,
    body.season || "",
    body.episode || "",
    body.embed || "",
    body.priority ?? 99,
    body.active ? 1 : 0
  ).run()

  return c.json({ success: true, id })
})

/* =====================================
   DELETE SERVER
===================================== */
servers.delete("/", async (c) => {

  const body = await c.req.json()

  if (!body.id) {
    return c.json({ error: "ID required" }, 400)
  }

  await c.env.DB
    .prepare("DELETE FROM servers WHERE id = ?")
    .bind(body.id)
    .run()

  return c.json({ success: true })
})

export default servers
