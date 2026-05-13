/* =========================================================
   src/routes/ads.js
   ⚡ PART 1 — CORE + HELPERS
========================================================= */

import { Hono } from "hono"

import { verifyAdmin }
from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================================================
   HELPERS
========================================================= */

/* =========================================================
   SAFE JSON PARSE
========================================================= */

function jsonParse(
  value,
  fallback=[]
){

  try{

    return JSON.parse(
      value || "[]"
    )

  }catch{

    return fallback

  }

}

/* =========================================================
   UUID
========================================================= */

function uuid(){

  return crypto.randomUUID()

}

/* =========================================================
   RANDOM PICK
========================================================= */

function randomPick(arr){

  if(!arr?.length){

    return null

  }

  return arr[
    Math.floor(
      Math.random() * arr.length
    )
  ]

}

/* =========================================================
   WEIGHTED RANDOM
========================================================= */

function weightedPick(items){

  if(!items?.length){

    return null

  }

  /* =========================
     TOTAL
  ========================= */

  const total =
  items.reduce((sum,item)=>{

    return (
      sum +
      Number(
        item.weight || 1
      )
    )

  },0)

  /* =========================
     RANDOM
  ========================= */

  let random =
  Math.random() * total

  /* =========================
     PICK
  ========================= */

  for(const item of items){

    random -= Number(
      item.weight || 1
    )

    if(random <= 0){

      return item

    }

  }

  return items[0]

}

/* =========================================================
   SEQUENCE PICK
========================================================= */

function sequencePick(
  items,
  clicks=0
){

  if(!items?.length){

    return null

  }

  const index =
  clicks % items.length

  return items[index]

}

/* =========================================================
   MODE PICKER
========================================================= */

function pickByMode(
  items,
  mode="random",
  clicks=0
){

  if(!items?.length){

    return null

  }

  /* =========================
     DIRECT
  ========================= */

  if(mode === "direct"){

    return items[0]

  }

  /* =========================
     SEQUENCE
  ========================= */

  if(mode === "sequence"){

    return sequencePick(
      items,
      clicks
    )

  }

  /* =========================
     RANDOM
  ========================= */

  return weightedPick(items)

}

/* =========================================================
   RESPONSE
========================================================= */

function success(
  data={}
){

  return {
    success:true,
    ...data
  }

}

function failure(
  error="Something went wrong"
){

  return {
    success:false,
    error
  }

}

/* =========================================================
   GET BODY
========================================================= */

async function getBody(c){

  try{

    return await c.req.json()

  }catch{

    return {}

  }

}

/* =========================================================
   VALIDATION
========================================================= */

function required(
  value
){

  return (
    value &&
    String(value)
    .trim()
    .length
  )

}

/* =========================================================
   ANALYTICS
========================================================= */

async function trackEvent(

  db,

  type,

  meta={}

){

  try{

    await db.prepare(`

      INSERT INTO monetization_analytics (

        id,
        type,
        meta,
        created_at

      )

      VALUES (

        ?,?,?,datetime('now')

      )

    `)
    .bind(

      uuid(),

      type,

      JSON.stringify(meta)

    )
    .run()

  }catch(err){

    console.error(
      "Analytics Error",
      err
    )

  }

}

/* =========================================================
   GET IDS PLACEHOLDER
========================================================= */

function placeholders(arr){

  return arr
  .map(()=>"?")
  .join(",")

}

/* =========================================================
   LOAD ADS BY IDS
========================================================= */

async function getAds(

  db,
  ids=[]

){

  if(!ids.length){

    return []

  }

  const { results } =
  await db.prepare(`

    SELECT *

    FROM ads_library

    WHERE id IN (${placeholders(ids)})

  `)
  .bind(...ids)
  .all()

  return results || []

}

/* =========================================================
   LOAD SHORTLINKS BY IDS
========================================================= */

async function getShortlinks(

  db,
  ids=[]

){

  if(!ids.length){

    return []

  }

  const { results } =
  await db.prepare(`

    SELECT *

    FROM shortlinks_library

    WHERE id IN (${placeholders(ids)})

  `)
  .bind(...ids)
  .all()

  return results || []

}

/* =========================================================
   LOAD POPUPS BY IDS
========================================================= */

