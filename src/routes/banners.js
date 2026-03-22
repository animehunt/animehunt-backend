import { Hono } from "hono"
const app = new Hono()

// GET BANNERS
app.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`SELECT * FROM banners ORDER BY banner_order ASC`).all()
    return c.json(results || [])
  } catch (e) {
    return c.json({ success: false, error: "Load failed" }, 500)
  }
})

// SAVE BANNER
app.post("/", async (c) => {
  try {
    const b = await c.req.json()
    if (!b.image) return c.json({ success: false, error: "Image required" }, 400)

    const id = b.id || crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO banners (
        id, title, page, category, position, banner_order, image, active, auto_rotate, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM banners WHERE id=?), ?))
    `).bind(
      id, b.title || "", b.page || "home", b.category || "", b.position || "hero",
      Number(b.banner_order || 0), b.image, b.active ? 1 : 0, b.autoRotate ? 1 : 0, id, Date.now()
    ).run()

    return c.json({ success: true, id })
  } catch (e) {
    return c.json({ success: false, error: "Save failed" }, 500)
  }
})

// DELETE BANNER
app.delete("/:id", async (c) => {
  const id = c.req.param("id")
  await c.env.DB.prepare(`DELETE FROM banners WHERE id=?`).bind(id).run()
  return c.json({ success: true })
})

// STATUS TOGGLE
app.patch("/:id/status", async (c) => {
  const id = c.req.param("id")
  const { active } = await c.req.json()
  await c.env.DB.prepare(`UPDATE banners SET active=? WHERE id=?`).bind(active ? 1 : 0, id).run()
  return c.json({ success: true })
})

export default app
