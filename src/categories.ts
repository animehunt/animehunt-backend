import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const categories = new Hono<{ Bindings: Bindings }>()

/* ===============================
GET ALL
================================ */
categories.get("/", async (c) => {

  try{

    const data = await c.env.DB
      .prepare(`
        SELECT *
        FROM categories
        ORDER BY category_order ASC
      `)
      .all()

    return c.json(data?.results || [])

  }catch(err){

    console.error("Category fetch error",err)
    return c.json([])

  }

})

/* ===============================
CREATE
================================ */
categories.post("/", async (c) => {

  try{

    const body = await c.req.json()

    if(!body.name || !body.slug){
      return c.json({error:"Name & slug required"},400)
    }

    const id = crypto.randomUUID()

    await c.env.DB.prepare(`
      INSERT INTO categories (
        id,name,slug,type,
        category_order,priority,
        showHome,active,featured,
        aiTrending,aiPopular,aiAssign
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `)
    .bind(
      id,
      body.name,
      body.slug,
      body.type || "row",
      Number(body.order || 0),
      Number(body.priority || 1),
      body.showHome ? 1 : 0,
      body.isActive ? 1 : 0,
      body.isFeatured ? 1 : 0,
      body.aiTrending ? 1 : 0,
      body.aiPopular ? 1 : 0,
      body.aiAssign ? 1 : 0
    )
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Category create error",err)

    return c.json({
      error:"Slug already exists or invalid data"
    },400)

  }

})

/* ===============================
UPDATE
================================ */
categories.put("/:id", async (c) => {

  try{

    const id = c.req.param("id")
    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE categories SET
        name=?,
        slug=?,
        type=?,
        category_order=?,
        priority=?,
        showHome=?,
        active=?,
        featured=?,
        aiTrending=?,
        aiPopular=?,
        aiAssign=?
      WHERE id=?
    `)
    .bind(
      body.name,
      body.slug,
      body.type || "row",
      Number(body.order || 0),
      Number(body.priority || 1),
      body.showHome ? 1 : 0,
      body.isActive ? 1 : 0,
      body.isFeatured ? 1 : 0,
      body.aiTrending ? 1 : 0,
      body.aiPopular ? 1 : 0,
      body.aiAssign ? 1 : 0,
      id
    )
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Category update error",err)

    return c.json({error:"Update failed"},500)

  }

})

/* ===============================
DELETE
================================ */
categories.delete("/:id", async (c) => {

  try{

    const id = c.req.param("id")

    await c.env.DB.prepare(`
      DELETE FROM categories
      WHERE id=?
    `)
    .bind(id)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Category delete error",err)

    return c.json({error:"Delete failed"},500)

  }

})

export default categories
