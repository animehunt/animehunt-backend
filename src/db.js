
// ============================================================
// src/db.js  —  AnimeHunt Universal DB Client
// ============================================================
// Primary  : Cloudflare D1  (c.env.DB)
// Replica 1: Turso / LibSQL (c.env.TURSO_URL + TURSO_AUTH_TOKEN)
// Replica 2: Supabase REST  (c.env.SUPABASE_URL + SUPABASE_KEY)
//
// HOW IT WORKS:
//   READ  → always from D1 (fastest, local to worker)
//   WRITE → D1 first, then Turso + Supabase in background
//   If D1 is down → reads fall back to Turso, then Supabase
// ============================================================

/* ─────────────────────────────────────────────
   TURSO CLIENT  (LibSQL HTTP — no npm needed)
───────────────────────────────────────────── */
async function tursoQuery(env, sql, args = []) {
  if (!env.TURSO_URL || !env.TURSO_AUTH_TOKEN) return null

  const httpUrl = env.TURSO_URL.replace("libsql://", "https://")

  try {
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: args.map(v => serializeArg(v)) } },
          { type: "close" }
        ]
      })
    })

    if (!res.ok) throw new Error(`Turso HTTP ${res.status}`)
    const data = await res.json()
    return parseTursoResult(data.results?.[0]?.response?.result)
  } catch (e) {
    console.error("❌ Turso error:", e.message)
    return null
  }
}

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

/* ─────────────────────────────────────────────
   SUPABASE CLIENT  (REST API — no npm needed)
───────────────────────────────────────────── */
async function supabaseQuery(env, sql, args = []) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null

  // Build final SQL with args substituted (positional $1, $2…)
  let finalSql = sql
  args.forEach((v, i) => {
    const escaped = v === null ? "NULL"
      : typeof v === "number" ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`
    finalSql = finalSql.replace(new RegExp(`\\$${i + 1}`, "g"), escaped)
  })

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: finalSql })
    })

    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`)
    const data = await res.json()
    return { results: Array.isArray(data) ? data : [], meta: {} }
  } catch (e) {
    console.error("❌ Supabase error:", e.message)
    return null
  }
}

/* ─────────────────────────────────────────────
   UNIVERSAL DB  —  main export
───────────────────────────────────────────── */
export function getDB(env) {
  return {

    /* ── READ ── */
    async query(sql, args = []) {
      // Try D1 first
      try {
        if (env.DB) {
          const stmt = env.DB.prepare(sql)
          const bound = args.length ? stmt.bind(...args) : stmt
          const { results, meta } = await bound.all()
          return { results: results || [], meta, source: "d1" }
        }
      } catch (e) {
        console.warn("⚠️ D1 read failed, trying Turso:", e.message)
      }

      // Fallback → Turso
      const turso = await tursoQuery(env, sql, args)
      if (turso) return { ...turso, source: "turso" }

      // Fallback → Supabase
      const supa = await supabaseQuery(env, convertToPostgres(sql), args)
      if (supa) return { ...supa, source: "supabase" }

      throw new Error("All databases unavailable")
    },

    /* ── READ (first row only) ── */
    async queryOne(sql, args = []) {
      const { results, source } = await this.query(sql, args)
      return { result: results?.[0] || null, source }
    },

    /* ── WRITE (D1 primary + replicas in background) ── */
    async execute(sql, args = []) {
      let d1Result = null
      let d1Error = null

      // 1️⃣ Write to D1
      try {
        if (env.DB) {
          const stmt = env.DB.prepare(sql)
          const bound = args.length ? stmt.bind(...args) : stmt
          d1Result = await bound.run()
        }
      } catch (e) {
        d1Error = e
        console.error("❌ D1 write failed:", e.message)
      }

      // 2️⃣ Sync to Turso (background — non-blocking)
      tursoQuery(env, sql, args).catch(e =>
        console.warn("⚠️ Turso sync failed:", e.message)
      )

      // 3️⃣ Sync to Supabase (background — non-blocking)
      supabaseQuery(env, convertToPostgres(sql), args).catch(e =>
        console.warn("⚠️ Supabase sync failed:", e.message)
      )

      // If D1 failed but replicas might work, throw
      if (d1Error) throw d1Error

      return d1Result
    },

    /* ── BATCH WRITE (multiple statements) ── */
    async batch(statements) {
      // statements = [{ sql, args }, ...]
      const results = []
      for (const s of statements) {
        const r = await this.execute(s.sql, s.args || [])
        results.push(r)
      }
      return results
    }
  }
}

/* ─────────────────────────────────────────────
   SQLite → PostgreSQL basic converter
   (for Supabase — handles common differences)
───────────────────────────────────────────── */
function convertToPostgres(sql) {
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
    .replace(/TEXT PRIMARY KEY/gi,                  "VARCHAR(255) PRIMARY KEY")
    .replace(/datetime\('now'\)/gi,                 "NOW()")
    .replace(/\bIF NOT EXISTS\b/gi,                 "IF NOT EXISTS")
    .replace(/\bINSERT OR IGNORE\b/gi,              "INSERT")
    .replace(/\bINSERT OR REPLACE\b/gi,             "INSERT")
    .replace(/PRAGMA [^;]+;?/gi,                    "")
    .trim()
}
