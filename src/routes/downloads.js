/* =========================================================
   src/routes/downloads.js
   PART 1 — SETUP + HELPERS
========================================================= */

import { Hono } from "hono"

import { verifyAdmin }
from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================================================
   HELPERS
========================================================= */

/* =========================
   SAFE JSON
========================= */

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

/* =========================
   GROUP BY
========================= */

function groupBy(

  arr,

  key

){

  return arr.reduce((acc,item)=>{

    const value =
    item[key]

    if(!acc[value]){

      acc[value] = []

    }

    acc[value].push(item)

    return acc

  },{})

}

/* =========================
   UUID
========================= */

function uid(){

  return crypto.randomUUID()

}

/* =========================
   NUMBER
========================= */

function toNumber(v){

  if(v === null) return null

  if(v === undefined) return null

  if(v === "") return null

  return Number(v)

}

/* =========================================================
   ADMIN
   ANIME LIST
========================================================= */

app.get(

  "/anime-list",

  verifyAdmin,

  async(c)=>{

    const { results } =

    await c.env.DB.prepare(`

      SELECT

        id,
        title,
        slug,
        poster,
        type

      FROM anime

      ORDER BY title ASC

    `).all()

    return c.json(results)

})

/* =========================================================
   EXPORT
========================================================= */

export default app
/* =========================================================
   src/routes/downloads.js
   PART 2 — ADMIN GET DOWNLOADS
========================================================= */

/* =========================================================
   ADMIN
   GET DOWNLOADS
========================================================= */

app.get(

  "/downloads-v2",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    /* =====================================================
       ENTRIES
    ===================================================== */

    const { results:entries } =

    await db.prepare(`

      SELECT

        de.id,
        de.anime_id,
        de.content_type,
        de.season,
        de.episode,
        de.episode_title,
        de.created_at,

        a.title as anime_title,
        a.poster as anime_poster,
        a.slug as anime_slug,
        a.type as anime_type

      FROM download_entries de

      LEFT JOIN anime a
      ON a.id = de.anime_id

      ORDER BY

        a.title ASC,
        de.season ASC,
        de.episode ASC

    `).all()

    /* =====================================================
       EMPTY
    ===================================================== */

    if(!entries.length){

      return c.json([])

    }

    /* =====================================================
       ENTRY IDS
    ===================================================== */

    const entryIds =
    entries.map(x=>x.id)

    const placeholders =
    entryIds.map(()=>"?").join(",")

    /* =====================================================
       HOSTS
    ===================================================== */

    const { results:hosts } =

    await db.prepare(`

      SELECT

        dh.id,
        dh.entry_id,
        dh.host,
        dh.storage,
        dh.knight,
        dh.direct_download,
        dh.monetization_id,

        hm.mode,
        hm.ads,
        hm.shortlinks,
        hm.popups

      FROM download_hosts dh

      LEFT JOIN host_monetization hm
      ON hm.id = dh.monetization_id

      WHERE dh.entry_id IN (${placeholders})

    `)
    .bind(...entryIds)
    .all()

    /* =====================================================
       HOST IDS
    ===================================================== */

    const hostIds =
    hosts.map(x=>x.id)

    /* =====================================================
       LINKS
    ===================================================== */

    let links = []

    if(hostIds.length){

      const hostPlaceholders =

      hostIds.map(()=>"?")
      .join(",")

      const result =

      await db.prepare(`

        SELECT

          id,
          host_id,
          quality,
          link

        FROM download_links

        WHERE host_id IN (${hostPlaceholders})

      `)
      .bind(...hostIds)
      .all()

      links =
      result.results || []

    }

    /* =====================================================
       MAPS
    ===================================================== */

    const hostMap =
    groupBy(
      hosts,
      "entry_id"
    )

    const linkMap =
    groupBy(
      links,
      "host_id"
    )

    /* =====================================================
       BUILD
    ===================================================== */

    const final =

    entries.map(entry=>{

      const entryHosts =

        hostMap[
          entry.id
        ] || []

      return {

        id:
        entry.id,

        anime_id:
        entry.anime_id,

        anime_title:
        entry.anime_title,

        anime_slug:
        entry.anime_slug,

        anime_poster:
        entry.anime_poster,

        anime_type:
        entry.anime_type,

        content_type:
        entry.content_type,

        season:
        entry.season,

        episode:
        entry.episode,

        episode_title:
        entry.episode_title,

        created_at:
        entry.created_at,

        /* =====================
           HOSTS
        ===================== */

        hosts:

        entryHosts.map(host=>({

          id:
          host.id,

          host:
          host.host,

          storage:
          host.storage,

          knight:
          !!host.knight,

          direct_download:
          !!host.direct_download,

          monetization_id:
          host.monetization_id,

          mode:
          host.mode || "random",

          ads:
          jsonParse(
            host.ads
          ),

          shortlinks:
          jsonParse(
            host.shortlinks
          ),

          popups:
          jsonParse(
            host.popups
          ),

          links:

          linkMap[
            host.id
          ] || []

        }))

      }

    })

    return c.json(final)

})
/* =========================================================
   src/routes/downloads.js
   PART 3 — CREATE DOWNLOAD
========================================================= */

