         /* ================================================
   homepage.js — Homepage Row Builder
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

/* ================================================
   ENSURE TABLE
================================================ */

async function ensureTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS homepage_rows (
        id          TEXT    PRIMARY KEY,
        title       TEXT    NOT NULL,
        type        TEXT    DEFAULT 'auto',
        source      TEXT    DEFAULT '',
        layout      TEXT    DEFAULT 'scroll',
        row_limit   INTEGER DEFAULT 10,
        row_order   INTEGER DEFAULT 0,
        active      INTEGER DEFAULT 1,
        autoUpdate  INTEGER DEFAULT 0,
        show_more   INTEGER DEFAULT 1,
        more_link   TEXT    DEFAULT '',
        icon        TEXT    DEFAULT '',
        bg_color    TEXT    DEFAULT '',
        created_at  TEXT,
        updated_at  TEXT
      )
    `).run()
  } catch (err) {
    console.error("homepage ensureTable:", err)
  }
}

/* ================================================
   FORMAT ROW
================================================ */

function format(r) {
  return {
    id:         r.id,
    title:      r.title,
    type:       r.type,
    source:     r.source     || "",
    layout:     r.layout     || "scroll",
    limit:      r.row_limit  || 10,
    order:      r.row_order  || 0,
    active:     !!r.active,
    autoUpdate: !!r.autoUpdate,
    showMore:   !!r.show_more,
    moreLink:   r.more_link  || "",
    icon:       r.icon       || "",
    bgColor:    r.bg_color   || "",
    created_at: r.created_at,
    updated_at: r.updated_at
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, action, row) {
  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    const sql = action === "delete"
      ? { sql: "DELETE FROM homepage_rows WHERE id=?", args: [{ type:"text", value: row.id }] }
      : {
          sql: `INSERT OR REPLACE INTO homepage_rows (
            id,title,type,source,layout,row_limit,row_order,active,autoUpdate,
            show_more,more_link,icon,bg_color,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: row.id },
            { type:"text",    value: row.title },
            { type:"text",    value: row.type },
            { type:"text",    value: row.source },
            { type:"text",    value: row.layout },
            { type:"integer", value: String(row.row_limit) },
            { type:"integer", value: String(row.row_order) },
            { type:"integer", value: String(row.active) },
            { type:"integer", value: String(row.autoUpdate) },
            { type:"integer", value: String(row.show_more) },
            { type:"text",    value: row.more_link },
            { type:"text",    value: row.icon },
            { type:"text",    value: row.bg_color },
            { type:"text",    value: row.created_at || "" },
            { type:"text",    value: row.updated_at || "" }
          ]
        }

    fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({ requests: [{ type:"execute", stmt: sql }] })
    }).catch(e => console.error("Turso homepage sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    const base    = `${env.SUPABASE_URL}/rest/v1/homepage_rows`
    const headers = {
      "apikey":        env.SUPABASE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type":  "application/json",
      "Prefer":        "resolution=merge-duplicates"
    }

    if (action === "delete") {
      fetch(`${base}?id=eq.${row.id}`, { method:"DELETE", headers }).catch(e => console.error("Supabase homepage sync:", e))
    } else {
      fetch(base, { method:"POST", headers, body: JSON.stringify(row) }).catch(e => console.error("Supabase homepage sync:", e))
    }
  }
}

/* ✅ FIX (audit ISSUE-026, homepage.js instance): removed dead duplicate
   route GET /homepage/public (previously ~180 lines). This file is only
   mounted under adminRoutes (see index.js), so it was only ever reachable
   at /api/admin/homepage/public — behind admin auth, never actually
   serving the public site. public.js already correctly and independently
   serves the real public version at /api/homepage/public. Worth noting:
   this dead handler's WHERE clauses also never checked active=1 (only
   is_hidden=0) — a second gap beyond just being unreachable, further
   confirming it was safe to remove rather than fix-and-remount. */

/* ================================================
   GET /homepage — Admin list
================================================ */

