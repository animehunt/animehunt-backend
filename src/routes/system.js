/* ================================================
   system.js — System Settings + Health + Logs
   Auth handled by adminAuth middleware in index.js

   FIXES v2.2:
     ✅ FIX 1: cache-clear batched (500 rows, prevent D1 lock)
     ✅ FIX 2: KV invalidated after every save/reset/kill/recover
     ✅ FIX 3: Config versioning (save snapshot + rollback)
     ✅ FIX 4: saveConfigVersion — env.DB null guard added
     ✅ FIX 5: DELETE /system/logs — batched deletion
================================================ */

import { Hono } from "hono"
import { invalidateSystemSettingsCache } from "./systemGuard.js"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

/* ── Ensure all required tables exist ── */
async function ensureRow(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id               INTEGER PRIMARY KEY DEFAULT 1,
        systemOn         INTEGER DEFAULT 1,
        maintenanceSoft  INTEGER DEFAULT 0,
        maintenanceHard  INTEGER DEFAULT 0,
        lockCMS          INTEGER DEFAULT 0,
        readOnly         INTEGER DEFAULT 0,
        env              TEXT    DEFAULT 'Production',
        theme            TEXT    DEFAULT 'Dark',
        animation        TEXT    DEFAULT 'Soft',
        geoBlock         INTEGER DEFAULT 0,
        ageLock          INTEGER DEFAULT 0,
        schedule         INTEGER DEFAULT 0,
        shadow           INTEGER DEFAULT 0,
        autoBackup       INTEGER DEFAULT 0,
        autoBackupHours  INTEGER DEFAULT 24,
        debugMode        INTEGER DEFAULT 0,
        apiLogs          INTEGER DEFAULT 0,
        rateLimitGlobal  INTEGER DEFAULT 1,
        cdnEnabled       INTEGER DEFAULT 1,
        imageProxy       INTEGER DEFAULT 1,
        updated_at       TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS cache_store (
        id         TEXT PRIMARY KEY,
        data       TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        action     TEXT,
        detail     TEXT,
        admin      TEXT DEFAULT 'system',
        created_at TEXT
      )
    `).run()

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS config_versions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        config     TEXT    NOT NULL,
        created_at TEXT    NOT NULL,
        created_by TEXT    DEFAULT 'admin'
      )
    `).run()

    const row = await db.prepare("SELECT id FROM system_settings WHERE id=1").first()
    if (!row) {
      await db.prepare("INSERT INTO system_settings (id, updated_at) VALUES (1, ?)").bind(now()).run()
    }
  } catch (err) {
    console.error("system ensureRow:", err)
  }
}

/* ── Log action ── */
async function logAction(db, action, detail, admin = "admin") {
  try {
    await db.prepare(
      "INSERT INTO system_logs (action,detail,admin,created_at) VALUES (?,?,?,?)"
    ).bind(action, detail, admin, now()).run()
  } catch {}
}

/* ── Format row for API response ── */
function format(r) {
  return {
    core: {
      systemOn:        !!r.systemOn,
      maintenanceSoft: !!r.maintenanceSoft,
      maintenanceHard: !!r.maintenanceHard,
      lockCMS:         !!r.lockCMS,
      readOnly:        !!r.readOnly,
      env:             r.env || "Production"
    },
    ui: {
      theme:     r.theme     || "Dark",
      animation: r.animation || "Soft"
    },
    content: {
      geoBlock: !!r.geoBlock,
      ageLock:  !!r.ageLock,
      schedule: !!r.schedule,
      shadow:   !!r.shadow
    },
    automation: {
      autoBackup:      !!r.autoBackup,
      autoBackupHours: r.autoBackupHours || 24,
      debugMode:       !!r.debugMode,
      apiLogs:         !!r.apiLogs,
      rateLimitGlobal: !!r.rateLimitGlobal,
      cdnEnabled:      !!r.cdnEnabled,
      imageProxy:      !!r.imageProxy
    },
    updated_at: r.updated_at
  }
}