/* =========================================================
   ADMIN
   CREATE DOWNLOAD
========================================================= */

app.post(

  "/downloads-v2",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const body =
    await c.req.json()

    /* =====================================================
       VALIDATION
    ===================================================== */

    if(

      !body.anime_id ||

      !Array.isArray(
        body.hosts
      ) ||

      !body.hosts.length

    ){

      return c.json({

        success:false,

        error:
        "Missing data"

      },400)

    }

    /* =====================================================
       ENTRY
    ===================================================== */

    const entryId =
    uid()

    await db.prepare(`

      INSERT INTO download_entries (

        id,
        anime_id,
        content_type,
        season,
        episode,
        episode_title,
        created_at

      )

      VALUES (

        ?,?,?,?,?,?,
        datetime('now')

      )

    `)
    .bind(

      entryId,

      body.anime_id,

      body.content_type ||
      "episode",

      toNumber(
        body.season
      ),

      toNumber(
        body.episode
      ),

      body.episode_title ||
      null

    )
    .run()

    /* =====================================================
       HOSTS
    ===================================================== */

    for(const host of body.hosts){

      /* =========================
         INVALID
      ========================= */

      if(
        !host.host
      ){

        continue

      }

      /* ===================================================
         HOST CONFIG
      =================================================== */

      const config =

      await db.prepare(`

        SELECT *

        FROM host_monetization

        WHERE LOWER(host)=LOWER(?)

        LIMIT 1

      `)
      .bind(
        host.host
      )
      .first()

      /* ===================================================
         HOST ENTRY
      =================================================== */

      const hostId =
      uid()

      await db.prepare(`

        INSERT INTO download_hosts (

          id,
          entry_id,
          host,
          storage,
          knight,
          direct_download,
          monetization_id,
          created_at

        )

        VALUES (

          ?,?,?,?,?,?,?,

          datetime('now')

        )

      `)
      .bind(

        hostId,

        entryId,

        host.host,

        config?.storage ||
        null,

        config?.knight
        ? 1
        : 0,

        config?.knight
        ? 0
        : 1,

        config?.id ||
        null

      )
      .run()

      /* ===================================================
         LINKS
      =================================================== */

      if(
        !Array.isArray(
          host.links
        )
      ){

        continue

      }

      for(const item of host.links){

        if(!item.link){

          continue

        }

        /* ===============================================
           QUALITY RULE
        =============================================== */

        let quality =
        null

        if(
          config?.knight
        ){

          quality =
          item.quality ||
          null

        }

        /* ===============================================
           INSERT LINK
        =============================================== */

        await db.prepare(`

          INSERT INTO download_links (

            id,
            host_id,
            quality,
            link,
            created_at

          )

          VALUES (

            ?,?,?,?,

            datetime('now')

          )

        `)
        .bind(

          uid(),

          hostId,

          quality,

          item.link

        )
        .run()

      }

    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return c.json({

      success:true,

      entry_id:
      entryId

    })

})
/* =========================================================
   src/routes/downloads.js
   PART 4 — UPDATE DOWNLOAD
========================================================= */

/* =========================================================
   ADMIN
   UPDATE DOWNLOAD
========================================================= */

