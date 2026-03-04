import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const homepage = new Hono<{ Bindings: Bindings }>()

/* ===============================
   GET ALL ROWS
================================ */
homepage.get("/", async (c) => {

  try{

    const data = await c.env.DB.prepare(`
      SELECT *
      FROM homepage_rows
      ORDER BY row_order ASC, id DESC
    `).all()

    const rows = data?.results || []

    return c.json(rows.map(formatRow))

  }catch(err){

    console.error("Homepage rows load error:",err)

    return c.json([])

  }

})

/* ===============================
   GET SINGLE ROW
================================ */
homepage.get("/:id", async (c) => {

  try{

    const id = c.req.param("id")

    const row = await c.env.DB
      .prepare("SELECT * FROM homepage_rows WHERE id=?")
      .bind(id)
      .first()

    if(!row){
      return c.json({error:"Not found"},404)
    }

    return c.json(formatRow(row))

  }catch(err){

    console.error("Homepage row fetch error:",err)

    return c.json({error:"Server error"},500)

  }

})

/* ===============================
   CREATE ROW
================================ */
homepage.post("/", async (c) => {

  try{

    const body = await c.req.json()

    if(!body?.title){
      return c.json({error:"Title required"},400)
    }

    await c.env.DB.prepare(`
      INSERT INTO homepage_rows
      (title,type,source,layout,row_limit,row_order,active,auto_update)
      VALUES (?,?,?,?,?,?,?,?)
    `)
    .bind(
      body.title,
      body.type || "auto",
      body.source || "",
      body.layout || "scroll",
      Number(body.limit || 10),
      Number(body.order || 0),
      body.active ? 1 : 0,
      body.autoUpdate ? 1 : 0
    )
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Homepage create error:",err)

    return c.json({error:"Insert failed"},500)

  }

})

/* ===============================
   UPDATE ROW
================================ */
homepage.patch("/:id", async (c) => {

  try{

    const id = c.req.param("id")
    const body = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE homepage_rows
      SET
        title=?,
        type=?,
        source=?,
        layout=?,
        row_limit=?,
        row_order=?,
        active=?,
        auto_update=?
      WHERE id=?
    `)
    .bind(
      body.title || "",
      body.type || "auto",
      body.source || "",
      body.layout || "scroll",
      Number(body.limit || 10),
      Number(body.order || 0),
      body.active ? 1 : 0,
      body.autoUpdate ? 1 : 0,
      id
    )
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Homepage update error:",err)

    return c.json({error:"Update failed"},500)

  }

})

/* ===============================
   DELETE ROW
================================ */
homepage.delete("/:id", async (c) => {

  try{

    const id = c.req.param("id")

    await c.env.DB.prepare(`
      DELETE FROM homepage_rows
      WHERE id=?
    `)
    .bind(id)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Homepage delete error:",err)

    return c.json({error:"Delete failed"},500)

  }

})

/* ===============================
   FORMAT OUTPUT
================================ */
function formatRow(row:any){

  return {
    _id: row.id,
    title: row.title || "",
    type: row.type || "auto",
    source: row.source || "",
    layout: row.layout || "scroll",
    limit: row.row_limit || 10,
    order: row.row_order || 0,
    active: !!row.active,
    autoUpdate: !!row.auto_update
  }

}

export default homepage