async function getPopups(

  db,
  ids=[]

){

  if(!ids.length){

    return []

  }

  const { results } =
  await db.prepare(`

    SELECT *

    FROM popup_library

    WHERE id IN (${placeholders(ids)})

  `)
  .bind(...ids)
  .all()

  return results || []

}

/* =========================================================
   EXPORT
========================================================= */

export default app

/* =========================================================
   ⚡ PART 2 — ADS LIBRARY APIs
========================================================= */

/* =========================================================
   GET ADS
========================================================= */

app.get(

  "/ads-library",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    try{

      const { results } =
      await db.prepare(`

        SELECT *

        FROM ads_library

        ORDER BY created_at DESC

      `).all()

      return c.json(
        results || []
      )

    }catch(err){

      console.error(err)

      return c.json(
        failure(
          "Failed to load ads"
        ),
        500
      )

    }

})

/* =========================================================
   CREATE AD
========================================================= */

app.post(

  "/ads-library",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(

      !required(body.name) ||

      !required(body.type) ||

      !required(body.code)

    ){

      return c.json(

        failure(
          "Missing required fields"
        ),

        400

      )

    }

    try{

      /* =========================
         DUPLICATE CHECK
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM ads_library

        WHERE LOWER(name)=LOWER(?)

        LIMIT 1

      `)
      .bind(body.name)
      .first()

      if(exists){

        return c.json(

          failure(
            "Ad already exists"
          ),

          400

        )

      }

      /* =========================
         INSERT
      ========================= */

      const id =
      uuid()

      await db.prepare(`

        INSERT INTO ads_library (

          id,
          name,
          type,
          code,
          delay,
          weight,
          created_at

        )

        VALUES (

          ?,?,?,?,?,?,
          datetime('now')

        )

      `)
      .bind(

        id,

        body.name,

        body.type,

        body.code,

        Number(
          body.delay || 0
        ),

        Number(
          body.weight || 1
        )

      )
      .run()

      return c.json(

        success({
          id
        })

      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to create ad"
        ),

        500

      )

    }

})

/* =========================================================
   UPDATE AD
========================================================= */

app.put(

  "/ads-library/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(

      !required(body.name) ||

      !required(body.type) ||

      !required(body.code)

    ){

      return c.json(

        failure(
          "Missing required fields"
        ),

        400

      )

    }

    try{

      /* =========================
         EXISTS
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM ads_library

        WHERE id=?

        LIMIT 1

      `)
      .bind(id)
      .first()

      if(!exists){

        return c.json(

          failure(
            "Ad not found"
          ),

          404

        )

      }

      /* =========================
         UPDATE
      ========================= */

      await db.prepare(`

        UPDATE ads_library

        SET

          name=?,
          type=?,
          code=?,
          delay=?,
          weight=?

        WHERE id=?

      `)
      .bind(

        body.name,

        body.type,

        body.code,

        Number(
          body.delay || 0
        ),

        Number(
          body.weight || 1
        ),

        id

      )
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to update ad"
        ),

        500

      )

    }

})

/* =========================================================
   DELETE AD
========================================================= */

app.delete(

  "/ads-library/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    try{

      /* =========================
         DELETE
      ========================= */

      await db.prepare(`

        DELETE FROM ads_library

        WHERE id=?

      `)
      .bind(id)
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to delete ad"
        ),

        500

      )

    }

})

/* =========================================================
   ⚡ PART 3 — SHORTLINKS APIs
========================================================= */

/* =========================================================
   GET SHORTLINKS
========================================================= */

app.get(

  "/shortlinks-library",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    try{

      const { results } =
      await db.prepare(`

        SELECT *

        FROM shortlinks_library

        ORDER BY created_at DESC

      `).all()

      return c.json(
        results || []
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to load shortlinks"
        ),

        500

      )

    }

})

/* =========================================================
   CREATE SHORTLINK
========================================================= */

app.post(

  "/shortlinks-library",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(

      !required(body.name) ||

      !required(body.base_url)

    ){

      return c.json(

        failure(
          "Missing required fields"
        ),

        400

      )

    }

    try{

      /* =========================
         DUPLICATE CHECK
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM shortlinks_library

        WHERE LOWER(name)=LOWER(?)

        LIMIT 1

      `)
      .bind(body.name)
      .first()

      if(exists){

        return c.json(

          failure(
            "Shortlink already exists"
          ),

          400

        )

      }

      /* =========================
         INSERT
      ========================= */

      const id =
      uuid()

      await db.prepare(`

        INSERT INTO shortlinks_library (

          id,
          name,
          base_url,
          api_key,
          created_at

        )

        VALUES (

          ?,?,?,?,
          datetime('now')

        )

      `)
      .bind(

        id,

        body.name,

        body.base_url,

        body.api_key || null

      )
      .run()

      return c.json(

        success({
          id
        })

      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to create shortlink"
        ),

        500

      )

    }

})

