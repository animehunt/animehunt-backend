// ============================================================
// src/routes/dbRestore.js  —  Database Restore Route
// ============================================================
// Admin-only endpoints:
//
//  POST /api/admin/db/restore/d1-from-turso
//  POST /api/admin/db/restore/d1-from-supabase
//  POST /api/admin/db/restore/turso-from-d1
//  POST /api/admin/db/restore/supabase-from-d1
//  GET  /api/admin/db/status          ← teeno DB ka health check
// ============================================================

import { Hono } from "hono"

const router = new Hono()

// All tables to sync (same as animehunt_database.sql)
const ALL_TABLES = [
  "anime", "episodes", "categories", "banners", "servers",
  "homepage_rows", "sidebar", "footer_config", "player_settings",
  "seo_settings", "seo_meta", "performance_settings",
  "security_settings", "banned_ips", "threat_logs",
  "search_settings", "search_logs", "system_settings", "system_logs",
  "deploy_state", "deploy_backups", "deploy_versions",
  "ai_state", "ai_settings", "ai_logs", "cache_store",
  "ads", "ads_logs", "downloads", "analytics"
]

/* ─────────────────────────────────────────────
   HEALTH CHECK — teeno DB ka status
───────────────────────────────────────────── */
router.get("/db/status", async (c) => {
  const status = { d1: false, turso: false, supabase: false }
  const counts = {}

  // D1 check
  try {
    const r = await c.env.DB.prepare("SELECT COUNT(*) as n FROM anime").first()
    status.d1 = true
    counts.d1_anime = r?.n || 0
  } catch (e) { status.d1_error = e.message }

  // Turso check
  try {
    const httpUrl = c.env.TURSO_URL?.replace("libsql://", "https://")
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${c.env.TURSO_AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "SELECT COUNT(*) as n FROM anime", args: [] } },
          { type: "close" }
        ]
      })
    })
    if (res.ok) {
      const data = await res.json()
      const rows = data.results?.[0]?.response?.result?.rows
      status.turso = true
      counts.turso_anime = rows?.[0]?.[0]?.value || 0
    }
  } catch (e) { status.turso_error = e.message }

  // Supabase check
  try {
    const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/anime?select=count`, {
      headers: {
        "apikey": c.env.SUPABASE_KEY,
        "Authorization": `Bearer ${c.env.SUPABASE_KEY}`,
        "Prefer": "count=exact",
        "Range": "0-0"
      }
    })
    status.supabase = res.ok
    counts.supabase_anime = res.headers.get("content-range")?.split("/")?.[1] || "?"
  } catch (e) { status.supabase_error = e.message }

  return c.json({ success: true, status, counts })
})

/* ─────────────────────────────────────────────
   HELPER: D1 se saari rows fetch karo
───────────────────────────────────────────── */
async function fetchAllFromD1(env, table) {
  try {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all()
    return results || []
  } catch (e) {
    console.warn(`D1 fetch failed for ${table}:`, e.message)
    return []
  }
}

/* ─────────────────────────────────────────────
   HELPER: Turso mein bulk insert
───────────────────────────────────────────── */
async function bulkInsertTurso(env, table, rows) {
  if (!rows.length) return 0
  const httpUrl = env.TURSO_URL.replace("libsql://", "https://")
  let count = 0

  for (const row of rows) {
    const keys   = Object.keys(row)
    const vals   = Object.values(row)
    const sql    = `INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
    const args   = vals.map(v =>
      v === null ? { type: "null" } :
      typeof v === "number" ? { type: "integer", value: String(v) } :
      { type: "text", value: String(v) }
    )

    try {
      await fetch(`${httpUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql, args } },
            { type: "close" }
          ]
        })
      })
      count++
    } catch (e) { console.warn(`Turso insert error (${table}):`, e.message) }
  }
  return count
}

/* ─────────────────────────────────────────────
   HELPER: Supabase mein bulk upsert
───────────────────────────────────────────── */
async function bulkUpsertSupabase(env, table, rows) {
  if (!rows.length) return 0

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(rows)
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(err)
    }
    return rows.length
  } catch (e) {
    console.warn(`Supabase upsert error (${table}):`, e.message)
    return 0
  }
}

/* ─────────────────────────────────────────────
   RESTORE: D1 → Turso
───────────────────────────────────────────── */
router.post("/db/restore/turso-from-d1", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    const rows = await fetchAllFromD1(c.env, table)
    const inserted = await bulkInsertTurso(c.env, table, rows)
    report[table] = inserted
    total += inserted
  }

  return c.json({
    success: true,
    message: `✅ Turso restored from D1 — ${total} rows synced`,
    report
  })
})

/* ─────────────────────────────────────────────
   RESTORE: D1 → Supabase
───────────────────────────────────────────── */
router.post("/db/restore/supabase-from-d1", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    const rows = await fetchAllFromD1(c.env, table)
    const inserted = await bulkUpsertSupabase(c.env, table, rows)
    report[table] = inserted
    total += inserted
  }

  return c.json({
    success: true,
    message: `✅ Supabase restored from D1 — ${total} rows synced`,
    report
  })
})

/* ─────────────────────────────────────────────
   RESTORE: Turso → D1
───────────────────────────────────────────── */
router.post("/db/restore/d1-from-turso", async (c) => {
  const httpUrl = c.env.TURSO_URL.replace("libsql://", "https://")
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    try {
      const res = await fetch(`${httpUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${c.env.TURSO_AUTH_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql: `SELECT * FROM ${table}`, args: [] } },
            { type: "close" }
          ]
        })
      })

      const data = await res.json()
      const result = data.results?.[0]?.response?.result
      const cols = result?.cols?.map(c => c.name) || []
      const rows = (result?.rows || []).map(row =>
        Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? null]))
      )

      let count = 0
      for (const row of rows) {
        const keys = Object.keys(row)
        const vals = Object.values(row)
        const sql  = `INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
        try {
          await c.env.DB.prepare(sql).bind(...vals).run()
          count++
        } catch (e) { console.warn(`D1 insert error (${table}):`, e.message) }
      }
      report[table] = count
      total += count
    } catch (e) {
      report[table] = `error: ${e.message}`
    }
  }

  return c.json({
    success: true,
    message: `✅ D1 restored from Turso — ${total} rows synced`,
    report
  })
})

/* ─────────────────────────────────────────────
   RESTORE: Supabase → D1
───────────────────────────────────────────── */
router.post("/db/restore/d1-from-supabase", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    try {
      const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
          "apikey": c.env.SUPABASE_KEY,
          "Authorization": `Bearer ${c.env.SUPABASE_KEY}`
        }
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = await res.json()

      let count = 0
      for (const row of rows) {
        const keys = Object.keys(row)
        const vals = Object.values(row)
        const sql  = `INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
        try {
          await c.env.DB.prepare(sql).bind(...vals).run()
          count++
        } catch (e) { console.warn(`D1 insert error (${table}):`, e.message) }
      }
      report[table] = count
      total += count
    } catch (e) {
      report[table] = `error: ${e.message}`
    }
  }

  return c.json({
    success: true,
    message: `✅ D1 restored from Supabase — ${total} rows synced`,
    report
  })
})

export default router