/* ── Sync settings to Turso + Supabase replicas (fire & forget) ── */
async function syncToReplicas(env, row) {
  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    fetch(`${env.TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO system_settings (
              id,systemOn,maintenanceSoft,maintenanceHard,lockCMS,readOnly,env,
              theme,animation,geoBlock,ageLock,schedule,shadow,
              autoBackup,autoBackupHours,debugMode,apiLogs,
              rateLimitGlobal,cdnEnabled,imageProxy,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              row.systemOn, row.maintenanceSoft, row.maintenanceHard,
              row.lockCMS, row.readOnly, row.env,
              row.theme, row.animation,
              row.geoBlock, row.ageLock, row.schedule, row.shadow,
              row.autoBackup, row.autoBackupHours, row.debugMode, row.apiLogs,
              row.rateLimitGlobal, row.cdnEnabled, row.imageProxy, row.updated_at
            ].map(v => ({ type: typeof v === "number" ? "integer" : "text", value: String(v ?? "") }))
          }
        }]
      })
    }).catch(e => console.error("Turso system sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/system_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        "apikey": env.SUPABASE_KEY, "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    }).catch(e => console.error("Supabase system sync:", e))
  }
}

/* ── Config versioning ── */

// FIX v2.2: env.DB null guard + early return if no DB
export async function saveConfigVersion(env, config, adminId = "admin") {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      "INSERT INTO config_versions (config, created_at, created_by) VALUES (?, ?, ?)"
    ).bind(JSON.stringify(config), now(), adminId).run()

    // Keep only last 10 versions
    await env.DB.prepare(`
      DELETE FROM config_versions WHERE id NOT IN (
        SELECT id FROM config_versions ORDER BY created_at DESC LIMIT 10
      )
    `).run()
  } catch (err) {
    console.warn("⚠️ saveConfigVersion error:", err.message)
  }
}

export async function rollbackConfig(env, versionId) {
  if (!env.DB) throw new Error("Database unavailable")

  const version = await env.DB.prepare(
    "SELECT * FROM config_versions WHERE id=?"
  ).bind(versionId).first()

  if (!version) throw new Error("Version not found")

  const config = JSON.parse(version.config)

  const row = {
    systemOn:        bool(config.core?.systemOn),
    maintenanceSoft: bool(config.core?.maintenanceSoft),
    maintenanceHard: bool(config.core?.maintenanceHard),
    lockCMS:         bool(config.core?.lockCMS),
    readOnly:        bool(config.core?.readOnly),
    env:             config.core?.env             || "Production",
    theme:           config.ui?.theme             || "Dark",
    animation:       config.ui?.animation         || "Soft",
    geoBlock:        bool(config.content?.geoBlock),
    ageLock:         bool(config.content?.ageLock),
    schedule:        bool(config.content?.schedule),
    shadow:          bool(config.content?.shadow),
    autoBackup:      bool(config.automation?.autoBackup),
    autoBackupHours: Number(config.automation?.autoBackupHours || 24),
    debugMode:       bool(config.automation?.debugMode),
    apiLogs:         bool(config.automation?.apiLogs),
    rateLimitGlobal: bool(config.automation?.rateLimitGlobal),
    cdnEnabled:      bool(config.automation?.cdnEnabled),
    imageProxy:      bool(config.automation?.imageProxy),
    updated_at:      now()
  }

  await env.DB.prepare(`
    UPDATE system_settings SET
      systemOn=?,maintenanceSoft=?,maintenanceHard=?,lockCMS=?,readOnly=?,env=?,
      theme=?,animation=?,
      geoBlock=?,ageLock=?,schedule=?,shadow=?,
      autoBackup=?,autoBackupHours=?,debugMode=?,apiLogs=?,
      rateLimitGlobal=?,cdnEnabled=?,imageProxy=?,
      updated_at=?
    WHERE id=1
  `).bind(
    row.systemOn, row.maintenanceSoft, row.maintenanceHard,
    row.lockCMS, row.readOnly, row.env,
    row.theme, row.animation,
    row.geoBlock, row.ageLock, row.schedule, row.shadow,
    row.autoBackup, row.autoBackupHours, row.debugMode, row.apiLogs,
    row.rateLimitGlobal, row.cdnEnabled, row.imageProxy,
    row.updated_at
  ).run()

  await invalidateSystemSettingsCache(env)
  return { success: true, rolledBackTo: versionId, config }
}

/* ================================================================
   ROUTES
================================================================ */

app.get("/system", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare("SELECT * FROM system_settings WHERE id=1").first()
    return c.json(success(format(row || {})))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.post("/system", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    const timestamp = now()
    const row = {
      systemOn:        bool(body.core?.systemOn),
      maintenanceSoft: bool(body.core?.maintenanceSoft),
      maintenanceHard: bool(body.core?.maintenanceHard),
      lockCMS:         bool(body.core?.lockCMS),
      readOnly:        bool(body.core?.readOnly),
      env:             body.core?.env             || "Production",
      theme:           body.ui?.theme             || "Dark",
      animation:       body.ui?.animation         || "Soft",
      geoBlock:        bool(body.content?.geoBlock),
      ageLock:         bool(body.content?.ageLock),
      schedule:        bool(body.content?.schedule),
      shadow:          bool(body.content?.shadow),
      autoBackup:      bool(body.automation?.autoBackup),
      autoBackupHours: Number(body.automation?.autoBackupHours || 24),
      debugMode:       bool(body.automation?.debugMode),
      apiLogs:         bool(body.automation?.apiLogs),
      rateLimitGlobal: bool(body.automation?.rateLimitGlobal),
      cdnEnabled:      bool(body.automation?.cdnEnabled),
      imageProxy:      bool(body.automation?.imageProxy),
      updated_at:      timestamp
    }

    // Save snapshot before overwriting
    const currentRow = await db.prepare("SELECT * FROM system_settings WHERE id=1").first()
    if (currentRow) await saveConfigVersion(c.env, format(currentRow), "admin")

    await db.prepare(`
      UPDATE system_settings SET
        systemOn=?,maintenanceSoft=?,maintenanceHard=?,lockCMS=?,readOnly=?,env=?,
        theme=?,animation=?,
        geoBlock=?,ageLock=?,schedule=?,shadow=?,
        autoBackup=?,autoBackupHours=?,debugMode=?,apiLogs=?,
        rateLimitGlobal=?,cdnEnabled=?,imageProxy=?,
        updated_at=?
      WHERE id=1
    `).bind(
      row.systemOn, row.maintenanceSoft, row.maintenanceHard,
      row.lockCMS, row.readOnly, row.env,
      row.theme, row.animation,
      row.geoBlock, row.ageLock, row.schedule, row.shadow,
      row.autoBackup, row.autoBackupHours, row.debugMode, row.apiLogs,
      row.rateLimitGlobal, row.cdnEnabled, row.imageProxy,
      row.updated_at
    ).run()

    await invalidateSystemSettingsCache(c.env)
    syncToReplicas(c.env, row)
    await logAction(db, "SETTINGS_SAVED", `env=${row.env}`)

    return c.json(success({ saved: true, updated_at: timestamp }))
  } catch (err) {
    console.error("system POST:", err)
    return c.json(failure(err.message), 500)
  }
})

app.post("/system/reset", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)

    const currentRow = await db.prepare("SELECT * FROM system_settings WHERE id=1").first()
    if (currentRow) await saveConfigVersion(c.env, format(currentRow), "admin")

    await db.prepare(`
      UPDATE system_settings SET
        systemOn=1,maintenanceSoft=0,maintenanceHard=0,lockCMS=0,readOnly=0,
        env='Production',theme='Dark',animation='Soft',
        geoBlock=0,ageLock=0,schedule=0,shadow=0,
        autoBackup=0,autoBackupHours=24,debugMode=0,apiLogs=0,
        rateLimitGlobal=1,cdnEnabled=1,imageProxy=1,updated_at=?
      WHERE id=1
    `).bind(ts).run()

    await invalidateSystemSettingsCache(c.env)
    await logAction(db, "SYSTEM_RESET", "Reset to defaults")
    return c.json(success({ reset: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.post("/system/kill", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)

    await db.prepare(
      "UPDATE system_settings SET systemOn=0,maintenanceHard=1,updated_at=? WHERE id=1"
    ).bind(ts).run()

    await invalidateSystemSettingsCache(c.env)
    await logAction(db, "KILL_SWITCH", "Emergency shutdown activated")
    return c.json(success({ halted: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.post("/system/recover", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)

    await db.prepare(
      "UPDATE system_settings SET systemOn=1,maintenanceSoft=0,maintenanceHard=0,updated_at=? WHERE id=1"
    ).bind(ts).run()

    await invalidateSystemSettingsCache(c.env)
    await logAction(db, "SYSTEM_RECOVERED", "System brought back online")
    return c.json(success({ recovered: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

// FIX: Batched deletion — prevents D1 lock on large cache_store
app.post("/system/cache-clear", async (c) => {
  try {
    const db         = c.env.DB
    const BATCH_SIZE = 500
    let total        = 0
    let deleted      = 0
    await ensureRow(db)

    do {
      const result = await db.prepare(
        "DELETE FROM cache_store WHERE id IN (SELECT id FROM cache_store LIMIT ?)"
      ).bind(BATCH_SIZE).run()
      deleted = result.meta?.changes || 0
      total  += deleted
      if (deleted === BATCH_SIZE) await new Promise(r => setTimeout(r, 10))
    } while (deleted === BATCH_SIZE)

    await invalidateSystemSettingsCache(c.env)
    await logAction(db, "CACHE_CLEARED", `Cleared ${total} rows from cache_store`)
    return c.json(success({ cleared: true, rowsCleared: total, timestamp: now() }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.get("/system/config-versions", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const { results } = await db.prepare(
      "SELECT id, created_at, created_by FROM config_versions ORDER BY created_at DESC LIMIT 10"
    ).all()
    return c.json(success(results || []))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.get("/system/config-versions/:id", async (c) => {
  try {
    const db        = c.env.DB
    const versionId = Number(c.req.param("id"))
    const version   = await db.prepare(
      "SELECT * FROM config_versions WHERE id=?"
    ).bind(versionId).first()

    if (!version) return c.json(failure("Version not found"), 404)

    return c.json(success({
      id:         version.id,
      created_at: version.created_at,
      created_by: version.created_by,
      config:     JSON.parse(version.config)
    }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.post("/system/config-versions/rollback", async (c) => {
  try {
    const body      = await c.req.json()
    const versionId = Number(body.versionId)
    if (!versionId) return c.json(failure("versionId required"), 400)

    const result = await rollbackConfig(c.env, versionId)
    await logAction(c.env.DB, "CONFIG_ROLLBACK", `Rolled back to version ${versionId}`)
    return c.json(success(result))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

app.get("/system/health", async (c) => {
  const db     = c.env.DB
  const result = {
    d1:        false,
    turso:     !!(c.env.TURSO_URL && c.env.TURSO_AUTH_TOKEN),
    supabase:  !!(c.env.SUPABASE_URL && c.env.SUPABASE_KEY),
    kv:        !!c.env.KV,
    imageKit:  !!c.env.IMAGEKIT_PRIVATE_KEY,
    timestamp: now()
  }
  try {
    await db.prepare("SELECT 1").first()
    result.d1 = true
  } catch {}
  return c.json(success(result))
})

app.get("/system/stats", async (c) => {
  const db   = c.env.DB
  const safe = async (sql, fallback = 0) => {
    try { const r = await db.prepare(sql).first(); return r?.c || fallback } catch { return fallback }
  }

  const [anime, episodes, categories, banners, servers, bannedIPs, logs] = await Promise.all([
    safe("SELECT COUNT(*) as c FROM anime"),
    safe("SELECT COUNT(*) as c FROM episodes"),
    safe("SELECT COUNT(*) as c FROM categories"),
    safe("SELECT COUNT(*) as c FROM banners"),
    safe("SELECT COUNT(*) as c FROM servers"),
    safe("SELECT COUNT(*) as c FROM banned_ips"),
    safe("SELECT COUNT(*) as c FROM system_logs")
  ])

  return c.json(success({ anime, episodes, categories, banners, servers, bannedIPs, logs }))
})

app.get("/system/logs", async (c) => {
  try {
    const db    = c.env.DB
    const limit = Math.min(Number(c.req.query("limit") || 30), 200)
    await ensureRow(db)
    const { results } = await db.prepare(
      "SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all()
    return c.json(success(results || []))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

// FIX: Batched like cache-clear
app.delete("/system/logs", async (c) => {
  try {
    const db         = c.env.DB
    const BATCH_SIZE = 500
    let total        = 0
    let deleted      = 0

    do {
      const result = await db.prepare(
        "DELETE FROM system_logs WHERE id IN (SELECT id FROM system_logs LIMIT ?)"
      ).bind(BATCH_SIZE).run()
      deleted = result.meta?.changes || 0
      total  += deleted
      if (deleted === BATCH_SIZE) await new Promise(r => setTimeout(r, 10))
    } while (deleted === BATCH_SIZE)

    return c.json(success({ cleared: true, rowsCleared: total }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
   
