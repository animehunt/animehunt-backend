// ============================================================
// src/db.js  —  AnimeHunt Universal DB Client v2.2
// ============================================================
// PRIMARY   : Cloudflare D1  (env.DB)
// REPLICA 1 : Turso / LibSQL (env.TURSO_URL + env.TURSO_AUTH_TOKEN)
// REPLICA 2 : Supabase REST  (env.SUPABASE_URL + env.SUPABASE_KEY)
//
// FIXES v2.2 (on top of v2.1):
//   ✅ FIX 7: Database.queryOne() — was returning raw .first() value
//             Now returns null explicitly when no row found (consistent)
//   ✅ FIX 8: getDB().queryOne() — was returning {result, source} object
//             Now returns raw value (same as Database.queryOne) so callers
//             don't need to destructure. source available via getDB().query()
//   ✅ FIX 9: replayEvent — env param removed (already in closure)
// ============================================================

// ❌ REMOVED: import { createHash } from "crypto"  ← Node.js module, crashes in Workers
// ✅ Using crypto.subtle (built-in Web Crypto API in Cloudflare Workers)

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */
const ORIGIN_D1       = "d1"
const ORIGIN_TURSO    = "turso"
const ORIGIN_SUPABASE = "supabase"
const MAX_RETRIES     = 5
const RETRY_BASE_MS   = 500

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function nowISO() { return new Date().toISOString() }

