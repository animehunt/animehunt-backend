/* ================================================
   ANIMEHUNT — SIDEBAR ADMIN (FINAL — ALL ISSUES FIXED)
   File: src/routes/sidebar.js
   Auth handled by adminAuth middleware in index.js

   BUGS FIXED:
   ✅ FIXED: /sidebar/reorder loop await → db.batch()
   ✅ FIXED: KV cache invalidated on every write
   ✅ FIXED: /sidebar/public route path — sidebar.js uses /sidebar/public
             public.js uses /api/sidebar/public — NO conflict
             (different paths, both can coexist)

   ROUTES (admin, all protected by middleware):
   GET    /sidebar/public    — Public menu (KV cached)
   GET    /sidebar           — Admin list
   GET    /sidebar/stats     — Stats
   POST   /sidebar           — Create or Update
   PATCH  /sidebar/:id/toggle — Toggle active
   DELETE /sidebar/:id       — Delete
   POST   /sidebar/reorder   — Bulk reorder (FIXED: db.batch)
   POST   /sidebar/default   — Reset to defaults
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
const KV_SIDEBAR_KEY     = "public:sidebar"
const KV_TTL             = 300

/* ================================================
   ENSURE TABLE
================================================ */

async function ensureTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS sidebar (
        id         TEXT    PRIMARY KEY,
        title      TEXT    NOT NULL,
        icon       TEXT    DEFAULT '',
        url        TEXT    NOT NULL,
        device     TEXT    DEFAULT 'All',
        visibility TEXT    DEFAULT 'All',
        highlight  TEXT    DEFAULT 'None',
        badge      TEXT    DEFAULT '',
        priority   INTEGER DEFAULT 99,
        active     INTEGER DEFAULT 1,
        newTab     INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      )
    `).run()
  } catch (err) {
    console.error("sidebar ensureTable:", err)
  }
}

/* ================================================
   KV CACHE INVALIDATE
================================================ */

async function invalidateCache(env) {
  if (env.KV) await env.KV.delete(KV_SIDEBAR_KEY).catch(() => {})
}

/* ================================================
   FORMAT ROW
================================================ */

function format(r) {
  return {
    id:         r.id,
    title:      r.title      || "",
    icon:       r.icon       || "",
    url:        r.url        || "",
    device:     r.device     || "All",
    visibility: r.visibility || "All",
    highlight:  r.highlight  || "None",
    badge:      r.badge      || "",
    priority:   r.priority   ?? 99,
    active:     !!r.active,
    newTab:     !!r.newTab,
    created_at: r.created_at || "",
    updated_at: r.updated_at || ""
  }
}

/* ================================================
   VALIDATE
================================================ */

function validate(body) {
  if (!body.title?.trim()) return "Title required"
  if (!body.url?.trim())   return "URL required"
  if (body.device     && !ALLOWED_DEVICE.includes(body.device))
    return "Invalid device value"
  if (body.visibility && !ALLOWED_VISIBILITY.includes(body.visibility))
    return "Invalid visibility value"
  if (body.highlight  && !ALLOWED_HIGHLIGHT.includes(body.highlight))
    return "Invalid highlight value"
  return null
}

/* ================================================
   SYNC TO REPLICAS (non-blocking)
================================================ */

function syncToReplicas(env, action, row) {
  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    const stmt = action === "delete"
      ? { sql: "DELETE FROM sidebar WHERE id=?", args: [{ type: "text", value: row.id }] }
      : {
          sql: `INSERT OR REPLACE INTO sidebar
            (id,title,icon,url,device,visibility,highlight,badge,
             priority,active,newTab,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            row.id, row.title, row.icon, row.url,
            row.device, row.visibility, row.highlight, row.badge,
            row.priority, row.active, row.newTab,
            row.created_at || "", row.updated_at || ""
          ].map(v => ({
            type:  typeof v === "number" ? "integer" : "text",
            value: String(v ?? "")
          }))
        }

    fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
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
      fetch(`${base}?id=eq.${row.id}`, { method: "DELETE", headers }).catch(() => {})
    } else {
      fetch(base, { method: "POST", headers, body: JSON.stringify(row) }).catch(() => {})
    }
  }
}

/* ✅ FIX (audit ISSUE-026, sidebar.js instance): removed dead duplicate
   route GET /sidebar/public. The prior comment here already correctly
   noted this file is admin-mounted and that public.js separately serves
   the real /api/sidebar/public — sharing a KV cache key was a thoughtful
   attempt to reduce impact, but it didn't change the fact that this exact
   route, at this exact path, was still only reachable at
   /api/admin/sidebar/public and never actually served a real public
   request. public.js's own copy is the one genuinely public path. */

/* ================================================
   GET /sidebar — Admin list
================================================ */

