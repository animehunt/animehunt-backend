import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const performance = new Hono<{ Bindings: Bindings }>()

/* ===============================
   ENSURE SETTINGS ROW EXISTS
================================ */
async function ensureRow(db:D1Database){

  const row = await db
    .prepare("SELECT id FROM performance_settings WHERE id=1")
    .first()

  if(!row){

    await db.prepare(`
      INSERT INTO performance_settings (
        id,lazyLoad,smartPreload,assetMinify,imgOptimize,
        jsOptimize,cssOptimize,smartCache,mobilePriority,
        cdnMode,adaptiveLoad,preconnect,bandwidth
      )
      VALUES (1,0,0,0,0,0,0,0,0,0,0,0,0)
    `).run()

  }

}

/* ===============================
   GET SETTINGS
================================ */
performance.get("/", async (c) => {

  try{

    await ensureRow(c.env.DB)

    const row:any = await c.env.DB
      .prepare("SELECT * FROM performance_settings WHERE id=1")
      .first()

    if(!row) return c.json({})

    const response:Record<string,boolean> = {}

    Object.keys(row).forEach(key=>{
      if(key==="id") return
      response[key] = !!row[key]
    })

    return c.json(response)

  }catch(err){

    console.error("Performance load error:",err)

    return c.json({})

  }

})

/* ===============================
   SAVE SETTINGS
================================ */
performance.post("/", async (c) => {

  try{

    const body = await c.req.json()

    await ensureRow(c.env.DB)

    const fields = [
      "lazyLoad","smartPreload","assetMinify","imgOptimize",
      "jsOptimize","cssOptimize","smartCache","mobilePriority",
      "cdnMode","adaptiveLoad","preconnect","bandwidth"
    ]

    const updates:string[]=[]
    const values:any[]=[]

    fields.forEach(field=>{
      if(field in body){
        updates.push(`${field}=?`)
        values.push(body[field]?1:0)
      }
    })

    if(!updates.length){
      return c.json({success:true})
    }

    await c.env.DB.prepare(`
      UPDATE performance_settings
      SET ${updates.join(",")}
      WHERE id=1
    `)
    .bind(...values)
    .run()

    return c.json({success:true})

  }catch(err){

    console.error("Performance save error:",err)

    return c.json({error:"Save failed"},500)

  }

})

export default performance