app.put(

  "/downloads-v2/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const entryId =
    c.req.param("id")

    const body =
    await c.req.json()

    /* =====================================================
       ENTRY
    ===================================================== */

    const existing =

    await db.prepare(`

      SELECT id

      FROM download_entries

      WHERE id=?

      LIMIT 1

    `)
    .bind(entryId)
    .first()

    if(!existing){

      return c.json({

        success:false,

        error:
        "Download not found"

      },404)

    }

    /* =====================================================
       UPDATE ENTRY
    ===================================================== */

    await db.prepare(`

      UPDATE download_entries

      SET

        anime_id=?,
        content_type=?,
        season=?,
        episode=?,
        episode_title=?

      WHERE id=?

    `)
    .bind(

      body.anime_id,

      body.content_type ||
      "episode",

      toNumber(
        body.season
      ),

      toNumber(
        body.episode
      ),

      body.episode_title ||
      null,

      entryId

    )
    .run()

    /* =====================================================
       OLD HOSTS
    ===================================================== */

    const { results:oldHosts } =

    await db.prepare(`

      SELECT id

      FROM download_hosts

      WHERE entry_id=?

    `)
    .bind(entryId)
    .all()

    const oldIds =
    oldHosts.map(x=>x.id)

    /* =====================================================
       DELETE OLD LINKS
    ===================================================== */

    if(oldIds.length){

      const placeholders =

      oldIds.map(()=>"?")
      .join(",")

      await db.prepare(`

        DELETE FROM download_links

        WHERE host_id IN (${placeholders})

      `)
      .bind(...oldIds)
      .run()

    }

    /* =====================================================
       DELETE OLD HOSTS
    ===================================================== */

    await db.prepare(`

      DELETE FROM download_hosts

      WHERE entry_id=?

    `)
    .bind(entryId)
    .run()

    /* =====================================================
       REINSERT HOSTS
    ===================================================== */

    for(const host of body.hosts){

      if(!host.host){

        continue

      }

      /* =========================
         HOST CONFIG
      ========================= */

      const config =

      await db.prepare(`

        SELECT *

        FROM host_monetization

        WHERE LOWER(host)=LOWER(?)

        LIMIT 1

      `)
      .bind(
        host.host
      )
      .first()

      /* =========================
         HOST ENTRY
      ========================= */

      const hostId =
      uid()

      await db.prepare(`

        INSERT INTO download_hosts (

          id,
          entry_id,
          host,
          storage,
          knight,
          direct_download,
          monetization_id,
          created_at

        )

        VALUES (

          ?,?,?,?,?,?,?,

          datetime('now')

        )

      `)
      .bind(

        hostId,

        entryId,

        host.host,

        config?.storage ||
        null,

        config?.knight
        ? 1
        : 0,

        config?.knight
        ? 0
        : 1,

        config?.id ||
        null

      )
      .run()

      /* =========================
         LINKS
      ========================= */

      if(
        !Array.isArray(
          host.links
        )
      ){

        continue

      }

      for(const item of host.links){

        if(!item.link){

          continue

        }

        let quality =
        null

        if(
          config?.knight
        ){

          quality =
          item.quality ||
          null

        }

        await db.prepare(`

          INSERT INTO download_links (

            id,
            host_id,
            quality,
            link,
            created_at

          )

          VALUES (

            ?,?,?,?,

            datetime('now')

          )

        `)
        .bind(

          uid(),

          hostId,

          quality,

          item.link

        )
        .run()

      }

    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return c.json({

      success:true,

      updated:true

    })

})
/* =========================================================
   src/routes/downloads.js
   PART 5 — DELETE DOWNLOAD
========================================================= */

/* =========================================================
   ADMIN
   DELETE DOWNLOAD
========================================================= */