async function generateEventId(sql, args, table) {
  const raw     = `${table}::${sql}::${JSON.stringify(args)}::${Date.now()}`
  const encoded = new TextEncoder().encode(raw)
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function rowChecksum(row) {
  const stable  = JSON.stringify(row, Object.keys(row).sort())
  const encoded = new TextEncoder().encode(stable)
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function backoffMs(attempt) {
  return RETRY_BASE_MS * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4)
}

/* ─────────────────────────────────────────────────────────────
   PRIMARY DATABASE CLASS
   Used by: dbSync.js, systemGuard.js, firewall.js,
            system.js, securityAdmin.js, all Part 2/3 files
   NOTE: All methods return raw values (not wrapped objects)
───────────────────────────────────────────────────────────── */
export class Database {
  constructor(d1) {
    this.d1 = d1
  }

  // Returns { results: [], meta: {} }
  async query(sql, params = []) {
    try {
      const stmt  = this.d1.prepare(sql)
      const bound = params.length > 0 ? stmt.bind(...params) : stmt
      return await bound.all()
    } catch (error) {
      console.error("DB Error:", error)
      throw new Error(`Database query failed: ${error.message}`)
    }
  }

  // FIX v2.2: Returns raw row object or null (not wrapped)
  // Callers: systemGuard.js, securityAdmin.js, adminAuth.js
  async queryOne(sql, params = []) {
    try {
      const stmt  = this.d1.prepare(sql)
      const bound = params.length > 0 ? stmt.bind(...params) : stmt
      return await bound.first() ?? null
    } catch (error) {
      throw new Error(`Database fetch failed: ${error.message}`)
    }
  }

  // Returns D1 run result with meta.changes
  async run(sql, params = []) {
    try {
      const stmt  = this.d1.prepare(sql)
      const bound = params.length > 0 ? stmt.bind(...params) : stmt
      return await bound.run()
    } catch (error) {
      throw new Error(`Database run failed: ${error.message}`)
    }
  }

  // D1 native batch — atomic, efficient
  // statements = array of {sql, params}
  async batch(statements) {
    try {
      const prepared = statements.map(({ sql, params = [] }) => {
        const stmt = this.d1.prepare(sql)
        return params.length > 0 ? stmt.bind(...params) : stmt
      })
      return await this.d1.batch(prepared)
    } catch (error) {
      throw new Error(`Database batch failed: ${error.message}`)
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   EVENT LOG
───────────────────────────────────────────────────────────── */
async function appendEventLog(env, {
  event_id, origin, table_name, operation, sql, args, row_id
}) {
  if (!env.DB) return
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO sync_event_log
        (event_id, origin, table_name, operation, sql, args_json, row_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      event_id, origin, table_name, operation,
      sql, JSON.stringify(args), row_id || null, nowISO()
    ).run()
  } catch (e) {
    console.warn("⚠️ Event log append failed:", e.message)
  }
}

async function markEventStatus(env, event_id, status, error_msg = null) {
  if (!env.DB) return
  try {
    await env.DB.prepare(`
      UPDATE sync_event_log SET status = ?, error_msg = ?, updated_at = ?
      WHERE event_id = ?
    `).bind(status, error_msg, nowISO(), event_id).run()
  } catch (e) {
    console.warn("⚠️ Event status update failed:", e.message)
  }
}

/* ─────────────────────────────────────────────────────────────
   DEAD LETTER QUEUE
───────────────────────────────────────────────────────────── */
async function sendToDeadLetter(env, event_id, reason) {
  if (!env.DB) return
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO sync_dead_letter (event_id, reason, created_at)
      VALUES (?, ?, ?)
    `).bind(event_id, reason, nowISO()).run()
    await markEventStatus(env, event_id, "dead_letter", reason)
  } catch (e) {
    console.warn("⚠️ Dead letter insert failed:", e.message)
  }
}

/* ─────────────────────────────────────────────────────────────
   AUDIT LOG
───────────────────────────────────────────────────────────── */
async function writeAuditLog(env, {
  event_id, origin, table_name, operation, row_id,
  status, error_msg = null, checksum = null
}) {
  if (!env.DB) return
  try {
    await env.DB.prepare(`
      INSERT INTO sync_audit_log
        (event_id, origin, table_name, operation, row_id, status, error_msg, checksum, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event_id, origin, table_name, operation, row_id || null,
      status, error_msg, checksum, nowISO()
    ).run()
  } catch (e) {
    console.warn("⚠️ Audit log write failed:", e.message)
  }
}

/* ─────────────────────────────────────────────────────────────
   LOOP PREVENTION
───────────────────────────────────────────────────────────── */
async function hasProcessedEvent(env, event_id, target) {
  if (!env.DB) return false
  try {
    const r = await env.DB.prepare(`
      SELECT 1 FROM sync_processed_events WHERE event_id = ? AND target = ?
    `).bind(event_id, target).first()
    return !!r
  } catch { return false }
}

async function markEventProcessed(env, event_id, target) {
  if (!env.DB) return
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO sync_processed_events (event_id, target, processed_at)
      VALUES (?, ?, ?)
    `).bind(event_id, target, nowISO()).run()
  } catch (e) {
    console.warn("⚠️ Mark processed failed:", e.message)
  }
}

/* ─────────────────────────────────────────────────────────────
   TURSO CLIENT
───────────────────────────────────────────────────────────── */
function serializeArg(v) {
  if (v === null || v === undefined) return { type: "null" }
  if (typeof v === "number")         return { type: "integer", value: String(v) }
  if (typeof v === "boolean")        return { type: "integer", value: v ? "1" : "0" }
  return { type: "text", value: String(v) }
}

function parseTursoResult(result) {
  if (!result) return { results: [], meta: {} }
  const cols = result.cols?.map(c => c.name) || []
  const rows = (result.rows || []).map(row =>
    Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? null]))
  )
  return { results: rows, meta: { rows_written: result.affected_row_count || 0 } }
}

async function tursoQuery(env, sql, args = [], { event_id = null, is_sync = false } = {}) {
  if (!env.TURSO_URL || !env.TURSO_AUTH_TOKEN) return null

  if (is_sync && event_id) {
    const already = await hasProcessedEvent(env, event_id, ORIGIN_TURSO)
    if (already) return { results: [], meta: {}, skipped: true }
  }

  const httpUrl = env.TURSO_URL.replace("libsql://", "https://")

  try {
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type":  "application/json",
        ...(event_id ? { "X-Sync-Event-Id": event_id } : {})
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: args.map(serializeArg) } },
          { type: "close" }
        ]
      })
    })

    if (!res.ok) throw new Error(`Turso HTTP ${res.status}`)
    const data = await res.json()

    if (is_sync && event_id) await markEventProcessed(env, event_id, ORIGIN_TURSO)

    return parseTursoResult(data.results?.[0]?.response?.result)
  } catch (e) {
    console.error("❌ Turso error:", e.message)
    return null
  }
}

/* ─────────────────────────────────────────────────────────────
   SUPABASE CLIENT
   convertToPostgres() called ONLY here — never on D1 queries
───────────────────────────────────────────────────────────── */
async function supabaseQuery(env, sql, args = [], { event_id = null, is_sync = false } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null

  if (is_sync && event_id) {
    const already = await hasProcessedEvent(env, event_id, ORIGIN_SUPABASE)
    if (already) return { results: [], meta: {}, skipped: true }
  }

  let paramIdx = 0
  const pgSql  = convertToPostgres(sql).replace(/\?/g, () => `$${++paramIdx}`)

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        ...(event_id ? { "X-Sync-Event-Id": event_id } : {})
      },
      body: JSON.stringify({ query: pgSql, params: args })
    })

    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`)
    const data = await res.json()

    if (is_sync && event_id) await markEventProcessed(env, event_id, ORIGIN_SUPABASE)

    return { results: Array.isArray(data) ? data : [], meta: {} }
  } catch (e) {
    console.error("❌ Supabase error:", e.message)
    return null
  }
}

