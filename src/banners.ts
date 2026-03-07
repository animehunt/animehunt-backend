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

  return c.json(result.results || [])

})


/* ===============================
CREATE
================================ */
banners.post("/", async (c) => {

  try {

    const form = await c.req.formData()

    const title = String(form.get("title") || "").trim()
    const page = String(form.get("page") || "")
    const category = String(form.get("category") || "")
    const position = String(form.get("position") || "hero")

    const order = Number(form.get("order") || 0)
    const active = form.get("active") ? 1 : 0
    const autoRotate = form.get("autoRotate") ? 1 : 0

    const file = form.get("image") as File

    if (!title || !file) {
      return c.json({ error: "Title & image required" }, 400)
    }

    const id = crypto.randomUUID()

    const ext = file.name.split(".").pop()
    const key = `banners/${id}.${ext}`

    const buffer = await file.arrayBuffer()

    await c.env.BANNER_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type }
    })

    await c.env.DB.prepare(`
      INSERT INTO banners
      (id,title,image,type,target,position,banner_order,device,active,autoRotate,page,category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .bind(
      id,
      title,
      key,
      "page",
      "",
      position,
      order,
      "all",
      active,
      autoRotate,
      page,
      category
    )
    .run()

    return c.json({ success: true })

  } catch (err) {

    console.error("Banner create error", err)

    return c.json({ error: "Upload failed" }, 500)

  }

})


/* ===============================
STATUS
================================ */
banners.put("/:id/status", async (c) => {

  const id = c.req.param("id")
  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE banners
    SET active=?
    WHERE id=?
  `)
  .bind(body.active ? 1 : 0, id)
  .run()

  return c.json({ success: true })

})


/* ===============================
DELETE
================================ */
banners.delete("/:id", async (c) => {

  const id = c.req.param("id")

  const banner:any = await c.env.DB.prepare(`
    SELECT image FROM banners WHERE id=?
  `)
  .bind(id)
  .first()

  if (banner?.image) {
    await c.env.BANNER_BUCKET.delete(banner.image)
  }

  await c.env.DB.prepare(`
    DELETE FROM banners WHERE id=?
  `)
  .bind(id)
  .run()

  return c.json({ success: true })

})

export default banners