/* =========================================================
   UPDATE SHORTLINK
========================================================= */

app.put(

  "/shortlinks-library/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(

      !required(body.name) ||

      !required(body.base_url)

    ){

      return c.json(

        failure(
          "Missing required fields"
        ),

        400

      )

    }

    try{

      /* =========================
         EXISTS
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM shortlinks_library

        WHERE id=?

        LIMIT 1

      `)
      .bind(id)
      .first()

      if(!exists){

        return c.json(

          failure(
            "Shortlink not found"
          ),

          404

        )

      }

      /* =========================
         UPDATE
      ========================= */

      await db.prepare(`

        UPDATE shortlinks_library

        SET

          name=?,
          base_url=?,
          api_key=?

        WHERE id=?

      `)
      .bind(

        body.name,

        body.base_url,

        body.api_key || null,

        id

      )
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to update shortlink"
        ),

        500

      )

    }

})

/* =========================================================
   DELETE SHORTLINK
========================================================= */

app.delete(

  "/shortlinks-library/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    try{

      /* =========================
         DELETE
      ========================= */

      await db.prepare(`

        DELETE FROM shortlinks_library

        WHERE id=?

      `)
      .bind(id)
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to delete shortlink"
        ),

        500

      )

    }

})

/* =========================================================
   ⚡ PART 4 — POPUP APIs
========================================================= */

/* =========================================================
   GET POPUPS
========================================================= */

app.get(

  "/popup-library",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    try{

      const { results } =
      await db.prepare(`

        SELECT *

        FROM popup_library

        ORDER BY created_at DESC

      `).all()

      return c.json(
        results || []
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to load popups"
        ),

        500

      )

    }

})

/* =========================================================
   CREATE POPUP
========================================================= */

app.post(

  "/popup-library",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(

      !required(body.name) ||

      !required(body.script)

    ){

      return c.json(

        failure(
          "Missing required fields"
        ),

        400

      )

    }

    try{

      /* =========================
         DUPLICATE CHECK
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM popup_library

        WHERE LOWER(name)=LOWER(?)

        LIMIT 1

      `)
      .bind(body.name)
      .first()

      if(exists){

        return c.json(

          failure(
            "Popup already exists"
          ),

          400

        )

      }

      /* =========================
         INSERT
      ========================= */

      const id =
      uuid()

      await db.prepare(`

        INSERT INTO popup_library (

          id,
          name,
          script,
          created_at

        )

        VALUES (

          ?,?,?,
          datetime('now')

        )

      `)
      .bind(

        id,

        body.name,

        body.script

      )
      .run()

      return c.json(

        success({
          id
        })

      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to create popup"
        ),

        500

      )

    }

})

/* =========================================================
   UPDATE POPUP
========================================================= */

app.put(

  "/popup-library/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(

      !required(body.name) ||

      !required(body.script)

    ){

      return c.json(

        failure(
          "Missing required fields"
        ),

        400

      )

    }

    try{

      /* =========================
         EXISTS
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM popup_library

        WHERE id=?

        LIMIT 1

      `)
      .bind(id)
      .first()

      if(!exists){

        return c.json(

          failure(
            "Popup not found"
          ),

          404

        )

      }

      /* =========================
         UPDATE
      ========================= */

      await db.prepare(`

        UPDATE popup_library

        SET

          name=?,
          script=?

        WHERE id=?

      `)
      .bind(

        body.name,

        body.script,

        id

      )
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to update popup"
        ),

        500

      )

    }

})

/* =========================================================
   DELETE POPUP
========================================================= */

app.delete(

  "/popup-library/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    try{

      /* =========================
         DELETE
      ========================= */

      await db.prepare(`

        DELETE FROM popup_library

        WHERE id=?

      `)
      .bind(id)
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to delete popup"
        ),

        500

      )

    }

})
/* =========================================================
   ⚡ PART 5 — HOST MONETIZATION APIs
========================================================= */