app.delete(

  "/downloads-v2/:id",

  verifyAdmin,

  async(c)=>{

    const db =
    c.env.DB

    const entryId =
    c.req.param("id")

    /* =====================================================
       CHECK
    ===================================================== */

    const entry =

    await db.prepare(`

      SELECT id

      FROM download_entries

      WHERE id=?

      LIMIT 1

    `)
    .bind(entryId)
    .first()

    if(!entry){

      return c.json({

        success:false,

        error:
        "Download not found"

      },404)

    }

    /* =====================================================
       HOSTS
    ===================================================== */

    const { results:hosts } =

    await db.prepare(`

      SELECT id

      FROM download_hosts

      WHERE entry_id=?

    `)
    .bind(entryId)
    .all()

    const hostIds =
    hosts.map(x=>x.id)

    /* =====================================================
       DELETE LINKS
    ===================================================== */

    if(hostIds.length){

      const placeholders =

      hostIds.map(()=>"?")
      .join(",")

      await db.prepare(`

        DELETE FROM download_links

        WHERE host_id IN (${placeholders})

      `)
      .bind(...hostIds)
      .run()

    }

    /* =====================================================
       DELETE HOSTS
    ===================================================== */

    await db.prepare(`

      DELETE FROM download_hosts

      WHERE entry_id=?

    `)
    .bind(entryId)
    .run()

    /* =====================================================
       DELETE ENTRY
    ===================================================== */

    await db.prepare(`

      DELETE FROM download_entries

      WHERE id=?

    `)
    .bind(entryId)
    .run()

    /* =====================================================
       RESPONSE
    ===================================================== */

    return c.json({

      success:true,

      deleted:true

    })

})
/* =========================================================
   src/routes/downloads.js
   PART 6 — PUBLIC DOWNLOAD PAGE API
========================================================= */

/* =========================================================
   PUBLIC
   DOWNLOAD PAGE
========================================================= */

app.get(

  "/downloads-page/:animeId",

  async(c)=>{

    const db =
    c.env.DB

    const animeId =
    c.req.param("animeId")

    /* =====================================================
       ANIME
    ===================================================== */

    const anime =

    await db.prepare(`

      SELECT

        id,
        title,
        slug,
        poster,
        type

      FROM anime

      WHERE id=?

      LIMIT 1

    `)
    .bind(animeId)
    .first()

    if(!anime){

      return c.json({

        success:false,

        error:
        "Anime not found"

      },404)

    }

    /* =====================================================
       ENTRIES
    ===================================================== */

    const { results:entries } =

    await db.prepare(`

      SELECT *

      FROM download_entries

      WHERE anime_id=?

      ORDER BY

        season ASC,
        episode ASC

    `)
    .bind(animeId)
    .all()

    /* =====================================================
       EMPTY
    ===================================================== */

    if(!entries.length){

      return c.json({

        success:true,

        anime,

        downloads:[]

      })

    }

    /* =====================================================
       IDS
    ===================================================== */

    const entryIds =
    entries.map(x=>x.id)

    const placeholders =
    entryIds.map(()=>"?").join(",")

    /* =====================================================
       HOSTS
    ===================================================== */

    const { results:hosts } =

    await db.prepare(`

      SELECT

        dh.id,
        dh.entry_id,
        dh.host,
        dh.knight

      FROM download_hosts dh

      WHERE dh.entry_id IN (${placeholders})

      ORDER BY dh.host ASC

    `)
    .bind(...entryIds)
    .all()

    /* =====================================================
       HOST MAP
    ===================================================== */

    const hostMap =
    groupBy(
      hosts,
      "entry_id"
    )

    /* =====================================================
       FINAL
    ===================================================== */

    const downloads =

    entries.map(entry=>({

      id:
      entry.id,

      content_type:
      entry.content_type,

      season:
      entry.season,

      episode:
      entry.episode,

      episode_title:
      entry.episode_title,

      hosts:

      (hostMap[
        entry.id
      ] || [])

      .map(host=>({

        id:
        host.id,

        host:
        host.host,

        knight:
        !!host.knight

      }))

    }))

    /* =====================================================
       RESPONSE
    ===================================================== */

    return c.json({

      success:true,

      anime,

      downloads

    })

})
/* =========================================================
   src/routes/downloads.js
   PART 7 — KNIGHT API
========================================================= */

/* =========================================================
   PUBLIC
   KNIGHT DATA
========================================================= */

