import { Hono } from "hono";
import { verifyAdmin } from "../middleware/adminAuth.js";

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

/* ================= SLUG ================= */

function normalizeSlug(slug) {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ================= CREATE ================= */

app.post("/categories", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json(failure(err), 400);

    const slug = normalizeSlug(body.slug);

    // UNIQUE CHECK
    const exists = await db
      .prepare("SELECT id FROM categories WHERE slug=?")
      .bind(slug)
      .first();

    if (exists) return c.json(failure("Slug exists"), 400);

    let order = Number(body.order);

    // AUTO ORDER
    if (!order || order < 0) {
      const last = await db
        .prepare("SELECT MAX(category_order) as max FROM categories")
        .first();

      order = (last?.max || 0) + 1;
    } else {
      // SHIFT DOWN
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
    console.error(err);
    return c.json(failure("Create failed"), 500);
  }
});

/* ================= GET ALL (ADMIN) ================= */

app.get("/categories", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT *
      FROM categories
      ORDER BY priority ASC, category_order ASC
    `).all();

    const data = results.map(format);

    return c.json(success(data));

  } catch (err) {
    console.error(err);
    return c.json(failure("Load failed"), 500);
  }
});

/* ================= GET ONE ================= */

app.get("/categories/:id", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    const row = await db.prepare(`
      SELECT * FROM categories WHERE id=?
    `).bind(id).first();

    if (!row) return c.json(failure("Not found"), 404);

    return c.json(success(format(row)));

  } catch (err) {
    console.error(err);
    return c.json(failure("Fetch failed"), 500);
  }
});

/* ================= UPDATE ================= */

app.put("/categories/:id", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");
    const body = await c.req.json();

    const err = validate(body);
    if (err) return c.json(failure(err), 400);

    const slug = normalizeSlug(body.slug);

    const exists = await db.prepare(`
      SELECT id FROM categories
      WHERE slug=? AND id!=?
    `).bind(slug, id).first();

    if (exists) return c.json(failure("Slug exists"), 400);

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
    console.error(err);
    return c.json(failure("Update failed"), 500);
  }
});

/* ================= DELETE ================= */

app.delete("/categories/:id", verifyAdmin, async (c) => {
  try {
    const db = c.env.DB;
    const id = c.req.param("id");

    await db.prepare(`
      DELETE FROM categories WHERE id=?
    `).bind(id).run();

    return c.json(success({ id }));

  } catch (err) {
    console.error(err);
    return c.json(failure("Delete failed"), 500);
  }
});

/* ================= PUBLIC ================= */

app.get("/categories/public", async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT *
      FROM categories
      WHERE active = 1
      ORDER BY priority ASC, category_order ASC
    `).all();

    return c.json(results.map(format));

  } catch {
    return c.json([]);
  }
});

app.get("/categories/home", async (c) => {
  try {
    const db = c.env.DB;

    const { results } = await db.prepare(`
      SELECT *
      FROM categories
      WHERE active = 1 AND show_home = 1
      ORDER BY priority ASC, category_order ASC
    `).all();

    return c.json(results.map(format));

  } catch {
    return c.json([]);
  }
});

/* ================= FORMAT ================= */

function format(c) {
  return {
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
  };
}

export default app;
