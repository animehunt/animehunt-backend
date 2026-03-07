import { Hono } from "hono"

type Bindings = {
  DB: D1Database
  IMAGEKIT_PRIVATE_KEY: string
  IMAGEKIT_URL_ENDPOINT: string
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

  try {

    const form = await c.req.formData()

    const title = String(form.get("title") || "")
    const page = String(form.get("page") || "")
    const category = String(form.get("category") || "")
    const position = String(form.get("position") || "hero")

    const order = Number(form.get("order") || 0)

    const active = form.get("active") ? 1 : 0
    const autoRotate = form.get("autoRotate") ? 1 : 0

    const file = form.get("image") as File

    if (!title || !file) {

      return c.json({
        message: "Title & image required"
      }, 400)

    }

    /* IMAGEKIT UPLOAD */

    const buffer = await file.arrayBuffer()

    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(buffer))
    )

    const body = new URLSearchParams()

    body.append("file", `data:${file.type};base64,${base64}`)
    body.append("fileName", file.name)
    body.append("folder", "/animehunt/banners")

    const upload = await fetch("https://upload.imagekit.io/api/v1/files/upload", {

      method: "POST",

      headers: {

        Authorization:
          "Basic " + btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":"),

        "Content-Type":
          "application/x-www-form-urlencoded"

      },

      body

    })

    const data:any = await upload.json()

    if (!data.url) {

      return c.json({
        message: "Image upload failed",
        error: data
      }, 500)

    }

    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO banners
      (id,title,image,type,target,position,banner_order,device,active,autoRotate,page,category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(

      id,
      title,
      data.url,
      "page",
      "",
      position,
      order,
      "all",
      active,
      autoRotate,
      page,
      category

    ).run()

    return c.json({ success:true })

  } catch (err:any) {

    return c.json({

      message:"Upload failed",
      error:err.message

    },500)

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
  .bind(body.active ? 1 : 0,id)
  .run()

  return c.json({ success:true })

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

  return c.json({ success:true })

})

export default banners
