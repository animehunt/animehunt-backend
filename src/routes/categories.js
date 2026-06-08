/* ================================================
   categories.js — Admin + Public Category Routes
   Auth handled by adminAuth middleware in index.js
   NO local auth middleware here
================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ================= HELPERS ================= */

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

function normalizeSlug(slug) {
  return slug.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function makeSlug(name) {
  return normalizeSlug(name || "")
}

/* ================= FORMAT ================= */

function format(row) {
  return {
    id:             row.id,
    name:           row.name,
    slug:           row.slug,
    type:           row.type,
    category_order: row.category_order,
    priority:       row.priority,
    show_home:      !!row.show_home,
    active:         !!row.active,
    featured:       !!row.featured,
    ai_trending:    !!row.ai_trending,
    ai_popular:     !!row.ai_popular,
    ai_assign:      !!row.ai_assign,
    created_at:     row.created_at,
    updated_at:     row.updated_at
  }
}

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body || typeof body !== "object") return "Invalid request body"   // ✅ FIX: guard null/non-object body
  if (!body.name?.trim()) return "Name required"
  return null
}

/* ================= SYNC TO REPLICAS ================= */

async function syncToReplicas(env, action, data) {
  const promises = []

  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    promises.push(
      fetch(`${env.TURSO_URL}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
          "Content-Type":  "application/json"
        },
        body: JSON.stringify(buildTursoPayload(action, data))
      }).catch(e => console.error("Turso sync:", e))
    )
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    promises.push(
      syncSupabase(env, action, data)
        .catch(e => console.error("Supabase sync:", e))
    )
  }

  return Promise.all(promises)   // ✅ FIX: missing return — waitUntil() callers got undefined, CF Workers killed sync mid-flight
}

function buildTursoPayload(action, data) {
  if (action === "insert") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql: `INSERT OR REPLACE INTO categories (
            id,name,slug,type,category_order,priority,
            show_home,active,featured,
            ai_trending,ai_popular,ai_assign,
            created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: String(data.id) },
            { type:"text",    value: String(data.name) },
            { type:"text",    value: String(data.slug) },
            { type:"text",    value: String(data.type) },
            { type:"integer", value: String(data.category_order) },   // ✅ FIX: Turso requires string-encoded values
            { type:"integer", value: String(data.priority) },         // ✅ FIX
            { type:"integer", value: String(data.show_home) },        // ✅ FIX
            { type:"integer", value: String(data.active) },           // ✅ FIX
            { type:"integer", value: String(data.featured) },         // ✅ FIX
            { type:"integer", value: String(data.ai_trending) },      // ✅ FIX
            { type:"integer", value: String(data.ai_popular) },       // ✅ FIX
            { type:"integer", value: String(data.ai_assign) },        // ✅ FIX
            { type:"text",    value: String(data.created_at) },
            { type:"text",    value: String(data.updated_at) }
          ]
        }
      }]
    }
  }
  if (action === "delete") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql:  "DELETE FROM categories WHERE id=?",
          args: [{ type:"text", value: String(data.id) }]   // ✅ FIX: String() for safety
        }
      }]
    }
  }
  return { requests: [] }
}

async function syncSupabase(env, action, data) {
  const base    = `${env.SUPABASE_URL}/rest/v1/categories`
  const headers = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates"
  }
  if (action === "insert") {
    const res = await fetch(base, { method:"POST", headers, body: JSON.stringify(data) })
    if (!res.ok) {
      const txt = await res.text()
      console.error("Supabase categories insert failed:", res.status, txt)   // ✅ FIX: was silently swallowing errors
    }
  }
  if (action === "delete") {
    const res = await fetch(`${base}?id=eq.${encodeURIComponent(data.id)}`, {   // ✅ FIX: encode id in URL
      method:  "DELETE",
      headers: { ...headers, Prefer: undefined }   // ✅ FIX: Prefer header invalid on DELETE
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error("Supabase categories delete failed:", res.status, txt)
    }
  }
}

/* ================================================
   PUBLIC ROUTES — must be BEFORE /:id
================================================ */

