import { Hono } from "hono";
import { verifyAdmin } from "../middleware/adminAuth.js";

const app = new Hono();

/* =========================
FIELDS
========================= */

const fields = [
  "lazyLoad",
  "smartPreload",
  "assetMinify",
  "imgOptimize",

  "jsOptimize",
  "cssOptimize",

  "smartCache",
  "mobilePriority",

  "cdnMode",
  "adaptiveLoad",

  "preconnect",
  "bandwidth"
];

/* =========================
HELPER
========================= */

const bool = (v) => (v ? 1 : 0);

/* =========================
ENSURE ROW EXISTS
========================= */

async function ensureRow(db){

  const row = await db
    .prepare("SELECT id FROM performance_settings WHERE id=1")
    .first();

  if(!row){

    await db.prepare(`
      INSERT INTO performance_settings (
        id,
        lazyLoad,
        smartPreload,
        assetMinify,
        imgOptimize,
        jsOptimize,
        cssOptimize,
        smartCache,
        mobilePriority,
        cdnMode,
        adaptiveLoad,
        preconnect,
        bandwidth
      )
      VALUES (1,1,1,1,1,1,1,1,1,0,1,1,0)
    `).run();

  }

}

/* =========================
ADMIN GET
========================= */

app.get("/performance", verifyAdmin, async (c) => {

  try{

    const db = c.env.DB;

    await ensureRow(db);

    const row = await db
      .prepare(`
        SELECT *
        FROM performance_settings
        WHERE id=1
      `)
      .first();

    const data = {};

    fields.forEach(f=>{
      data[f] = !!row[f];
    });

    return c.json(data);

  }catch(err){

    console.error(err);

    return c.json({
      error: "Failed to load settings"
    },500);

  }

});

/* =========================
ADMIN SAVE
========================= */

app.post("/performance", verifyAdmin, async (c) => {

  try{

    const db = c.env.DB;

    const body = await c.req.json();

    await ensureRow(db);

    await db.prepare(`
      UPDATE performance_settings
      SET

      lazyLoad=?,
      smartPreload=?,
      assetMinify=?,
      imgOptimize=?,

      jsOptimize=?,
      cssOptimize=?,

      smartCache=?,
      mobilePriority=?,

      cdnMode=?,
      adaptiveLoad=?,

      preconnect=?,
      bandwidth=?,

      updated_at=CURRENT_TIMESTAMP

      WHERE id=1
    `)
    .bind(

      bool(body.lazyLoad),
      bool(body.smartPreload),
      bool(body.assetMinify),
      bool(body.imgOptimize),

      bool(body.jsOptimize),
      bool(body.cssOptimize),

      bool(body.smartCache),
      bool(body.mobilePriority),

      bool(body.cdnMode),
      bool(body.adaptiveLoad),

      bool(body.preconnect),
      bool(body.bandwidth)

    )
    .run();

    return c.json({
      success:true
    });

  }catch(err){

    console.error(err);

    return c.json({
      error:"Failed to save"
    },500);

  }

});

/* =========================
PUBLIC API
========================= */

app.get("/performance/public", async (c)=>{

  try{

    const row = await c.env.DB
      .prepare(`
        SELECT

        lazyLoad,
        smartPreload,
        assetMinify,
        imgOptimize,

        jsOptimize,
        cssOptimize,

        smartCache,
        mobilePriority,

        cdnMode,
        adaptiveLoad,

        preconnect,
        bandwidth

        FROM performance_settings
        WHERE id=1
      `)
      .first();

    if(!row){
      return c.json({});
    }

    const data = {};

    fields.forEach(f=>{
      data[f] = !!row[f];
    });

    return c.json(data);

  }catch(err){

    console.error(err);

    return c.json({});

  }

});

export default app;
