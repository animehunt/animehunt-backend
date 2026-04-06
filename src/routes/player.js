import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================
UTIL: ENSURE DEFAULT ROW
========================= */
async function ensureRow(db){

  try{

    const row = await db
      .prepare("SELECT id FROM player_settings WHERE id=1")
      .first()

    if(!row){
      await db.prepare(`
        INSERT INTO player_settings (id)
        VALUES (1)
      `).run()
    }

  }catch(e){
    console.error("ENSURE ROW ERROR:", e)
  }

}

/* =========================
UTIL: SAFE BOOLEAN
========================= */
function toBool(v){
  return v === true || v === 1 || v === "true"
}

/* =========================
UTIL: VALIDATE INPUT (STRICT)
========================= */
function validate(body){

  if(!body || typeof body !== "object")
    return "Invalid body"

  if(typeof body.defaultServer !== "string")
    return "defaultServer required"

  if(typeof body.mode !== "string")
    return "mode required"

  if(!body.ui || typeof body.ui !== "object")
    return "ui object required"

  if(!body.security || typeof body.security !== "object")
    return "security object required"

  return null
}

/* =========================
GET PLAYER SETTINGS
========================= */
app.get("/player", verifyAdmin, async (c)=>{

  try{

    const db = c.env.DB

    await ensureRow(db)

    const r = await db
      .prepare("SELECT * FROM player_settings WHERE id=1")
      .first()

    if(!r){
      return c.json({ success:false, error:"Config missing" },500)
    }

    return c.json({

      success:true,

      defaultServer: r.default_server || "Server 1",

      autoplay: !!r.autoplay,
      resume: !!r.resume,
      autoswitch: !!r.autoswitch,

      mode: r.mode || "responsive",

      ui:{
        servers: !!r.ui_servers,
        download: !!r.ui_download,
        subscribe: !!r.ui_subscribe,
        related: !!r.ui_related
      },

      security:{
        embedOnly: !!r.sec_embed_only,
        cloudflare: !!r.sec_cloudflare,
        sandbox: !!r.sec_sandbox,
        referrer: r.sec_referrer || "strict-origin"
      }

    })

  }catch(e){

    console.error("GET PLAYER ERROR:", e)

    return c.json({
      success:false,
      error:"Failed to load player settings"
    },500)

  }

})

/* =========================
UPDATE PLAYER SETTINGS
========================= */
app.post("/player", verifyAdmin, async (c)=>{

  try{

    let body

    try{
      body = await c.req.json()
    }catch{
      return c.json({ success:false, error:"Invalid JSON" },400)
    }

    const db = c.env.DB

    const err = validate(body)
    if(err){
      return c.json({ success:false, error:err },400)
    }

    await ensureRow(db)

    await db.prepare(`
      UPDATE player_settings SET

        default_server = ?,

        autoplay = ?,
        resume = ?,
        autoswitch = ?,

        mode = ?,

        ui_servers = ?,
        ui_download = ?,
        ui_subscribe = ?,
        ui_related = ?,

        sec_embed_only = ?,
        sec_cloudflare = ?,
        sec_sandbox = ?,
        sec_referrer = ?,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = 1
    `).bind(

      body.defaultServer,

      toBool(body.autoplay) ? 1 : 0,
      toBool(body.resume) ? 1 : 0,
      toBool(body.autoswitch) ? 1 : 0,

      body.mode,

      toBool(body.ui?.servers) ? 1 : 0,
      toBool(body.ui?.download) ? 1 : 0,
      toBool(body.ui?.subscribe) ? 1 : 0,
      toBool(body.ui?.related) ? 1 : 0,

      toBool(body.security?.embedOnly) ? 1 : 0,
      toBool(body.security?.cloudflare) ? 1 : 0,
      toBool(body.security?.sandbox) ? 1 : 0,
      body.security?.referrer || "strict-origin"

    ).run()

    return c.json({ success:true })

  }catch(e){

    console.error("SAVE PLAYER ERROR:", e)

    return c.json({
      success:false,
      error:"Failed to save player settings"
    },500)

  }

})

/* =========================
RESET PLAYER SETTINGS
========================= */
app.post("/player/reset", verifyAdmin, async (c)=>{

  try{

    const db = c.env.DB

    await ensureRow(db)

    await db.prepare(`
      UPDATE player_settings SET

        default_server = 'Server 1',

        autoplay = 1,
        resume = 1,
        autoswitch = 1,

        mode = 'responsive',

        ui_servers = 1,
        ui_download = 1,
        ui_subscribe = 1,
        ui_related = 1,

        sec_embed_only = 0,
        sec_cloudflare = 0,
        sec_sandbox = 1,
        sec_referrer = 'strict-origin',

        updated_at = CURRENT_TIMESTAMP

      WHERE id = 1
    `).run()

    return c.json({ success:true })

  }catch(e){

    console.error("RESET PLAYER ERROR:", e)

    return c.json({
      success:false,
      error:"Reset failed"
    },500)

  }

})

/* =========================
HEALTH CHECK
========================= */
app.get("/player/health", async (c)=>{

  try{

    const db = c.env.DB

    const row = await db
      .prepare("SELECT COUNT(*) as total FROM player_settings")
      .first()

    return c.json({
      success:true,
      total: row?.total || 0
    })

  }catch(e){

    return c.json({
      success:false,
      error:e.message
    },500)

  }

})

export default app
