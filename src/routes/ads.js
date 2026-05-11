/* =========================================================
   src/routes/adsSystem.js
   FINAL MONETIZATION + HOST ENGINE
========================================================= */

import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================================================
   HELPERS
========================================================= */

function jsonParse(v, fallback = []){

  try{

    return JSON.parse(v || "[]")

  }catch{

    return fallback

  }

}

function randomPick(arr){

  if(!arr?.length) return null

  return arr[
    Math.floor(Math.random() * arr.length)
  ]

}

/* =========================================================
   ADS LIBRARY
========================================================= */

/* ================= GET ================= */

app.get("/ads-library", verifyAdmin, async(c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM ads_library
    ORDER BY created_at DESC
  `).all()

  return c.json(results)

})

/* ================= CREATE ================= */

app.post("/ads-library", verifyAdmin, async(c)=>{

  const body = await c.req.json()

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO ads_library
    (
      id,
      name,
      type,
      code,
      delay,
      weight,
      created_at
    )

    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `)
  .bind(

    id,
    body.name,
    body.type,
    body.code,
    body.delay || 0,
    body.weight || 1

  )
  .run()

  return c.json({

    success:true,
    id

  })

})

/* ================= DELETE ================= */

app.delete("/ads-library/:id", verifyAdmin, async(c)=>{

  await c.env.DB.prepare(`
    DELETE FROM ads_library
    WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run()

  return c.json({

    success:true

  })

})

/* =========================================================
   SHORTLINK LIBRARY
========================================================= */

/* ================= GET ================= */

app.get("/shortlinks-library", verifyAdmin, async(c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM shortlinks_library
    ORDER BY created_at DESC
  `).all()

  return c.json(results)

})

/* ================= CREATE ================= */

app.post("/shortlinks-library", verifyAdmin, async(c)=>{

  const body = await c.req.json()

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO shortlinks_library
    (
      id,
      name,
      base_url,
      api_key,
      created_at
    )

    VALUES (?, ?, ?, ?, datetime('now'))
  `)
  .bind(

    id,
    body.name,
    body.base_url,
    body.api_key || null

  )
  .run()

  return c.json({

    success:true,
    id

  })

})

/* ================= DELETE ================= */

app.delete("/shortlinks-library/:id", verifyAdmin, async(c)=>{

  await c.env.DB.prepare(`
    DELETE FROM shortlinks_library
    WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run()

  return c.json({

    success:true

  })

})

/* =========================================================
   POPUP LIBRARY
========================================================= */

/* ================= GET ================= */

app.get("/popup-library", verifyAdmin, async(c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM popup_library
    ORDER BY created_at DESC
  `).all()

  return c.json(results)

})

/* ================= CREATE ================= */

app.post("/popup-library", verifyAdmin, async(c)=>{

  const body = await c.req.json()

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO popup_library
    (
      id,
      name,
      script,
      created_at
    )

    VALUES (?, ?, ?, datetime('now'))
  `)
  .bind(

    id,
    body.name,
    body.script

  )
  .run()

  return c.json({

    success:true,
    id

  })

})

/* ================= DELETE ================= */

app.delete("/popup-library/:id", verifyAdmin, async(c)=>{

  await c.env.DB.prepare(`
    DELETE FROM popup_library
    WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run()

  return c.json({

    success:true

  })

})

/* =========================================================
   HOST MONETIZATION
========================================================= */

/* ================= GET ================= */

app.get("/host-monetization", verifyAdmin, async(c)=>{

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM host_monetization
    ORDER BY host ASC
  `).all()

  const data = results.map(x=>({

    ...x,

    ads: jsonParse(x.ads),
    shortlinks: jsonParse(x.shortlinks),
    popups: jsonParse(x.popups)

  }))

  return c.json(data)

})

/* ================= CREATE ================= */

