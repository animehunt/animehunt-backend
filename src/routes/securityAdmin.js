/* ================================================
   securityAdmin.js — Security Settings + Threat Management
   Auth handled by adminAuth middleware in index.js

   FIXES:
     ✅ FIX 1: GET /security/threats — now has pagination
               Previously returned raw LIMIT 50 with no pagination info
               (security.html Line 860 mismatch)
     ✅ FIX 2: GET /security/banned — now has pagination
               Previously hard-coded LIMIT 100
     ✅ FIX 3: POST /security/threats/log — now auto-blocks high severity
               via KV blocklist (uses blockIP from firewall.js)
     ✅ FIX 4: Imported blockIP/unblockIP from firewall.js
               (no more duplicate ban logic)
     ✅ FIX 5: GET /security/audit-logs — new route added
               (was in blueprint but missing from file)
================================================ */

import { Hono } from "hono"
import { blockIP, unblockIP } from "./firewall.js"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

/* ================================================
   ENSURE TABLES + DEFAULT ROW
================================================ */

async function ensureRow(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS security_settings (
        id                    INTEGER PRIMARY KEY DEFAULT 1,
        firewall_level        INTEGER DEFAULT 3,
        core_bot              INTEGER DEFAULT 1,
        core_scraper          INTEGER DEFAULT 1,
        core_hotlink          INTEGER DEFAULT 1,
        core_embed            INTEGER DEFAULT 1,
        core_xss              INTEGER DEFAULT 1,
        core_csrf             INTEGER DEFAULT 1,
        core_sqli             INTEGER DEFAULT 1,
        rate_limit            INTEGER DEFAULT 1,
        rate_limit_req        INTEGER DEFAULT 100,
        rate_limit_window     INTEGER DEFAULT 60,
        rate_limit_ban        INTEGER DEFAULT 1,
        ddos_protect          INTEGER DEFAULT 1,
        ddos_threshold        INTEGER DEFAULT 500,
        ddos_block_time       INTEGER DEFAULT 300,
        admin_login_limit     INTEGER DEFAULT 1,
        admin_max_attempts    INTEGER DEFAULT 5,
        admin_lockout_min     INTEGER DEFAULT 30,
        admin_2fa             INTEGER DEFAULT 0,
        session_monitor       INTEGER DEFAULT 1,
        geo_block             INTEGER DEFAULT 0,
        geo_blocked_countries TEXT    DEFAULT '',
        vpn_block             INTEGER DEFAULT 0,
        tor_block             INTEGER DEFAULT 1,
        ai_auto_ban           INTEGER DEFAULT 1,
        ai_threat_detect      INTEGER DEFAULT 1,
        ai_anomaly            INTEGER DEFAULT 1,
        ai_ban_threshold      INTEGER DEFAULT 5,
        hsts                  INTEGER DEFAULT 1,
        csp                   INTEGER DEFAULT 1,
        xframe                INTEGER DEFAULT 1,
        nosniff               INTEGER DEFAULT 1,
        updated_at            TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS banned_ips (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ip         TEXT NOT NULL UNIQUE,
        reason     TEXT DEFAULT 'manual',
        ban_count  INTEGER DEFAULT 1,
        expires_at TEXT,
        created_at TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS threat_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        ip         TEXT,
        type       TEXT,
        path       TEXT,
        ua         TEXT,
        country    TEXT,
        severity   TEXT DEFAULT 'medium',
        created_at TEXT
      )
    `).run()

    /* FIX: audit_logs table — needed for GET /security/audit-logs */
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        admin      TEXT,
        action     TEXT,
        target     TEXT,
        detail     TEXT,
        ip         TEXT,
        created_at TEXT
      )
    `).run()

    /* Add severity column to threat_logs if it doesn't exist (migration) */
    try {
      await db.prepare("ALTER TABLE threat_logs ADD COLUMN severity TEXT DEFAULT 'medium'").run()
    } catch { /* column already exists */ }

    const row = await db.prepare(
      "SELECT id FROM security_settings WHERE id=1"
    ).first()

    if (!row) {
      await db.prepare(`
        INSERT INTO security_settings (
          id,firewall_level,
          core_bot,core_scraper,core_hotlink,core_embed,core_xss,core_csrf,core_sqli,
          rate_limit,rate_limit_req,rate_limit_window,rate_limit_ban,
          ddos_protect,ddos_threshold,ddos_block_time,
          admin_login_limit,admin_max_attempts,admin_lockout_min,admin_2fa,
          session_monitor,geo_block,geo_blocked_countries,vpn_block,tor_block,
          ai_auto_ban,ai_threat_detect,ai_anomaly,ai_ban_threshold,
          hsts,csp,xframe,nosniff,updated_at
        ) VALUES (1,3,1,1,1,1,1,1,1,1,100,60,1,1,500,300,1,5,30,0,1,0,'',0,1,1,1,1,5,1,1,1,1,?)
      `).bind(now()).run()
    }
  } catch (err) {
    console.error("security ensureRow:", err)
  }
}

