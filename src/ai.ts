import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const ai = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET FULL AI STATE
================================ */
ai.get("/", async (c) => {

  const settings = await c.env.DB
    .prepare(`SELECT engine, setting, value FROM ai_settings`)
    .all()

  const global = await c.env.DB
    .prepare(`SELECT paused FROM ai_global LIMIT 1`)
    .first()

  const result: any = {}

  // format nested object
  settings.results.forEach((row: any) => {
    if (!result[row.engine]) {
      result[row.engine] = {}
    }
    result[row.engine][row.setting] = !!row.value
  })

  result.paused = global ? !!global.paused : false

  return c.json(result)
})

/* ===============================
   UPDATE SINGLE SETTING
================================ */
ai.patch("/", async (c) => {

  const body = await c.req.json()

  const { engine, setting, value } = body

  if (!engine || !setting) {
    return c.json({ error: "Invalid data" }, 400)
  }

  const existing = await c.env.DB
    .prepare(`SELECT id FROM ai_settings WHERE engine = ? AND setting = ?`)
    .bind(engine, setting)
    .first()

  if (existing) {
    await c.env.DB
      .prepare(`UPDATE ai_settings SET value = ? WHERE engine = ? AND setting = ?`)
      .bind(value ? 1 : 0, engine, setting)
      .run()
  } else {
    await c.env.DB
      .prepare(`INSERT INTO ai_settings (id, engine, setting, value)
                VALUES (?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        engine,
        setting,
        value ? 1 : 0
      )
      .run()
  }

  return c.json({ success: true })
})

/* ===============================
   PAUSE / RESUME ALL
================================ */
ai.patch("/pause", async (c) => {

  const global = await c.env.DB
    .prepare(`SELECT id, paused FROM ai_global LIMIT 1`)
    .first()

  if (!global) {
    await c.env.DB
      .prepare(`INSERT INTO ai_global (id, paused) VALUES (?, ?)`)
      .bind(crypto.randomUUID(), 1)
      .run()

    return c.json({ paused: true })
  }

  const newState = global.paused ? 0 : 1

  await c.env.DB
    .prepare(`UPDATE ai_global SET paused = ? WHERE id = ?`)
    .bind(newState, global.id)
    .run()

  return c.json({ paused: !!newState })
})

export default ai
