import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const homepage = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET ALL ROWS
================================ */
homepage.get("/", async (c) => {

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM homepage_rows
    ORDER BY row_order ASC, id DESC
  `).all()

  return c.json(results.map(formatRow))
})

/* ===============================
   GET SINGLE ROW
================================ */
homepage.get("/:id", async (c) => {

  const id = c.req.param("id")

  const row = await c.env.DB
    .prepare("SELECT * FROM homepage_rows WHERE id = ?")
    .bind(id)
    .first()

  if (!row) return c.json({ error: "Not found" }, 404)

  return c.json(formatRow(row))
})

/* ===============================
   CREATE ROW
================================ */
homepage.post("/", async (c) => {

  const body = await c.req.json()

  await c.env.DB.prepare(`
    INSERT INTO homepage_rows
    (title, type, source, layout, row_limit, row_order, active, auto_update)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    body.title,
    body.type,
    body.source || "",
    body.layout,
    body.limit || 10,
    body.order || 0,
    body.active ? 1 : 0,
    body.autoUpdate ? 1 : 0
  )
  .run()

  return c.json({ success: true })
})

/* ===============================
   UPDATE ROW
================================ */
homepage.patch("/:id", async (c) => {

  const id = c.req.param("id")
  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE homepage_rows
    SET title = ?,
        type = ?,
        source = ?,
        layout = ?,
        row_limit = ?,
        row_order = ?,
        active = ?,
        auto_update = ?
    WHERE id = ?
  `)
  .bind(
    body.title,
    body.type,
    body.source || "",
    body.layout,
    body.limit || 10,
    body.order || 0,
    body.active ? 1 : 0,
    body.autoUpdate ? 1 : 0,
    id
  )
  .run()

  return c.json({ success: true })
})

/* ===============================
   DELETE ROW
================================ */
homepage.delete("/:id", async (c) => {

  const id = c.req.param("id")

  await c.env.DB
    .prepare("DELETE FROM homepage_rows WHERE id = ?")
    .bind(id)
    .run()

  return c.json({ success: true })
})

/* ===============================
   FORMAT OUTPUT
================================ */
function formatRow(row: any) {
  return {
    _id: row.id,
    title: row.title,
    type: row.type,
    source: row.source,
    layout: row.layout,
    limit: row.row_limit,
    order: row.row_order,
    active: !!row.active,
    autoUpdate: !!row.auto_update
  }
}

export default homepage
