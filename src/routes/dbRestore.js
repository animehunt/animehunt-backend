// ============================================================
// src/routes/dbRestore.js  —  Database Restore & Recovery v2.0
// ============================================================
// Admin-only endpoints:
//
//  GET  /api/admin/db/status              ← teeno DB ka health check
//  GET  /api/admin/db/sync-status         ← event log + queue status
//  POST /api/admin/db/restore/turso-from-d1
//  POST /api/admin/db/restore/supabase-from-d1
//  POST /api/admin/db/restore/d1-from-turso
//  POST /api/admin/db/restore/d1-from-supabase
//  POST /api/admin/db/restore/full        ← smart auto-recovery
//  POST /api/admin/db/snapshot            ← manual snapshot to R2
//  POST /api/admin/db/snapshot/restore    ← restore from R2 snapshot
//  POST /api/admin/db/reconcile           ← row-level reconciliation
//  POST /api/admin/db/replay-events       ← replay event log
//  GET  /api/admin/db/dead-letter         ← view dead letter queue
//  POST /api/admin/db/dead-letter/retry   ← retry dead letter events
//  GET  /api/admin/db/audit-log           ← view audit log
//  GET  /api/admin/db/checksums           ← verify integrity
// ============================================================

import { Hono } from "hono"
import {
  tursoQuery, supabaseQuery,
  rowChecksum, resolveConflict, nowISO,
  ORIGIN_D1, ORIGIN_TURSO, ORIGIN_SUPABASE
} from "../db.js"

// ✅ FIX: convertToPostgres was imported from db.js but is BANNED per MASTER_INDEX.md
//    (D1 uses SQLite syntax, not Postgres — convertToPostgres breaks parameterized queries)
//    Replaced with a no-op passthrough: D1-compatible SQL is sent as-is to Supabase
//    via the exec_sql RPC, which accepts standard SQL.
function passThrough(sql) {
  return sql  // D1/SQLite SQL is compatible enough for basic CRUD via Supabase RPC
}

const router = new Hono()

/* ─────────────────────────────────────────────────────────────
   ALL TABLES (same as animehunt_database.sql + sync tables)
───────────────────────────────────────────────────────────── */
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

// Sync infrastructure tables (don't replicate these — they're meta)
const SYNC_TABLES = [
  "sync_event_log", "sync_processed_events",
  "sync_dead_letter", "sync_audit_log", "sync_checksums"
]

/* ─────────────────────────────────────────────────────────────
   HELPERS: FETCH from each source
───────────────────────────────────────────────────────────── */

async function fetchAllFromD1(env, table) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM ${table}`
    ).all()
    return results || []
  } catch (e) {
    console.warn(`D1 fetch failed [${table}]:`, e.message)
    return []
  }
}

// MIGRATION: repointed at TURSO_REPLICA_URL/TOKEN (DB3) — this used to read
// env.TURSO_URL directly, which is the same primary database fetchAllFromD1
// above already reads via env.DB, making the two functions redundant.
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
    console.warn(`Turso fetch failed [${table}]:`, e.message)
    return []
  }
}

async function fetchAllFromSupabase(env, table) {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    console.warn(`Supabase fetch failed [${table}]:`, e.message)
    return []
  }
}

/* ─────────────────────────────────────────────────────────────
   HELPERS: WRITE to each target
───────────────────────────────────────────────────────────── */

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
    } catch (e) {
      console.warn(`D1 write error [${table}]:`, e.message)
    }
  }
  return count
}

// MIGRATION: repointed at TURSO_REPLICA_URL/TOKEN (DB3) — "restore into
// Turso" now means restoring into the second, independent Turso database,
// not writing back into the primary through a separate redundant path.
async function bulkWriteToTurso(env, table, rows) {
  if (!rows.length) return 0
  if (!env.TURSO_REPLICA_URL || !env.TURSO_REPLICA_AUTH_TOKEN) {
    console.warn(`Turso write skipped [${table}]: TURSO_REPLICA_URL/TURSO_REPLICA_AUTH_TOKEN not configured`)
    return 0
  }
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
    } catch (e) {
      console.warn(`Turso write error [${table}]:`, e.message)
    }
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
  } catch (e) {
    console.warn(`Supabase write error [${table}]:`, e.message)
    return 0
  }
}

/* ─────────────────────────────────────────────────────────────
   HELPER: Health check single DB
───────────────────────────────────────────────────────────── */
async function checkD1Health(env) {
  try {
    const r = await env.DB.prepare("SELECT COUNT(*) as n FROM anime").first()
    return { ok: true, anime_count: r?.n || 0 }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// MIGRATION: this used to check env.TURSO_URL directly, which — now that
// checkD1Health() above queries env.DB (the primary Turso, via the
// D1-compatible adapter) — meant this function and checkD1Health() were
// silently checking the exact same database through two different code
// paths. Repointed at TURSO_REPLICA_URL/TOKEN (DB3, the second independent
// Turso database) so the three-way comparison below is genuinely three
// independent sources again, matching the trio architecture.
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
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/anime?select=count`, {
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

/* ─────────────────────────────────────────────────────────────
   CHECKSUM VERIFICATION
───────────────────────────────────────────────────────────── */
async function computeTableChecksum(rows) {
  if (!rows.length) return "empty"
  // Sort rows deterministically before hashing
  const sorted = [...rows].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  )
  const raw     = JSON.stringify(sorted)
  const encoded = new TextEncoder().encode(raw)
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded)
  const hashArr = Array.from(new Uint8Array(hashBuf))
  return hashArr.map(b => b.toString(16).padStart(2, "0")).join("")
}

