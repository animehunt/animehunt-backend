/* ================================================================
   src/adapters/d1Libsql.js
   D1-COMPATIBLE ADAPTER — backed by Turso (libSQL)

   Every route file in this project calls:
     env.DB.prepare(sql).bind(...args).all() / .first() / .run()
     env.DB.batch([stmt1, stmt2, ...])

   That is exactly Cloudflare D1's API shape. This file re-implements
   the same shape on top of the official @libsql/client SDK, so that
   every one of those existing call sites keeps working completely
   unmodified — only this one file, and the two lines in index.js
   that construct it, need to exist for the D1 half of the migration.

   Turso runs on libSQL, which is a SQLite fork — same dialect D1
   uses under the hood, so no SQL needs to be rewritten. FTS5 (used
   in publicSearch.js / searchAdmin.js) is supported by libSQL too.
================================================================ */

import { createClient } from "@libsql/client"

/**
 * @param {{ url: string, authToken: string }} config
 * @returns an object with the same .prepare/.batch shape as env.DB on Workers
 */
export function createD1Compatible({ url, authToken }) {
  if (!url) {
    throw new Error(
      "createD1Compatible: TURSO_URL is required (e.g. libsql://your-db-name.turso.io)"
    )
  }

  const client = createClient({ url, authToken })

  return {
    /** Raw libsql client, exposed in case you need it directly (e.g. client.batch for advanced use) */
    _client: client,

    prepare(sql) {
      let boundArgs = []

      return {
        bind(...args) {
          // D1's .bind() is variadic: stmt.bind(a, b, c) — but some call
          // sites in this codebase do stmt.bind(...arrayOfArgs), which
          // already flattens correctly via the spread above.
          boundArgs = args
          return this
        },

        async all() {
          const r = await client.execute({ sql, args: boundArgs })
          return {
            results: r.rows,
            success: true,
            meta: {
              changes: r.rowsAffected,
              last_row_id: normalizeLastId(r.lastInsertRowid),
              duration: 0
            }
          }
        },

        async first(column) {
          const r = await client.execute({ sql, args: boundArgs })
          const row = r.rows[0] ?? null
          if (row && column) return row[column] ?? null
          return row
        },

        async run() {
          const r = await client.execute({ sql, args: boundArgs })
          return {
            success: true,
            meta: {
              changes: r.rowsAffected,
              last_row_id: normalizeLastId(r.lastInsertRowid),
              duration: 0
            }
          }
        },

        // Some route files build an array of .prepare(...).bind(...) objects
        // and pass them straight to env.DB.batch([...]) — raw() isn't used
        // anywhere in this codebase, but included for completeness/safety.
        raw() {
          throw new Error("raw() is not implemented in the D1-compatible adapter — not used in this codebase")
        },

        // internal — used by db.batch() below to read the sql/args back out
        _sql: sql,
        get _args() { return boundArgs }
      }
    },

    /**
     * env.DB.batch([stmtA, stmtB, ...]) — D1 runs these as a single
     * transaction. libSQL's client.batch() does the same, and — unlike
     * D1 — has no hard 100-statement ceiling, so the manual chunking in
     * searchAdmin.js / seoAdmin.js / adminServers.js etc. is no longer
     * required (safe to leave as-is, or relax later).
     */
    async batch(stmts) {
      const requests = stmts.map(s => ({ sql: s._sql, args: s._args }))
      const results = await client.batch(requests, "write")
      return results.map(r => ({
        success: true,
        results: r.rows,
        meta: {
          changes: r.rowsAffected,
          last_row_id: normalizeLastId(r.lastInsertRowid),
          duration: 0
        }
      }))
    },

    /** Not used anywhere in this codebase today, included for parity with D1's API */
    async exec(sql) {
      const r = await client.executeMultiple(sql)
      return { count: Array.isArray(r) ? r.length : 1, duration: 0 }
    },

    async dump() {
      throw new Error("dump() is not implemented — use /deploy/backup or wrangler d1 export instead")
    }
  }
}

// libsql returns BigInt for lastInsertRowid; D1 callers expect a plain number.
function normalizeLastId(v) {
  if (v === undefined || v === null) return null
  return typeof v === "bigint" ? Number(v) : v
}

