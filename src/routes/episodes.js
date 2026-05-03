import { Hono } from "hono";
import { verifyAdmin } from "../middleware/adminAuth.js";

const app = new Hono();

/* ================= HELPERS ================= */

const success = (data) => ({ success: true, data });
const failure = (msg) => ({ success: false, message: msg });

const now = () => new Date().toISOString();

const safeJSON = (val) => {
  try { return JSON.parse(val || "[]"); }
  catch { return []; }
};

const toJSON = (val) =>
  JSON.stringify(Array.isArray(val) ? val : []);

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body.anime_id) return "anime_id required";
  if (!body.episode) return "episode required";
  return null;
}

/* ================= CREATE ================= */

app.post("/episodes", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json(failure(err), 400);

    const id = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO episodes (
        id, anime_id, anime_title,
        season, episode, title, description,
        thumbnail, servers,
        ongoing, featured,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.anime_id,
      body.anime_title || "",
      body.season || "1",
      Number(body.episode),
      body.title || "",
      body.description || "",
      body.thumbnail || "",
      toJSON(body.servers),
      body.ongoing ? 1 : 0,
      body.featured ? 1 : 0,
      now(),
      now()
    ).run();

    return c.json(success({ id }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= GET ALL (ADMIN) ================= */

app.get("/episodes", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT * FROM episodes
      ORDER BY created_at DESC
    `).all();

    const data = results.map(e => ({
      ...e,
      servers: safeJSON(e.servers),
      ongoing: !!e.ongoing,
      featured: !!e.featured
    }));

    return c.json(success(data));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= GET ONE ================= */

app.get("/episodes/:id", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    const row = await db.prepare(`
      SELECT * FROM episodes WHERE id=?
    `).bind(id).first();

    if (!row) return c.json(failure("Not found"), 404);

    return c.json(success({
      ...row,
      servers: safeJSON(row.servers),
      ongoing: !!row.ongoing,
      featured: !!row.featured
    }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= UPDATE ================= */

app.put("/episodes/:id", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json(failure(err), 400);

    await db.prepare(`
      UPDATE episodes SET
        anime_id=?,
        anime_title=?,
        season=?,
        episode=?,
        title=?,
        description=?,
        thumbnail=?,
        servers=?,
        ongoing=?,
        featured=?,
        updated_at=?
      WHERE id=?
    `).bind(
      body.anime_id,
      body.anime_title || "",
      body.season || "1",
      Number(body.episode),
      body.title || "",
      body.description || "",
      body.thumbnail || "",
      toJSON(body.servers),
      body.ongoing ? 1 : 0,
      body.featured ? 1 : 0,
      now(),
      id
    ).run();

    return c.json(success({ id }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= DELETE ================= */

app.delete("/episodes/:id", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    await db.prepare(`
      DELETE FROM episodes WHERE id=?
    `).bind(id).run();

    return c.json(success({ id }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= PUBLIC: EPISODES ================= */

app.get("/public/episodes/:animeId", async (c) => {
  try {
    const db = c.env.DB;
    const animeId = c.req.param("animeId");

    const { results } = await db.prepare(`
      SELECT id, season, episode, title, thumbnail, servers
      FROM episodes
      WHERE anime_id=?
      ORDER BY CAST(season AS INTEGER), episode ASC
    `).bind(animeId).all();

    const data = results.map(e => ({
      id: e.id,
      season: e.season,
      episode: e.episode,
      title: e.title,
      thumbnail: e.thumbnail,
      servers: safeJSON(e.servers)
    }));

    return c.json(success(data));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= PUBLIC: SERVERS ================= */

app.get("/public/servers/:id", async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    const row = await db.prepare(`
      SELECT servers FROM episodes WHERE id=?
    `).bind(id).first();

    if (!row) return c.json(success([]));

    const servers = safeJSON(row.servers);

    return c.json(success(
      servers.map(url => ({ url }))
    ));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

export default app;
