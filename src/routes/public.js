import { Hono } from "hono";

const app = new Hono();

/* ========================= */
/* HELPERS */
/* ========================= */

const success = (data) => ({ success: true, data });

const parseJSON = (val) => {
  try { return JSON.parse(val || "[]"); }
  catch { return []; }
};

/* ========================= */
/* GET HOMEPAGE */
/* ========================= */

app.get("/homepage", async (c) => {
  try {
    const db = c.env.DB;

    // 1. get rows
    const { results: rows } = await db.prepare(`
      SELECT *
      FROM homepage_rows
      WHERE active = 1
      ORDER BY row_order ASC
    `).all();

    const finalRows = [];

    for (const row of rows) {

      let animeQuery = `SELECT * FROM anime WHERE is_hidden = 0`;
      const params = [];

      // TYPE LOGIC
      if (row.type === "auto") {

        if (row.source === "trending") {
          animeQuery += " AND is_trending = 1";
        }

        if (row.source === "most-viewed") {
          animeQuery += " AND is_most_viewed = 1";
        }

      }

      if (row.type === "category") {
        animeQuery += " AND genres LIKE ?";
        params.push(`%${row.source}%`);
      }

      animeQuery += " ORDER BY created_at DESC LIMIT ?";
      params.push(row.row_limit || 10);

      const { results: anime } = await db.prepare(animeQuery)
        .bind(...params)
        .all();

      const items = anime.map(a => ({
        id: a.id,
        title: a.title,
        poster: a.poster,
        banner: a.banner,
        year: a.year,
        rating: a.rating,
        type: a.type,
        genres: parseJSON(a.genres),
        isBanner: !!a.is_banner
      }));

      finalRows.push({
        id: row.id,
        title: row.title,
        type: row.type,
        layout: row.layout,
        items
      });

    }

    return c.json(success({ rows: finalRows }));

  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/* ========================= */
/* GET ANIME LIST */
/* ========================= */

app.get("/anime", async (c) => {
  try {
    const db = c.env.DB;

    const page = Number(c.req.query("page") || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const type = c.req.query("type");
    const category = c.req.query("category");
    const search = c.req.query("search");

    let query = `SELECT * FROM anime WHERE is_hidden = 0`;
    const params = [];

    if (type) {
      query += " AND type = ?";
      params.push(type);
    }

    if (category) {
      query += " AND genres LIKE ?";
      params.push(`%${category}%`);
    }

    if (search) {
      query += " AND title LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const { results } = await db.prepare(query)
      .bind(...params)
      .all();

    const data = results.map(a => ({
      id: a.id,
      title: a.title,
      poster: a.poster,
      banner: a.banner,
      year: a.year,
      rating: a.rating,
      type: a.type,
      genres: parseJSON(a.genres)
    }));

    return c.json(success({
      page,
      data
    }));

  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

/* ========================= */
/* GET SINGLE ANIME */
/* ========================= */

app.get("/anime/:id", async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    const a = await db.prepare(`
      SELECT * FROM anime WHERE id = ?
    `).bind(id).first();

    if (!a) {
      return c.json({ success: false, message: "Not found" }, 404);
    }

    return c.json(success({
      id: a.id,
      title: a.title,
      poster: a.poster,
      banner: a.banner,
      year: a.year,
      rating: a.rating,
      type: a.type,
      genres: parseJSON(a.genres),
      description: a.description
    }));

  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export default app;
