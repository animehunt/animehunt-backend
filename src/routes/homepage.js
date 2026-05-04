import { Hono } from "hono";
import { verifyAdmin } from "../middleware/adminAuth.js";

const app = new Hono();

/* ================= HELPERS ================= */

const success = (data) => ({ success: true, data });
const now = () => new Date().toISOString();

/* ================= ADMIN: GET ALL ================= */

app.get("/homepage", verifyAdmin, async (c) => {

  const { results } = await c.env.DB.prepare(`
    SELECT *
    FROM homepage_rows
    ORDER BY row_order ASC
  `).all();

  return c.json(success(results));
});

/* ================= ADMIN: GET ONE ================= */

app.get("/homepage/:id", verifyAdmin, async (c) => {

  const row = await c.env.DB.prepare(`
    SELECT *
    FROM homepage_rows
    WHERE id=?
  `)
  .bind(c.req.param("id"))
  .first();

  return c.json(success(row));
});

/* ================= CREATE ================= */

app.post("/homepage", verifyAdmin, async (c) => {

  const body = await c.req.json();

  if (!body.title) {
    return c.json({ success:false, message:"Title required" }, 400);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO homepage_rows
    (id,title,type,source,layout,row_limit,row_order,active,autoUpdate,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `)
  .bind(
    id,
    body.title,
    body.type || "auto",
    body.source || "",
    body.layout || "scroll",
    body.limit || 10,
    body.order || 0,
    body.active ? 1 : 0,
    body.autoUpdate ? 1 : 0,
    now()
  )
  .run();

  return c.json(success({ id }));
});

/* ================= UPDATE ================= */

app.patch("/homepage/:id", verifyAdmin, async (c) => {

  const body = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE homepage_rows SET
      title=?,
      type=?,
      source=?,
      layout=?,
      row_limit=?,
      row_order=?,
      active=?,
      autoUpdate=?
    WHERE id=?
  `)
  .bind(
    body.title,
    body.type,
    body.source,
    body.layout,
    body.limit,
    body.order,
    body.active ? 1 : 0,
    body.autoUpdate ? 1 : 0,
    c.req.param("id")
  )
  .run();

  return c.json(success(true));
});

/* ================= DELETE ================= */

app.delete("/homepage/:id", verifyAdmin, async (c) => {

  await c.env.DB.prepare(`
    DELETE FROM homepage_rows WHERE id=?
  `)
  .bind(c.req.param("id"))
  .run();

  return c.json(success(true));
});

/* =====================================================
🔥 PUBLIC API (MAIN ENGINE)
===================================================== */

app.get("/homepage/public", async (c) => {

  const db = c.env.DB;

  try {

    const { results: rows } = await db.prepare(`
      SELECT *
      FROM homepage_rows
      WHERE active = 1
      ORDER BY row_order ASC
    `).all();

    const final = [];

    for (const row of rows) {

      let items = [];

      /* ===== AUTO (LATEST) ===== */
      if (row.type === "auto") {

        const { results } = await db.prepare(`
          SELECT id,title,poster,slug,rating,year
          FROM anime
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .bind(row.row_limit || 10)
        .all();

        items = results;
      }

      /* ===== CATEGORY ===== */
      else if (row.type === "category" && row.source) {

        const { results } = await db.prepare(`
          SELECT id,title,poster,slug,rating,year
          FROM anime
          WHERE category=?
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .bind(row.source, row.row_limit || 10)
        .all();

        items = results;
      }

      /* ===== SKIP EMPTY ===== */
      if (!items.length) continue;

      final.push({
        id: row.id,
        title: row.title,
        type: row.type,
        source: row.source,
        layout: row.layout,
        items
      });
    }

    return c.json(final);

  } catch (err) {
    console.error(err);
    return c.json([]);
  }
});

export default app;
