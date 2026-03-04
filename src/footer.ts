import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const footer = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ENSURE CONFIG ROW EXISTS
================================ */
async function ensureRow(db: D1Database){

  const row = await db
    .prepare("SELECT id FROM footer_config WHERE id=1")
    .first()

  if(!row){

    await db.prepare(`
      INSERT INTO footer_config (id,config)
      VALUES (1,'{}')
    `).run()

  }

}

/* ===============================
   GET FOOTER CONFIG
================================ */
footer.get("/", async (c) => {

  try{

    await ensureRow(c.env.DB)

    const row:any = await c.env.DB
      .prepare("SELECT config FROM footer_config WHERE id=1")
      .first()

    if(!row?.config){
      return c.json({})
    }

    try{
      return c.json(JSON.parse(row.config))
    }catch{
      return c.json({})
    }

  }catch(err){

    console.error("Footer load error:",err)

    return c.json({})

  }

})

/* ===============================
   SAVE / UPDATE CONFIG
================================ */
footer.post("/", async (c) => {

  try{

    const body = await c.req.json()

    await ensureRow(c.env.DB)

    await c.env.DB.prepare(`
      UPDATE footer_config
      SET config=?
      WHERE id=1
    `)
    .bind(JSON.stringify(body || {}))
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Footer save error:",err)

    return c.json({error:"Save failed"},500)

  }

})

/* ===============================
   KILL FOOTER
================================ */
footer.post("/kill", async (c) => {

  try{

    await ensureRow(c.env.DB)

    const row:any = await c.env.DB
      .prepare("SELECT config FROM footer_config WHERE id=1")
      .first()

    let current:any = {}

    try{
      current = JSON.parse(row?.config || "{}")
    }catch{
      current = {}
    }

    current.footerOn = false

    await c.env.DB.prepare(`
      UPDATE footer_config
      SET config=?
      WHERE id=1
    `)
    .bind(JSON.stringify(current))
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Footer kill error:",err)

    return c.json({error:"Kill failed"},500)

  }

})

export default footer