/* ─────────────────────────────────────────────────────────────
   RETRY WRAPPER
───────────────────────────────────────────────────────────── */
async function withRetry(env, event_id, target, fn) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn()
      if (result !== null) return result
      throw new Error(`${target} returned null`)
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        await sendToDeadLetter(env, event_id, `${target}: ${e.message}`)
        return null
      }
      await sleep(backoffMs(attempt))
    }
  }
  return null
}

/* ─────────────────────────────────────────────────────────────
   CONFLICT RESOLUTION
───────────────────────────────────────────────────────────── */
export function resolveConflict(localRow, incomingRow, localOrigin) {
  const localTs    = new Date(localRow?.updated_at || 0).getTime()
  const incomingTs = new Date(incomingRow?.updated_at || 0).getTime()
  if (incomingTs > localTs) return "incoming"
  if (localTs > incomingTs) return "local"
  return localOrigin === ORIGIN_D1 ? "local" : "incoming"
}

/* ─────────────────────────────────────────────────────────────
   EXTRACT TABLE / OPERATION from SQL
───────────────────────────────────────────────────────────── */
function extractTableName(sql) {
  const clean = sql.trim().toUpperCase()
  let match
  if (clean.startsWith("INSERT"))      match = sql.match(/INTO\s+([`"]?[\w]+[`"]?)/i)
  else if (clean.startsWith("UPDATE")) match = sql.match(/UPDATE\s+([`"]?[\w]+[`"]?)/i)
  else if (clean.startsWith("DELETE")) match = sql.match(/FROM\s+([`"]?[\w]+[`"]?)/i)
  return match ? match[1].replace(/[`"]/g, "") : "unknown"
}

function extractOperation(sql) {
  const clean = sql.trim().toUpperCase()
  if (clean.startsWith("INSERT")) return "INSERT"
  if (clean.startsWith("UPDATE")) return "UPDATE"
  if (clean.startsWith("DELETE")) return "DELETE"
  return "OTHER"
}

/* ─────────────────────────────────────────────────────────────
   SQLite → PostgreSQL converter
   ONLY called for Supabase replica — never on D1
───────────────────────────────────────────────────────────── */
export function convertToPostgres(sql) {
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
    .replace(/TEXT PRIMARY KEY/gi,                  "VARCHAR(255) PRIMARY KEY")
    .replace(/datetime\('now'\)/gi,                 "NOW()")
    .replace(/\bINSERT OR IGNORE\b/gi,              "INSERT")
    .replace(/\bINSERT OR REPLACE\b/gi,             "INSERT")
    .replace(/ON CONFLICT\(([^)]+)\)\s*DO UPDATE SET/gi, "ON CONFLICT($1) DO UPDATE SET")
    .replace(/PRAGMA [^;]+;?/gi,                    "")
    .trim()
}

/* ─────────────────────────────────────────────────────────────
   UNIVERSAL DB  —  getDB factory (full sync + event log)
   FIX v2.2: queryOne returns raw row (not {result, source})
             so callers don't need to destructure
───────────────────────────────────────────────────────────── */
export function getDB(env) {
  return {

    // Returns { results: [], meta: {}, source: "d1"|"turso"|"supabase" }
    async query(sql, args = []) {
      try {
        if (env.DB) {
          const stmt  = env.DB.prepare(sql)
          const bound = args.length ? stmt.bind(...args) : stmt
          const { results, meta } = await bound.all()
          return { results: results || [], meta, source: ORIGIN_D1 }
        }
      } catch (e) {
        console.warn("⚠️ D1 read failed, trying Turso:", e.message)
      }

      const turso = await tursoQuery(env, sql, args)
      if (turso) return { ...turso, source: ORIGIN_TURSO }

      const supa = await supabaseQuery(env, sql, args)
      if (supa)  return { ...supa,  source: ORIGIN_SUPABASE }

      throw new Error("All databases unavailable")
    },

    // FIX v2.2: Returns raw row object or null — consistent with Database.queryOne()
    async queryOne(sql, args = []) {
      const { results } = await this.query(sql, args)
      return results?.[0] ?? null
    },

    // Write with event log + replica sync
    async execute(sql, args = [], { origin = ORIGIN_D1, event_id = null } = {}) {
      const table     = extractTableName(sql)
      const operation = extractOperation(sql)
      const eid       = event_id || await generateEventId(sql, args, table)

      await appendEventLog(env, { event_id: eid, origin, table_name: table, operation, sql, args, row_id: null })

      let d1Result = null
      let d1Error  = null

      try {
        if (env.DB) {
          if (origin !== ORIGIN_D1) {
            const already = await hasProcessedEvent(env, eid, ORIGIN_D1)
            if (already) return { skipped: true }
          }
          const stmt  = env.DB.prepare(sql)
          const bound = args.length ? stmt.bind(...args) : stmt
          d1Result    = await bound.run()
          if (origin !== ORIGIN_D1) await markEventProcessed(env, eid, ORIGIN_D1)
        }
      } catch (e) {
        d1Error = e
        console.error("❌ D1 write failed:", e.message)
      }

      // Turso sync (non-blocking background)
      ;(async () => {
        if (origin === ORIGIN_TURSO) return
        const result = await withRetry(env, eid, ORIGIN_TURSO, () =>
          tursoQuery(env, sql, args, { event_id: eid, is_sync: true })
        )
        if (result) await writeAuditLog(env, { event_id: eid, origin, table_name: table, operation, row_id: null, status: "synced_turso" })
      })().catch(e => console.error("Turso sync bg error:", e.message))

      // Supabase sync (non-blocking background)
      ;(async () => {
        if (origin === ORIGIN_SUPABASE) return
        const result = await withRetry(env, eid, ORIGIN_SUPABASE, () =>
          supabaseQuery(env, sql, args, { event_id: eid, is_sync: true })
        )
        if (result) await writeAuditLog(env, { event_id: eid, origin, table_name: table, operation, row_id: null, status: "synced_supabase" })
      })().catch(e => console.error("Supabase sync bg error:", e.message))

      await markEventStatus(env, eid, "applied")
      await writeAuditLog(env, { event_id: eid, origin, table_name: table, operation, row_id: null, status: "applied" })

      if (d1Error) throw d1Error
      return d1Result
    },

    // Batch write — D1 native batch (fast path) or event-tracked (opt-in)
    async batch(statements, opts = {}) {
      if (opts.trackEvents) {
        const results = []
        for (const s of statements) {
          results.push(await this.execute(s.sql, s.args || [], opts))
        }
        return results
      }

      if (env.DB) {
        try {
          const prepared = statements.map(({ sql, params, args }) => {
            const p    = params || args || []
            const stmt = env.DB.prepare(sql)
            return p.length ? stmt.bind(...p) : stmt
          })
          return await env.DB.batch(prepared)
        } catch (e) {
          console.error("❌ D1 batch failed:", e.message)
          throw e
        }
      }

      throw new Error("D1 database unavailable for batch operation")
    },

    // FIX v2.2: env removed from params — already in closure
    async replayEvent(event) {
      console.log(`🔄 Replaying event ${event.event_id} on ${event.origin}`)
      const args = JSON.parse(event.args_json || "[]")
      return this.execute(event.sql, args, { origin: event.origin, event_id: event.event_id })
    }
  }
}

export { tursoQuery, supabaseQuery, nowISO, ORIGIN_D1, ORIGIN_TURSO, ORIGIN_SUPABASE }

