import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const sidebar = new Hono<{ Bindings: Bindings }>()

/* ================================
   GET ALL SIDEBAR ITEMS
================================ */
sidebar.get("/", async (c) => {

  try {

    const result = await c.env.DB
      .prepare("SELECT * FROM sidebar_items ORDER BY priority ASC")
      .all()

    const rows = result.results || []

    return c.json(
      rows.map((r: any) => ({
        _id: r.id,
        title: r.title,
        icon: r.icon || "",
        url: r.url,
        device: r.device || "All",
        visibility: r.visibility || "All",
        highlight: r.highlight || "None",
        badge: r.badge || "",
        priority: r.priority ?? 99,
        active: !!r.active,
        newTab: !!r.new_tab
      }))
    )

  } catch (err) {

    console.error("Sidebar GET error:", err)
    return c.json([])

  }

})

/* ================================
   ADD / UPDATE ITEM
================================ */
sidebar.post("/", async (c) => {

  try {

    const body = await c.req.json()

    if (!body.title || !body.url) {
      return c.json({ error: "Missing required fields" }, 400)
    }

    const id = body._id || crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO sidebar_items (
        id, title, icon, url,
        device, visibility,
        highlight, badge,
        priority, active, new_tab
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        icon = excluded.icon,
        url = excluded.url,
        device = excluded.device,
        visibility = excluded.visibility,
        highlight = excluded.highlight,
        badge = excluded.badge,
        priority = excluded.priority,
        active = excluded.active,
        new_tab = excluded.new_tab
    `).bind(

      id,
      String(body.title).trim(),
      body.icon || "",
      String(body.url).trim(),
      body.device || "All",
      body.visibility || "All",
      body.highlight || "None",
      body.badge || "",
      Number(body.priority ?? 99),
      body.active ? 1 : 0,
      body.newTab ? 1 : 0

    ).run()

    return c.json({ success: true, id })

  } catch (err) {

    console.error("Sidebar SAVE error:", err)
    return c.json({ error: "Save failed" }, 500)

  }

})

/* ================================
   DELETE ITEM
================================ */
sidebar.delete("/", async (c) => {

  try {

    const body = await c.req.json()

    if (!body.id) {
      return c.json({ error: "ID required" }, 400)
    }

    await c.env.DB
      .prepare("DELETE FROM sidebar_items WHERE id = ?")
      .bind(body.id)
      .run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Sidebar DELETE error:", err)
    return c.json({ error: "Delete failed" }, 500)

  }

})

export default sidebar
