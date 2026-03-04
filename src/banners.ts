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

  try{

    const data = await c.env.DB
      .prepare(`SELECT * FROM banners ORDER BY banner_order ASC`)
      .all()

    return c.json(data?.results || [])

  }catch(err){

    console.error("Banner fetch error",err)
    return c.json([])

  }

})

/* ===============================
CREATE
================================ */
banners.post("/", async (c) => {

  try{

    const form = await c.req.formData()

    const title = String(form.get("title") || "").trim()
    const file = form.get("image") as File

    if(!title || !file){
      return c.json({error:"Title & image required"},400)
    }

    const id = crypto.randomUUID()

    const ext = file.name.split(".").pop()
    const key = `banners/${id}.${ext}`

    const arrayBuffer = await file.arrayBuffer()

    await c.env.BANNER_BUCKET.put(key,arrayBuffer,{
      httpMetadata:{
        contentType:file.type
      }
    })

    await c.env.DB.prepare(`
      INSERT INTO banners (
        id,title,image,type,target,
        position,banner_order,device,
        active,autoRotate
      )
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `)
    .bind(
      id,
      title,
      key,
      form.get("type") || "Hero",
      form.get("target") || null,
      form.get("position") || null,
      Number(form.get("order") || 0),
      form.get("device") || "all",
      form.get("active") ? 1 : 0,
      form.get("autoRotate") ? 1 : 0
    )
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Banner create error",err)

    return c.json({error:"Upload failed"},500)

  }

})

/* ===============================
TOGGLE STATUS
================================ */
banners.put("/:id/status", async (c) => {

  try{

    const id = c.req.param("id")
    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE banners
      SET active=?
      WHERE id=?
    `)
    .bind(body.active?1:0,id)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Banner toggle error",err)
    return c.json({error:"Update failed"},500)

  }

})

/* ===============================
DELETE
================================ */
banners.delete("/:id", async (c) => {

  try{

    const id = c.req.param("id")

    const banner:any = await c.env.DB.prepare(`
      SELECT image FROM banners
      WHERE id=?
    `)
    .bind(id)
    .first()

    if(banner?.image){
      await c.env.BANNER_BUCKET.delete(banner.image)
    }

    await c.env.DB.prepare(`
      DELETE FROM banners
      WHERE id=?
    `)
    .bind(id)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Banner delete error",err)
    return c.json({error:"Delete failed"},500)

  }

})

export default banners
