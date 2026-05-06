import { Hono } from "hono";
import { verifyAdmin } from "../middleware/adminAuth.js";

const app = new Hono();

/* =========================
GET SERVERS
========================= */

app.get("/servers", verifyAdmin, async (c)=>{

  try{

    const q = c.req.query("q") || "";

    let query = `
      SELECT *
      FROM servers
    `;

    let bind = [];

    if(q){

      query += `
        WHERE
        anime LIKE ?
        OR name LIKE ?
      `;

      bind = [
        `%${q}%`,
        `%${q}%`
      ];

    }

    query += `
      ORDER BY priority ASC,
      created_at DESC
      LIMIT 500
    `;

    const { results } = await c.env.DB
      .prepare(query)
      .bind(...bind)
      .all();

    return c.json(results || []);

  }catch(err){

    console.error(err);

    return c.json([],500);

  }

});

/* =========================
CREATE / UPDATE
========================= */

app.post("/servers", verifyAdmin, async (c)=>{

  try{

    const body = await c.req.json();

    if(
      !body.name ||
      !body.anime ||
      !body.embed
    ){

      return c.json({
        success:false,
        error:"Missing fields"
      },400);

    }

    const id = body.id || crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO servers (

        id,
        name,
        anime,

        season,
        episode,

        embed,

        priority,
        active,

        updated_at

      )

      VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)

      ON CONFLICT(id)
      DO UPDATE SET

        name=excluded.name,
        anime=excluded.anime,

        season=excluded.season,
        episode=excluded.episode,

        embed=excluded.embed,

        priority=excluded.priority,
        active=excluded.active,

        updated_at=CURRENT_TIMESTAMP

    `)
    .bind(

      id,

      body.name,
      body.anime,

      Number(body.season || 1),
      Number(body.episode || 1),

      body.embed,

      Number(body.priority || 99),
      body.active ? 1 : 0

    )
    .run();

    return c.json({
      success:true,
      id
    });

  }catch(err){

    console.error(err);

    return c.json({
      success:false
    },500);

  }

});

/* =========================
DELETE
========================= */

app.delete("/servers/:id", verifyAdmin, async (c)=>{

  try{

    const id = c.req.param("id");

    await c.env.DB.prepare(`
      DELETE FROM servers
      WHERE id=?
    `)
    .bind(id)
    .run();

    return c.json({
      success:true
    });

  }catch(err){

    console.error(err);

    return c.json({
      success:false
    },500);

  }

});

/* =========================
PUBLIC SERVERS
========================= */

app.get("/servers/public/:anime/:ep", async (c)=>{

  try{

    const anime = c.req.param("anime");
    const ep = c.req.param("ep");

    const { results } = await c.env.DB.prepare(`

      SELECT
      id,
      name,
      embed,
      priority

      FROM servers

      WHERE
      anime=? AND
      episode=? AND
      active=1

      ORDER BY priority ASC

    `)
    .bind(anime, ep)
    .all();

    return c.json(results || []);

  }catch(err){

    console.error(err);

    return c.json([]);

  }

});

export default app;
