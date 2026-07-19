/* ================================================
   player.js — Netflix-Style Player Settings
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v === true || v === 1 || v === "true") ? 1 : 0

/* ================================================
   ENSURE TABLE + DEFAULT ROW
================================================ */

async function ensureRow(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS player_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,

        -- Server
        default_server      TEXT    DEFAULT 'Server 1',
        server_priority     TEXT    DEFAULT '["Server 1","Server 2","Server 3"]',

        -- Playback
        autoplay            INTEGER DEFAULT 1,
        resume              INTEGER DEFAULT 1,
        autoswitch          INTEGER DEFAULT 1,
        auto_next           INTEGER DEFAULT 1,
        auto_next_delay     INTEGER DEFAULT 5,
        loop                INTEGER DEFAULT 0,
        mode                TEXT    DEFAULT 'responsive',

        -- Netflix Controls
        skip_intro          INTEGER DEFAULT 1,
        skip_intro_sec      INTEGER DEFAULT 85,
        skip_outro          INTEGER DEFAULT 1,
        seek_seconds        INTEGER DEFAULT 10,
        default_speed       TEXT    DEFAULT '1',
        remember_speed      INTEGER DEFAULT 1,
        remember_quality    INTEGER DEFAULT 1,

        -- Subtitle
        subtitle_enabled    INTEGER DEFAULT 1,
        subtitle_default    TEXT    DEFAULT 'Hindi',
        subtitle_size       TEXT    DEFAULT 'medium',
        subtitle_color      TEXT    DEFAULT '#ffffff',
        subtitle_bg         TEXT    DEFAULT 'rgba(0,0,0,0.7)',
        subtitle_position   TEXT    DEFAULT 'bottom',
        subtitle_langs      TEXT    DEFAULT '["Hindi","English","Japanese","Off"]',

        -- Audio
        audio_enabled       INTEGER DEFAULT 1,
        audio_default       TEXT    DEFAULT 'Hindi Dubbed',
        audio_tracks        TEXT    DEFAULT '["Hindi Dubbed","English Dubbed","Japanese Original"]',
        audio_normalize     INTEGER DEFAULT 1,

        -- UI Controls
        ui_servers          INTEGER DEFAULT 1,
        ui_download         INTEGER DEFAULT 1,
        ui_subscribe        INTEGER DEFAULT 1,
        ui_related          INTEGER DEFAULT 1,
        ui_episodes         INTEGER DEFAULT 1,
        ui_share            INTEGER DEFAULT 1,
        ui_fullscreen       INTEGER DEFAULT 1,
        ui_pip              INTEGER DEFAULT 1,
        ui_keyboard         INTEGER DEFAULT 1,
        ui_minibar          INTEGER DEFAULT 1,
        ui_progress_preview INTEGER DEFAULT 1,
        ui_volume_mem       INTEGER DEFAULT 1,

        -- Ads in player
        ads_enabled         INTEGER DEFAULT 0,
        ads_skip_sec        INTEGER DEFAULT 5,

        -- Security
        sec_embed_only      INTEGER DEFAULT 0,
        sec_cloudflare      INTEGER DEFAULT 1,
        sec_sandbox         INTEGER DEFAULT 1,
        sec_referrer        TEXT    DEFAULT 'strict-origin',
        sec_hotlink_block   INTEGER DEFAULT 1,
        sec_iframe_limit    INTEGER DEFAULT 0,

        updated_at          TEXT
      )
    `).run()

    const row = await db.prepare(
      "SELECT id FROM player_settings WHERE id=1"
    ).first()

    if (!row) {
      await db.prepare(`
        INSERT INTO player_settings (id, updated_at) VALUES (1, ?)
      `).bind(now()).run()
    }

  } catch (err) {
    console.error("player ensureRow:", err)
  }
}

/* ================================================
   FORMAT ROW
================================================ */

function safeJSON(val, fallback = []) {
  try { return JSON.parse(val || "[]") }
  catch { return fallback }
}

function formatRow(r) {
  return {
    server: {
      default:  r.default_server  || "Server 1",
      priority: safeJSON(r.server_priority, ["Server 1","Server 2","Server 3"])
    },
    playback: {
      autoplay:      !!r.autoplay,
      resume:        !!r.resume,
      autoswitch:    !!r.autoswitch,
      autoNext:      !!r.auto_next,
      autoNextDelay: r.auto_next_delay || 5,
      loop:          !!r.loop,
      mode:          r.mode || "responsive"
    },
    controls: {
      skipIntro:     !!r.skip_intro,
      skipIntroSec:  r.skip_intro_sec || 85,
      skipOutro:     !!r.skip_outro,
      seekSeconds:   r.seek_seconds   || 10,
      defaultSpeed:  r.default_speed  || "1",
      rememberSpeed: !!r.remember_speed,
      rememberQuality: !!r.remember_quality
    },
    subtitle: {
      enabled:  !!r.subtitle_enabled,
      default:  r.subtitle_default  || "Hindi",
      size:     r.subtitle_size     || "medium",
      color:    r.subtitle_color    || "#ffffff",
      bg:       r.subtitle_bg       || "rgba(0,0,0,0.7)",
      position: r.subtitle_position || "bottom",
      langs:    safeJSON(r.subtitle_langs, ["Hindi","English","Japanese","Off"])
    },
    audio: {
      enabled:   !!r.audio_enabled,
      default:   r.audio_default || "Hindi Dubbed",
      tracks:    safeJSON(r.audio_tracks, ["Hindi Dubbed","English Dubbed","Japanese Original"]),
      normalize: !!r.audio_normalize
    },
    ui: {
      servers:         !!r.ui_servers,
      download:        !!r.ui_download,
      subscribe:       !!r.ui_subscribe,
      related:         !!r.ui_related,
      episodes:        !!r.ui_episodes,
      share:           !!r.ui_share,
      fullscreen:      !!r.ui_fullscreen,
      pip:             !!r.ui_pip,
      keyboard:        !!r.ui_keyboard,
      minibar:         !!r.ui_minibar,
      progressPreview: !!r.ui_progress_preview,
      volumeMemory:    !!r.ui_volume_mem
    },
    ads: {
      enabled: !!r.ads_enabled,
      skipSec: r.ads_skip_sec || 5
    },
    security: {
      embedOnly:    !!r.sec_embed_only,
      cloudflare:   !!r.sec_cloudflare,
      sandbox:      !!r.sec_sandbox,
      referrer:     r.sec_referrer    || "strict-origin",
      hotlinkBlock: !!r.sec_hotlink_block,
      iframeLimit:  !!r.sec_iframe_limit
    },
    updated_at: r.updated_at
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, row) {
  const promises = []

  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    promises.push(fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO player_settings (
              id,default_server,server_priority,
              autoplay,resume,autoswitch,auto_next,auto_next_delay,loop,mode,
              skip_intro,skip_intro_sec,skip_outro,seek_seconds,
              default_speed,remember_speed,remember_quality,
              subtitle_enabled,subtitle_default,subtitle_size,
              subtitle_color,subtitle_bg,subtitle_position,subtitle_langs,
              audio_enabled,audio_default,audio_tracks,audio_normalize,
              ui_servers,ui_download,ui_subscribe,ui_related,
              ui_episodes,ui_share,ui_fullscreen,ui_pip,
              ui_keyboard,ui_minibar,ui_progress_preview,ui_volume_mem,
              ads_enabled,ads_skip_sec,
              sec_embed_only,sec_cloudflare,sec_sandbox,
              sec_referrer,sec_hotlink_block,sec_iframe_limit,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              row.default_server, row.server_priority,
              row.autoplay, row.resume, row.autoswitch, row.auto_next, row.auto_next_delay, row.loop, row.mode,
              row.skip_intro, row.skip_intro_sec, row.skip_outro, row.seek_seconds,
              row.default_speed, row.remember_speed, row.remember_quality,
              row.subtitle_enabled, row.subtitle_default, row.subtitle_size,
              row.subtitle_color, row.subtitle_bg, row.subtitle_position, row.subtitle_langs,
              row.audio_enabled, row.audio_default, row.audio_tracks, row.audio_normalize,
              row.ui_servers, row.ui_download, row.ui_subscribe, row.ui_related,
              row.ui_episodes, row.ui_share, row.ui_fullscreen, row.ui_pip,
              row.ui_keyboard, row.ui_minibar, row.ui_progress_preview, row.ui_volume_mem,
              row.ads_enabled, row.ads_skip_sec,
              row.sec_embed_only, row.sec_cloudflare, row.sec_sandbox,
              row.sec_referrer, row.sec_hotlink_block, row.sec_iframe_limit,
              row.updated_at
            ].map(v => ({
              type: typeof v === "number" ? "integer" : "text",
              value: String(v ?? "")
            }))
          }
        }]
      })
    }).catch(e => console.error("Turso player sync:", e)))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    promises.push(fetch(`${env.SUPABASE_URL}/rest/v1/player_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    }).catch(e => console.error("Supabase player sync:", e)))
  }

  return Promise.all(promises)
}

