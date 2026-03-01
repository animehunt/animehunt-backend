import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const performance = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET SETTINGS
================================ */
performance.get("/", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT * FROM performance_settings WHERE id = 1")
    .first()

  if (!row) {
    return c.json({})
  }

  // convert 0/1 to boolean
  const response: Record<string, boolean> = {}

  Object.keys(row).forEach(key => {
    if (key === "id") return
    response[key] = !!row[key]
  })

  return c.json(response)
})

/* ===============================
   SAVE SETTINGS
================================ */
performance.post("/", async (c) => {

  const body = await c.req.json()

  const fields = [
    "lazyLoad","smartPreload","assetMinify","imgOptimize",
    "jsOptimize","cssOptimize","smartCache","mobilePriority",
    "cdnMode","adaptiveLoad","preconnect","bandwidth"
  ]

  const updates = []
  const values = []

  fields.forEach(field => {
    if (field in body) {
      updates.push(`${field} = ?`)
      values.push(body[field] ? 1 : 0)
    }
  })

  if (updates.length === 0) {
    return c.json({ success: true })
  }

  await c.env.DB.prepare(`
    UPDATE performance_settings
    SET ${updates.join(", ")}
    WHERE id = 1
  `).bind(...values).run()

  return c.json({ success: true })
})

export default performance
