import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const banners = new Hono<{ Bindings: Bindings }>()

const CLOUD_NAME = "djzdjooly"
const UPLOAD_PRESET = "animehunt"

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

    /* ===============================
    CLOUDINARY UPLOAD
    =============================== */

    const cloudForm = new FormData()

    cloudForm.append("file", file)
    cloudForm.append("upload_preset", UPLOAD_PRESET)

    const upload = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: cloudForm
      }
    )

    const cloudData:any = await upload.json()

    if (!cloudData.secure_url) {
      return c.json({ error: "Cloudinary upload failed", details: cloudData }, 500)
    }

    const imageUrl = cloudData.secure_url

    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO banners
      (id,title,image,type,target,position,banner_order,device,active,autoRotate,page,category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .bind(
      id,
      title,
      imageUrl,
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

  } catch (err:any) {

    console.error(err)

    return c.json({
      error: "Upload failed",
      details: err.message
    }, 500)

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

  await c.env.DB.prepare(`
    DELETE FROM banners WHERE id=?
  `)
  .bind(id)
  .run()

  return c.json({ success: true })

})

export default banners
