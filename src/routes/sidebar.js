
/* ================================================
   sidebar.js — Sidebar Menu Management
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)
const clean   = (v)    => (typeof v === "string" ? v.trim() : v ?? "")

const ALLOWED_DEVICE     = ["All", "Desktop", "Mobile"]
const ALLOWED_VISIBILITY = ["All", "Logged Users", "Guests"]
const ALLOWED_HIGHLIGHT  = ["None", "NEW", "HOT", "UPDATE"]

/* ================================================
   ENSURE TABLE
================================================ */

async function ensureTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sidebar (
        id          TEXT    PRIMARY KEY,
        title       TEXT    NOT NULL,
        icon        TEXT    DEFAULT '',
        url         TEXT    NOT NULL,
        device      TEXT    DEFAULT 'All',
        visibility  TEXT    DEFAULT 'All',
        highlight   TEXT    DEFAULT 'None',
        badge       TEXT    DEFAULT '',
        priority    INTEGER DEFAULT 99,
        active      INTEGER DEFAULT 1,
        newTab      INTEGER DEFAULT 0,
        created_at  TEXT,
        updated_at  TEXT
      )
    `).run()
  } catch (err) {
    console.error("sidebar ensureTable:", err)
  }
}

/* ================================================
   FORMAT ROW
================================================ */

function format(r) {
  return {
    id:         r.id,
    title:      r.title,
    icon:       r.icon       || "",
    url:        r.url,
    device:     r.device     || "All",
    visibility: r.visibility || "All",
    highlight:  r.highlight  || "None",
    badge:      r.badge      || "",
    priority:   r.priority   || 99,
    active:     !!r.active,
    newTab:     !!r.newTab,
    created_at: r.created_at,
    updated_at: r.updated_at
  }
}

/* ================================================
   VALIDATE
================================================ */

function validate(body) {
  if (!body.title?.trim())  return "Title required"
  if (!body.url?.trim())    return "URL required"
  if (body.device     && !ALLOWED_DEVICE.includes(body.device))
    return "Invalid device value"
  if (body.visibility && !ALLOWED_VISIBILITY.includes(body.visibility))
    return "Invalid visibility value"
  if (body.highlight  && !ALLOWED_HIGHLIGHT.includes(body.highlight))
    return "Invalid highlight value"
  return null
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, action, row) {
  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    const stmt = action === "delete"
      ? { sql: "DELETE FROM sidebar WHERE id=?", args: [{ type:"text", value: row.id }] }
      : {
          sql: `INSERT OR REPLACE INTO sidebar (
            id,title,icon,url,device,visibility,highlight,badge,
            priority,active,newTab,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            { type:"text",    value: row.id },
            { type:"text",    value: row.title },
            { type:"text",    value: row.icon },
            { type:"text",    value: row.url },
            { type:"text",    value: row.device },
            { type:"text",    value: row.visibility },
            { type:"text",    value: row.highlight },
            { type:"text",    value: row.badge },
            { type:"integer", value: row.priority },
            { type:"integer", value: row.active },
            { type:"integer", value: row.newTab },
            { type:"text",    value: row.created_at || "" },
            { type:"text",    value: row.updated_at || "" }
          ]
        }

    fetch(`${env.TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({ requests: [{ type: "execute", stmt }] })
    }).catch(e => console.error("Turso sidebar sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    const base    = `${env.SUPABASE_URL}/rest/v1/sidebar`
    const headers = {
      "apikey":        env.SUPABASE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type":  "application/json",
      "Prefer":        "resolution=merge-duplicates"
    }
    if (action === "delete") {
      fetch(`${base}?id=eq.${row.id}`, { method:"DELETE", headers })
        .catch(e => console.error("Supabase sidebar sync:", e))
    } else {
      fetch(base, { method:"POST", headers, body: JSON.stringify(row) })
        .catch(e => console.error("Supabase sidebar sync:", e))
    }
  }
}

/* ================================================
   PUBLIC — must be before /:id
================================================ */

app.get("/sidebar/public", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    const { results } = await db.prepare(`
      SELECT id,title,icon,url,highlight,badge,priority,newTab,device,visibility
      FROM sidebar
      WHERE active=1
      ORDER BY priority ASC
    `).all()

    return c.json(success(results || []))

  } catch (err) {
    return c.json(success([]))
  }
})

/* ================================================
   GET /sidebar — Admin list
================================================ */

app.get("/sidebar", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    const { results } = await db.prepare(`
      SELECT * FROM sidebar ORDER BY priority ASC
    `).all()

    return c.json(success((results || []).map(format)))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /sidebar/stats
================================================ */

app.get("/sidebar/stats", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    const total  = await db.prepare("SELECT COUNT(*) as c FROM sidebar").first()
    const active = await db.prepare("SELECT COUNT(*) as c FROM sidebar WHERE active=1").first()
    const hot    = await db.prepare("SELECT COUNT(*) as c FROM sidebar WHERE highlight='HOT'").first()
    const newI   = await db.prepare("SELECT COUNT(*) as c FROM sidebar WHERE highlight='NEW'").first()

    return c.json(success({
      total:  total?.c  || 0,
      active: active?.c || 0,
      hot:    hot?.c    || 0,
      new:    newI?.c   || 0
    }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /sidebar — Create or Update (upsert)
================================================ */

app.post("/sidebar", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureTable(db)

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const id        = body._id || crypto.randomUUID()
    const timestamp = now()

    const isNew = !body._id
    const existRow = body._id
      ? await db.prepare("SELECT id,created_at FROM sidebar WHERE id=?").bind(body._id).first()
      : null

    const row = {
      id,
      title:      clean(body.title),
      icon:       clean(body.icon)  || "",
      url:        clean(body.url),
      device:     ALLOWED_DEVICE.includes(body.device)          ? body.device      : "All",
      visibility: ALLOWED_VISIBILITY.includes(body.visibility)  ? body.visibility  : "All",
      highlight:  ALLOWED_HIGHLIGHT.includes(body.highlight)    ? body.highlight   : "None",
      badge:      clean(body.badge)  || "",
      priority:   Number(body.priority || 99),
      active:     bool(body.active !== false),
      newTab:     bool(body.newTab),
      created_at: existRow?.created_at || timestamp,
      updated_at: timestamp
    }

    await db.prepare(`
      INSERT INTO sidebar (
        id,title,icon,url,device,visibility,highlight,badge,
        priority,active,newTab,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        icon=excluded.icon,
        url=excluded.url,
        device=excluded.device,
        visibility=excluded.visibility,
        highlight=excluded.highlight,
        badge=excluded.badge,
        priority=excluded.priority,
        active=excluded.active,
        newTab=excluded.newTab,
        updated_at=excluded.updated_at
    `).bind(
      row.id, row.title, row.icon, row.url,
      row.device, row.visibility, row.highlight, row.badge,
      row.priority, row.active, row.newTab,
      row.created_at, row.updated_at
    ).run()

    syncToReplicas(c.env, "insert", row)

    return c.json(success({ id, saved: true }), isNew ? 201 : 200)

  } catch (err) {
    console.error("sidebar POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   PATCH /sidebar/:id/toggle — Toggle active
================================================ */

app.patch("/sidebar/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT id,active FROM sidebar WHERE id=?").bind(id).first()

    if (!row) return c.json(failure("Item not found"), 404)

    const newVal = row.active ? 0 : 1
    await db.prepare(
      "UPDATE sidebar SET active=?,updated_at=? WHERE id=?"
    ).bind(newVal, now(), id).run()

    return c.json(success({ id, active: !!newVal }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /sidebar/:id
================================================ */

app.delete("/sidebar/:id", async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param("id")

    const existing = await db.prepare(
      "SELECT id FROM sidebar WHERE id=?"
    ).bind(id).first()
    if (!existing) return c.json(failure("Item not found"), 404)

    await db.prepare("DELETE FROM sidebar WHERE id=?").bind(id).run()

    syncToReplicas(c.env, "delete", { id })

    return c.json(success({ id, deleted: true }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /sidebar/reorder — Bulk reorder
================================================ */

app.post("/sidebar/reorder", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()

    if (!Array.isArray(body.order)) {
      return c.json(failure("order array required"), 400)
    }

    for (const item of body.order) {
      await db.prepare(
        "UPDATE sidebar SET priority=?,updated_at=? WHERE id=?"
      ).bind(item.priority, now(), item.id).run()
    }

    return c.json(success({ updated: body.order.length }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /sidebar/default — Auto-build default menu
================================================ */

app.post("/sidebar/default", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)

    await db.prepare("DELETE FROM sidebar").run()

    const defaults = [
      { title: "About AnimeHunt", icon: "ℹ️",  url: "about.html",       priority: 1 },
      { title: "Privacy Policy",  icon: "🔒",  url: "privacy.html",     priority: 2 },
      { title: "Disclaimer",      icon: "📋",  url: "disclaimer.html",  priority: 3 },
      { title: "DMCA",            icon: "⚖️",  url: "dmca.html",        priority: 4 },
      { title: "Telegram",        icon: "📣",  url: "https://t.me/toons15", priority: 5, newTab: 1 }
    ]

    const timestamp = now()
    for (const item of defaults) {
      const id  = crypto.randomUUID()
      const row = {
        id,
        title:      item.title,
        icon:       item.icon || "",
        url:        item.url,
        device:     "All",
        visibility: "All",
        highlight:  "None",
        badge:      "",
        priority:   item.priority,
        active:     1,
        newTab:     item.newTab || 0,
        created_at: timestamp,
        updated_at: timestamp
      }

      await db.prepare(`
        INSERT INTO sidebar (
          id,title,icon,url,device,visibility,highlight,badge,
          priority,active,newTab,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        row.id, row.title, row.icon, row.url,
        row.device, row.visibility, row.highlight, row.badge,
        row.priority, row.active, row.newTab,
        row.created_at, row.updated_at
      ).run()

      syncToReplicas(c.env, "insert", row)
    }

    return c.json(success({ created: defaults.length }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
