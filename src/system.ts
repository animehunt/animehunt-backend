import { Hono } from "hono"

type Bindings = {
  DB: D1Database
}

const system = new Hono<{ Bindings: Bindings }>()

const DEFAULT_CONFIG = {
  systemOn: true,
  maintenanceSoft: false,
  maintenanceHard: false,
  lockCMS: false,
  readOnly: false,
  env: "Production",

  theme: "Dark",
  animation: "Premium",
  skeleton: true,
  imgBlur: true,
  mobileUI: false,

  autoHome: true,
  aiHome: false,
  trendBoost: true,
  manualPin: false,
  homeMode: "Dynamic",

  geoBlock: false,
  ageLock: false,
  schedule: false,
  shadow: false,

  autoPlay: true,
  resume: true,
  autoNext: true,
  skipIntro: false,
  serverSwitch: true,

  downloads: true,
  zip: false,
  scan: true,
  limit: false,

  liveSearch: true,
  highlight: true,
  fuzzy: true,
  adult: false,
  maxResult: 8,

  antiInspect: false,
  iframe: true,
  rateLimit: true,
  rightClick: false
}

/* ===============================
   SAFE PARSE
=============================== */
function safeParse(json: any) {
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

/* ===============================
   LOAD CONFIG
=============================== */
system.get("/", async (c) => {

  try {

    const row: any = await c.env.DB
      .prepare("SELECT config FROM system_config WHERE id = 'master'")
      .first()

    if (!row) {

      await c.env.DB.prepare(`
        INSERT INTO system_config (id, config)
        VALUES ('master', ?)
      `)
      .bind(JSON.stringify(DEFAULT_CONFIG))
      .run()

      return c.json(DEFAULT_CONFIG)

    }

    const parsed = safeParse(row.config)

    return c.json({
      ...DEFAULT_CONFIG,
      ...parsed
    })

  } catch (err) {

    console.error("System GET error:", err)
    return c.json(DEFAULT_CONFIG)

  }

})

/* ===============================
   SAVE CONFIG
=============================== */
system.post("/", async (c) => {

  try {

    const body = await c.req.json()

    const row: any = await c.env.DB
      .prepare("SELECT config FROM system_config WHERE id = 'master'")
      .first()

    const existing = row ? safeParse(row.config) : {}

    const merged = {
      ...DEFAULT_CONFIG,
      ...existing,
      ...body
    }

    await c.env.DB.prepare(`
      INSERT INTO system_config (id, config)
      VALUES ('master', ?)
      ON CONFLICT(id) DO UPDATE SET
        config = excluded.config,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(JSON.stringify(merged))
    .run()

    return c.json({ success: true })

  } catch (err) {

    console.error("System SAVE error:", err)
    return c.json({ error: "Save failed" }, 500)

  }

})

/* ===============================
   KILL SWITCH
=============================== */
system.post("/kill", async (c) => {

  try {

    const row: any = await c.env.DB
      .prepare("SELECT config FROM system_config WHERE id = 'master'")
      .first()

    const config = row
      ? safeParse(row.config)
      : { ...DEFAULT_CONFIG }

    config.systemOn = false
    config.maintenanceHard = true

    await c.env.DB.prepare(`
      UPDATE system_config
      SET config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 'master'
    `)
    .bind(JSON.stringify(config))
    .run()

    return c.json({ halted: true })

  } catch (err) {

    console.error("Kill switch error:", err)
    return c.json({ error: "Kill failed" }, 500)

  }

})

export default system