/* =========================================================
   GET HOST CONFIGS
========================================================= */

app.get(

  "/host-monetization",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    try{

      /* =========================
         HOSTS
      ========================= */

      const { results:hosts } =
      await db.prepare(`

        SELECT *

        FROM host_monetization

        ORDER BY host ASC

      `).all()

      if(!hosts?.length){

        return c.json([])

      }

      /* =====================================================
         BUILD
      ===================================================== */

      const final = []

      for(const host of hosts){

        /* =========================
           IDS
        ========================= */

        const adsIds =
        jsonParse(
          host.ads
        )

        const shortIds =
        jsonParse(
          host.shortlinks
        )

        const popupIds =
        jsonParse(
          host.popups
        )

        /* =========================
           LOAD DATA
        ========================= */

        const ads =
        await getAds(
          db,
          adsIds
        )

        const shortlinks =
        await getShortlinks(
          db,
          shortIds
        )

        const popups =
        await getPopups(
          db,
          popupIds
        )

        final.push({

          id:
          host.id,

          host:
          host.host,

          storage:
          host.storage,

          knight:
          !!host.knight,

          mode:
          host.mode || "random",

          clicks:
          Number(
            host.clicks || 0
          ),

          ads,

          shortlinks,

          popups

        })

      }

      return c.json(final)

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to load hosts"
        ),

        500

      )

    }

})

/* =========================================================
   CREATE HOST CONFIG
========================================================= */

app.post(

  "/host-monetization",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(
      !required(body.host)
    ){

      return c.json(

        failure(
          "Host name required"
        ),

        400

      )

    }

    try{

      /* =========================
         DUPLICATE CHECK
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM host_monetization

        WHERE LOWER(host)=LOWER(?)

        LIMIT 1

      `)
      .bind(body.host)
      .first()

      if(exists){

        return c.json(

          failure(
            "Host already exists"
          ),

          400

        )

      }

      /* =========================
         INSERT
      ========================= */

      const id =
      uuid()

      await db.prepare(`

        INSERT INTO host_monetization (

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

        VALUES (

          ?,?,?,?,?,?,?,?,?,
          datetime('now')

        )

      `)
      .bind(

        id,

        body.host,

        body.storage || null,

        Number(
          body.knight || 0
        ),

        JSON.stringify(
          body.ads || []
        ),

        JSON.stringify(
          body.shortlinks || []
        ),

        JSON.stringify(
          body.popups || []
        ),

        body.mode || "random",

        0

      )
      .run()

      return c.json(

        success({
          id
        })

      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to create host"
        ),

        500

      )

    }

})

/* =========================================================
   UPDATE HOST CONFIG
========================================================= */

app.put(

  "/host-monetization/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    const body =
    await getBody(c)

    /* =========================
       VALIDATION
    ========================= */

    if(
      !required(body.host)
    ){

      return c.json(

        failure(
          "Host name required"
        ),

        400

      )

    }

    try{

      /* =========================
         EXISTS
      ========================= */

      const exists =
      await db.prepare(`

        SELECT id

        FROM host_monetization

        WHERE id=?

        LIMIT 1

      `)
      .bind(id)
      .first()

      if(!exists){

        return c.json(

          failure(
            "Host not found"
          ),

          404

        )

      }

      /* =========================
         UPDATE
      ========================= */

      await db.prepare(`

        UPDATE host_monetization

        SET

          host=?,
          storage=?,
          knight=?,
          ads=?,
          shortlinks=?,
          popups=?,
          mode=?

        WHERE id=?

      `)
      .bind(

        body.host,

        body.storage || null,

        Number(
          body.knight || 0
        ),

        JSON.stringify(
          body.ads || []
        ),

        JSON.stringify(
          body.shortlinks || []
        ),

        JSON.stringify(
          body.popups || []
        ),

        body.mode || "random",

        id

      )
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to update host"
        ),

        500

      )

    }

})

/* =========================================================
   DELETE HOST CONFIG
========================================================= */

app.delete(

  "/host-monetization/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const id =
    c.req.param("id")

    try{

      /* =========================
         DELETE
      ========================= */

      await db.prepare(`

        DELETE FROM host_monetization

        WHERE id=?

      `)
      .bind(id)
      .run()

      return c.json(
        success()
      )

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to delete host"
        ),

        500

      )

    }

})
/* =========================================================
   ⚡ PART 6 — /api/go FLOW ENGINE
========================================================= */