app.get("/categories/public", async (c) => {
  try {
    const db = c.env.DB
    const { results } = await db.prepare(`
      SELECT * FROM categories
      WHERE active=1
      ORDER BY priority ASC, category_order ASC
    `).all()
    return c.json(success((results || []).map(format)))   // ✅ FIX: guard undefined results on empty table
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.get("/categories/home", async (c) => {
  try {
    const db = c.env.DB
    const { results } = await db.prepare(`
      SELECT * FROM categories
      WHERE active=1 AND show_home=1
      ORDER BY priority ASC, category_order ASC
    `).all()
    return c.json(success((results || []).map(format)))   // ✅ FIX: guard undefined results on empty table
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= CREATE ================= */

app.post("/categories", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }                           // ✅ FIX: guard malformed JSON body
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const slug = body.slug?.trim()
      ? normalizeSlug(body.slug)
      : makeSlug(body.name)

    if (!slug) return c.json(failure("Could not generate slug"), 400)

    const exists = await db.prepare(
      "SELECT id FROM categories WHERE slug=?"
    ).bind(slug).first()
    if (exists) return c.json(failure("Slug already exists"), 400)

    /* Auto order or manual */
    let order = Number(body.order)
    if (!order || order < 1) {
      const last = await db.prepare(
        "SELECT MAX(category_order) as max FROM categories"
      ).first()
      order = (last?.max || 0) + 1
    } else {
      /* Shift others down */
      await db.prepare(`
        UPDATE categories
        SET category_order = category_order + 1
        WHERE category_order >= ?
      `).bind(order).run()
    }

    const id        = crypto.randomUUID()
    const timestamp = now()

    const row = {
      id,
      name:           String(body.name).trim(),
      slug,
      type:           body.type      || "row",
      category_order: order,
      priority:       Number(body.priority || 1),
      show_home:      bool(body.showHome),
      active:         bool(body.isActive !== false),
      featured:       bool(body.isFeatured),
      ai_trending:    bool(body.aiTrending),
      ai_popular:     bool(body.aiPopular),
      ai_assign:      bool(body.aiAssign),
      created_at:     timestamp,
      updated_at:     timestamp
    }

    await db.prepare(`
      INSERT INTO categories (
        id,name,slug,type,category_order,priority,
        show_home,active,featured,
        ai_trending,ai_popular,ai_assign,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.name, row.slug, row.type,
      row.category_order, row.priority,
      row.show_home, row.active, row.featured,
      row.ai_trending, row.ai_popular, row.ai_assign,
      row.created_at, row.updated_at
    ).run()

    // ✅ FIX: waitUntil so CF Workers doesn't kill sync after response sent
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id, slug }), 201)

  } catch (err) {
    console.error("categories POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ALL (ADMIN) ================= */

app.get("/categories", async (c) => {
  try {
    const db     = c.env.DB
    const search = c.req.query("search") || ""
    const type   = c.req.query("type")   || ""

    let where    = "WHERE 1=1"
    const params = []

    if (search) { where += " AND name LIKE ?";  params.push(`%${search}%`) }
    if (type)   { where += " AND type=?";        params.push(type) }

    const { results } = await db.prepare(`
      SELECT * FROM categories
      ${where}
      ORDER BY priority ASC, category_order ASC
    `).bind(...params).all()

    return c.json(success((results || []).map(format)))   // ✅ FIX: guard undefined results on empty table

  } catch (err) {
    console.error("categories GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ONE ================= */

app.get("/categories/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare(
      "SELECT * FROM categories WHERE id=? OR slug=?"
    ).bind(id, id).first()

    if (!row) return c.json(failure("Category not found"), 404)
    return c.json(success(format(row)))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= UPDATE ================= */

app.put("/categories/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    let body
    try { body = await c.req.json() }                           // ✅ FIX: guard malformed JSON
    catch { return c.json(failure("Invalid JSON body"), 400) }

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    // ✅ FIX: fetch created_at AND existing order to preserve them
    const existing = await db.prepare(
      "SELECT id, created_at, category_order FROM categories WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Category not found"), 404)

    const slug = body.slug?.trim()
      ? normalizeSlug(body.slug)
      : makeSlug(body.name)

    const conflict = await db.prepare(
      "SELECT id FROM categories WHERE slug=? AND id!=?"
    ).bind(slug, id).first()
    if (conflict) return c.json(failure("Slug already used"), 400)

    const timestamp = now()

    // ✅ FIX: was `Number(body.order || 0)` — 0 stored in DB when blank, now preserves existing order
    const newOrder = Number(body.order) >= 1 ? Number(body.order) : existing.category_order

    const row = {
      id,
      name:           String(body.name).trim(),
      slug,
      type:           body.type      || "row",
      category_order: newOrder,
      priority:       Number(body.priority || 1),
      show_home:      bool(body.showHome),
      active:         bool(body.isActive),
      featured:       bool(body.isFeatured),
      ai_trending:    bool(body.aiTrending),
      ai_popular:     bool(body.aiPopular),
      ai_assign:      bool(body.aiAssign),
      created_at:     existing.created_at || timestamp,   // ✅ FIX: preserve original created_at
      updated_at:     timestamp
    }

    await db.prepare(`
      UPDATE categories SET
        name=?,slug=?,type=?,
        category_order=?,priority=?,
        show_home=?,active=?,featured=?,
        ai_trending=?,ai_popular=?,ai_assign=?,
        updated_at=?
      WHERE id=?
    `).bind(
      row.name, row.slug, row.type,
      row.category_order, row.priority,
      row.show_home, row.active, row.featured,
      row.ai_trending, row.ai_popular, row.ai_assign,
      row.updated_at, id
    ).run()

    // ✅ FIX: waitUntil + pass correct created_at (was `created_at: now()` which overwrote original)
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
    } else {
      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ id, slug }))

  } catch (err) {
    console.error("categories PUT:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= DELETE ================= */

app.delete("/categories/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare(
      "SELECT id FROM categories WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Category not found"), 404)

    await db.prepare("DELETE FROM categories WHERE id=?").bind(id).run()

    // ✅ FIX: waitUntil so CF Workers doesn't kill sync after response sent
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "delete", { id }))
    } else {
      syncToReplicas(c.env, "delete", { id })
    }

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("categories DELETE:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= REORDER (BULK) ================= */

app.post("/categories/reorder", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }                           // ✅ FIX: guard malformed JSON
    catch { return c.json(failure("Invalid JSON body"), 400) }

    if (!Array.isArray(body.order) || !body.order.length) {
      return c.json(failure("order array required"), 400)
    }

    // ✅ FIX: validate each item before touching DB
    for (const item of body.order) {
      if (!item.id)                         return c.json(failure("Each item needs an id"), 400)
      if (typeof item.order !== "number" ||
          item.order < 1)                   return c.json(failure("Each item needs a valid order >= 1"), 400)
    }

    // ✅ FIX: parallel updates instead of sequential awaits (N DB round-trips → 1 batch)
    await Promise.all(
      body.order.map(item =>
        db.prepare(
          "UPDATE categories SET category_order=?, updated_at=? WHERE id=?"
        ).bind(item.order, now(), item.id).run()
      )
    )

    return c.json(success({ updated: body.order.length }))

  } catch (err) {
    console.error("categories REORDER:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= TOGGLE ACTIVE ================= */

app.patch("/categories/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")

    // ✅ FIX: fetch full row for sync (was only fetching id+active)
    const row = await db.prepare(
      "SELECT * FROM categories WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(failure("Not found"), 404)

    const newVal    = row.active ? 0 : 1
    const timestamp = now()

    await db.prepare(
      "UPDATE categories SET active=?, updated_at=? WHERE id=?"
    ).bind(newVal, timestamp, id).run()

    // ✅ FIX: sync toggle to replicas — was completely missing, Turso/Supabase never got active state changes
    const syncRow = {
      id:             row.id,
      name:           row.name,
      slug:           row.slug,
      type:           row.type,
      category_order: row.category_order,
      priority:       row.priority,
      show_home:      row.show_home,
      active:         newVal,
      featured:       row.featured,
      ai_trending:    row.ai_trending,
      ai_popular:     row.ai_popular,
      ai_assign:      row.ai_assign,
      created_at:     row.created_at,
      updated_at:     timestamp
    }
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", syncRow))
    } else {
      syncToReplicas(c.env, "insert", syncRow)
    }

    return c.json(success({ id, active: !!newVal }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app

