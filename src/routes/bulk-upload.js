/* ================================================
   bulk-upload.js — CSV Bulk Import (NEW FILE)
   Blueprint §11 — Bulk import download links + IP block

   index.js mein mount karo:
     adminRoutes.route("/", bulkUpload)   ← admin-only

   Routes:
     POST /api/admin/bulk-upload/download-links  ← CSV import
     POST /api/admin/bulk-upload/block-ips        ← bulk IP block
================================================ */

import { Hono }  from "hono"
import config    from "./config.js"

const bulkUpload = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

/* ── HELPERS ── */

// Parse a single CSV line — handles basic quoted fields
function parseCsvLine(line) {
  const result = []
  let   cur    = ""
  let   inQuote = false

  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim())
      cur = ""
    } else {
      cur += ch
    }
  }
  result.push(cur.trim())
  return result
}

/* ════════════════════════════════════════════════════════════
   POST /api/admin/bulk-upload/download-links
   CSV format: episode_id,url,host,quality
════════════════════════════════════════════════════════════ */

bulkUpload.post("/bulk-upload/download-links", async (c) => {
  try {
    const db = c.env.DB

    // Must be multipart
    let formData
    try { formData = await c.req.parseBody() }
    catch { return fail(c, "multipart/form-data required") }

    const csvFile = formData["csv"]
    if (!csvFile || typeof csvFile === "string") {
      return fail(c, "CSV file required (field name: csv)")
    }

    const csvText = await csvFile.text()
    const lines   = csvText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)

    if (lines.length < 2) {
      return fail(c, "CSV must have a header row plus at least one data row")
    }

    // Parse header
    const headers      = parseCsvLine(lines[0]).map(h => h.toLowerCase())
    const requiredCols = ["episode_id", "url", "host"]

    for (const col of requiredCols) {
      if (!headers.includes(col)) {
        return fail(c, `Missing required column: "${col}" — expected header: episode_id,url,host,quality`)
      }
    }

    // Parse data rows
    const rows = lines.slice(1).map(line => {
      const values = parseCsvLine(line)
      const row    = {}
      headers.forEach((h, i) => { row[h] = (values[i] || "").trim() })
      return row
    }).filter(row => row.episode_id && row.url)  // skip blank rows

    if (rows.length === 0) {
      return fail(c, "No valid data rows found")
    }

    // Safety cap from config
    const MAX_ROWS = config.BULK_UPLOAD.MAX_CSV_ROWS
    if (rows.length > MAX_ROWS) {
      return fail(c, `Too many rows — max ${MAX_ROWS} per upload (got ${rows.length})`)
    }

    // Batch insert in chunks
    const BATCH     = config.BULK_UPLOAD.BATCH_SIZE
    let   inserted  = 0
    let   errors    = 0
    const errorList = []

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)

      // ✅ D1 batch — one round-trip per chunk
      const stmts = chunk.map(row =>
        db.prepare(
          `INSERT OR IGNORE INTO download_links
             (episode_id, url, host, quality, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`
        ).bind(
          row.episode_id,
          row.url,
          row.host,
          row.quality || "auto"
        )
      )

      try {
        const results = await db.batch(stmts)
        // Each result has meta.changes: 0 = duplicate (ignored), 1 = inserted
        results.forEach((r, idx) => {
          if (r.meta?.changes > 0) {
            inserted++
          } else {
            // Duplicate — not an error, just skipped
          }
        })
      } catch (err) {
        errors += chunk.length
        errorList.push(`Rows ${i + 1}–${i + chunk.length}: ${err.message}`)
      }
    }

    return ok(c, {
      total:    rows.length,
      inserted,
      skipped:  rows.length - inserted - errors,  // duplicates
      errors,
      errorDetails: errorList.slice(0, 10)        // cap error list
    })

  } catch (err) {
    console.error("bulk-upload download-links:", err)
    return fail(c, err.message, 500)
  }
})

/* ════════════════════════════════════════════════════════════
   POST /api/admin/bulk-upload/block-ips
   Body: { ips: string[], reason?: string, duration?: number }
   (superadmin only — enforce in adminAuth middleware or index.js)
════════════════════════════════════════════════════════════ */

bulkUpload.post("/bulk-upload/block-ips", async (c) => {
  try {
    if (!c.env.KV) {
      return fail(c, "KV store not bound — cannot block IPs", 503)
    }

    let body
    try { body = await c.req.json() }
    catch { return fail(c, "Invalid JSON body") }

    const { ips, reason, duration } = body || {}

    if (!Array.isArray(ips) || ips.length === 0) {
      return fail(c, "ips array required")
    }

    // Basic IPv4 + IPv6 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Regex = /^[0-9a-fA-F:]{2,39}$/

    const validIPs   = ips.filter(ip => ipv4Regex.test(ip) || ipv6Regex.test(ip))
    const invalidIPs = ips.filter(ip => !ipv4Regex.test(ip) && !ipv6Regex.test(ip))

    if (validIPs.length === 0) {
      return fail(c, "No valid IP addresses found")
    }

    // Safety cap — max 100 at a time
    const toBlock     = validIPs.slice(0, 100)
    const ttl         = Number(duration) || 86400  // default: 24 h
    const blockReason = reason || "Bulk blocked by admin"
    const now         = new Date().toISOString()

    // ✅ KV bulk put — Promise.all is safe here (KV puts, not D1 subrequests)
    await Promise.all(
      toBlock.map(ip =>
        c.env.KV.put(
          `blocklist:${ip}`,
          JSON.stringify({ reason: blockReason, blockedAt: now }),
          { expirationTtl: ttl }
        )
      )
    )

    return ok(c, {
      blocked:  toBlock.length,
      invalid:  invalidIPs.length,
      skipped:  validIPs.length - toBlock.length,  // over cap
      duration: ttl,
      invalidSamples: invalidIPs.slice(0, 5)
    })

  } catch (err) {
    console.error("bulk-upload block-ips:", err)
    return fail(c, err.message, 500)
  }
})

export default bulkUpload