app.get("/sidebar", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)
    const { results } = await db.prepare(
      "SELECT * FROM sidebar ORDER BY priority ASC"
    ).all()
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

    const [total, active, hot, newItems] = await Promise.all([
      db.prepare("SELECT COUNT(*) as c FROM sidebar").first(),
      db.prepare("SELECT COUNT(*) as c FROM sidebar WHERE active=1").first(),
      db.prepare("SELECT COUNT(*) as c FROM sidebar WHERE highlight='HOT'").first(),
      db.prepare("SELECT COUNT(*) as c FROM sidebar WHERE highlight='NEW'").first()
    ])

    return c.json(success({
      total:  total?.c    || 0,
      active: active?.c   || 0,
      hot:    hot?.c      || 0,
      new:    newItems?.c || 0
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
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    await ensureTable(db)

    const err = validate(body)
    if (err) return c.json(failure(err), 400)

    const id        = (body._id && body._id.trim()) ? body._id.trim() : crypto.randomUUID()
    const timestamp = now()
    const isNew     = !(body._id && body._id.trim())

    const existRow = (body._id && body._id.trim())
      ? await db.prepare("SELECT id,created_at FROM sidebar WHERE id=?").bind(body._id.trim()).first()
      : null

    const row = {
      id,
      title:      clean(body.title),
      icon:       clean(body.icon) || "",
      url:        clean(body.url),
      device:     ALLOWED_DEVICE.includes(body.device)         ? body.device     : "All",
      visibility: ALLOWED_VISIBILITY.includes(body.visibility) ? body.visibility : "All",
      highlight:  ALLOWED_HIGHLIGHT.includes(body.highlight)   ? body.highlight  : "None",
      badge:      clean(body.badge) || "",
      priority:   Number(body.priority ?? 99),
      active:     bool(body.active !== false),
      newTab:     bool(body.newTab),
      created_at: existRow?.created_at || timestamp,
      updated_at: timestamp
    }

    await db.prepare(`
      INSERT INTO sidebar
        (id,title,icon,url,device,visibility,highlight,badge,
         priority,active,newTab,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
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

    await invalidateCache(c.env)
    syncToReplicas(c.env, "insert", row)

    return c.json(success({ id, saved: true }), isNew ? 201 : 200)
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   PATCH /sidebar/:id/toggle
================================================ */

app.patch("/sidebar/:id/toggle", async (c) => {
  try {
    const db  = c.env.DB
    const id  = c.req.param("id")
    const row = await db.prepare("SELECT id,active FROM sidebar WHERE id=?").bind(id).first()
    if (!row) return c.json(failure("Item not found"), 404)

    const newVal = row.active ? 0 : 1
    await db.prepare("UPDATE sidebar SET active=?,updated_at=? WHERE id=?")
      .bind(newVal, now(), id).run()

    await invalidateCache(c.env)
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
    const db  = c.env.DB
    const id  = c.req.param("id")

    const existing = await db.prepare("SELECT id FROM sidebar WHERE id=?").bind(id).first()
    if (!existing) return c.json(failure("Item not found"), 404)

    await db.prepare("DELETE FROM sidebar WHERE id=?").bind(id).run()

    await invalidateCache(c.env)
    syncToReplicas(c.env, "delete", { id })

    return c.json(success({ id, deleted: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /sidebar/reorder — Bulk reorder
   FIXED: Sequential await-in-loop → db.batch()
================================================ */

app.post("/sidebar/reorder", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    if (!Array.isArray(body.order) || body.order.length === 0) {
      return c.json(failure("order array required"), 400)
    }

    // Validate every item has id + priority
    const valid = body.order.every(item =>
      item.id !== undefined && item.priority !== undefined
    )
    if (!valid) {
      return c.json(failure("Each order item needs {id, priority}"), 400)
    }

    const timestamp = now()

    // FIXED: db.batch() — zero sequential awaits
    const statements = body.order.map(item =>
      db.prepare("UPDATE sidebar SET priority=?,updated_at=? WHERE id=?")
        .bind(Number(item.priority), timestamp, item.id)
    )

    await db.batch(statements)
    await invalidateCache(c.env)

    return c.json(success({ updated: body.order.length }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /sidebar/default — Reset to defaults
================================================ */

app.post("/sidebar/default", async (c) => {
  try {
    const db = c.env.DB
    await ensureTable(db)
    await db.prepare("DELETE FROM sidebar").run()

    const defaults = [
      { title: "About AnimeHunt", icon: "ℹ️",  url: "about.html",           priority: 1 },
      { title: "Privacy Policy",  icon: "🔒",  url: "privacy.html",         priority: 2 },
      { title: "Disclaimer",      icon: "📋",  url: "disclaimer.html",      priority: 3 },
      { title: "DMCA",            icon: "⚖️",  url: "dmca.html",            priority: 4 },
      { title: "Telegram",        icon: "📣",  url: "https://t.me/toons15", priority: 5, newTab: 1 }
    ]

    const timestamp = now()
    const rows = defaults.map(item => ({
      id:         crypto.randomUUID(),
      title:      item.title,
      icon:       item.icon   || "",
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
    }))

    // db.batch — no await-in-loop
    const stmts = rows.map(row =>
      db.prepare(`
        INSERT INTO sidebar
          (id,title,icon,url,device,visibility,highlight,badge,
           priority,active,newTab,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        row.id, row.title, row.icon, row.url,
        row.device, row.visibility, row.highlight, row.badge,
        row.priority, row.active, row.newTab,
        row.created_at, row.updated_at
      )
    )

    await db.batch(stmts)
    rows.forEach(row => syncToReplicas(c.env, "insert", row))
    await invalidateCache(c.env)

    return c.json(success({ created: rows.length }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
