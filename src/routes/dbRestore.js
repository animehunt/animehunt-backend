// ============================================================
// src/routes/dbRestore.js  —  Database Restore & Recovery
// ============================================================
// Admin-only endpoints:
//  GET  /api/admin/db/status
//  GET  /api/admin/db/sync-status
//  POST /api/admin/db/restore/full
//  POST /api/admin/db/snapshot            ← manual snapshot to VPS disk
//  POST /api/admin/db/snapshot/restore    ← restore from VPS disk snapshot
//  POST /api/admin/db/reconcile
//  POST /api/admin/db/replay-events
//  GET  /api/admin/db/dead-letter
//  POST /api/admin/db/dead-letter/retry
//  GET  /api/admin/db/audit-log
//  GET  /api/admin/db/checksums
// ============================================================

import { Hono } from "hono"
import { promises as fs } from "fs"
import path from "path"
import crypto from "node:crypto"
import {
  tursoQuery, supabaseQuery,
  resolveConflict, nowISO,
  ORIGIN_D1, ORIGIN_TURSO, ORIGIN_SUPABASE
} from "../db.js"

const BACKUP_DIR = path.resolve(process.cwd(), "backups")

// Ensure backup directory exists on VPS
fs.mkdir(BACKUP_DIR, { recursive: true }).catch(() => {})

function passThrough(sql) {
  return sql  
}

const router = new Hono()

const ALL_TABLES = [
  "ad_assignments", "ad_stats", "admin_users", "ads_library",
  "ai_logs", "ai_settings", "ai_state", "analytics",
  "analytics_downloads", "analytics_views", "anime", "audit_logs",
  "banned_ips", "banner_clicks", "banners", "broken_link_reports",
  "cache_store", "categories", "config_versions", "deploy_backups",
  "deploy_state", "deploy_versions", "download_entries",
  "download_host_entries", "download_links", "download_sessions",
  "downloads", "episodes", "footer_config", "homepage_rows",
  "host_monetization", "hosts", "impression_counters",
  "nav_monetization", "page_monetization", "performance_settings",
  "player_sessions", "player_settings", "popup_library",
  "redirect_library", "search_logs", "search_settings",
  "security_settings", "seo_meta", "seo_settings", "servers",
  "shortlinks_library", "sidebar", "system_logs", "system_settings",
  "threat_logs", "user_video_config", "watch_progress"
]