/* =========================================================
   PUBLIC
   GO ROUTER
========================================================= */

app.get(

  "/go",

  async(c)=>{

    const db =
    c.env.DB

    /* =====================================================
       PARAMS
    ===================================================== */

    const hostId =
    c.req.query("host_id")

    const quality =
    c.req.query("quality") || ""

    const step =
    Number(
      c.req.query("step") || 1
    )

    /* =====================================================
       VALIDATION
    ===================================================== */

    if(!hostId){

      return c.text(
        "Missing host"
      )

    }

    /* =====================================================
       HOST
    ===================================================== */

    const host =
    await db.prepare(`

      SELECT *

      FROM download_hosts

      WHERE id=?

      LIMIT 1

    `)
    .bind(hostId)
    .first()

    if(!host){

      return c.text(
        "Host not found"
      )

    }

    /* =====================================================
       MONETIZATION
    ===================================================== */

    let monetization = null

    if(host.monetization_id){

      monetization =
      await db.prepare(`

        SELECT *

        FROM host_monetization

        WHERE id=?

        LIMIT 1

      `)
      .bind(
        host.monetization_id
      )
      .first()

    }

    /* =====================================================
       NO MONETIZATION
    ===================================================== */

    if(!monetization){

      return c.redirect(

        `/api/download-final?host_id=${hostId}&quality=${quality}`

      )

    }

    /* =====================================================
       IDS
    ===================================================== */

    const adsIds =
    jsonParse(
      monetization.ads
    )

    const shortIds =
    jsonParse(
      monetization.shortlinks
    )

    const popupIds =
    jsonParse(
      monetization.popups
    )

    /* =====================================================
       MODE
    ===================================================== */

    const mode =
    monetization.mode || "random"

    const clicks =
    Number(
      monetization.clicks || 0
    )

    /* =====================================================
       STEP 1 — POPUPS
    ===================================================== */

    if(
      step === 1 &&
      popupIds.length
    ){

      const popups =
      await getPopups(
        db,
        popupIds
      )

      const popup =
      pickByMode(
        popups,
        mode,
        clicks
      )

      if(popup){

        /* =========================
           ANALYTICS
        ========================= */

        await trackEvent(

          db,

          "popup_open",

          {

            host_id:
            hostId,

            popup_id:
            popup.id

          }

        )

        return c.html(`

<!DOCTYPE html>
<html>
<head>

<title>
Popup Redirect
</title>

<meta
name="viewport"
content="width=device-width,initial-scale=1"
/>

<style>

body{
  margin:0;
  background:#000;
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:100vh;
  font-family:system-ui;
}

.loader{
  text-align:center;
}

.loader h2{
  margin-bottom:12px;
}

.loader p{
  color:#999;
  font-size:14px;
}

</style>

</head>

<body>

<div class="loader">

<h2>
Please Wait...
</h2>

<p>
Loading Popup
</p>

</div>

${popup.script}

<script>

setTimeout(()=>{

  location.href =

  "/api/go?host_id=${hostId}&quality=${quality}&step=2"

},1000)

</script>

</body>
</html>

        `)

      }

    }

    /* =====================================================
       STEP 2 — SHORTLINKS
    ===================================================== */

    if(
      step === 2 &&
      shortIds.length
    ){

      const shortlinks =
      await getShortlinks(
        db,
        shortIds
      )

      const short =
      pickByMode(
        shortlinks,
        mode,
        clicks
      )

      if(short){

        /* =========================
           ANALYTICS
        ========================= */

        await trackEvent(

          db,

          "shortlink_click",

          {

            host_id:
            hostId,

            shortlink_id:
            short.id

          }

        )

        /* =========================
           TARGET
        ========================= */

        const target =

          encodeURIComponent(

            `/api/go?host_id=${hostId}&quality=${quality}&step=3`

          )

        /* =========================
           REDIRECT
        ========================= */

        return c.redirect(

          `${short.base_url}${target}`

        )

      }

    }

    /* =====================================================
       STEP 3 — ADS
    ===================================================== */

    if(
      step === 3 &&
      adsIds.length
    ){

      const ads =
      await getAds(
        db,
        adsIds
      )

      const ad =
      pickByMode(
        ads,
        mode,
        clicks
      )

      if(ad){

        /* =========================
           ANALYTICS
        ========================= */

        await trackEvent(

          db,

          "ad_open",

          {

            host_id:
            hostId,

            ad_id:
            ad.id

          }

        )

        /* =================================================
           REDIRECT
        ================================================= */

        if(
          ad.type === "redirect"
        ){

          return c.redirect(
            ad.code
          )

        }

        /* =================================================
           SCRIPT
        ================================================= */

        return c.html(`

<!DOCTYPE html>
<html>
<head>

<title>
Advertisement
</title>

<meta
name="viewport"
content="width=device-width,initial-scale=1"
/>

<style>

body{
  margin:0;
  background:#000;
  color:#fff;
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:100vh;
  font-family:system-ui;
}

.loader{
  text-align:center;
}

.loader h2{
  margin-bottom:10px;
}

.loader p{
  color:#999;
}

</style>

</head>

<body>

<div class="loader">

<h2>
Loading Ad...
</h2>

<p>
Please wait
</p>

</div>

<script>

${ad.code}

setTimeout(()=>{

  location.href =

  "/api/go?host_id=${hostId}&quality=${quality}&step=4"

}, ${Number(ad.delay || 1500)})

</script>

</body>
</html>

        `)

      }

    }

    /* =====================================================
       STEP 4 — KNIGHT / FINAL
    ===================================================== */

    if(step === 4){

      /* =========================
         KNIGHT
      ========================= */

      if(host.knight){

        return c.redirect(

          `/knight.html?host_id=${hostId}`

        )

      }

      /* =========================
         FINAL
      ========================= */

      return c.redirect(

        `/api/download-final?host_id=${hostId}&quality=${quality}`

      )

    }

    /* =====================================================
       FALLBACK
    ===================================================== */

    return c.redirect(

      `/api/download-final?host_id=${hostId}&quality=${quality}`

    )

})

