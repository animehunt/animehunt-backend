import { Hono } from "hono"

type Bindings = {
  DB: D1Database
  BANNER_BUCKET: R2Bucket
}

const banners = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET ALL
================================ */
banners.get("/", async (c) => {

  const result = await c.env.DB
    .prepare("SELECT * FROM banners ORDER BY banner_order ASC")
    .all()

  return c.json(result.results)
})

/* ===============================
   CREATE
================================ */
banners.post("/", async (c) => {

  const form = await c.req.formData()

  const title = form.get("title") as string
  const file = form.get("image") as File

  if (!title || !file) {
    return c.json({ message: "Title & image required" }, 400)
  }

  const id = crypto.randomUUID()
  const key = `banners/${id}-${file.name}`

  await c.env.BANNER_BUCKET.put(key, file.stream())

  await c.env.DB.prepare(`
    INSERT INTO banners (
      id, title, image, type, target,
      position, banner_order, device,
      active, autoRotate
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    title,
    key,
    form.get("type"),
    form.get("target"),
    form.get("position"),
    Number(form.get("order") || 0),
    form.get("device") || "all",
    form.get("active") ? 1 : 0,
    form.get("autoRotate") ? 1 : 0
  ).run()

  return c.json({ success: true })
})

/* ===============================
   TOGGLE STATUS
================================ */
banners.put("/:id/status", async (c) => {

  const { id } = c.req.param()
  const body = await c.req.json()

  await c.env.DB
    .prepare("UPDATE banners SET active=? WHERE id=?")
    .bind(body.active ? 1 : 0, id)
    .run()

  return c.json({ success: true })
})

/* ===============================
   DELETE
================================ */
banners.delete("/:id", async (c) => {

  const { id } = c.req.param()

  const banner = await c.env.DB
    .prepare("SELECT image FROM banners WHERE id=?")
    .bind(id)
    .first()

  if (banner?.image) {
    await c.env.BANNER_BUCKET.delete(banner.image)
  }

  await c.env.DB
    .prepare("DELETE FROM banners WHERE id=?")
    .bind(id)
    .run()

  return c.json({ success: true })
})

export default banners