/* ================================================
   FORMAT ROW
================================================ */

function formatRow(r) {
  return {
    firewallLevel: r.firewall_level ?? 3,
    core: {
      bot:     !!r.core_bot,
      scraper: !!r.core_scraper,
      hotlink: !!r.core_hotlink,
      embed:   !!r.core_embed,
      xss:     !!r.core_xss,
      csrf:    !!r.core_csrf,
      sqli:    !!r.core_sqli
    },
    rateLimit: {
      enabled: !!r.rate_limit,
      req:     r.rate_limit_req    || 100,
      window:  r.rate_limit_window || 60,
      ban:     !!r.rate_limit_ban
    },
    ddos: {
      protect:   !!r.ddos_protect,
      threshold: r.ddos_threshold  || 500,
      blockTime: r.ddos_block_time || 300
    },
    admin: {
      loginLimit:  !!r.admin_login_limit,
      maxAttempts: r.admin_max_attempts || 5,
      lockoutMin:  r.admin_lockout_min  || 30,
      twoFA:       !!r.admin_2fa
    },
    advanced: {
      sessionMonitor:      !!r.session_monitor,
      geoBlock:            !!r.geo_block,
      geoBlockedCountries: r.geo_blocked_countries || "",
      vpnBlock:            !!r.vpn_block,
      torBlock:            !!r.tor_block
    },
    ai: {
      autoBan:      !!r.ai_auto_ban,
      threatDetect: !!r.ai_threat_detect,
      anomaly:      !!r.ai_anomaly,
      banThreshold: r.ai_ban_threshold || 5
    },
    headers: {
      hsts:    !!r.hsts,
      csp:     !!r.csp,
      xframe:  !!r.xframe,
      nosniff: !!r.nosniff
    },
    updated_at: r.updated_at
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, row) {
  const args = [
    row.firewall_level,
    row.core_bot, row.core_scraper, row.core_hotlink, row.core_embed,
    row.core_xss, row.core_csrf, row.core_sqli,
    row.rate_limit, row.rate_limit_req, row.rate_limit_window, row.rate_limit_ban,
    row.ddos_protect, row.ddos_threshold, row.ddos_block_time,
    row.admin_login_limit, row.admin_max_attempts, row.admin_lockout_min, row.admin_2fa,
    row.session_monitor, row.geo_block, row.geo_blocked_countries,
    row.vpn_block, row.tor_block,
    row.ai_auto_ban, row.ai_threat_detect, row.ai_anomaly, row.ai_ban_threshold,
    row.hsts, row.csp, row.xframe, row.nosniff, row.updated_at
  ].map(v => ({
    type: typeof v === "number" ? "integer" : "text",
    value: String(v ?? "")
  }))

  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    fetch(`${env.TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO security_settings (
              id,firewall_level,
              core_bot,core_scraper,core_hotlink,core_embed,core_xss,core_csrf,core_sqli,
              rate_limit,rate_limit_req,rate_limit_window,rate_limit_ban,
              ddos_protect,ddos_threshold,ddos_block_time,
              admin_login_limit,admin_max_attempts,admin_lockout_min,admin_2fa,
              session_monitor,geo_block,geo_blocked_countries,vpn_block,tor_block,
              ai_auto_ban,ai_threat_detect,ai_anomaly,ai_ban_threshold,
              hsts,csp,xframe,nosniff,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args
          }
        }]
      })
    }).catch(e => console.error("Turso security sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/security_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        "apikey": env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    }).catch(e => console.error("Supabase security sync:", e))
  }
}

/* ================================================
   GET /security
================================================ */

app.get("/security", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare("SELECT * FROM security_settings WHERE id=1").first()
    return c.json(success(formatRow(row || {})))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /security — Save Settings
================================================ */

app.post("/security", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    const timestamp = now()
    const row = {
      firewall_level:        Number(body.firewallLevel || 3),
      core_bot:              bool(body.core?.bot),
      core_scraper:          bool(body.core?.scraper),
      core_hotlink:          bool(body.core?.hotlink),
      core_embed:            bool(body.core?.embed),
      core_xss:              bool(body.core?.xss),
      core_csrf:             bool(body.core?.csrf),
      core_sqli:             bool(body.core?.sqli),
      rate_limit:            bool(body.rateLimit?.enabled),
      rate_limit_req:        Number(body.rateLimit?.req      || 100),
      rate_limit_window:     Number(body.rateLimit?.window   || 60),
      rate_limit_ban:        bool(body.rateLimit?.ban),
      ddos_protect:          bool(body.ddos?.protect),
      ddos_threshold:        Number(body.ddos?.threshold     || 500),
      ddos_block_time:       Number(body.ddos?.blockTime     || 300),
      admin_login_limit:     bool(body.admin?.loginLimit),
      admin_max_attempts:    Number(body.admin?.maxAttempts  || 5),
      admin_lockout_min:     Number(body.admin?.lockoutMin   || 30),
      admin_2fa:             bool(body.admin?.twoFA),
      session_monitor:       bool(body.advanced?.sessionMonitor),
      geo_block:             bool(body.advanced?.geoBlock),
      geo_blocked_countries: body.advanced?.geoBlockedCountries || "",
      vpn_block:             bool(body.advanced?.vpnBlock),
      tor_block:             bool(body.advanced?.torBlock),
      ai_auto_ban:           bool(body.ai?.autoBan),
      ai_threat_detect:      bool(body.ai?.threatDetect),
      ai_anomaly:            bool(body.ai?.anomaly),
      ai_ban_threshold:      Number(body.ai?.banThreshold    || 5),
      hsts:                  bool(body.headers?.hsts),
      csp:                   bool(body.headers?.csp),
      xframe:                bool(body.headers?.xframe),
      nosniff:               bool(body.headers?.nosniff),
      updated_at:            timestamp
    }

    await db.prepare(`
      UPDATE security_settings SET
        firewall_level=?,
        core_bot=?,core_scraper=?,core_hotlink=?,core_embed=?,
        core_xss=?,core_csrf=?,core_sqli=?,
        rate_limit=?,rate_limit_req=?,rate_limit_window=?,rate_limit_ban=?,
        ddos_protect=?,ddos_threshold=?,ddos_block_time=?,
        admin_login_limit=?,admin_max_attempts=?,admin_lockout_min=?,admin_2fa=?,
        session_monitor=?,geo_block=?,geo_blocked_countries=?,vpn_block=?,tor_block=?,
        ai_auto_ban=?,ai_threat_detect=?,ai_anomaly=?,ai_ban_threshold=?,
        hsts=?,csp=?,xframe=?,nosniff=?,updated_at=?
      WHERE id=1
    `).bind(
      row.firewall_level,
      row.core_bot, row.core_scraper, row.core_hotlink, row.core_embed,
      row.core_xss, row.core_csrf, row.core_sqli,
      row.rate_limit, row.rate_limit_req, row.rate_limit_window, row.rate_limit_ban,
      row.ddos_protect, row.ddos_threshold, row.ddos_block_time,
      row.admin_login_limit, row.admin_max_attempts, row.admin_lockout_min, row.admin_2fa,
      row.session_monitor, row.geo_block, row.geo_blocked_countries,
      row.vpn_block, row.tor_block,
      row.ai_auto_ban, row.ai_threat_detect, row.ai_anomaly, row.ai_ban_threshold,
      row.hsts, row.csp, row.xframe, row.nosniff, row.updated_at
    ).run()

    syncToReplicas(c.env, row)
    return c.json(success({ saved: true, updated_at: timestamp }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /security/reset
================================================ */

app.post("/security/reset", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)
    await db.prepare(`
      UPDATE security_settings SET
        firewall_level=3,
        core_bot=1,core_scraper=1,core_hotlink=1,core_embed=1,
        core_xss=1,core_csrf=1,core_sqli=1,
        rate_limit=1,rate_limit_req=100,rate_limit_window=60,rate_limit_ban=1,
        ddos_protect=1,ddos_threshold=500,ddos_block_time=300,
        admin_login_limit=1,admin_max_attempts=5,admin_lockout_min=30,admin_2fa=0,
        session_monitor=1,geo_block=0,geo_blocked_countries='',vpn_block=0,tor_block=1,
        ai_auto_ban=1,ai_threat_detect=1,ai_anomaly=1,ai_ban_threshold=5,
        hsts=1,csp=1,xframe=1,nosniff=1,updated_at=?
      WHERE id=1
    `).bind(ts).run()
    return c.json(success({ reset: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /security/enable-all
================================================ */

app.post("/security/enable-all", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)
    await db.prepare(`
      UPDATE security_settings SET
        firewall_level=5,
        core_bot=1,core_scraper=1,core_hotlink=1,core_embed=1,
        core_xss=1,core_csrf=1,core_sqli=1,
        rate_limit=1,rate_limit_ban=1,
        ddos_protect=1,admin_login_limit=1,
        session_monitor=1,tor_block=1,
        ai_auto_ban=1,ai_threat_detect=1,ai_anomaly=1,
        hsts=1,csp=1,xframe=1,nosniff=1,updated_at=?
      WHERE id=1
    `).bind(ts).run()
    return c.json(success({ enabled: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /security/score
================================================ */

app.get("/security/score", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare("SELECT * FROM security_settings WHERE id=1").first()
    if (!row) return c.json(success({ score: 0, grade: "F", tips: [] }))

    const checks = [
      { key: "core_bot",          pts: 8,  tip: "Enable Bot Protection" },
      { key: "core_scraper",      pts: 7,  tip: "Enable Scraper Shield" },
      { key: "core_hotlink",      pts: 6,  tip: "Enable Hotlink Block" },
      { key: "core_xss",          pts: 10, tip: "Enable XSS Protection" },
      { key: "core_csrf",         pts: 10, tip: "Enable CSRF Protection" },
      { key: "core_sqli",         pts: 10, tip: "Enable SQL Injection Protection" },
      { key: "rate_limit",        pts: 8,  tip: "Enable Rate Limiting" },
      { key: "ddos_protect",      pts: 10, tip: "Enable DDoS Protection" },
      { key: "admin_login_limit", pts: 8,  tip: "Enable Admin Login Limit" },
      { key: "session_monitor",   pts: 6,  tip: "Enable Session Monitor" },
      { key: "ai_auto_ban",       pts: 8,  tip: "Enable AI Auto-Ban" },
      { key: "hsts",              pts: 4,  tip: "Enable HSTS Header" },
      { key: "csp",               pts: 5,  tip: "Enable CSP Header" }
    ]

    let score = 0
    const tips = []
    checks.forEach(chk => {
      if (row[chk.key]) score += chk.pts
      else tips.push(chk.tip)
    })
    score = Math.min(100, score)

    const grade = score >= 90 ? "A+" : score >= 80 ? "A" :
                  score >= 70 ? "B"  : score >= 60 ? "C" :
                  score >= 50 ? "D"  : "F"

    return c.json(success({ score, grade, tips, fw: row.firewall_level }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /security/stats
================================================ */

app.get("/security/stats", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)

    let bannedCount = 0, threatCount = 0
    try {
      const b = await db.prepare("SELECT COUNT(*) as c FROM banned_ips").first()
      bannedCount = b?.c || 0
    } catch {}

    try {
      const t = await db.prepare("SELECT COUNT(*) as c FROM threat_logs").first()
      threatCount = t?.c || 0
    } catch {}

    return c.json(success({ bannedIPs: bannedCount, threats: threatCount }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /security/banned — List banned IPs WITH PAGINATION
   FIX: Was hard-coded LIMIT 100 with no pagination data
        Now returns page/limit/total/pages for frontend
================================================ */

app.get("/security/banned", async (c) => {
  try {
    const db     = c.env.DB
    const page   = Math.max(1, parseInt(c.req.query("page")  || "1", 10))
    const limit  = Math.min(100, parseInt(c.req.query("limit") || "50", 10))
    const offset = (page - 1) * limit

    await ensureRow(db)

    const [listResult, countResult] = await Promise.all([
      db.prepare(
        "SELECT * FROM banned_ips ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(limit, offset).all(),
      db.prepare("SELECT COUNT(*) as total FROM banned_ips").first()
    ])

    const total = countResult?.total || 0

    return c.json(success({
      banned: listResult.results || [],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /security/ban — Ban an IP
   FIX: Uses shared blockIP() from firewall.js (single source of truth)
================================================ */

app.post("/security/ban", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    if (!body.ip?.trim()) return c.json(failure("IP required"), 400)

    /* Basic IP format check */
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(body.ip.trim())) {
      return c.json(failure("Invalid IP format"), 400)
    }

    const durationSeconds = body.duration || 86400

    // FIX: Use shared blockIP from firewall.js (also updates KV blocklist)
    await blockIP(c.env, body.ip.trim(), body.reason || "manual", durationSeconds)

    return c.json(success({ ip: body.ip.trim(), banned: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /security/banned/all — Clear all bans
   FIX: /banned/all pehle — warna :ip "all" ko match kar leta
        Also clears KV blocklist entries
================================================ */

app.delete("/security/banned/all", async (c) => {
  try {
    const db = c.env.DB

    // Get all IPs before deleting (to clean KV)
    if (c.env.KV) {
      try {
        const kvList = await c.env.KV.list({ prefix: "blocklist:" })
        if (kvList.keys.length > 0) {
          await Promise.all(kvList.keys.map(k => c.env.KV.delete(k.name)))
        }
      } catch (e) {
        console.warn("⚠️ KV blocklist clear failed:", e.message)
      }
    }

    await db.prepare("DELETE FROM banned_ips").run()
    return c.json(success({ cleared: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /security/ban/:ip — Unban an IP
   FIX: Uses shared unblockIP() from firewall.js (also clears KV)
================================================ */

app.delete("/security/ban/:ip", async (c) => {
  try {
    const ip = c.req.param("ip")
    // FIX: Use shared unblockIP (clears DB + KV)
    await unblockIP(c.env, ip)
    return c.json(success({ ip, unbanned: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /security/threats — Threat logs WITH PAGINATION
   FIX: Was returning raw LIMIT 50 with no pagination
        security.html Line 860 expected pagination object
================================================ */

app.get("/security/threats", async (c) => {
  try {
    const db     = c.env.DB
    const page   = Math.max(1, parseInt(c.req.query("page")  || "1", 10))
    const limit  = Math.min(100, parseInt(c.req.query("limit") || "30", 10))
    const offset = (page - 1) * limit

    await ensureRow(db)

    const [listResult, countResult] = await Promise.all([
      db.prepare(
        "SELECT * FROM threat_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(limit, offset).all(),
      db.prepare("SELECT COUNT(*) as total FROM threat_logs").first()
    ])

    const total = countResult?.total || 0

    return c.json(success({
      threats: listResult.results || [],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   DELETE /security/threats — Clear threat logs
================================================ */

app.delete("/security/threats", async (c) => {
  try {
    await c.env.DB.prepare("DELETE FROM threat_logs").run()
    return c.json(success({ cleared: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /security/threats/log — Log a threat (internal use)
   FIX: Auto-ban now uses blockIP() from firewall.js
        (previously was a raw DB insert without KV sync)
        High/critical severity auto-bans immediately
================================================ */

app.post("/security/threats/log", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    const severity = body.severity || "medium"

    await db.prepare(`
      INSERT INTO threat_logs (ip,type,path,ua,country,severity,created_at)
      VALUES (?,?,?,?,?,?,?)
    `).bind(
      body.ip      || "",
      body.type    || "unknown",
      body.path    || "",
      body.ua      || "",
      body.country || "",
      severity,
      now()
    ).run()

    /* FIX: Auto-ban high/critical severity immediately */
    if ((severity === "high" || severity === "critical") && body.ip) {
      await blockIP(c.env, body.ip, `Auto-blocked: ${body.type} (${severity})`, 86400)
      return c.json(success({ logged: true, autoBanned: true }))
    }

    /* Auto-ban if threshold crossed for medium/low severity */
    const settings = await db.prepare(
      "SELECT ai_auto_ban,ai_ban_threshold FROM security_settings WHERE id=1"
    ).first()

    if (settings?.ai_auto_ban && body.ip) {
      const count = await db.prepare(
        "SELECT COUNT(*) as c FROM threat_logs WHERE ip=?"
      ).bind(body.ip).first()

      if (count?.c >= (settings.ai_ban_threshold || 5)) {
        // FIX: Use blockIP() which also updates KV blocklist
        await blockIP(c.env, body.ip, "ai_auto_ban", 86400)
        return c.json(success({ logged: true, autoBanned: true }))
      }
    }

    return c.json(success({ logged: true, autoBanned: false }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /security/audit-logs — Audit log WITH PAGINATION
   FIX: This route was completely missing from the file
        Blueprint specified it was needed
================================================ */

app.get("/security/audit-logs", async (c) => {
  try {
    const db     = c.env.DB
    const page   = Math.max(1, parseInt(c.req.query("page")  || "1", 10))
    const limit  = Math.min(100, parseInt(c.req.query("limit") || "50", 10))
    const offset = (page - 1) * limit

    await ensureRow(db)

    const [listResult, countResult] = await Promise.all([
      db.prepare(
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
      ).bind(limit, offset).all(),
      db.prepare("SELECT COUNT(*) as total FROM audit_logs").first()
    ])

    const total = countResult?.total || 0

    return c.json(success({
      logs: listResult.results || [],
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /security/audit-logs — Write audit log entry
================================================ */

app.post("/security/audit-logs", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    await db.prepare(`
      INSERT INTO audit_logs (admin, action, target, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      body.admin  || "system",
      body.action || "unknown",
      body.target || "",
      body.detail || "",
      body.ip     || "",
      now()
    ).run()

    return c.json(success({ logged: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