/* =========================================================
   FINAL DOWNLOAD
========================================================= */

app.get(

  "/download-final",

  async(c)=>{

    const db =
    c.env.DB

    /* =====================================================
       PARAMS
    ===================================================== */

    const hostId =
    c.req.query("host_id")

    const quality =
    c.req.query("quality")

    if(!hostId){

      return c.text(
        "Missing host"
      )

    }

    /* =====================================================
       FIND LINK
    ===================================================== */

    let row = null

    /* =========================
       QUALITY
    ========================= */

    if(quality){

      row =
      await db.prepare(`

        SELECT *

        FROM download_links

        WHERE

          host_id=?
          AND quality=?

        LIMIT 1

      `)
      .bind(
        hostId,
        quality
      )
      .first()

    }

    /* =========================
       NORMAL
    ========================= */

    else{

      row =
      await db.prepare(`

        SELECT *

        FROM download_links

        WHERE host_id=?

        LIMIT 1

      `)
      .bind(hostId)
      .first()

    }

    /* =====================================================
       NOT FOUND
    ===================================================== */

    if(!row){

      return c.text(
        "Download not found"
      )

    }

    /* =====================================================
       UPDATE CLICKS
    ===================================================== */

    await db.prepare(`

      UPDATE host_monetization

      SET clicks = clicks + 1

      WHERE id=(

        SELECT monetization_id

        FROM download_hosts

        WHERE id=?

      )

    `)
    .bind(hostId)
    .run()

    /* =====================================================
       ANALYTICS
    ===================================================== */

    await trackEvent(

      db,

      "final_download",

      {

        host_id:
        hostId,

        quality:
        quality || null

      }

    )

    /* =====================================================
       REDIRECT
    ===================================================== */

    return c.redirect(
      row.link
    )

})
/* =========================================================
   ⚡ PART 7 — FLOW HELPERS + ANALYTICS HELPERS
========================================================= */

/* =========================================================
   PARSE JSON
========================================================= */

function jsonParse(
  value,
  fallback=[]
){

  try{

    return JSON.parse(
      value || "[]"
    )

  }catch{

    return fallback

  }

}

/* =========================================================
   UUID
========================================================= */

function uuid(){

  return crypto.randomUUID()

}

/* =========================================================
   BODY
========================================================= */

async function getBody(c){

  try{

    return await c.req.json()

  }catch{

    return {}

  }

}

/* =========================================================
   REQUIRED
========================================================= */

function required(v){

  return !!String(
    v || ""
  ).trim()

}

