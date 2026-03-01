import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const footer = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET FOOTER CONFIG
================================ */
footer.get("/", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT config FROM footer_config WHERE id = 1")
    .first()

  if (!row) return c.json({})

  return c.json(JSON.parse(row.config || "{}"))
})

/* ===============================
   SAVE / UPDATE CONFIG
================================ */
footer.post("/", async (c) => {

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE footer_config
    SET config = ?
    WHERE id = 1
  `)
  .bind(JSON.stringify(body))
  .run()

  return c.json({ success: true })
})

/* ===============================
   KILL FOOTER (GLOBAL OFF)
================================ */
footer.post("/kill", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT config FROM footer_config WHERE id = 1")
    .first()

  const current = JSON.parse(row?.config || "{}")

  current.footerOn = false

  await c.env.DB.prepare(`
    UPDATE footer_config
    SET config = ?
    WHERE id = 1
  `)
  .bind(JSON.stringify(current))
  .run()

  return c.json({ success: true })
})

export default footer
