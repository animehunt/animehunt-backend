import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

const ads = new Hono<{ Bindings: Bindings }>()

/* ===============================
GET ALL ADS
================================ */
ads.get('/', async (c) => {

  const { results } = await c.env.DB
    .prepare(`SELECT * FROM ads ORDER BY createdAt DESC`)
    .all()

  return c.json(results || [])

})


/* ===============================
CREATE SINGLE AD
================================ */
ads.post('/', async (c) => {

  const body = await c.req.json()

  if (!body.name || !body.adCode) {
    return c.json({ error: "Invalid data" }, 400)
  }

  const id = crypto.randomUUID()

  await c.env.DB.prepare(
`
INSERT INTO ads (
id,
name,
type,
adCode,
page,
position,
maxPerPage,
startDate,
endDate,
priority,
animeSlug,
episode,
country,
language,
maxViews,
status,
createdAt
)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`
  ).bind(
    id,
    body.name,
    body.type || "Banner",
    body.adCode,
    body.page || "Home",
    body.position || "Header",
    body.maxPerPage || 1,
    body.startDate || null,
    body.endDate || null,
    body.priority || 5,
    body.animeSlug || null,
    body.episode || null,
    body.country || null,
    body.language || null,
    body.maxViews || null,
    "ON",
    new Date().toISOString()
  ).run()

  return c.json({ success:true })

})


/* ===============================
BULK INSERT
================================ */
ads.post('/bulk', async (c) => {

  const list = await c.req.json()

  if (!Array.isArray(list)) {
    return c.json({ error:"Invalid JSON" },400)
  }

  const stmt = `
INSERT INTO ads (
id,
name,
type,
adCode,
page,
position,
maxPerPage,
priority,
status,
createdAt
)
VALUES (?,?,?,?,?,?,?,?,?,?)
`

  for (const item of list) {

    await c.env.DB.prepare(stmt).bind(
      crypto.randomUUID(),
      item.name || "Ad",
      item.type || "Banner",
      item.adCode || "",
      item.page || "Home",
      item.position || "Header",
      item.maxPerPage || 1,
      item.priority || 5,
      "ON",
      new Date().toISOString()
    ).run()

  }

  return c.json({ success:true })

})


/* ===============================
TOGGLE AD STATUS
================================ */
ads.patch('/:id/toggle', async (c) => {

  const id = c.req.param('id')

  const ad = await c.env.DB.prepare(
    `SELECT status FROM ads WHERE id = ?`
  ).bind(id).first()

  if (!ad) {
    return c.json({ error:"Ad not found" },404)
  }

  const newStatus = ad.status === "ON" ? "OFF" : "ON"

  await c.env.DB.prepare(
    `UPDATE ads SET status = ? WHERE id = ?`
  ).bind(newStatus,id).run()

  return c.json({ success:true })

})


export default ads
