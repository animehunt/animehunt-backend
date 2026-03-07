import { Hono } from "hono"
import ImageKit from "imagekit"

type Bindings = {
  DB: D1Database
  IMAGEKIT_PUBLIC_KEY: string
  IMAGEKIT_PRIVATE_KEY: string
  IMAGEKIT_URL_ENDPOINT: string
}

const banners = new Hono<{ Bindings: Bindings }>()

/* =====================================================
   GET ALL BANNERS
===================================================== */
banners.get("/", async (c) => {

  try {

    const result = await c.env.DB
      .prepare("SELECT * FROM banners ORDER BY banner_order ASC")
      .all()

    return c.json({
      success: true,
      data: result.results
    })

  } catch (err) {

    console.error("GET BANNERS ERROR", err)

    return c.json({
      success: false,
      message: "Failed to fetch banners"
    }, 500)

  }

})

/* =====================================================
   CREATE BANNER
===================================================== */
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
        success: false,
        message: "Title & image required"
      }, 400)

    }

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

    await c.env.DB.prepare(`
      INSERT INTO banners
      (id,title,image,type,target,position,banner_order,device,active,autoRotate,page,category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(

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

    ).run()

    return c.json({
      success: true,
      message: "Banner created"
    })

  } catch (err:any) {

    console.error("CREATE BANNER ERROR", err)

    return c.json({
      success: false,
      message: "Banner upload failed",
      error: err.message
    }, 500)

  }

})

/* =====================================================
   UPDATE STATUS
===================================================== */
banners.put("/:id/status", async (c) => {

  try {

    const id = c.req.param("id")
    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE banners
      SET active=?
      WHERE id=?
    `)
    .bind(body.active ? 1 : 0, id)
    .run()

    return c.json({
      success: true
    })

  } catch (err) {

    return c.json({
      success: false,
      message: "Status update failed"
    }, 500)

  }

})

/* =====================================================
   UPDATE BANNER
===================================================== */
banners.patch("/:id", async (c) => {

  try {

    const id = c.req.param("id")
    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE banners SET
        title=?,
        position=?,
        banner_order=?,
        page=?,
        category=?,
        active=?,
        autoRotate=?
      WHERE id=?
    `).bind(

      body.title,
      body.position,
      body.banner_order,
      body.page,
      body.category,
      body.active ? 1 : 0,
      body.autoRotate ? 1 : 0,
      id

    ).run()

    return c.json({
      success: true
    })

  } catch {

    return c.json({
      success: false,
      message: "Update failed"
    }, 500)

  }

})

/* =====================================================
   DELETE BANNER
===================================================== */
banners.delete("/:id", async (c) => {

  try {

    const id = c.req.param("id")

    await c.env.DB
      .prepare("DELETE FROM banners WHERE id=?")
      .bind(id)
      .run()

    return c.json({
      success: true
    })

  } catch {

    return c.json({
      success: false,
      message: "Delete failed"
    }, 500)

  }

})

export default banners