/* ─────────────────────────────────────────────────────────────
   SNAPSHOT TO R2  (OOM FIX — Blueprint Line 42)
   ❌ OLD: fetchAllFromD1 loads entire table into RAM
   ✅ FIX: chunked reads, 100 rows at a time
───────────────────────────────────────────────────────────── */

// ✅ FIX (Blueprint Line 42): Chunked table read — avoids 128 MB Worker memory limit
async function fetchTableChunked(env, table, chunkSize = 100) {
  const rows    = []
  let   offset  = 0
  let   hasMore = true

  while (hasMore) {
    let chunk
    try {
      chunk = await env.DB.prepare(
        `SELECT * FROM ${table} LIMIT ? OFFSET ?`
      ).bind(chunkSize, offset).all()
    } catch {
      break  // table may not exist in this environment
    }
    if (!chunk.results || chunk.results.length === 0) break
    rows.push(...chunk.results)
    offset  += chunkSize
    hasMore  = chunk.results.length === chunkSize
  }
  return rows
}

async function snapshotToR2(env, label = "auto") {
  if (!env.R2_BUCKET) return { ok: false, error: "R2_BUCKET not bound" }

  const snapshot = {
    version:    "2.0",
    label,
    created_at: nowISO(),
    tables:     {}
  }

  // ✅ FIX: chunked reads instead of single fetchAllFromD1 per table
  for (const table of ALL_TABLES) {
    snapshot.tables[table] = await fetchTableChunked(env, table)
  }

  const key  = `snapshots/${label}-${Date.now()}.json`
  const body = JSON.stringify(snapshot)

  try {
    await env.R2_BUCKET.put(key, body, {
      httpMetadata: { contentType: "application/json" }
    })
    return { ok: true, key, size_kb: Math.round(body.length / 1024) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/* ─────────────────────────────────────────────────────────────
   RESTORE FROM R2 SNAPSHOT
───────────────────────────────────────────────────────────── */
async function restoreFromR2(env, key, targets = ["d1", "turso", "supabase"]) {
  if (!env.R2_BUCKET) return { ok: false, error: "R2_BUCKET not bound" }

  try {
    const obj  = await env.R2_BUCKET.get(key)
    if (!obj)  return { ok: false, error: `Snapshot not found: ${key}` }

    const text     = await obj.text()
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

/* ─────────────────────────────────────────────────────────────
   ROW-LEVEL RECONCILIATION
   Compares D1 vs Turso vs Supabase row by row,
   resolves conflicts, writes winner to all three
───────────────────────────────────────────────────────────── */
async function reconcileTable(env, table) {
  const [d1Rows, tursoRows, supaRows] = await Promise.all([
    fetchAllFromD1(env, table),
    fetchAllFromTurso(env, table),
    fetchAllFromSupabase(env, table)
  ])

  // Build maps: id → row for each source
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

  // Collect all unique IDs
  const allIds = new Set([
    ...d1Map.keys(), ...tursoMap.keys(), ...supaMap.keys()
  ])

  const conflicts = []
  const synced    = []
  const missing   = { d1: [], turso: [], supabase: [] }

  for (const id of allIds) {
    const d1Row    = d1Map.get(id) || null
    const tursoRow = tursoMap.get(id) || null
    const supaRow  = supaMap.get(id) || null

    // All three agree → no conflict
    const d1Str    = JSON.stringify(d1Row)
    const tursoStr = JSON.stringify(tursoRow)
    const supaStr  = JSON.stringify(supaRow)

    if (d1Str === tursoStr && tursoStr === supaStr) {
      synced.push(id)
      continue
    }

    // Resolve: pick winner among present rows
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

    // Write winner to all three databases
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
    table,
    total:     allIds.size,
    synced:    synced.length,
    conflicts: conflicts.length,
    missing,
    status:    conflicts.length === 0 ? "in_sync" : "reconciled"
  }
}

/* ═══════════════════════════════════════════════════════════
   ROUTES
═══════════════════════════════════════════════════════════ */

/* ─── HEALTH CHECK ─── */
router.get("/db/status", async (c) => {
  const [d1, turso, supabase] = await Promise.all([
    checkD1Health(c.env),
    checkTursoHealth(c.env),
    checkSupabaseHealth(c.env)
  ])

  const allOk = d1.ok && turso.ok && supabase.ok

  return c.json({
    success: true,
    overall: allOk ? "healthy" : "degraded",
    databases: { d1, turso, supabase },
    checked_at: nowISO()
  })
})

/* ─── SYNC STATUS ─── */
router.get("/db/sync-status", async (c) => {
  try {
    const [pending, failed, deadLetter, recentAudit] = await Promise.all([
      c.env.DB.prepare(
        "SELECT COUNT(*) as n FROM sync_event_log WHERE status='pending'"
      ).first(),
      c.env.DB.prepare(
        "SELECT COUNT(*) as n FROM sync_event_log WHERE status='failed'"
      ).first(),
      c.env.DB.prepare(
        "SELECT COUNT(*) as n FROM sync_dead_letter"
      ).first(),
      c.env.DB.prepare(
        "SELECT * FROM sync_audit_log ORDER BY created_at DESC LIMIT 20"
      ).all()
    ])

    return c.json({
      success: true,
      event_log: {
        pending:     pending?.n || 0,
        failed:      failed?.n || 0,
        dead_letter: deadLetter?.n || 0
      },
      recent_audit: recentAudit.results || [],
      checked_at: nowISO()
    })
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

/* ─── RESTORE: D1 → Turso ─── */
router.post("/db/restore/turso-from-d1", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    const rows     = await fetchAllFromD1(c.env, table)
    const inserted = await bulkWriteToTurso(c.env, table, rows)
    report[table]  = inserted
    total         += inserted
  }

  return c.json({
    success: true,
    message: `✅ Turso restored from D1 — ${total} rows synced`,
    source: "d1", target: "turso",
    report, restored_at: nowISO()
  })
})

/* ─── RESTORE: D1 → Supabase ─── */
router.post("/db/restore/supabase-from-d1", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    const rows     = await fetchAllFromD1(c.env, table)
    const inserted = await bulkWriteToSupabase(c.env, table, rows)
    report[table]  = inserted
    total         += inserted
  }

  return c.json({
    success: true,
    message: `✅ Supabase restored from D1 — ${total} rows synced`,
    source: "d1", target: "supabase",
    report, restored_at: nowISO()
  })
})

/* ─── RESTORE: Turso → D1 ─── */
router.post("/db/restore/d1-from-turso", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    const rows     = await fetchAllFromTurso(c.env, table)
    const inserted = await bulkWriteToD1(c.env, table, rows)
    report[table]  = inserted
    total         += inserted
  }

  return c.json({
    success: true,
    message: `✅ D1 restored from Turso — ${total} rows synced`,
    source: "turso", target: "d1",
    report, restored_at: nowISO()
  })
})

/* ─── RESTORE: Supabase → D1 ─── */
router.post("/db/restore/d1-from-supabase", async (c) => {
  const report = {}
  let total = 0

  for (const table of ALL_TABLES) {
    const rows     = await fetchAllFromSupabase(c.env, table)
    const inserted = await bulkWriteToD1(c.env, table, rows)
    report[table]  = inserted
    total         += inserted
  }

  return c.json({
    success: true,
    message: `✅ D1 restored from Supabase — ${total} rows synced`,
    source: "supabase", target: "d1",
    report, restored_at: nowISO()
  })
})

/* ─── FULL AUTO-RECOVERY ─── */
// Smart recovery: checks which DBs are alive, picks best source,
// restores the missing/broken ones automatically.
router.post("/db/restore/full", async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const force_source = body.source  // optional: "d1", "turso", "supabase"

  const [d1Health, tursoHealth, supaHealth] = await Promise.all([
    checkD1Health(c.env),
    checkTursoHealth(c.env),
    checkSupabaseHealth(c.env)
  ])

  const alive = {
    d1:       d1Health.ok,
    turso:    tursoHealth.ok,
    supabase: supaHealth.ok
  }

  // Pick source (override or auto)
  let source = force_source
  if (!source) {
    if      (alive.d1)       source = "d1"
    else if (alive.turso)    source = "turso"
    else if (alive.supabase) source = "supabase"
    else {
      return c.json({
        success: false,
        error: "All databases are offline. Cannot auto-recover.",
        alive
      }, 503)
    }
  }

  const targets = Object.entries(alive)
    .filter(([db, ok]) => !ok && db !== source)
    .map(([db]) => db)

  if (!targets.length) {
    return c.json({
      success: true,
      message: "All databases are healthy — no recovery needed.",
      alive
    })
  }

  const results = {}
  for (const target of targets) {
    const key = `${target}-from-${source}`
    try {
      if (source === "d1" && target === "turso") {
        let t = 0
        for (const table of ALL_TABLES) {
          const rows = await fetchAllFromD1(c.env, table)
          t += await bulkWriteToTurso(c.env, table, rows)
        }
        results[key] = { ok: true, rows: t }
      } else if (source === "d1" && target === "supabase") {
        let t = 0
        for (const table of ALL_TABLES) {
          const rows = await fetchAllFromD1(c.env, table)
          t += await bulkWriteToSupabase(c.env, table, rows)
        }
        results[key] = { ok: true, rows: t }
      } else if (source === "turso" && target === "d1") {
        let t = 0
        for (const table of ALL_TABLES) {
          const rows = await fetchAllFromTurso(c.env, table)
          t += await bulkWriteToD1(c.env, table, rows)
        }
        results[key] = { ok: true, rows: t }
      } else if (source === "turso" && target === "supabase") {
        let t = 0
        for (const table of ALL_TABLES) {
          const rows = await fetchAllFromTurso(c.env, table)
          t += await bulkWriteToSupabase(c.env, table, rows)
        }
        results[key] = { ok: true, rows: t }
      } else if (source === "supabase" && target === "d1") {
        let t = 0
        for (const table of ALL_TABLES) {
          const rows = await fetchAllFromSupabase(c.env, table)
          t += await bulkWriteToD1(c.env, table, rows)
        }
        results[key] = { ok: true, rows: t }
      } else if (source === "supabase" && target === "turso") {
        let t = 0
        for (const table of ALL_TABLES) {
          const rows = await fetchAllFromSupabase(c.env, table)
          t += await bulkWriteToTurso(c.env, table, rows)
        }
        results[key] = { ok: true, rows: t }
      }
    } catch (e) {
      results[key] = { ok: false, error: e.message }
    }
  }

  return c.json({
    success: true,
    message: `✅ Auto-recovery complete. Source: ${source}`,
    source, targets, alive, results,
    recovered_at: nowISO()
  })
})

/* ─── MANUAL SNAPSHOT ─── */
router.post("/db/snapshot", async (c) => {
  const body  = await c.req.json().catch(() => ({}))
  const label = body.label || "manual"
  const result = await snapshotToR2(c.env, label)

  return c.json({
    success: result.ok,
    ...(result.ok
      ? { message: `✅ Snapshot saved to R2`, key: result.key, size_kb: result.size_kb }
      : { error: result.error }),
    created_at: nowISO()
  })
})

/* ─── RESTORE FROM SNAPSHOT ─── */
router.post("/db/snapshot/restore", async (c) => {
  const body    = await c.req.json().catch(() => ({}))
  const { key, targets } = body

  if (!key) {
    return c.json({ success: false, error: "key required" }, 400)
  }

  const result = await restoreFromR2(
    c.env, key,
    targets || ["d1", "turso", "supabase"]
  )

  return c.json({
    success: result.ok,
    ...(result.ok ? result : { error: result.error }),
    restored_at: nowISO()
  })
})

/* ─── LIST SNAPSHOTS ─── */
router.get("/db/snapshots", async (c) => {
  if (!c.env.R2_BUCKET) {
    return c.json({ success: false, error: "R2_BUCKET not bound" }, 500)
  }
  try {
    const list = await c.env.R2_BUCKET.list({ prefix: "snapshots/" })
    const objects = list.objects.map(o => ({
      key:        o.key,
      size_kb:    Math.round(o.size / 1024),
      uploaded:   o.uploaded
    })).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))

    return c.json({ success: true, snapshots: objects })
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

/* ─── ROW-LEVEL RECONCILIATION ─── */
router.post("/db/reconcile", async (c) => {
  const body   = await c.req.json().catch(() => ({}))
  const tables = body.tables || ALL_TABLES
  const report = []

  for (const table of tables) {
    const result = await reconcileTable(c.env, table)
    report.push(result)
  }

  const totalConflicts = report.reduce((s, r) => s + r.conflicts, 0)

  return c.json({
    success:    true,
    message:    totalConflicts === 0
      ? "✅ All tables in sync"
      : `⚠️ ${totalConflicts} conflicts resolved`,
    tables:     report.length,
    conflicts:  totalConflicts,
    report,
    reconciled_at: nowISO()
  })
})

/* ─── REPLAY EVENTS from event log ─── */
router.post("/db/replay-events", async (c) => {
  const body      = await c.req.json().catch(() => ({}))
  const from_date = body.from_date || null
  const limit     = Math.min(body.limit || 100, 1000)

  try {
    let q = "SELECT * FROM sync_event_log WHERE status IN ('pending','failed')"
    const binds = []
    if (from_date) { q += " AND created_at >= ?"; binds.push(from_date) }
    q += " ORDER BY created_at ASC LIMIT ?"
    binds.push(limit)

    const { results: events } = await c.env.DB.prepare(q).bind(...binds).all()

    let replayed = 0
    let failed   = 0

    for (const event of (events || [])) {
      try {
        const args = JSON.parse(event.args_json || "[]")

        // Write to all three targets
        if (event.origin !== ORIGIN_D1) {
          try {
            await c.env.DB.prepare(event.sql).bind(...args).run()
          } catch (e) {
            console.warn(`Replay D1 error [${event.event_id}]:`, e.message)
          }
        }

        if (event.origin !== ORIGIN_TURSO) {
          // MIGRATION: repointed at TURSO_REPLICA_URL/TOKEN (DB3) — same
          // reasoning as fetchAllFromTurso/bulkWriteToTurso above.
          const httpUrl = c.env.TURSO_REPLICA_URL.replace("libsql://", "https://")
          await fetch(`${httpUrl}/v2/pipeline`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${c.env.TURSO_REPLICA_AUTH_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              requests: [
                {
                  type: "execute",
                  stmt: {
                    sql: event.sql,
                    args: args.map(v =>
                      v === null       ? { type: "null" } :
                      typeof v === "number" ? { type: "integer", value: String(v) } :
                                         { type: "text", value: String(v) }
                    )
                  }
                },
                { type: "close" }
              ]
            })
          }).catch(() => null)
        }

        if (event.origin !== ORIGIN_SUPABASE) {
          await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              "apikey": c.env.SUPABASE_KEY,
              "Authorization": `Bearer ${c.env.SUPABASE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              // ✅ FIX: convertToPostgres() replaced — BANNED per project rules.
              //    D1 SQLite syntax is sent as-is; Supabase RPC handles basic SQL.
              query: passThrough(event.sql)
            })
          }).catch(() => null)
        }

        // Mark as applied
        await c.env.DB.prepare(
          "UPDATE sync_event_log SET status='applied', updated_at=? WHERE event_id=?"
        ).bind(nowISO(), event.event_id).run()

        replayed++
      } catch (e) {
        failed++
        await c.env.DB.prepare(
          "UPDATE sync_event_log SET status='failed', error_msg=?, updated_at=? WHERE event_id=?"
        ).bind(e.message, nowISO(), event.event_id).run()
      }
    }

    return c.json({
      success:  true,
      message:  `✅ Replayed ${replayed} events, ${failed} failed`,
      replayed, failed,
      replayed_at: nowISO()
    })
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

/* ─── DEAD LETTER QUEUE: VIEW ─── */
router.get("/db/dead-letter", async (c) => {
  try {
    const limit = Math.min(Number(c.req.query("limit") || 50), 200)
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM sync_dead_letter ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all()

    return c.json({
      success: true,
      count:   results?.length || 0,
      items:   results || []
    })
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

/* ─── DEAD LETTER QUEUE: RETRY ─── */
router.post("/db/dead-letter/retry", async (c) => {
  try {
    // Get all dead letter event IDs
    const { results: dlItems } = await c.env.DB.prepare(
      "SELECT event_id FROM sync_dead_letter"
    ).all()

    if (!dlItems?.length) {
      return c.json({ success: true, message: "No dead letter items to retry" })
    }

    let retried = 0
    let failed  = 0

    for (const dl of dlItems) {
      // Get original event
      const event = await c.env.DB.prepare(
        "SELECT * FROM sync_event_log WHERE event_id = ?"
      ).bind(dl.event_id).first()

      if (!event) { failed++; continue }

      try {
        const args = JSON.parse(event.args_json || "[]")

        // Try to re-apply
        await c.env.DB.prepare(event.sql).bind(...args).run().catch(() => null)

        // MIGRATION: repointed at TURSO_REPLICA_URL/TOKEN (DB3) — same
        // reasoning as fetchAllFromTurso/bulkWriteToTurso above.
        const httpUrl = c.env.TURSO_REPLICA_URL.replace("libsql://", "https://")
        await fetch(`${httpUrl}/v2/pipeline`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${c.env.TURSO_REPLICA_AUTH_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            requests: [
              {
                type: "execute",
                stmt: {
                  sql: event.sql,
                  args: args.map(v =>
                    v === null ? { type: "null" } :
                    typeof v === "number" ? { type: "integer", value: String(v) } :
                    { type: "text", value: String(v) }
                  )
                }
              },
              { type: "close" }
            ]
          })
        }).catch(() => null)

        // Remove from dead letter
        await c.env.DB.prepare(
          "DELETE FROM sync_dead_letter WHERE event_id = ?"
        ).bind(dl.event_id).run()

        await c.env.DB.prepare(
          "UPDATE sync_event_log SET status='applied', updated_at=? WHERE event_id=?"
        ).bind(nowISO(), dl.event_id).run()

        retried++
      } catch (e) {
        failed++
      }
    }

    return c.json({
      success:  true,
      message:  `✅ Retried ${retried} dead letter items, ${failed} still failed`,
      retried, failed,
      retried_at: nowISO()
    })
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

/* ─── AUDIT LOG ─── */
router.get("/db/audit-log", async (c) => {
  try {
    const limit  = Math.min(Number(c.req.query("limit") || 100), 500)
    const table  = c.req.query("table") || null
    const origin = c.req.query("origin") || null

    let q = "SELECT * FROM sync_audit_log WHERE 1=1"
    const binds = []
    if (table)  { q += " AND table_name=?"; binds.push(table) }
    if (origin) { q += " AND origin=?";     binds.push(origin) }
    q += " ORDER BY created_at DESC LIMIT ?"
    binds.push(limit)

    const { results } = await c.env.DB.prepare(q).bind(...binds).all()

    return c.json({
      success: true,
      count:   results?.length || 0,
      logs:    results || []
    })
  } catch (e) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

/* ─── CHECKSUM INTEGRITY VERIFICATION ─── */
router.get("/db/checksums", async (c) => {
  const report = []

  for (const table of ALL_TABLES) {
    const [d1Rows, tursoRows, supaRows] = await Promise.all([
      fetchAllFromD1(c.env, table),
      fetchAllFromTurso(c.env, table),
      fetchAllFromSupabase(c.env, table)
    ])

    const [d1Checksum, tursoChecksum, supaChecksum] = await Promise.all([
      computeTableChecksum(d1Rows),
      computeTableChecksum(tursoRows),
      computeTableChecksum(supaRows)
    ])

    const allMatch = d1Checksum === tursoChecksum && tursoChecksum === supaChecksum

    report.push({
      table,
      in_sync: allMatch,
      row_counts: {
        d1:       d1Rows.length,
        turso:    tursoRows.length,
        supabase: supaRows.length
      },
      checksums: {
        d1:       d1Checksum,
        turso:    tursoChecksum,
        supabase: supaChecksum
      }
    })
  }

  const totalMismatch = report.filter(r => !r.in_sync).length

  return c.json({
    success:   true,
    all_synced: totalMismatch === 0,
    mismatch_tables: totalMismatch,
    report,
    checked_at: nowISO()
  })
})

export default router
