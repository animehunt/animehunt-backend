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

  return c.json(results)
})

/* ===============================
   CREATE SINGLE AD
================================ */
ads.post('/', async (c) => {
  const body = await c.req.json()

  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    `INSERT INTO ads (
      id, name, type, adCode, page, position,
      maxPerPage, startDate, endDate, priority,
      animeSlug, episode, country, language,
      maxViews, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  .bind(
    id,
    body.name,
    body.type,
    body.adCode,
    body.page,
    body.position,
    body.maxPerPage || 1,
    body.startDate || null,
    body.endDate || null,
    body.priority || 5,
    body.animeSlug || null,
    body.episode || null,
    body.country || null,
    body.language || null,
    body.maxViews || null,
    "ON"
  )
  .run()

  return c.json({ success: true })
})

/* ===============================
   BULK INSERT
================================ */
ads.post('/bulk', async (c) => {
  const list = await c.req.json()

  if (!Array.isArray(list)) {
    return c.json({ error: "Invalid format" }, 400)
  }

  for (const item of list) {
    const id = crypto.randomUUID()

    await c.env.DB.prepare(
      `INSERT INTO ads (
        id, name, type, adCode, page, position,
        maxPerPage, priority, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      item.name,
      item.type,
      item.adCode,
      item.page,
      item.position,
      item.maxPerPage || 1,
      item.priority || 5,
      "ON"
    )
    .run()
  }

  return c.json({ success: true })
})

/* ===============================
   TOGGLE STATUS
================================ */
ads.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id')

  const ad = await c.env.DB
    .prepare(`SELECT status FROM ads WHERE id = ?`)
    .bind(id)
    .first()

  if (!ad) {
    return c.json({ error: "Ad not found" }, 404)
  }

  const newStatus = ad.status === "ON" ? "OFF" : "ON"

  await c.env.DB
    .prepare(`UPDATE ads SET status = ? WHERE id = ?`)
    .bind(newStatus, id)
    .run()

  return c.json({ success: true })
})

export default ads