app.post("/host-monetization", verifyAdmin, async(c)=>{

  const body = await c.req.json()

  const id = crypto.randomUUID()

  await c.env.DB.prepare(`
    INSERT INTO host_monetization
    (
      id,
      host,
      storage,
      knight,
      ads,
      shortlinks,
      popups,
      mode,
      clicks,
      created_at
    )

    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)
  .bind(

    id,

    body.host,
    body.storage || null,

    body.knight ? 1 : 0,

    JSON.stringify(body.ads || []),

    JSON.stringify(body.shortlinks || []),

    JSON.stringify(body.popups || []),

    body.mode || "random",

    0

  )
  .run()

  return c.json({

    success:true,
    id

  })

})

/* ================= UPDATE ================= */

app.put("/host-monetization/:id", verifyAdmin, async(c)=>{

  const id = c.req.param("id")

  const body = await c.req.json()

  await c.env.DB.prepare(`
    UPDATE host_monetization

    SET

      ads=?,
      shortlinks=?,
      popups=?,
      mode=?

    WHERE id=?
  `)
  .bind(

    JSON.stringify(body.ads || []),

    JSON.stringify(body.shortlinks || []),

    JSON.stringify(body.popups || []),

    body.mode || "random",

    id

  )
  .run()

  return c.json({

    success:true

  })

})

/* ================= DELETE ================= */

app.delete("/host-monetization/:id", verifyAdmin, async(c)=>{

  await c.env.DB.prepare(`
    DELETE FROM host_monetization
    WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run()

  return c.json({

    success:true

  })

})

/* =========================================================
   PUBLIC DOWNLOAD FLOW ENGINE
========================================================= */

/*
   FLOW

   DOWNLOAD PAGE
      ↓
   HOST CLICK
      ↓
   ADS / SHORTLINK / POPUP
      ↓
   KNIGHT PAGE (OPTIONAL)
      ↓
   FINAL LINK
*/

/* =========================================================
   GET HOST CONFIG
========================================================= */

app.get("/download-flow", async(c)=>{

  const host = c.req.query("host")

  if(!host){

    return c.json({

      success:false

    },400)

  }

  const data = await c.env.DB.prepare(`
    SELECT *
    FROM host_monetization
    WHERE LOWER(host)=LOWER(?)
    LIMIT 1
  `)
  .bind(host)
  .first()

  if(!data){

    return c.json({

      success:false

    },404)

  }

  const adsIds = jsonParse(data.ads)
  const shortIds = jsonParse(data.shortlinks)
  const popupIds = jsonParse(data.popups)

  /* ================= LOAD ADS ================= */

  let ads = []

  if(adsIds.length){

    const placeholders = adsIds.map(()=>"?").join(",")

    const query = `
      SELECT *
      FROM ads_library
      WHERE id IN (${placeholders})
    `

    const { results } = await c.env.DB.prepare(query)
    .bind(...adsIds)
    .all()

    ads = results

  }

  /* ================= LOAD SHORTS ================= */

  let shortlinks = []

  if(shortIds.length){

    const placeholders = shortIds.map(()=>"?").join(",")

    const query = `
      SELECT *
      FROM shortlinks_library
      WHERE id IN (${placeholders})
    `

    const { results } = await c.env.DB.prepare(query)
    .bind(...shortIds)
    .all()

    shortlinks = results

  }

  /* ================= LOAD POPUPS ================= */

  let popups = []

  if(popupIds.length){

    const placeholders = popupIds.map(()=>"?").join(",")

    const query = `
      SELECT *
      FROM popup_library
      WHERE id IN (${placeholders})
    `

    const { results } = await c.env.DB.prepare(query)
    .bind(...popupIds)
    .all()

    popups = results

  }

  return c.json({

    success:true,

    host:{

      id:data.id,
      host:data.host,
      storage:data.storage,
      knight:!!data.knight,
      mode:data.mode

    },

    ads,

    shortlinks,

    popups

  })

})

/* =========================================================
   FINAL DOWNLOAD REDIRECT
========================================================= */

app.get("/download-final", async(c)=>{

  const anime = c.req.query("anime")
  const season = c.req.query("season")
  const episode = c.req.query("episode")
  const host = c.req.query("host")
  const quality = c.req.query("quality")

  const row = await c.env.DB.prepare(`
    SELECT *
    FROM downloads

    WHERE

      anime=?
      AND season=?
      AND episode=?
      AND LOWER(host)=LOWER(?)

      ${quality ? "AND quality=?" : ""}

    LIMIT 1
  `)
  .bind(

    ...(quality
      ? [anime, season, episode, host, quality]
      : [anime, season, episode, host]
    )

  )
  .first()

  if(!row){

    return c.text("Download not found")

  }

  /* ================= TRACK ================= */

  await c.env.DB.prepare(`
    UPDATE host_monetization
    SET clicks = clicks + 1
    WHERE LOWER(host)=LOWER(?)
  `)
  .bind(host)
  .run()

  return c.redirect(row.link)

})

/* =========================================================
   GO ROUTER
========================================================= */

app.get("/go", async(c)=>{

  const anime = c.req.query("anime")
  const season = c.req.query("season")
  const episode = c.req.query("episode")
  const host = c.req.query("host")
  const quality = c.req.query("quality")

  const step = Number(c.req.query("step") || 1)

  const data = await c.env.DB.prepare(`
    SELECT *
    FROM host_monetization
    WHERE LOWER(host)=LOWER(?)
    LIMIT 1
  `)
  .bind(host)
  .first()

  if(!data){

    return c.redirect(

      `/api/download-final?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality || ""}`

    )

  }

  const adsIds = jsonParse(data.ads)
  const popupIds = jsonParse(data.popups)
  const shortIds = jsonParse(data.shortlinks)

  /* =====================================================
     STEP 1 → POPUP
  ===================================================== */

  if(step === 1 && popupIds.length){

    const placeholders = popupIds.map(()=>"?").join(",")

    const { results } = await c.env.DB.prepare(`
      SELECT *
      FROM popup_library
      WHERE id IN (${placeholders})
    `)
    .bind(...popupIds)
    .all()

    const popup = randomPick(results)

    if(popup){

      return c.html(`

        <html>

        <body style="background:#000;color:#fff">

        ${popup.script}

        <script>

        setTimeout(()=>{

          location.href =
          "/api/go?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality || ""}&step=2"

        },1000)

        </script>

        </body>

        </html>

      `)

    }

  }

  /* =====================================================
     STEP 2 → SHORTLINK
  ===================================================== */

  if(step === 2 && shortIds.length){

    const placeholders = shortIds.map(()=>"?").join(",")

    const { results } = await c.env.DB.prepare(`
      SELECT *
      FROM shortlinks_library
      WHERE id IN (${placeholders})
    `)
    .bind(...shortIds)
    .all()

    const short = randomPick(results)

    if(short){

      return c.redirect(short.base_url)

    }

  }

  /* =====================================================
     STEP 3 → ADS
  ===================================================== */

  if(step === 3 && adsIds.length){

    const placeholders = adsIds.map(()=>"?").join(",")

    const { results } = await c.env.DB.prepare(`
      SELECT *
      FROM ads_library
      WHERE id IN (${placeholders})
      ORDER BY weight DESC
    `)
    .bind(...adsIds)
    .all()

    const ad = randomPick(results)

    if(ad){

      /* REDIRECT */

      if(ad.type === "redirect"){

        return c.redirect(ad.code)

      }

      /* SCRIPT */

      return c.html(`

        <html>

        <body style="background:#000;color:#fff;text-align:center;padding-top:100px">

        <h2>Please wait...</h2>

        <script>

        ${ad.code}

        setTimeout(()=>{

          location.href =
          "/api/go?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality || ""}&step=4"

        }, ${ad.delay || 1500})

        </script>

        </body>

        </html>

      `)

    }

  }

  /* =====================================================
     STEP 4 → KNIGHT
  ===================================================== */

  if(step === 4){

    if(data.knight){

      return c.redirect(

        `/knight.html?anime=${anime}&season=${season}&episode=${episode}&host=${host}`

      )

    }

    return c.redirect(

      `/api/download-final?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality || ""}`

    )

  }

  /* =====================================================
     STEP 99 → FINAL
  ===================================================== */

  if(step === 99){

    return c.redirect(

      `/api/download-final?anime=${anime}&season=${season}&episode=${episode}&host=${host}&quality=${quality || ""}`

    )

  }

  return c.text("Invalid Step")

})

export default app
