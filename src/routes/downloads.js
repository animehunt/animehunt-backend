/* =========================================================
   src/routes/downloadsV2.js
   FINAL DOWNLOAD SYSTEM
========================================================= */

import { Hono } from "hono"
import { verifyAdmin } from "../middleware/adminAuth.js"

const app = new Hono()

/* =========================================================
   HELPERS
========================================================= */

function groupBy(arr,key){

  return arr.reduce((acc,item)=>{

    const value = item[key]

    if(!acc[value]){
      acc[value] = []
    }

    acc[value].push(item)

    return acc

  },{})

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
        poster,
        type

      FROM anime

      ORDER BY title ASC

    `).all()

    return c.json(results)

})

/* =========================================================
   ADMIN
   GET DOWNLOADS
========================================================= */

app.get(
  "/downloads-v2",
  verifyAdmin,
  async(c)=>{

    const db = c.env.DB

    /* =========================
       ENTRIES
    ========================= */

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
        a.type as anime_type

      FROM download_entries de

      LEFT JOIN anime a
      ON a.id = de.anime_id

      ORDER BY
      a.title ASC,
      de.season ASC,
      de.episode ASC

    `).all()

    /* =========================
       HOSTS
    ========================= */

    const { results:hosts } =
    await db.prepare(`

      SELECT

        dh.*,

        hm.mode,

        hm.ads,
        hm.shortlinks,
        hm.popups

      FROM download_hosts dh

      LEFT JOIN host_monetization hm
      ON LOWER(hm.host)=LOWER(dh.host)

    `).all()

    /* =========================
       LINKS
    ========================= */

    const { results:links } =
    await db.prepare(`

      SELECT *
      FROM download_links

    `).all()

    /* =========================
       BUILD
    ========================= */

    const hostMap =
    groupBy(hosts,"entry_id")

    const linkMap =
    groupBy(links,"host_id")

    const final = entries.map(entry=>{

      const entryHosts =
      hostMap[entry.id] || []

      return {

        ...entry,

        hosts: entryHosts.map(host=>({

          ...host,

          ads:
          JSON.parse(host.ads || "[]"),

          shortlinks:
          JSON.parse(host.shortlinks || "[]"),

          popups:
          JSON.parse(host.popups || "[]"),

          links:
          linkMap[host.id] || []

        }))

      }

    })

    return c.json(final)

})

/* =========================================================
   ADMIN
   CREATE DOWNLOAD
========================================================= */

app.post(
  "/downloads-v2",
  verifyAdmin,
  async(c)=>{

    const db = c.env.DB

    const body =
    await c.req.json()

    /* =========================
       VALIDATION
    ========================= */

    if(
      !body.anime_id ||
      !body.hosts?.length
    ){

      return c.json({

        success:false,
        error:"Missing data"

      },400)

    }

    /* =====================================================
       ENTRY
    ===================================================== */

    const entryId =
    crypto.randomUUID()

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

      body.content_type || "episode",

      body.season || null,

      body.episode || null,

      body.episode_title || null

    )
    .run()

    /* =====================================================
       HOSTS
    ===================================================== */

    for(const host of body.hosts){

      const hostId =
      crypto.randomUUID()

      /* =========================
         HOST CONFIG
      ========================= */

      const hostConfig =
      await db.prepare(`

        SELECT *

        FROM host_monetization

        WHERE LOWER(host)=LOWER(?)

        LIMIT 1

      `)
      .bind(host.host)
      .first()

      /* =========================
         INSERT HOST
      ========================= */

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

          ?,?,?,?,?,?,?,datetime('now')

        )

      `)
      .bind(

        hostId,

        entryId,

        host.host,

        hostConfig?.storage || null,

        hostConfig?.knight ? 1 : 0,

        0,

        hostConfig?.id || null

      )
      .run()

      /* ===================================================
         LINKS
      =================================================== */

      for(const link of host.links){

        if(!link.link) continue

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

          crypto.randomUUID(),

          hostId,

          link.quality || null,

          link.link

        )
        .run()

      }

    }

    return c.json({

      success:true

    })

})

/* =========================================================
   PUBLIC
   DOWNLOAD PAGE
========================================================= */

app.get(
  "/downloads-page/:animeId",
  async(c)=>{

    const animeId =
    c.req.param("animeId")

    const db = c.env.DB

    /* =========================
       ENTRIES
    ========================= */

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

    if(!entries.length){

      return c.json([])

    }

    /* =========================
       IDS
    ========================= */

    const ids =
    entries.map(x=>x.id)

    const placeholders =
    ids.map(()=>"?").join(",")

    /* =========================
       HOSTS
    ========================= */

    const { results:hosts } =
    await db.prepare(`

      SELECT *

      FROM download_hosts

      WHERE entry_id IN (${placeholders})

    `)
    .bind(...ids)
    .all()

    /* =========================
       BUILD
    ========================= */

    const hostMap =
    groupBy(hosts,"entry_id")

    const final =
    entries.map(entry=>({

      id:entry.id,

      season:entry.season,

      episode:entry.episode,

      episode_title:
      entry.episode_title,

      content_type:
      entry.content_type,

      hosts:
      (hostMap[entry.id] || [])
      .map(host=>({

        host:host.host

      }))

    }))

    return c.json(final)

})

/* =========================================================
   PUBLIC
   KNIGHT PAGE
========================================================= */

app.get(
  "/knight-data",
  async(c)=>{

    const anime =
    c.req.query("anime")

    const season =
    c.req.query("season")

    const episode =
    c.req.query("episode")

    const host =
    c.req.query("host")

    const db = c.env.DB

    /* =========================
       ENTRY
    ========================= */

    const entry =
    await db.prepare(`

      SELECT id

      FROM download_entries

      WHERE

        anime_id=?
        AND season=?
        AND episode=?

      LIMIT 1

    `)
    .bind(
      anime,
      season,
      episode
    )
    .first()

    if(!entry){

      return c.json([])

    }

    /* =========================
       HOST
    ========================= */

    const hostData =
    await db.prepare(`

      SELECT *

      FROM download_hosts

      WHERE

        entry_id=?
        AND LOWER(host)=LOWER(?)

      LIMIT 1

    `)
    .bind(
      entry.id,
      host
    )
    .first()

    if(!hostData){

      return c.json([])

    }

    /* =========================
       LINKS
    ========================= */

    const { results } =
    await db.prepare(`

      SELECT
        quality,
        link

      FROM download_links

      WHERE host_id=?

    `)
    .bind(hostData.id)
    .all()

    return c.json(results)

})

/* =========================================================
   PUBLIC
   FINAL DOWNLOAD
========================================================= */

app.get(
  "/download-final",
  async(c)=>{

    const hostId =
    c.req.query("host_id")

    const quality =
    c.req.query("quality")

    const db = c.env.DB

    let row = null

    /* =========================
       KNIGHT
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

    if(!row){

      return c.text(
        "Download not found"
      )

    }

    return c.redirect(row.link)

})

export default app
