/* ================================================
   bulk-upload.js — Bulk IP Block
   Blueprint §11 — bulk IP block

   index.js mein mount karo:
     adminRoutes.route("/", bulkUpload)   ← admin-only

   Routes:
     POST /api/admin/bulk-upload/block-ips        ← bulk IP block

   ✅ FIX (audit): this file used to ALSO define
   POST /bulk-upload/download-links, registering the exact same route
   path as downloadsAdmin.js's (correct) implementation of the same
   route — both mounted via adminRoutes.route("/", ...), so whichever
   was registered first in index.js silently won and the other became
   dead code. This file's version was also the broken one: it inserted
   into download_links using columns (episode_id, url, host, quality,
   created_at) that don't exist on that table — confirmed against
   schema.sql, whose real download_links columns are
   (id, host_entry_id, quality, link, downloads). It targeted an older,
   simpler download_links design; the schema (and downloadsAdmin.js's
   working implementation) moved to the current three-table
   download_entries/download_host_entries/download_links design without
   this route being updated to match. Removed the broken duplicate here
   — see downloadsAdmin.js for the one real implementation of this
   route.
================================================ */

import { Hono }  from "hono"

const bulkUpload = new Hono()

const ok   = (c, data)              => c.json({ success: true,  data })
const fail = (c, msg, status = 400) => c.json({ success: false, message: msg }, status)

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

