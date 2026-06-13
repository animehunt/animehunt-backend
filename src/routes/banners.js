/* ================================================
   banners.js — Admin + Public Banner Routes
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

/* ================= HELPERS ================= */

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

function format(b) {
  return {
    id:         b.id,
    page:       b.page,
    category:   b.category,
    position:   b.position,
    title:      b.title,
    image:      b.image,
    link:       b.link,
    order:      b.banner_order,
    active:     !!b.active,
    rotate:     !!b.auto_rotate,
    created_at: b.created_at,
    updated_at: b.updated_at
  }
}

/* ================= VALIDATION ================= */

function validate(body) {
  if (!body.title?.trim()) return "Title required"
  if (!body.image?.trim()) return "Image URL required"
  try { new URL(body.image) } catch { return "Invalid image URL" }
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

  return Promise.all(promises)
}

function buildTursoPayload(action, data) {
  if (action === "insert") {
    return {
      requests: [{
        type: "execute",
        stmt: {
          sql: `INSERT OR REPLACE INTO banners (
            id,page,category,position,title,image,link,
            banner_order,active,auto_rotate,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: data.id },
            { type:"text",    value: data.page },
            { type:"text",    value: data.category },
            { type:"text",    value: data.position },
            { type:"text",    value: data.title },
            { type:"text",    value: data.image },
            { type:"text",    value: data.link },
            { type:"integer", value: data.banner_order },
            { type:"integer", value: data.active },
            { type:"integer", value: data.auto_rotate },
            { type:"text",    value: data.created_at },
            { type:"text",    value: data.updated_at }
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
          sql:  "DELETE FROM banners WHERE id=?",
          args: [{ type:"text", value: data.id }]
        }
      }]
    }
  }
  return { requests: [] }
}

async function syncSupabase(env, action, data) {
  const base    = `${env.SUPABASE_URL}/rest/v1/banners`
  const headers = {
    "apikey":        env.SUPABASE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_KEY}`,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates"
  }
  if (action === "insert") {
    await fetch(base, { method:"POST", headers, body: JSON.stringify(data) })
  }
  if (action === "delete") {
    await fetch(`${base}?id=eq.${data.id}`, { method:"DELETE", headers })
  }
}

/* ================================================
   PUBLIC ROUTES — MUST be before /:id
================================================ */

/* GET active banners (for frontend) */
app.get("/banners/public", async (c) => {
  try {
    const db       = c.env.DB
    const page     = c.req.query("page")     || ""
    const position = c.req.query("position") || ""
    const category = c.req.query("category") || ""

    let query    = "SELECT * FROM banners WHERE active=1"
    const params = []

    if (page)     { query += " AND page=?";     params.push(page) }
    if (position) { query += " AND position=?"; params.push(position) }
    if (category) {
      query += " AND (category=? OR category='')"
      params.push(category)
    }

    query += " ORDER BY banner_order ASC"

    const { results } = await db.prepare(query).bind(...params).all()

    return c.json(success(results.map(b => ({
      id:       b.id,
      title:    b.title,
      image:    b.image,
      link:     b.link,
      page:     b.page,
      position: b.position,
      rotate:   !!b.auto_rotate
    }))))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= CREATE ================= */

app.post("/banners", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    /* Auto order */
    let order = Number(body.order)
    if (!order || order < 1) {
      const last = await db.prepare(
        "SELECT MAX(banner_order) as max FROM banners"
      ).first()
      order = (last?.max || 0) + 1
    } else {
      /* Shift others down */
      await db.prepare(`
        UPDATE banners
        SET banner_order=banner_order+1
        WHERE banner_order >= ?
      `).bind(order).run()
    }

    const id        = crypto.randomUUID()
    const timestamp = now()

    const row = {
      id,
      page:         body.page      || "home",
      category:     body.category  || "",
      position:     body.position  || "hero",
      title:        body.title.trim(),
      image:        body.image.trim(),
      link:         body.link      || "",
      banner_order: order,
      active:       body.active !== false ? 1 : 0,
      auto_rotate:  bool(body.rotate),
      created_at:   timestamp,
      updated_at:   timestamp
    }

    await db.prepare(`
      INSERT INTO banners (
        id,page,category,position,title,image,link,
        banner_order,active,auto_rotate,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.page, row.category, row.position,
      row.title, row.image, row.link,
      row.banner_order, row.active, row.auto_rotate,
      row.created_at, row.updated_at
    ).run()

    syncToReplicas(c.env, "insert", row)

    return c.json(success({ id }), 201)

  } catch (err) {
    console.error("banners POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ALL (ADMIN) ================= */

app.get("/banners", async (c) => {
  try {
    const db       = c.env.DB
    const page     = c.req.query("page")     || ""
    const position = c.req.query("position") || ""

    let where    = "WHERE 1=1"
    const params = []

    if (page)     { where += " AND page=?";     params.push(page) }
    if (position) { where += " AND position=?"; params.push(position) }

    const { results } = await db.prepare(`
      SELECT * FROM banners
      ${where}
      ORDER BY banner_order ASC
    `).bind(...params).all()

    return c.json(success(results.map(format)))

  } catch (err) {
    console.error("banners GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= GET ONE ================= */

app.get("/banners/:id", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare(
      "SELECT * FROM banners WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(failure("Banner not found"), 404)
    return c.json(success(format(row)))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= UPDATE ================= */

app.put("/banners/:id", async (c) => {
  try {
    const db   = c.env.DB
    const id   = c.req.param("id")
    const body = await c.req.json()

    const existing = await db.prepare(
      "SELECT id FROM banners WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Banner not found"), 404)

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const timestamp = now()

    const row = {
      id,
      page:         body.page      || "home",
      category:     body.category  || "",
      position:     body.position  || "hero",
      title:        body.title.trim(),
      image:        body.image.trim(),
      link:         body.link      || "",
      banner_order: Number(body.order) || 1,
      active:       bool(body.active),
      auto_rotate:  bool(body.rotate),
      updated_at:   timestamp
    }

    await db.prepare(`
      UPDATE banners SET
        page=?,category=?,position=?,title=?,image=?,link=?,
        banner_order=?,active=?,auto_rotate=?,updated_at=?
      WHERE id=?
    `).bind(
      row.page, row.category, row.position,
      row.title, row.image, row.link,
      row.banner_order, row.active, row.auto_rotate,
      row.updated_at, id
    ).run()

    syncToReplicas(c.env, "insert", { ...row, created_at: now() })

    return c.json(success({ id }))

  } catch (err) {
    console.error("banners PUT:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= TOGGLE ACTIVE ================= */

app.patch("/banners/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare(
      "SELECT id,active FROM banners WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(failure("Not found"), 404)

    const newVal = row.active ? 0 : 1
    await db.prepare(
      "UPDATE banners SET active=?,updated_at=? WHERE id=?"
    ).bind(newVal, now(), id).run()

    return c.json(success({ id, active: !!newVal }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================= DELETE ================= */

app.delete("/banners/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare(
      "SELECT id FROM banners WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Banner not found"), 404)

    await db.prepare("DELETE FROM banners WHERE id=?").bind(id).run()

    syncToReplicas(c.env, "delete", { id })

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    console.error("banners DELETE:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================= REORDER ================= */

app.post("/banners/reorder", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    if (!Array.isArray(body.order)) {
      return c.json(failure("order array required"), 400)
    }

    for (const item of body.order) {
      await db.prepare(
        "UPDATE banners SET banner_order=?,updated_at=? WHERE id=?"
      ).bind(item.order, now(), item.id).run()
    }

    return c.json(success({ updated: body.order.length }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
