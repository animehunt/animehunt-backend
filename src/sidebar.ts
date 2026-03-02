import { Hono } from "hono"


type Bindings = {
  DB: D1Database
}

const sidebar = new Hono<{ Bindings: Bindings }>()

/* ================================
   GET ALL (ADMIN)
================================ */
sidebar.get("/", async (c) => {

  const rows = await c.env.DB
    .prepare("SELECT * FROM sidebar_items ORDER BY priority ASC")
    .all()

  return c.json(
    rows.results.map((r: any) => ({
      _id: r.id,
      title: r.title,
      icon: r.icon,
      url: r.url,
      device: r.device,
      visibility: r.visibility,
      highlight: r.highlight,
      badge: r.badge,
      priority: r.priority,
      active: !!r.active,
      newTab: !!r.new_tab
    }))
  )
})

/* ================================
   ADD / UPDATE
================================ */
sidebar.post("/", async (c) => {

  const body = await c.req.json()

  // ✅ nanoid removed — Cloudflare native UUID
  const id = body._id || crypto.randomUUID()

  if (!body.title || !body.url) {
    return c.json({ error: "Missing required fields" }, 400)
  }

  await c.env.DB.prepare(`
    INSERT INTO sidebar_items (
      id, title, icon, url,
      device, visibility,
      highlight, badge,
      priority, active, new_tab
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      icon=excluded.icon,
      url=excluded.url,
      device=excluded.device,
      visibility=excluded.visibility,
      highlight=excluded.highlight,
      badge=excluded.badge,
      priority=excluded.priority,
      active=excluded.active,
      new_tab=excluded.new_tab
  `).bind(
    id,
    body.title,
    body.icon || "",
    body.url,
    body.device || "All",
    body.visibility || "All",
    body.highlight || "None",
    body.badge || "",
    body.priority ?? 99,
    body.active ? 1 : 0,
    body.newTab ? 1 : 0
  ).run()

  return c.json({ success: true, id })
})

/* ================================
   DELETE
================================ */
sidebar.delete("/", async (c) => {

  const body = await c.req.json()

  if (!body.id) {
    return c.json({ error: "ID required" }, 400)
  }

  await c.env.DB
    .prepare("DELETE FROM sidebar_items WHERE id = ?")
    .bind(body.id)
    .run()

  return c.json({ success: true })
})

export default sidebar