app.get(

  "/knight-data",

  async(c)=>{

    const db =
    c.env.DB

    const hostId =
    c.req.query("host_id")

    /* =====================================================
       VALIDATION
    ===================================================== */

    if(!hostId){

      return c.json({

        success:false,

        error:
        "Missing host"

      },400)

    }

    /* =====================================================
       HOST
    ===================================================== */

    const host =

    await db.prepare(`

      SELECT

        id,
        host,
        knight

      FROM download_hosts

      WHERE id=?

      LIMIT 1

    `)
    .bind(hostId)
    .first()

    /* =====================================================
       NOT FOUND
    ===================================================== */

    if(!host){

      return c.json({

        success:false,

        error:
        "Host not found"

      },404)

    }

    /* =====================================================
       KNIGHT CHECK
    ===================================================== */

    if(!host.knight){

      return c.json({

        success:false,

        error:
        "Not a knight host"

      },400)

    }

    /* =====================================================
       LINKS
    ===================================================== */

    const { results:links } =

    await db.prepare(`

      SELECT

        quality,
        link

      FROM download_links

      WHERE host_id=?

      ORDER BY

        CASE quality

          WHEN '480p' THEN 1
          WHEN '720p' THEN 2
          WHEN '1080p' THEN 3
          WHEN '4K' THEN 4
          ELSE 99

        END ASC

    `)
    .bind(hostId)
    .all()

    /* =====================================================
       EMPTY
    ===================================================== */

    if(!links.length){

      return c.json({

        success:false,

        error:
        "No links found"

      },404)

    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return c.json({

      success:true,

      host:{

        id:
        host.id,

        host:
        host.host

      },

      links

    })

})

/* =========================================================
   src/routes/downloads.js
   PART 8 — PUBLIC FINAL DOWNLOAD
========================================================= */

/* =========================================================
   PUBLIC
   FINAL DOWNLOAD
========================================================= */

app.get(

  "/download-final",

  async(c)=>{

    const db =
    c.env.DB

    const hostId =
    c.req.query("host_id")

    const quality =
    c.req.query("quality")

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

      SELECT

        id,
        monetization_id

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
       DIRECT
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
       ANALYTICS
    ===================================================== */

    if(host.monetization_id){

      await db.prepare(`

        UPDATE host_monetization

        SET

          clicks =
          clicks + 1

        WHERE id=?

      `)
      .bind(
        host.monetization_id
      )
      .run()

    }

    /* =====================================================
       REDIRECT
    ===================================================== */

    return c.redirect(
      row.link
    )

})

/* =========================================================
   src/routes/downloads.js
   PART 9 — FINAL CLEANUP
========================================================= */

/* =========================================================
   PUBLIC
   DOWNLOAD BY SLUG
========================================================= */

app.get(

  "/downloads-by-slug/:slug",

  async(c)=>{

    const db =
    c.env.DB

    const slug =
    c.req.param("slug")

    /* =====================================================
       ANIME
    ===================================================== */

    const anime =

    await db.prepare(`

      SELECT

        id,
        title,
        slug,
        poster,
        type

      FROM anime

      WHERE slug=?

      LIMIT 1

    `)
    .bind(slug)
    .first()

    if(!anime){

      return c.json({

        success:false,

        error:
        "Anime not found"

      },404)

    }

    /* =====================================================
       REUSE
    ===================================================== */

    const url = new URL(
      c.req.url
    )

    url.pathname =

      `/downloads-page/${anime.id}`

    return fetch(
      url.toString()
    )

})

/* =========================================================
   PUBLIC
   HOST LINKS
========================================================= */

app.get(

  "/host-links/:hostId",

  async(c)=>{

    const db =
    c.env.DB

    const hostId =
    c.req.param("hostId")

    const host =

    await db.prepare(`

      SELECT

        id,
        host,
        knight

      FROM download_hosts

      WHERE id=?

      LIMIT 1

    `)
    .bind(hostId)
    .first()

    if(!host){

      return c.json({

        success:false,

        error:
        "Host not found"

      },404)

    }

    const { results } =

    await db.prepare(`

      SELECT

        quality,
        link

      FROM download_links

      WHERE host_id=?

    `)
    .bind(hostId)
    .all()

    return c.json({

      success:true,

      host,

      links:results || []

    })

})

/* =========================================================
   HEALTH
========================================================= */

app.get(

  "/downloads-health",

  async(c)=>{

    return c.json({

      success:true,

      service:
      "downloads",

      status:
      "running"

    })

})