function isSafeToReplay(sql) {
  if (typeof sql !== "string") return false
  const clean = sql.trim().toUpperCase()
  const isWriteStmt = /^(INSERT|UPDATE|DELETE)\b/.test(clean)
  if (!isWriteStmt) return false

  const match = sql.match(/(?:INTO|UPDATE|FROM)\s+([`"]?[\w]+[`"]?)/i)
  const table = match ? match[1].replace(/[`"]/g, "") : null
  return table && ALL_TABLES.includes(table)
}

async function fetchAllFromD1(env, table) {
  try {
    const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all()
    return results || []
  } catch (e) {
    return []
  }
}

async function fetchAllFromTurso(env, table) {
  try {
    const httpUrl = env.TURSO_REPLICA_URL.replace("libsql://", "https://")
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: `SELECT * FROM ${table}`, args: [] } },
          { type: "close" }
        ]
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const result = data.results?.[0]?.response?.result
    const cols   = result?.cols?.map(c => c.name) || []
    return (result?.rows || []).map(row =>
      Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? null]))
    )
  } catch (e) {
    return []
  }
}

async function fetchAllFromSupabase(env, table) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    return []
  }
}

async function bulkWriteToD1(env, table, rows) {
  if (!rows.length) return 0
  let count = 0
  for (const row of rows) {
    const keys = Object.keys(row)
    const vals = Object.values(row)
    const sql  = `INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
    try {
      await env.DB.prepare(sql).bind(...vals).run()
      count++
    } catch (e) {}
  }
  return count
}

async function bulkWriteToTurso(env, table, rows) {
  if (!rows.length) return 0
  if (!env.TURSO_REPLICA_URL || !env.TURSO_REPLICA_AUTH_TOKEN) return 0
  
  const httpUrl = env.TURSO_REPLICA_URL.replace("libsql://", "https://")
  let count = 0
  for (const row of rows) {
    const keys = Object.keys(row)
    const vals = Object.values(row)
    const sql  = `INSERT OR REPLACE INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`
    const args = vals.map(v =>
      v === null       ? { type: "null" } :
      typeof v === "number" ? { type: "integer", value: String(v) } :
                         { type: "text", value: String(v) }
    )
    try {
      await fetch(`${httpUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
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
    } catch (e) {}
  }
  return count
}

async function bulkWriteToSupabase(env, table, rows) {
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
    if (!res.ok) throw new Error(await res.text())
    return rows.length
  } catch (e) { return 0 }
}

async function checkD1Health(env) {
  try {
    const r = await env.DB.prepare("SELECT COUNT(*) as n FROM anime").first()
    return { ok: true, anime_count: r?.n || 0 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function checkTursoHealth(env) {
  try {
    const httpUrl = env.TURSO_REPLICA_URL?.replace("libsql://", "https://")
    if (!httpUrl) return { ok: false, error: "TURSO_REPLICA_URL not set" }
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "SELECT COUNT(*) as n FROM anime", args: [] } },
          { type: "close" }
        ]
      })
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    const rows = data.results?.[0]?.response?.result?.rows
    return { ok: true, anime_count: rows?.[0]?.[0]?.value || 0 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function checkSupabaseHealth(env) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
      return { ok: false, error: "SUPABASE_URL or SUPABASE_KEY not set" }
    }
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/anime?select=count`, {
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Prefer": "count=exact",
        "Range": "0-0"
      }
    })
    const count = res.headers.get("content-range")?.split("/")?.[1] || "?"
    return { ok: res.ok, anime_count: count }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function computeTableChecksum(rows) {
  if (!rows.length) return "empty"
  const sorted = [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const raw     = JSON.stringify(sorted)
  const encoded = new TextEncoder().encode(raw)
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded)
  const hashArr = Array.from(new Uint8Array(hashBuf))
  return hashArr.map(b => b.toString(16).padStart(2, "0")).join("")
}

async function fetchTableChunked(env, table, chunkSize = 100) {
  const rows    = []
  let   offset  = 0
  let   hasMore = true

  while (hasMore) {
    let chunk
    try {
      chunk = await env.DB.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).bind(chunkSize, offset).all()
    } catch { break }
    if (!chunk.results || chunk.results.length === 0) break
    rows.push(...chunk.results)
    offset  += chunkSize
    hasMore  = chunk.results.length === chunkSize
  }
  return rows
}

/* ─────────────────────────────────────────────────────────────
   SNAPSHOT TO LOCAL VPS STORAGE
───────────────────────────────────────────────────────────── */
async function snapshotToLocal(env, label = "auto") {
  const snapshot = {
    version:    "2.0",
    label,
    created_at: nowISO(),
    tables:     {}
  }

  for (const table of ALL_TABLES) {
    snapshot.tables[table] = await fetchTableChunked(env, table)
  }

  const filename = `snapshot-${label}-${Date.now()}.json`
  const filePath = path.join(BACKUP_DIR, filename)
  const body = JSON.stringify(snapshot)

  try {
    await fs.writeFile(filePath, body, "utf8")
    return { ok: true, key: filename, size_kb: Math.round(body.length / 1024) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function restoreFromLocal(env, key, targets = ["d1", "turso", "supabase"]) {
  try {
    const filePath = path.join(BACKUP_DIR, key)
    const text = await fs.readFile(filePath, "utf8")
    const snapshot = JSON.parse(text)
    
    const report   = {}
    let   total    = 0

    for (const table of ALL_TABLES) {
      const rows = snapshot.tables[table] || []
      report[table] = {}

      if (targets.includes("d1")) {
        report[table].d1 = await bulkWriteToD1(env, table, rows)
        total += report[table].d1
      }
      if (targets.includes("turso")) {
        report[table].turso = await bulkWriteToTurso(env, table, rows)
      }
      if (targets.includes("supabase")) {
        report[table].supabase = await bulkWriteToSupabase(env, table, rows)
      }
    }

    return {
      ok: true, snapshot_key: key,
      snapshot_date: snapshot.created_at,
      total_rows: total, report
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function reconcileTable(env, table) {
  const [d1Rows, tursoRows, supaRows] = await Promise.all([
    fetchAllFromD1(env, table),
    fetchAllFromTurso(env, table),
    fetchAllFromSupabase(env, table)
  ])

  const toMap = (rows) => {
    const m = new Map()
    for (const row of rows) {
      const key = row.id || row.slug || JSON.stringify(row)
      m.set(key, row)
    }
    return m
  }

  const d1Map    = toMap(d1Rows)
  const tursoMap = toMap(tursoRows)
  const supaMap  = toMap(supaRows)

  const allIds = new Set([ ...d1Map.keys(), ...tursoMap.keys(), ...supaMap.keys() ])

  const conflicts = []
  const synced    = []
  const missing   = { d1: [], turso: [], supabase: [] }

  for (const id of allIds) {
    const d1Row    = d1Map.get(id) || null
    const tursoRow = tursoMap.get(id) || null
    const supaRow  = supaMap.get(id) || null

    const d1Str    = JSON.stringify(d1Row)
    const tursoStr = JSON.stringify(tursoRow)
    const supaStr  = JSON.stringify(supaRow)

    if (d1Str === tursoStr && tursoStr === supaStr) {
      synced.push(id)
      continue
    }

    let winner = d1Row || tursoRow || supaRow

    if (d1Row && tursoRow) {
      const w = resolveConflict(d1Row, tursoRow, ORIGIN_D1)
      winner  = w === "local" ? d1Row : tursoRow
    }
    if (winner && supaRow) {
      const w = resolveConflict(winner, supaRow, ORIGIN_D1)
      winner  = w === "local" ? winner : supaRow
    }

    conflicts.push({ id, winner_source: "resolved" })

    if (winner) {
      await bulkWriteToD1(env, table, [winner])
      await bulkWriteToTurso(env, table, [winner])
      await bulkWriteToSupabase(env, table, [winner])
    }

    if (!d1Row)    missing.d1.push(id)
    if (!tursoRow) missing.turso.push(id)
    if (!supaRow)  missing.supabase.push(id)
  }

  return {
    table, total: allIds.size, synced: synced.length,
    conflicts: conflicts.length, missing,
    status: conflicts.length === 0 ? "in_sync" : "reconciled"
  }
}

/* ═══════════════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════════════ */

router.get("/db/status", async (c) => {
  const [d1, turso, supabase] = await Promise.all([
    checkD1Health(c.env), checkTursoHealth(c.env), checkSupabaseHealth(c.env)
  ])
  const allOk = d1.ok && turso.ok && supabase.ok
  return c.json({
    success: true, overall: allOk ? "healthy" : "degraded",
    databases: { d1, turso, supabase }, checked_at: nowISO()
  })
})

router.get("/db/sync-status", async (c) => {
  try {
    const [pending, failed, deadLetter, recentAudit] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) as n FROM sync_event_log WHERE status='pending'").first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM sync_event_log WHERE status='failed'").first(),
      c.env.DB.prepare("SELECT COUNT(*) as n FROM sync_dead_letter").first(),
      c.env.DB.prepare("SELECT * FROM sync_audit_log ORDER BY created_at DESC LIMIT 20").all()
    ])
    return c.json({
      success: true,
      event_log: { pending: pending?.n || 0, failed: failed?.n || 0, dead_letter: deadLetter?.n || 0 },
      recent_audit: recentAudit.results || [], checked_at: nowISO()
    })
  } catch (e) { return c.json({ success: false, message: e.message }, 500) }
})

router.post("/db/restore/turso-from-d1", async (c) => {
  const report = {}; let total = 0
  for (const table of ALL_TABLES) {
    const rows = await fetchAllFromD1(c.env, table)
    const inserted = await bulkWriteToTurso(c.env, table, rows)
    report[table] = inserted; total += inserted
  }
  return c.json({ success: true, message: `✅ Turso restored from D1 — ${total} rows`, source: "d1", target: "turso", report, restored_at: nowISO() })
})

router.post("/db/restore/supabase-from-d1", async (c) => {
  const report = {}; let total = 0
  for (const table of ALL_TABLES) {
    const rows = await fetchAllFromD1(c.env, table)
    const inserted = await bulkWriteToSupabase(c.env, table, rows)
    report[table] = inserted; total += inserted
  }
  return c.json({ success: true, message: `✅ Supabase restored from D1 — ${total} rows`, source: "d1", target: "supabase", report, restored_at: nowISO() })
})

router.post("/db/restore/d1-from-turso", async (c) => {
  const report = {}; let total = 0
  for (const table of ALL_TABLES) {
    const rows = await fetchAllFromTurso(c.env, table)
    const inserted = await bulkWriteToD1(c.env, table, rows)
    report[table] = inserted; total += inserted
  }
  return c.json({ success: true, message: `✅ D1 restored from Turso — ${total} rows`, source: "turso", target: "d1", report, restored_at: nowISO() })
})

router.post("/db/restore/d1-from-supabase", async (c) => {
  const report = {}; let total = 0
  for (const table of ALL_TABLES) {
    const rows = await fetchAllFromSupabase(c.env, table)
    const inserted = await bulkWriteToD1(c.env, table, rows)
    report[table] = inserted; total += inserted
  }
  return c.json({ success: true, message: `✅ D1 restored from Supabase — ${total} rows`, source: "supabase", target: "d1", report, restored_at: nowISO() })
})

router.post("/db/restore/full", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const force_source = body.source  
  const [d1Health, tursoHealth, supaHealth] = await Promise.all([ checkD1Health(c.env), checkTursoHealth(c.env), checkSupabaseHealth(c.env) ])
  const alive = { d1: d1Health.ok, turso: tursoHealth.ok, supabase: supaHealth.ok }
  let source = force_source
  if (!source) {
    if (alive.d1) source = "d1"
    else if (alive.turso) source = "turso"
    else if (alive.supabase) source = "supabase"
    else return c.json({ success: false, error: "All databases are offline.", alive }, 503)
  }
  const targets = Object.entries(alive).filter(([db, ok]) => !ok && db !== source).map(([db]) => db)
  if (!targets.length) return c.json({ success: true, message: "All healthy.", alive })
  const results = {}
  for (const target of targets) {
    const key = `${target}-from-${source}`
    try {
      if (source === "d1" && target === "turso") {
        let t = 0; for (const table of ALL_TABLES) { const rows = await fetchAllFromD1(c.env, table); t += await bulkWriteToTurso(c.env, table, rows) }; results[key] = { ok: true, rows: t }
      } else if (source === "d1" && target === "supabase") {
        let t = 0; for (const table of ALL_TABLES) { const rows = await fetchAllFromD1(c.env, table); t += await bulkWriteToSupabase(c.env, table, rows) }; results[key] = { ok: true, rows: t }
      } else if (source === "turso" && target === "d1") {
        let t = 0; for (const table of ALL_TABLES) { const rows = await fetchAllFromTurso(c.env, table); t += await bulkWriteToD1(c.env, table, rows) }; results[key] = { ok: true, rows: t }
      } else if (source === "turso" && target === "supabase") {
        let t = 0; for (const table of ALL_TABLES) { const rows = await fetchAllFromTurso(c.env, table); t += await bulkWriteToSupabase(c.env, table, rows) }; results[key] = { ok: true, rows: t }
      } else if (source === "supabase" && target === "d1") {
        let t = 0; for (const table of ALL_TABLES) { const rows = await fetchAllFromSupabase(c.env, table); t += await bulkWriteToD1(c.env, table, rows) }; results[key] = { ok: true, rows: t }
      } else if (source === "supabase" && target === "turso") {
        let t = 0; for (const table of ALL_TABLES) { const rows = await fetchAllFromSupabase(c.env, table); t += await bulkWriteToTurso(c.env, table, rows) }; results[key] = { ok: true, rows: t }
      }
    } catch (e) { results[key] = { ok: false, error: e.message } }
  }
  return c.json({ success: true, message: `✅ Auto-recovery complete.`, source, targets, alive, results, recovered_at: nowISO() })
})

router.post("/db/snapshot", async (c) => {
  const body  = await c.req.json().catch(() => ({}))
  const label = body.label || "manual"
  const result = await snapshotToLocal(c.env, label)
  return c.json({
    success: result.ok,
    ...(result.ok ? { message: `✅ Snapshot saved locally`, key: result.key, size_kb: result.size_kb } : { error: result.error }),
    created_at: nowISO()
  })
})

router.post("/db/snapshot/restore", async (c) => {
  const body    = await c.req.json().catch(() => ({}))
  const { key, targets } = body
  if (!key || key.includes("/") || key.includes("..")) return c.json({ success: false, message: "Invalid snapshot key" }, 400)
  const result = await restoreFromLocal(c.env, key, targets || ["d1", "turso", "supabase"])
  return c.json({ success: result.ok, ...(result.ok ? result : { error: result.error }), restored_at: nowISO() })
})

router.get("/db/snapshots", async (c) => {
  try {
    const files = await fs.readdir(BACKUP_DIR)
    const jsonFiles = files.filter(f => f.endsWith(".json"))
    const snapshots = []
    for (const f of jsonFiles) {
      const stats = await fs.stat(path.join(BACKUP_DIR, f))
      snapshots.push({ key: f, size_kb: Math.round(stats.size / 1024), uploaded: stats.mtime.toISOString() })
    }
    snapshots.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
    return c.json({ success: true, snapshots })
  } catch (e) { return c.json({ success: false, message: e.message }, 500) }
})

router.post("/db/reconcile", async (c) => {
  const body   = await c.req.json().catch(() => ({}))
  const tables = body.tables || ALL_TABLES
  if (body.tables) {
    const invalid = tables.filter(t => !ALL_TABLES.includes(t))
    if (invalid.length) return c.json({ success: false, message: `Invalid table(s)` }, 400)
  }
  const report = []
  for (const table of tables) { report.push(await reconcileTable(c.env, table)) }
  const totalConflicts = report.reduce((s, r) => s + r.conflicts, 0)
  return c.json({ success: true, message: totalConflicts === 0 ? "✅ All synced" : `⚠️ ${totalConflicts} conflicts`, tables: report.length, conflicts: totalConflicts, report, reconciled_at: nowISO() })
})

router.post("/db/replay-events", async (c) => {
  const body = await c.req.json().catch(() => ({})); const from_date = body.from_date || null; const limit = Math.min(body.limit || 100, 1000)
  try {
    let q = "SELECT * FROM sync_event_log WHERE status IN ('pending','failed')"; const binds = []
    if (from_date) { q += " AND created_at >= ?"; binds.push(from_date) }; q += " ORDER BY created_at ASC LIMIT ?"; binds.push(limit)
    const { results: events } = await c.env.DB.prepare(q).bind(...binds).all()
    let replayed = 0; let failed = 0
    for (const event of (events || [])) {
      try {
        if (!isSafeToReplay(event.sql)) throw new Error("Unsafe SQL")
        const args = JSON.parse(event.args_json || "[]")
        if (event.origin !== ORIGIN_D1) await c.env.DB.prepare(event.sql).bind(...args).run().catch(()=>{})
        if (event.origin !== ORIGIN_TURSO && c.env.TURSO_REPLICA_URL && c.env.TURSO_REPLICA_AUTH_TOKEN) {
          const httpUrl = c.env.TURSO_REPLICA_URL.replace("libsql://", "https://")
          await fetch(`${httpUrl}/v2/pipeline`, { method: "POST", headers: { "Authorization": `Bearer ${c.env.TURSO_REPLICA_AUTH_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: event.sql, args: args.map(v => v === null ? { type: "null" } : typeof v === "number" ? { type: "integer", value: String(v) } : { type: "text", value: String(v) }) } }, { type: "close" }] }) }).catch(()=>null)
        }
        if (event.origin !== ORIGIN_SUPABASE) {
          await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, { method: "POST", headers: { "apikey": c.env.SUPABASE_KEY, "Authorization": `Bearer ${c.env.SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: passThrough(event.sql) }) }).catch(()=>null)
        }
        await c.env.DB.prepare("UPDATE sync_event_log SET status='applied', updated_at=? WHERE event_id=?").bind(nowISO(), event.event_id).run()
        replayed++
      } catch (e) { failed++; await c.env.DB.prepare("UPDATE sync_event_log SET status='failed', error_msg=?, updated_at=? WHERE event_id=?").bind(e.message, nowISO(), event.event_id).run() }
    }
    return c.json({ success: true, message: `✅ Replayed ${replayed}`, replayed, failed, replayed_at: nowISO() })
  } catch (e) { return c.json({ success: false, message: e.message }, 500) }
})

router.get("/db/dead-letter", async (c) => {
  try {
    const { results } = await c.env.DB.prepare("SELECT * FROM sync_dead_letter ORDER BY created_at DESC LIMIT ?").bind(Math.min(Number(c.req.query("limit") || 50), 200)).all()
    return c.json({ success: true, count: results?.length || 0, items: results || [] })
  } catch (e) { return c.json({ success: false, message: e.message }, 500) }
})

router.post("/db/dead-letter/retry", async (c) => {
  try {
    const { results: dlItems } = await c.env.DB.prepare("SELECT event_id FROM sync_dead_letter").all()
    if (!dlItems?.length) return c.json({ success: true, message: "No items" })
    let retried = 0; let failed = 0
    for (const dl of dlItems) {
      const event = await c.env.DB.prepare("SELECT * FROM sync_event_log WHERE event_id = ?").bind(dl.event_id).first()
      if (!event) { failed++; continue }
      try {
        if (!isSafeToReplay(event.sql)) throw new Error("Unsafe SQL")
        const args = JSON.parse(event.args_json || "[]")
        await c.env.DB.prepare(event.sql).bind(...args).run().catch(() => null)
        if (c.env.TURSO_REPLICA_URL && c.env.TURSO_REPLICA_AUTH_TOKEN) {
          const httpUrl = c.env.TURSO_REPLICA_URL.replace("libsql://", "https://")
          await fetch(`${httpUrl}/v2/pipeline`, { method: "POST", headers: { "Authorization": `Bearer ${c.env.TURSO_REPLICA_AUTH_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: event.sql, args: args.map(v => v === null ? { type: "null" } : typeof v === "number" ? { type: "integer", value: String(v) } : { type: "text", value: String(v) }) } }, { type: "close" }] }) }).catch(()=>null)
        }
        await c.env.DB.prepare("DELETE FROM sync_dead_letter WHERE event_id = ?").bind(dl.event_id).run()
        await c.env.DB.prepare("UPDATE sync_event_log SET status='applied', updated_at=? WHERE event_id=?").bind(nowISO(), dl.event_id).run()
        retried++
      } catch (e) { failed++ }
    }
    return c.json({ success: true, message: `✅ Retried ${retried}`, retried, failed })
  } catch (e) { return c.json({ success: false, message: e.message }, 500) }
})

router.get("/db/audit-log", async (c) => {
  try {
    const limit = Math.min(Number(c.req.query("limit") || 100), 500); const table = c.req.query("table") || null; const origin = c.req.query("origin") || null
    let q = "SELECT * FROM sync_audit_log WHERE 1=1"; const binds = []
    if (table) { q += " AND table_name=?"; binds.push(table) }
    if (origin) { q += " AND origin=?"; binds.push(origin) }
    q += " ORDER BY created_at DESC LIMIT ?"; binds.push(limit)
    const { results } = await c.env.DB.prepare(q).bind(...binds).all()
    return c.json({ success: true, count: results?.length || 0, logs: results || [] })
  } catch (e) { return c.json({ success: false, message: e.message }, 500) }
})

router.get("/db/checksums", async (c) => {
  const report = []
  for (const table of ALL_TABLES) {
    const [d1Rows, tursoRows, supaRows] = await Promise.all([ fetchAllFromD1(c.env, table), fetchAllFromTurso(c.env, table), fetchAllFromSupabase(c.env, table) ])
    const [d1Checksum, tursoChecksum, supaChecksum] = await Promise.all([ computeTableChecksum(d1Rows), computeTableChecksum(tursoRows), computeTableChecksum(supaRows) ])
    const allMatch = d1Checksum === tursoChecksum && tursoChecksum === supaChecksum
    report.push({ table, in_sync: allMatch, row_counts: { d1: d1Rows.length, turso: tursoRows.length, supabase: supaRows.length }, checksums: { d1: d1Checksum, turso: tursoChecksum, supabase: supaChecksum } })
  }
  const totalMismatch = report.filter(r => !r.in_sync).length
  return c.json({ success: true, all_synced: totalMismatch === 0, mismatch_tables: totalMismatch, report, checked_at: nowISO() })
})

export default router
