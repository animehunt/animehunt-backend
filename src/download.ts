import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const download = new Hono<{ Bindings: Bindings }>()

/* ===============================
GET ALL DOWNLOADS
================================ */
download.get("/", async (c) => {

  try{

    const data = await c.env.DB
      .prepare(`
        SELECT *
        FROM downloads
        ORDER BY createdAt DESC
      `)
      .all()

    return c.json(data?.results || [])

  }catch(err){

    console.error("Download fetch error:",err)

    return c.json([])

  }

})

/* ===============================
BULK INSERT
================================ */
download.post("/bulk", async (c) => {

  try{

    const body = await c.req.json()

    if(!Array.isArray(body)){
      return c.json({error:"Invalid payload"},400)
    }

    if(body.length === 0){
      return c.json({error:"Empty payload"},400)
    }

    const now = new Date().toISOString()

    const stmt = c.env.DB.prepare(`
      INSERT INTO downloads (
        id,anime,season,episode,
        host,quality,link,createdAt
      )
      VALUES (?,?,?,?,?,?,?,?)
    `)

    const batch = body.map((d:any)=>{

      return stmt.bind(
        crypto.randomUUID(),
        String(d.anime || ""),
        String(d.season || ""),
        String(d.episode || ""),
        String(d.host || ""),
        String(d.quality || ""),
        String(d.link || ""),
        now
      )

    })

    await c.env.DB.batch(batch)

    return c.json({success:true})

  }catch(err){

    console.error("Download bulk error:",err)

    return c.json({error:"Insert failed"},500)

  }

})

/* ===============================
DELETE
================================ */
download.delete("/:id", async (c) => {

  try{

    const id = c.req.param("id")

    if(!id){
      return c.json({error:"Invalid id"},400)
    }

    await c.env.DB.prepare(`
      DELETE FROM downloads
      WHERE id=?
    `)
    .bind(id)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Delete error:",err)

    return c.json({error:"Delete failed"},500)

  }

})

export default download
