import { Hono } from "hono"
import ImageKit from "imagekit"

type Bindings = {
  DB: D1Database
  IMAGEKIT_PUBLIC_KEY: string
  IMAGEKIT_PRIVATE_KEY: string
  IMAGEKIT_URL_ENDPOINT: string
}

const banners = new Hono<{ Bindings: Bindings }>()

/* ===============================
GET ALL BANNERS
================================ */
banners.get("/", async (c) => {

  const result = await c.env.DB
    .prepare("SELECT * FROM banners ORDER BY banner_order ASC")
    .all()

  return c.json(result.results || [])

})


/* ===============================
CREATE BANNER
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
       IMAGEKIT SETUP
    =============================== */

    const imagekit = new ImageKit({
      publicKey: c.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: c.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: c.env.IMAGEKIT_URL_ENDPOINT
    })

    const buffer = await file.arrayBuffer()

    const upload = await imagekit.upload({
      file: Buffer.from(buffer),
      fileName: file.name,
      folder: "/animehunt/banners"
    })

    const id = crypto.randomUUID()

    /* ===============================
       SAVE TO DATABASE
    =============================== */

    await c.env.DB.prepare(`
      INSERT INTO banners
      (id,title,image,type,target,position,banner_order,device,active,autoRotate,page,category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `)
      .bind(
        id,
        title,
        upload.url,
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

  } catch (err: any) {

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
