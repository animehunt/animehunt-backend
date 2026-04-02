import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
GET ALL SIDEBAR ITEMS
========================= */

app.get("/sidebar", verifyAdmin, async (c) => {

  const { results } = await c.env.DB
    .prepare("SELECT * FROM sidebar_items ORDER BY priority ASC")
    .all()

  return c.json(results)

})

/* =========================
CREATE / UPDATE ITEM
========================= */

app.post("/sidebar", verifyAdmin, async (c) => {

  const body = await c.req.json()

  let {
    _id,
    title,
    icon,
    url,
    device,
    visibility,
    highlight,
    badge,
    priority,
    active,
    newTab
  } = body

  if (!title || !url) {
    return c.json({ error: "Missing fields" }, 400)
  }

  const id = _id || crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO sidebar_items (
      id,title,icon,url,device,visibility,highlight,badge,priority,active,newTab
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id)
    DO UPDATE SET
      title=excluded.title,
      icon=excluded.icon,
      url=excluded.url,
      device=excluded.device,
      visibility=excluded.visibility,
      highlight=excluded.highlight,
      badge=excluded.badge,
      priority=excluded.priority,
      active=excluded.active,
      newTab=excluded.newTab
  `)
  .bind(
    id,
    title,
    icon,
    url,
    device,
    visibility,
    highlight,
    badge,
    priority || 99,
    active ? 1 : 0,
    newTab ? 1 : 0
  )
  .run()

  return c.json({ success: true })

})

/* =========================
DELETE ITEM
========================= */

app.delete("/sidebar/:id", verifyAdmin, async (c) => {

  const id = c.req.param("id")

  await c.env.DB.prepare(`
    DELETE FROM sidebar_items WHERE id=?
  `)
  .bind(id)
  .run()

  return c.json({ success: true })

})

export default app