/* ================================================
   GET /player
================================================ */

app.get("/player", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare("SELECT * FROM player_settings WHERE id=1").first()
    return c.json(success(formatRow(row || {})))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /player — Save
================================================ */

app.post("/player", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    await ensureRow(db)

    const timestamp = now()

    const row = {
      default_server:      body.server?.default     || "Server 1",
      server_priority:     JSON.stringify(body.server?.priority || ["Server 1","Server 2","Server 3"]),

      autoplay:            bool(body.playback?.autoplay),
      resume:              bool(body.playback?.resume),
      autoswitch:          bool(body.playback?.autoswitch),
      auto_next:           bool(body.playback?.autoNext),
      auto_next_delay:     Number(body.playback?.autoNextDelay || 5),
      loop:                bool(body.playback?.loop),
      mode:                body.playback?.mode       || "responsive",

      skip_intro:          bool(body.controls?.skipIntro),
      skip_intro_sec:      Number(body.controls?.skipIntroSec   || 85),
      skip_outro:          bool(body.controls?.skipOutro),
      seek_seconds:        Number(body.controls?.seekSeconds    || 10),
      default_speed:       body.controls?.defaultSpeed          || "1",
      remember_speed:      bool(body.controls?.rememberSpeed),
      remember_quality:    bool(body.controls?.rememberQuality),

      subtitle_enabled:    bool(body.subtitle?.enabled),
      subtitle_default:    body.subtitle?.default    || "Hindi",
      subtitle_size:       body.subtitle?.size       || "medium",
      subtitle_color:      body.subtitle?.color      || "#ffffff",
      subtitle_bg:         body.subtitle?.bg         || "rgba(0,0,0,0.7)",
      subtitle_position:   body.subtitle?.position   || "bottom",
      subtitle_langs:      JSON.stringify(body.subtitle?.langs  || ["Hindi","English","Japanese","Off"]),

      audio_enabled:       bool(body.audio?.enabled),
      audio_default:       body.audio?.default       || "Hindi Dubbed",
      audio_tracks:        JSON.stringify(body.audio?.tracks    || ["Hindi Dubbed","English Dubbed","Japanese Original"]),
      audio_normalize:     bool(body.audio?.normalize),

      ui_servers:          bool(body.ui?.servers),
      ui_download:         bool(body.ui?.download),
      ui_subscribe:        bool(body.ui?.subscribe),
      ui_related:          bool(body.ui?.related),
      ui_episodes:         bool(body.ui?.episodes),
      ui_share:            bool(body.ui?.share),
      ui_fullscreen:       bool(body.ui?.fullscreen),
      ui_pip:              bool(body.ui?.pip),
      ui_keyboard:         bool(body.ui?.keyboard),
      ui_minibar:          bool(body.ui?.minibar),
      ui_progress_preview: bool(body.ui?.progressPreview),
      ui_volume_mem:       bool(body.ui?.volumeMemory),

      ads_enabled:         bool(body.ads?.enabled),
      ads_skip_sec:        Number(body.ads?.skipSec || 5),

      sec_embed_only:      bool(body.security?.embedOnly),
      sec_cloudflare:      bool(body.security?.cloudflare),
      sec_sandbox:         bool(body.security?.sandbox),
      sec_referrer:        body.security?.referrer   || "strict-origin",
      sec_hotlink_block:   bool(body.security?.hotlinkBlock),
      sec_iframe_limit:    bool(body.security?.iframeLimit),

      updated_at: timestamp
    }

    await db.prepare(`
      UPDATE player_settings SET
        default_server=?,server_priority=?,
        autoplay=?,resume=?,autoswitch=?,auto_next=?,auto_next_delay=?,loop=?,mode=?,
        skip_intro=?,skip_intro_sec=?,skip_outro=?,seek_seconds=?,
        default_speed=?,remember_speed=?,remember_quality=?,
        subtitle_enabled=?,subtitle_default=?,subtitle_size=?,
        subtitle_color=?,subtitle_bg=?,subtitle_position=?,subtitle_langs=?,
        audio_enabled=?,audio_default=?,audio_tracks=?,audio_normalize=?,
        ui_servers=?,ui_download=?,ui_subscribe=?,ui_related=?,
        ui_episodes=?,ui_share=?,ui_fullscreen=?,ui_pip=?,
        ui_keyboard=?,ui_minibar=?,ui_progress_preview=?,ui_volume_mem=?,
        ads_enabled=?,ads_skip_sec=?,
        sec_embed_only=?,sec_cloudflare=?,sec_sandbox=?,
        sec_referrer=?,sec_hotlink_block=?,sec_iframe_limit=?,
        updated_at=?
      WHERE id=1
    `).bind(
      row.default_server, row.server_priority,
      row.autoplay, row.resume, row.autoswitch, row.auto_next, row.auto_next_delay, row.loop, row.mode,
      row.skip_intro, row.skip_intro_sec, row.skip_outro, row.seek_seconds,
      row.default_speed, row.remember_speed, row.remember_quality,
      row.subtitle_enabled, row.subtitle_default, row.subtitle_size,
      row.subtitle_color, row.subtitle_bg, row.subtitle_position, row.subtitle_langs,
      row.audio_enabled, row.audio_default, row.audio_tracks, row.audio_normalize,
      row.ui_servers, row.ui_download, row.ui_subscribe, row.ui_related,
      row.ui_episodes, row.ui_share, row.ui_fullscreen, row.ui_pip,
      row.ui_keyboard, row.ui_minibar, row.ui_progress_preview, row.ui_volume_mem,
      row.ads_enabled, row.ads_skip_sec,
      row.sec_embed_only, row.sec_cloudflare, row.sec_sandbox,
      row.sec_referrer, row.sec_hotlink_block, row.sec_iframe_limit,
      row.updated_at
    ).run()

    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(syncToReplicas(c.env, row))
    } else {
      syncToReplicas(c.env, row)
    }

    return c.json(success({ saved: true, updated_at: timestamp }))

  } catch (err) {
    console.error("player POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /player/reset
================================================ */

app.post("/player/reset", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)

    await db.prepare(`
      UPDATE player_settings SET
        default_server='Server 1',
        server_priority='["Server 1","Server 2","Server 3"]',
        autoplay=1,resume=1,autoswitch=1,auto_next=1,auto_next_delay=5,loop=0,
        mode='responsive',
        skip_intro=1,skip_intro_sec=85,skip_outro=1,seek_seconds=10,
        default_speed='1',remember_speed=1,remember_quality=1,
        subtitle_enabled=1,subtitle_default='Hindi',subtitle_size='medium',
        subtitle_color='#ffffff',subtitle_bg='rgba(0,0,0,0.7)',
        subtitle_position='bottom',
        subtitle_langs='["Hindi","English","Japanese","Off"]',
        audio_enabled=1,audio_default='Hindi Dubbed',
        audio_tracks='["Hindi Dubbed","English Dubbed","Japanese Original"]',
        audio_normalize=1,
        ui_servers=1,ui_download=1,ui_subscribe=1,ui_related=1,
        ui_episodes=1,ui_share=1,ui_fullscreen=1,ui_pip=1,
        ui_keyboard=1,ui_minibar=1,ui_progress_preview=1,ui_volume_mem=1,
        ads_enabled=0,ads_skip_sec=5,
        sec_embed_only=0,sec_cloudflare=1,sec_sandbox=1,
        sec_referrer='strict-origin',sec_hotlink_block=1,sec_iframe_limit=0,
        updated_at=?
      WHERE id=1
    `).bind(ts).run()

    return c.json(success({ reset: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /player/public — for frontend watch page
================================================ */

app.get("/player/public", async (c) => {
  try {
    const db  = c.env.DB
    const row = await db.prepare(
      "SELECT * FROM player_settings WHERE id=1"
    ).first()
    if (!row) return c.json(success(formatRow({})))
    return c.json(success(formatRow(row)))
  } catch (err) {
    return c.json(success(formatRow({})))
  }
})

export default app

