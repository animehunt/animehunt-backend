import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* ================= HELPERS ================= */

const success = (data) => ({ success: true, data })
const failure = (msg) => ({ success: false, message: msg })

const now = () => new Date().toISOString()

const safeJSON = (v) => {
  try { return JSON.parse(v || "[]") }
  catch { return [] }
}

/* ================= ADMIN ================= */

/* GET ALL */
app.get("/episodes", verifyAdmin, async (c) => {

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM episodes
    ORDER BY created_at DESC
  `).all()

  const data = results.map(e => ({
    ...e,
    servers: safeJSON(e.servers),
    ongoing: !!e.ongoing,
    featured: !!e.featured
  }))

  return c.json(success(data))
})

/* CREATE */
app.post("/episodes", verifyAdmin, async (c) => {

  const body = await c.req.json()

  if (!body.anime_id || !body.episode) {
    return c.json(failure("anime_id + episode required"), 400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO episodes (
      id, anime_id, season, episode,
      title, description, thumbnail,
      servers, ongoing, featured,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.anime_id,
    Number(body.season) || 1,
    Number(body.episode),
    body.title || "",
    body.description || "",
    body.thumbnail || "",
    JSON.stringify(body.servers || []),
    body.ongoing ? 1 : 0,
    body.featured ? 1 : 0,
    now(),
    now()
  ).run()

  return c.json(success({ id }))
})

/* UPDATE */
app.patch("/episodes/:id", verifyAdmin, async (c) => {

  const body = await c.req.json()
  const id = c.req.param("id")

  await c.env.DB.prepare(`
    UPDATE episodes SET
      season=?,
      episode=?,
      title=?,
      description=?,
      thumbnail=?,
      servers=?,
      ongoing=?,
      featured=?,
      updated_at=?
    WHERE id=?
  `).bind(
    Number(body.season) || 1,
    Number(body.episode),
    body.title || "",
    body.description || "",
    body.thumbnail || "",
    JSON.stringify(body.servers || []),
    body.ongoing ? 1 : 0,
    body.featured ? 1 : 0,
    now(),
    id
  ).run()

  return c.json(success({ id }))
})

/* DELETE */
app.delete("/episodes/:id", verifyAdmin, async (c) => {

  const id = c.req.param("id")

  await c.env.DB.prepare(`
    DELETE FROM episodes WHERE id=?
  `).bind(id).run()

  return c.json(success({ id }))
})

/* ================= PUBLIC ================= */

/* GET EPISODES BY ANIME */
app.get("/public/episodes/:anime_id", async (c) => {

  const anime_id = c.req.param("anime_id")

  const { results } = await c.env.DB.prepare(`
    SELECT id, season, episode, title, thumbnail, servers
    FROM episodes
    WHERE anime_id=?
    ORDER BY season ASC, episode ASC
  `).bind(anime_id).all()

  const data = results.map(e => ({
    ...e,
    servers: safeJSON(e.servers)
  }))

  return c.json(success(data))
})

/* GET SERVERS */
app.get("/public/servers/:id", async (c) => {

  const id = c.req.param("id")

  const row = await c.env.DB.prepare(`
    SELECT servers FROM episodes WHERE id=?
  `).bind(id).first()

  if (!row) return c.json(success([]))

  const servers = safeJSON(row.servers)

  return c.json(success(
    servers.map(url => ({ url }))
  ))
})

export default app
