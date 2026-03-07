import { Hono } from "hono"
import ImageKit from "imagekit"

type Bindings = {
  DB: D1Database
  IMAGEKIT_PUBLIC_KEY: string
  IMAGEKIT_PRIVATE_KEY: string
  IMAGEKIT_URL_ENDPOINT: string
}

const anime = new Hono<{ Bindings: Bindings }>()

/* =====================================================
   GET ALL (FILTER SUPPORT)
===================================================== */
anime.get("/", async (c) => {

  try {

    const { type, status, home, search } = c.req.query()

    let query = "SELECT * FROM anime WHERE 1=1"
    const params: any[] = []

    if (type) {
      query += " AND type=?"
      params.push(type)
    }

    if (status) {
      query += " AND status=?"
      params.push(status)
    }

    if (home === "yes") {
      query += " AND isHome=1"
    }

    if (home === "no") {
      query += " AND isHome=0"
    }

    if (search) {
      query += " AND title LIKE ?"
      params.push(`%${search}%`)
    }

    query += " ORDER BY rowid DESC"

    const result = await c.env.DB.prepare(query).bind(...params).all()

    return c.json(result.results)

  } catch (err) {

    console.error(err)

    return c.json({
      message: "Server error"
    }, 500)

  }

})


/* =====================================================
   GET ONE
===================================================== */
anime.get("/:id", async (c) => {

  const id = c.req.param("id")

  const data = await c.env.DB
    .prepare("SELECT * FROM anime WHERE id=?")
    .bind(id)
    .first()

  if (!data) {
    return c.json({ message: "Not found" }, 404)
  }

  return c.json(data)

})


/* =====================================================
   CREATE
===================================================== */
anime.post("/", async (c) => {

  try {

    const form = await c.req.formData()

    const title = String(form.get("title") || "")
    const slug = String(form.get("slug") || "")

    const type = form.get("type")
    const status = form.get("status")

    const year = form.get("year")
    const rating = form.get("rating")

    const language = form.get("language")
    const duration = form.get("duration")

    const categories = form.get("categories")
    const tags = form.get("tags")
    const description = form.get("description")

    const isHome = form.get("isHome") ? 1 : 0
    const isTrending = form.get("isTrending") ? 1 : 0
    const isMostViewed = form.get("isMostViewed") ? 1 : 0
    const isBanner = form.get("isBanner") ? 1 : 0

    const posterFile = form.get("poster") as File
    const bannerFile = form.get("banner") as File

    if (!title || !slug) {
      return c.json({ message: "Title & slug required" }, 400)
    }

    const imagekit = new ImageKit({
      publicKey: c.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: c.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: c.env.IMAGEKIT_URL_ENDPOINT
    })

    let posterUrl: string | null = null
    let bannerUrl: string | null = null

    /* ======================
       POSTER UPLOAD
    ====================== */

    if (posterFile) {

      const buffer = await posterFile.arrayBuffer()

      const upload = await imagekit.upload({
        file: Buffer.from(buffer),
        fileName: posterFile.name,
        folder: "/animehunt/posters"
      })

      posterUrl = upload.url
    }

    /* ======================
       BANNER UPLOAD
    ====================== */

    if (bannerFile) {

      const buffer = await bannerFile.arrayBuffer()

      const upload = await imagekit.upload({
        file: Buffer.from(buffer),
        fileName: bannerFile.name,
        folder: "/animehunt/banners"
      })

      bannerUrl = upload.url
    }

    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO anime (
        id,title,slug,type,status,
        poster,banner,year,rating,
        language,duration,categories,
        tags,description,
        isHome,isTrending,isMostViewed,isBanner
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      title,
      slug,
      type || null,
      status || null,
      posterUrl,
      bannerUrl,
      year || null,
      rating || null,
      language || null,
      duration || null,
      categories || null,
      tags || null,
      description || null,
      isHome,
      isTrending,
      isMostViewed,
      isBanner
    ).run()

    return c.json({ success: true })

  } catch (err:any) {

    console.error(err)

    return c.json({
      message: "Insert failed",
      error: err.message
    }, 500)

  }

})


/* =====================================================
   UPDATE
===================================================== */
anime.patch("/:id", async (c) => {

  try {

    const id = c.req.param("id")

    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE anime SET
        title=?,
        slug=?,
        type=?,
        status=?,
        poster=?,
        banner=?,
        year=?,
        rating=?,
        language=?,
        duration=?,
        categories=?,
        tags=?,
        description=?,
        isHome=?,
        isTrending=?,
        isMostViewed=?,
        isBanner=?
      WHERE id=?
    `).bind(
      body.title,
      body.slug,
      body.type || null,
      body.status || null,
      body.poster || null,
      body.banner || null,
      body.year || null,
      body.rating || null,
      body.language || null,
      body.duration || null,
      body.categories || null,
      body.tags || null,
      body.description || null,
      body.isHome ? 1 : 0,
      body.isTrending ? 1 : 0,
      body.isMostViewed ? 1 : 0,
      body.isBanner ? 1 : 0,
      id
    ).run()

    return c.json({ success: true })

  } catch {

    return c.json({
      message: "Update failed"
    }, 500)

  }

})


/* =====================================================
   DELETE
===================================================== */
anime.delete("/:id", async (c) => {

  const id = c.req.param("id")

  await c.env.DB
    .prepare("DELETE FROM anime WHERE id=?")
    .bind(id)
    .run()

  return c.json({ success: true })

})

export default anime
