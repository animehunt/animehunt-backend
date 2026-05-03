import { Hono } from "hono";

const app = new Hono();

/* ================= HELPERS ================= */

const success = (data) => ({ success: true, data });
const failure = (msg) => ({ success: false, message: msg });

const now = () => new Date().toISOString();

const bool = (v) => (v ? 1 : 0);

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body.name?.trim()) return "Name required";
  if (!body.slug?.trim()) return "Slug required";
  return null;
}

/* ================= SLUG NORMALIZE ================= */

function normalizeSlug(slug) {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ================= CREATE ================= */

app.post("/categories", async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json(failure(err), 400);

    const slug = normalizeSlug(body.slug);

    // UNIQUE SLUG CHECK
    const exists = await db
      .prepare("SELECT id FROM categories WHERE slug=?")
      .bind(slug)
      .first();

    if (exists) {
      return c.json(failure("Slug already exists"), 400);
    }

    let order = Number(body.order);

    if (!order || order < 0) {
      const last = await db
        .prepare(`SELECT MAX(category_order) as max FROM categories`)
        .first();

      order = (last?.max || 0) + 1;
    } else {
      await db.prepare(`
        UPDATE categories
        SET category_order = category_order + 1
        WHERE category_order >= ?
      `).bind(order).run();
    }

    const id = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO categories (
        id, name, slug, type,
        category_order, priority,
        show_home, active, featured,
        ai_trending, ai_popular, ai_assign,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.name.trim(),
      slug,
      body.type || "row",
      order,
      Number(body.priority || 1),

      bool(body.showHome),
      bool(body.isActive !== false),
      bool(body.isFeatured),

      bool(body.aiTrending),
      bool(body.aiPopular),
      bool(body.aiAssign),

      now(),
      now()
    ).run();

    return c.json(success({ id }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= GET ALL ================= */

app.get("/categories", async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT *
      FROM categories
      ORDER BY priority ASC, category_order ASC
    `).all();

    const data = results.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      type: c.type,

      category_order: c.category_order,
      priority: c.priority,

      show_home: !!c.show_home,
      active: !!c.active,
      featured: !!c.featured,

      ai_trending: !!c.ai_trending,
      ai_popular: !!c.ai_popular,
      ai_assign: !!c.ai_assign,

      created_at: c.created_at,
      updated_at: c.updated_at
    }));

    return c.json(success(data));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= GET ONE ================= */

app.get("/categories/:id", async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    const row = await db.prepare(`
      SELECT * FROM categories WHERE id=?
    `).bind(id).first();

    if (!row) return c.json(failure("Not found"), 404);

    return c.json(success({
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,

      category_order: row.category_order,
      priority: row.priority,

      show_home: !!row.show_home,
      active: !!row.active,
      featured: !!row.featured,

      ai_trending: !!row.ai_trending,
      ai_popular: !!row.ai_popular,
      ai_assign: !!row.ai_assign
    }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= UPDATE ================= */

app.put("/categories/:id", async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json(failure(err), 400);

    const slug = normalizeSlug(body.slug);

    // UNIQUE SLUG CHECK (exclude self)
    const exists = await db.prepare(`
      SELECT id FROM categories
      WHERE slug=? AND id!=?
    `).bind(slug, id).first();

    if (exists) {
      return c.json(failure("Slug already exists"), 400);
    }

    await db.prepare(`
      UPDATE categories SET
        name=?,
        slug=?,
        type=?,

        category_order=?,
        priority=?,

        show_home=?,
        active=?,
        featured=?,

        ai_trending=?,
        ai_popular=?,
        ai_assign=?,

        updated_at=?
      WHERE id=?
    `).bind(
      body.name.trim(),
      slug,
      body.type || "row",

      Number(body.order || 0),
      Number(body.priority || 1),

      bool(body.showHome),
      bool(body.isActive),
      bool(body.isFeatured),

      bool(body.aiTrending),
      bool(body.aiPopular),
      bool(body.aiAssign),

      now(),
      id
    ).run();

    return c.json(success({ id }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= DELETE ================= */

app.delete("/categories/:id", async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    await db.prepare(`
      DELETE FROM categories WHERE id=?
    `).bind(id).run();

    return c.json(success({ id }));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* ================= PUBLIC ================= */

/* 🔥 only active categories */
app.get("/categories/public", async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT *
      FROM categories
      WHERE active = 1
      ORDER BY priority ASC, category_order ASC
    `).all();

    return c.json(success(results));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

/* 🔥 homepage categories */
app.get("/categories/home", async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT *
      FROM categories
      WHERE active = 1 AND show_home = 1
      ORDER BY priority ASC, category_order ASC
    `).all();

    return c.json(success(results));

  } catch (err) {
    return c.json(failure(err.message), 500);
  }
});

export default app;
