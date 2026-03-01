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
   LOAD CONFIG
=============================== */
system.get("/", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT config FROM system_config WHERE id = 'master'")
    .first()

  if (!row) {
    await c.env.DB.prepare(`
      INSERT INTO system_config (id, config)
      VALUES ('master', ?)
    `).bind(JSON.stringify(DEFAULT_CONFIG)).run()

    return c.json(DEFAULT_CONFIG)
  }

  return c.json(JSON.parse(row.config))
})

/* ===============================
   SAVE CONFIG
=============================== */
system.post("/", async (c) => {

  const body = await c.req.json()

  const existing = await c.env.DB
    .prepare("SELECT config FROM system_config WHERE id = 'master'")
    .first()

  const merged = {
    ...DEFAULT_CONFIG,
    ...(existing ? JSON.parse(existing.config) : {}),
    ...body
  }

  await c.env.DB.prepare(`
    INSERT INTO system_config (id, config)
    VALUES ('master', ?)
    ON CONFLICT(id) DO UPDATE SET
      config = excluded.config,
      updated_at = CURRENT_TIMESTAMP
  `).bind(JSON.stringify(merged)).run()

  return c.json({ success: true })
})

/* ===============================
   KILL SWITCH
=============================== */
system.post("/kill", async (c) => {

  const row = await c.env.DB
    .prepare("SELECT config FROM system_config WHERE id = 'master'")
    .first()

  const config = row
    ? JSON.parse(row.config)
    : DEFAULT_CONFIG

  config.systemOn = false
  config.maintenanceHard = true

  await c.env.DB.prepare(`
    UPDATE system_config
    SET config = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 'master'
  `).bind(JSON.stringify(config)).run()

  return c.json({ halted: true })
})

export default system