app.get("/homepage", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    const { results } = await db.prepare(`
      SELECT * FROM homepage_rows ORDER BY row_order ASC
    `).all()

    return c.json(success(results.map(format)))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /homepage/stats
================================================ */

app.get("/homepage/stats", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    const total  = await db.prepare("SELECT COUNT(*) as c FROM homepage_rows").first()
    const active = await db.prepare("SELECT COUNT(*) as c FROM homepage_rows WHERE active=1").first()
    const auto   = await db.prepare("SELECT COUNT(*) as c FROM homepage_rows WHERE autoUpdate=1").first()

    return c.json(success({
      total:  total?.c  || 0,
      active: active?.c || 0,
      auto:   auto?.c   || 0
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /homepage/:id — single row
================================================ */

app.get("/homepage/:id", async (c) => {
  try {
    const db  = c.env.DB
    const row = await db.prepare(
      "SELECT * FROM homepage_rows WHERE id=?"
    ).bind(c.req.param("id")).first()

    if (!row) return c.json(failure("Row not found"), 404)
    return c.json(success(format(row)))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /homepage — Create
================================================ */

app.post("/homepage", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    await ensureTable(db)

    if (!body.title?.trim()) return c.json(failure("Title required"), 400)

    /* Auto order — put at end */
    const last = await db.prepare(
      "SELECT MAX(row_order) as max FROM homepage_rows"
    ).first()
    const order = Number(body.order) || (last?.max || 0) + 1

    const id        = crypto.randomUUID()
    const timestamp = now()

    const row = {
      id,
      title:      body.title.trim(),
      type:       body.type    || "auto",
      source:     body.source  || "",
      layout:     body.layout  || "scroll",
      row_limit:  Number(body.limit || 10),
      row_order:  order,
      active:     bool(body.active !== false),
      autoUpdate: bool(body.autoUpdate),
      show_more:  bool(body.showMore !== false),
      more_link:  body.moreLink || "",
      icon:       body.icon    || "",
      bg_color:   body.bgColor || "",
      created_at: timestamp,
      updated_at: timestamp
    }

    await db.prepare(`
      INSERT INTO homepage_rows (
        id,title,type,source,layout,row_limit,row_order,active,autoUpdate,
        show_more,more_link,icon,bg_color,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      row.id, row.title, row.type, row.source, row.layout,
      row.row_limit, row.row_order, row.active, row.autoUpdate,
      row.show_more, row.more_link, row.icon, row.bg_color,
      row.created_at, row.updated_at
    ).run()

    syncToReplicas(c.env, "insert", row)

    return c.json(success({ id }), 201)

  } catch (err) {
    console.error("homepage POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   PATCH /homepage/:id — Update
================================================ */

app.patch("/homepage/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    if (!body.title?.trim()) return c.json(failure("Title required"), 400)

    const existing = await db.prepare(
      "SELECT id FROM homepage_rows WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Row not found"), 404)

    const timestamp = now()
    const row = {
      id,
      title:      body.title.trim(),
      type:       body.type    || "auto",
      source:     body.source  || "",
      layout:     body.layout  || "scroll",
      row_limit:  Number(body.limit || 10),
      row_order:  Number(body.order || 0),
      active:     bool(body.active !== false),
      autoUpdate: bool(body.autoUpdate),
      show_more:  bool(body.showMore !== false),
      more_link:  body.moreLink || "",
      icon:       body.icon    || "",
      bg_color:   body.bgColor || "",
      updated_at: timestamp
    }

    await db.prepare(`
      UPDATE homepage_rows SET
        title=?,type=?,source=?,layout=?,row_limit=?,row_order=?,
        active=?,autoUpdate=?,show_more=?,more_link=?,icon=?,bg_color=?,
        updated_at=?
      WHERE id=?
    `).bind(
      row.title, row.type, row.source, row.layout,
      row.row_limit, row.row_order, row.active, row.autoUpdate,
      row.show_more, row.more_link, row.icon, row.bg_color,
      row.updated_at, id
    ).run()

    syncToReplicas(c.env, "insert", { ...row, created_at: now() })

    return c.json(success({ id }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   PATCH /homepage/:id/toggle — Toggle active
================================================ */

app.patch("/homepage/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare(
      "SELECT id,active FROM homepage_rows WHERE id=?"
    ).bind(id).first()

    if (!row) return c.json(failure("Not found"), 404)

    const newVal = row.active ? 0 : 1
    await db.prepare(
      "UPDATE homepage_rows SET active=?,updated_at=? WHERE id=?"
    ).bind(newVal, now(), id).run()

    return c.json(success({ id, active: !!newVal }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /homepage/:id
================================================ */

app.delete("/homepage/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare(
      "SELECT id FROM homepage_rows WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Row not found"), 404)

    await db.prepare("DELETE FROM homepage_rows WHERE id=?").bind(id).run()

    syncToReplicas(c.env, "delete", { id })

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /homepage/reorder — Bulk reorder
================================================ */

app.post("/homepage/reorder", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    if (!Array.isArray(body.order) || body.order.length === 0) {
      return c.json(failure("order array required"), 400)
    }

    const timestamp = now()
    const stmts = body.order.map(item =>
      db.prepare(
        "UPDATE homepage_rows SET row_order=?,updated_at=? WHERE id=?"
      ).bind(item.order, timestamp, item.id)
    )

    await db.batch(stmts)

    return c.json(success({ updated: body.order.length }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /homepage/auto-build — AI auto-build homepage
================================================ */

app.post("/homepage/auto-build", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    /* Clear existing rows */
    await db.prepare("DELETE FROM homepage_rows").run()

    const DEFAULT_ROWS = [
      { title: "🔥 Trending Now",      type: "trending",   layout: "scroll", limit: 12, icon: "🔥" },
      { title: "🆕 Latest Added",       type: "auto",       layout: "scroll", limit: 12, icon: "🆕" },
      { title: "🎬 Top Rated",          type: "top_rated",  layout: "scroll", limit: 12, icon: "⭐" },
      { title: "📺 Ongoing Series",     type: "ongoing",    layout: "scroll", limit: 10, icon: "📺" },
      { title: "✅ Completed Anime",    type: "completed",  layout: "scroll", limit: 10, icon: "✅" },
      { title: "👁 Most Viewed",        type: "most_viewed",layout: "scroll", limit: 10, icon: "👁" },
      { title: "🎭 Movies",             type: "movies",     layout: "scroll", limit: 10, icon: "🎭" },
      { title: "📺 Cartoons",           type: "cartoon",    layout: "scroll", limit: 10, icon: "🎨" },
      { title: "⚔️ Action",            type: "genre",      source: "Action",  layout: "scroll", limit: 10, icon: "⚔️" },
      { title: "💕 Romance",            type: "genre",      source: "Romance", layout: "scroll", limit: 10, icon: "💕" }
    ]

    let order = 1
    const created = []

    for (const r of DEFAULT_ROWS) {
      const id        = crypto.randomUUID()
      const timestamp = now()

      const row = {
        id,
        title:      r.title,
        type:       r.type,
        source:     r.source    || "",
        layout:     r.layout,
        row_limit:  r.limit     || 10,
        row_order:  order++,
        active:     1,
        autoUpdate: 1,
        show_more:  1,
        more_link:  "",
        icon:       r.icon      || "",
        bg_color:   "",
        created_at: timestamp,
        updated_at: timestamp
      }

      await db.prepare(`
        INSERT INTO homepage_rows (
          id,title,type,source,layout,row_limit,row_order,active,autoUpdate,
          show_more,more_link,icon,bg_color,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        row.id, row.title, row.type, row.source, row.layout,
        row.row_limit, row.row_order, row.active, row.autoUpdate,
        row.show_more, row.more_link, row.icon, row.bg_color,
        row.created_at, row.updated_at
      ).run()

      syncToReplicas(c.env, "insert", row)
      created.push({ id, title: r.title })
    }

    return c.json(success({ created: created.length, rows: created }))

  } catch (err) {
    console.error("auto-build:", err)
    return c.json(failure(err.message), 500)
  }
})

export default app