/* =========================================================
   SUCCESS
========================================================= */

function success(data={}){

  return {

    success:true,

    ...data

  }

}

/* =========================================================
   FAILURE
========================================================= */

function failure(message){

  return {

    success:false,

    message

  }

}

/* =========================================================
   RANDOM PICK
========================================================= */

function randomPick(arr=[]){

  if(!arr?.length){

    return null

  }

  return arr[
    Math.floor(
      Math.random() * arr.length
    )
  ]

}

/* =========================================================
   SEQUENCE PICK
========================================================= */

function sequencePick(
  arr=[],
  clicks=0
){

  if(!arr?.length){

    return null

  }

  const index =
  clicks % arr.length

  return arr[index]

}

/* =========================================================
   PICK BY MODE
========================================================= */

function pickByMode(
  arr=[],
  mode="random",
  clicks=0
){

  if(!arr?.length){

    return null

  }

  /* =========================
     DIRECT
  ========================= */

  if(mode === "direct"){

    return arr[0]

  }

  /* =========================
     SEQUENCE
  ========================= */

  if(mode === "sequence"){

    return sequencePick(
      arr,
      clicks
    )

  }

  /* =========================
     RANDOM
  ========================= */

  return randomPick(arr)

}

/* =========================================================
   GET ADS
========================================================= */

async function getAds(
  db,
  ids=[]
){

  if(!ids?.length){

    return []

  }

  const placeholders =
  ids.map(()=>"?").join(",")

  const { results } =
  await db.prepare(`

    SELECT *

    FROM ads_library

    WHERE id IN (${placeholders})

  `)
  .bind(...ids)
  .all()

  return results || []

}

/* =========================================================
   GET SHORTLINKS
========================================================= */

async function getShortlinks(
  db,
  ids=[]
){

  if(!ids?.length){

    return []

  }

  const placeholders =
  ids.map(()=>"?").join(",")

  const { results } =
  await db.prepare(`

    SELECT *

    FROM shortlinks_library

    WHERE id IN (${placeholders})

  `)
  .bind(...ids)
  .all()

  return results || []

}

/* =========================================================
   GET POPUPS
========================================================= */

async function getPopups(
  db,
  ids=[]
){

  if(!ids?.length){

    return []

  }

  const placeholders =
  ids.map(()=>"?").join(",")

  const { results } =
  await db.prepare(`

    SELECT *

    FROM popup_library

    WHERE id IN (${placeholders})

  `)
  .bind(...ids)
  .all()

  return results || []

}

/* =========================================================
   TRACK EVENT
========================================================= */

async function trackEvent(

  db,

  type,

  meta={}

){

  try{

    await db.prepare(`

      INSERT INTO monetization_analytics (

        id,
        type,
        meta,
        created_at

      )

      VALUES (

        ?,?,?,datetime('now')

      )

    `)
    .bind(

      uuid(),

      type,

      JSON.stringify(meta)

    )
    .run()

  }catch(err){

    console.error(
      "Analytics Error",
      err
    )

  }

}

/* =========================================================
   TOTAL ANALYTICS
========================================================= */

app.get(

  "/analytics-summary",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    try{

      /* =========================
         HOSTS
      ========================= */

      const hosts =
      await db.prepare(`

        SELECT COUNT(*) as total

        FROM host_monetization

      `).first()

      /* =========================
         ADS
      ========================= */

      const ads =
      await db.prepare(`

        SELECT COUNT(*) as total

        FROM ads_library

      `).first()

      /* =========================
         SHORTLINKS
      ========================= */

      const shortlinks =
      await db.prepare(`

        SELECT COUNT(*) as total

        FROM shortlinks_library

      `).first()

      /* =========================
         DOWNLOADS
      ========================= */

      const downloads =
      await db.prepare(`

        SELECT COUNT(*) as total

        FROM monetization_analytics

        WHERE type='final_download'

      `).first()

      return c.json({

        total_hosts:
        Number(
          hosts?.total || 0
        ),

        total_ads:
        Number(
          ads?.total || 0
        ),

        total_shortlinks:
        Number(
          shortlinks?.total || 0
        ),

        total_downloads:
        Number(
          downloads?.total || 0
        )

      })

    }catch(err){

      console.error(err)

      return c.json(

        failure(
          "Failed to load analytics"
        ),

        500

      )

    }

})
