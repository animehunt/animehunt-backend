/* ================================================
   performance.js — Performance Settings + Metrics
   Auth handled by adminAuth middleware in index.js
================================================ */

import { Hono } from "hono"

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

/* ================================================
   DEFAULT SETTINGS
================================================ */

const DEFAULTS = {
  /* Loading */
  lazyLoad:        1,
  smartPreload:    1,
  adaptiveLoad:    1,
  mobilePriority:  1,

  /* Assets */
  assetMinify:     1,
  imgOptimize:     1,
  jsOptimize:      1,
  cssOptimize:     1,

  /* Network */
  smartCache:      1,
  cdnMode:         0,
  preconnect:      1,
  bandwidth:       0,
  http2Push:       1,
  compression:     1,

  /* Cache */
  cacheTTL:        3600,
  staticTTL:       86400,
  apiCacheTTL:     300,

  /* Image */
  imgQuality:      80,
  imgWebP:         1,
  imgResponsive:   1,
  thumbWidth:      400,

  /* CDN */
  cdnUrl:          "",

  updated_at: ""
}

/* ================================================
   ENSURE TABLE + ROW
================================================ */

async function ensureRow(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS performance_settings (
        id             INTEGER PRIMARY KEY DEFAULT 1,

        lazyLoad       INTEGER DEFAULT 1,
        smartPreload   INTEGER DEFAULT 1,
        adaptiveLoad   INTEGER DEFAULT 1,
        mobilePriority INTEGER DEFAULT 1,

        assetMinify    INTEGER DEFAULT 1,
        imgOptimize    INTEGER DEFAULT 1,
        jsOptimize     INTEGER DEFAULT 1,
        cssOptimize    INTEGER DEFAULT 1,

        smartCache     INTEGER DEFAULT 1,
        cdnMode        INTEGER DEFAULT 0,
        preconnect     INTEGER DEFAULT 1,
        bandwidth      INTEGER DEFAULT 0,
        http2Push      INTEGER DEFAULT 1,
        compression    INTEGER DEFAULT 1,

        cacheTTL       INTEGER DEFAULT 3600,
        staticTTL      INTEGER DEFAULT 86400,
        apiCacheTTL    INTEGER DEFAULT 300,

        imgQuality     INTEGER DEFAULT 80,
        imgWebP        INTEGER DEFAULT 1,
        imgResponsive  INTEGER DEFAULT 1,
        thumbWidth     INTEGER DEFAULT 400,

        cdnUrl         TEXT    DEFAULT '',
        updated_at     TEXT
      )
    `).run()

    const row = await db.prepare(
      "SELECT id FROM performance_settings WHERE id=1"
    ).first()

    if (!row) {
      await db.prepare(`
        INSERT INTO performance_settings (
          id,lazyLoad,smartPreload,adaptiveLoad,mobilePriority,
          assetMinify,imgOptimize,jsOptimize,cssOptimize,
          smartCache,cdnMode,preconnect,bandwidth,http2Push,compression,
          cacheTTL,staticTTL,apiCacheTTL,
          imgQuality,imgWebP,imgResponsive,thumbWidth,
          cdnUrl,updated_at
        ) VALUES (1,1,1,1,1,1,1,1,1,1,0,1,0,1,1,3600,86400,300,80,1,1,400,'',?)
      `).bind(now()).run()
    }
  } catch (err) {
    console.error("performance ensureRow:", err)
  }
}

/* ================================================
   FORMAT ROW
================================================ */

function formatRow(r) {
  return {
    loading: {
      lazyLoad:       !!r.lazyLoad,
      smartPreload:   !!r.smartPreload,
      adaptiveLoad:   !!r.adaptiveLoad,
      mobilePriority: !!r.mobilePriority
    },
    assets: {
      assetMinify: !!r.assetMinify,
      imgOptimize: !!r.imgOptimize,
      jsOptimize:  !!r.jsOptimize,
      cssOptimize: !!r.cssOptimize
    },
    network: {
      smartCache:  !!r.smartCache,
      cdnMode:     !!r.cdnMode,
      preconnect:  !!r.preconnect,
      bandwidth:   !!r.bandwidth,
      http2Push:   !!r.http2Push,
      compression: !!r.compression
    },
    cache: {
      cacheTTL:    r.cacheTTL    || 3600,
      staticTTL:   r.staticTTL  || 86400,
      apiCacheTTL: r.apiCacheTTL || 300
    },
    image: {
      imgQuality:    r.imgQuality    || 80,
      imgWebP:       !!r.imgWebP,
      imgResponsive: !!r.imgResponsive,
      thumbWidth:    r.thumbWidth    || 400
    },
    cdn: {
      cdnUrl: r.cdnUrl || ""
    },
    updated_at: r.updated_at
  }
}

/* ================================================
   SYNC TO REPLICAS
================================================ */

async function syncToReplicas(env, row) {
  if (env.TURSO_REPLICA_URL && env.TURSO_REPLICA_AUTH_TOKEN) {
    fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_REPLICA_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO performance_settings (
              id,lazyLoad,smartPreload,adaptiveLoad,mobilePriority,
              assetMinify,imgOptimize,jsOptimize,cssOptimize,
              smartCache,cdnMode,preconnect,bandwidth,http2Push,compression,
              cacheTTL,staticTTL,apiCacheTTL,
              imgQuality,imgWebP,imgResponsive,thumbWidth,
              cdnUrl,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              row.lazyLoad, row.smartPreload, row.adaptiveLoad, row.mobilePriority,
              row.assetMinify, row.imgOptimize, row.jsOptimize, row.cssOptimize,
              row.smartCache, row.cdnMode, row.preconnect, row.bandwidth,
              row.http2Push, row.compression,
              row.cacheTTL, row.staticTTL, row.apiCacheTTL,
              row.imgQuality, row.imgWebP, row.imgResponsive, row.thumbWidth,
              row.cdnUrl, row.updated_at
            ].map(v => ({
              type: typeof v === "number" ? "integer" : "text",
              value: String(v ?? "")
            }))
          }
        }]
      })
    }).catch(e => console.error("Turso perf sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/performance_settings?id=eq.1`, {
      method: "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    }).catch(e => console.error("Supabase perf sync:", e))
  }
}

/* ================================================
   GET /performance
================================================ */

app.get("/performance", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare(
      "SELECT * FROM performance_settings WHERE id=1"
    ).first()
    return c.json(success(formatRow(row || DEFAULTS)))
  } catch (err) {
    console.error("performance GET:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /performance — Save
================================================ */

app.post("/performance", async (c) => {
  try {
    const db   = c.env.DB
    const body = await c.req.json()
    await ensureRow(db)

    const timestamp = now()

    const row = {
      lazyLoad:       bool(body.loading?.lazyLoad),
      smartPreload:   bool(body.loading?.smartPreload),
      adaptiveLoad:   bool(body.loading?.adaptiveLoad),
      mobilePriority: bool(body.loading?.mobilePriority),

      assetMinify:    bool(body.assets?.assetMinify),
      imgOptimize:    bool(body.assets?.imgOptimize),
      jsOptimize:     bool(body.assets?.jsOptimize),
      cssOptimize:    bool(body.assets?.cssOptimize),

      smartCache:     bool(body.network?.smartCache),
      cdnMode:        bool(body.network?.cdnMode),
      preconnect:     bool(body.network?.preconnect),
      bandwidth:      bool(body.network?.bandwidth),
      http2Push:      bool(body.network?.http2Push),
      compression:    bool(body.network?.compression),

      cacheTTL:       Number(body.cache?.cacheTTL    || 3600),
      staticTTL:      Number(body.cache?.staticTTL   || 86400),
      apiCacheTTL:    Number(body.cache?.apiCacheTTL || 300),

      imgQuality:     Number(body.image?.imgQuality  || 80),
      imgWebP:        bool(body.image?.imgWebP),
      imgResponsive:  bool(body.image?.imgResponsive),
      thumbWidth:     Number(body.image?.thumbWidth  || 400),

      cdnUrl:         body.cdn?.cdnUrl?.trim() || "",
      updated_at:     timestamp
    }

    await db.prepare(`
      UPDATE performance_settings SET
        lazyLoad=?,smartPreload=?,adaptiveLoad=?,mobilePriority=?,
        assetMinify=?,imgOptimize=?,jsOptimize=?,cssOptimize=?,
        smartCache=?,cdnMode=?,preconnect=?,bandwidth=?,http2Push=?,compression=?,
        cacheTTL=?,staticTTL=?,apiCacheTTL=?,
        imgQuality=?,imgWebP=?,imgResponsive=?,thumbWidth=?,
        cdnUrl=?,updated_at=?
      WHERE id=1
    `).bind(
      row.lazyLoad, row.smartPreload, row.adaptiveLoad, row.mobilePriority,
      row.assetMinify, row.imgOptimize, row.jsOptimize, row.cssOptimize,
      row.smartCache, row.cdnMode, row.preconnect, row.bandwidth,
      row.http2Push, row.compression,
      row.cacheTTL, row.staticTTL, row.apiCacheTTL,
      row.imgQuality, row.imgWebP, row.imgResponsive, row.thumbWidth,
      row.cdnUrl, row.updated_at
    ).run()

    syncToReplicas(c.env, row)

    return c.json(success({ saved: true, updated_at: timestamp }))

  } catch (err) {
    console.error("performance POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /performance/reset
================================================ */

app.post("/performance/reset", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()
    await ensureRow(db)

    await db.prepare(`
      UPDATE performance_settings SET
        lazyLoad=1,smartPreload=1,adaptiveLoad=1,mobilePriority=1,
        assetMinify=1,imgOptimize=1,jsOptimize=1,cssOptimize=1,
        smartCache=1,cdnMode=0,preconnect=1,bandwidth=0,http2Push=1,compression=1,
        cacheTTL=3600,staticTTL=86400,apiCacheTTL=300,
        imgQuality=80,imgWebP=1,imgResponsive=1,thumbWidth=400,
        cdnUrl='',updated_at=?
      WHERE id=1
    `).bind(timestamp).run()

    return c.json(success({ reset: true, updated_at: timestamp }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /performance/enable-all
================================================ */

app.post("/performance/enable-all", async (c) => {
  try {
    const db        = c.env.DB
    const timestamp = now()
    await ensureRow(db)

    await db.prepare(`
      UPDATE performance_settings SET
        lazyLoad=1,smartPreload=1,adaptiveLoad=1,mobilePriority=1,
        assetMinify=1,imgOptimize=1,jsOptimize=1,cssOptimize=1,
        smartCache=1,cdnMode=1,preconnect=1,bandwidth=1,http2Push=1,compression=1,
        imgWebP=1,imgResponsive=1,updated_at=?
      WHERE id=1
    `).bind(timestamp).run()

    return c.json(success({ enabled: true, updated_at: timestamp }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /performance/score — Calculate perf score
================================================ */

app.get("/performance/score", async (c) => {
  try {
    const db  = c.env.DB
    await ensureRow(db)
    const row = await db.prepare(
      "SELECT * FROM performance_settings WHERE id=1"
    ).first()

    if (!row) return c.json(success({ score: 0, grade: "F", tips: [] }))

    /* Score calculation — each feature adds points */
    const checks = [
      { key: "lazyLoad",       pts: 10, tip: "Enable Lazy Load for faster page load" },
      { key: "smartPreload",   pts: 8,  tip: "Enable Smart Preload to preload critical assets" },
      { key: "assetMinify",    pts: 10, tip: "Enable Asset Minify to reduce file sizes" },
      { key: "imgOptimize",    pts: 10, tip: "Enable Image Optimizer for faster images" },
      { key: "jsOptimize",     pts: 8,  tip: "Enable JS Optimizer to reduce script load" },
      { key: "cssOptimize",    pts: 8,  tip: "Enable CSS Optimizer" },
      { key: "smartCache",     pts: 12, tip: "Enable Smart Cache — biggest speed boost" },
      { key: "mobilePriority", pts: 8,  tip: "Enable Mobile Priority for mobile users" },
      { key: "preconnect",     pts: 8,  tip: "Enable Preconnect to reduce DNS time" },
      { key: "http2Push",      pts: 6,  tip: "Enable HTTP/2 Push" },
      { key: "compression",    pts: 8,  tip: "Enable Compression (gzip/brotli)" },
      { key: "adaptiveLoad",   pts: 4,  tip: "Enable Adaptive Loading" }
    ]

    let score = 0
    const tips = []

    // FIX: forEach param renamed (was `c`) — shadowed the outer
    // Hono context variable `c` used elsewhere in this handler.
    checks.forEach(check => {
      if (row[check.key]) {
        score += check.pts
      } else {
        tips.push(check.tip)
      }
    })

    const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B"
                : score >= 60 ? "C"  : score >= 50 ? "D" : "F"

    return c.json(success({ score, grade, tips, maxScore: 100 }))

  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ✅ FIX (audit ISSUE-026, performance.js instance): removed dead
   duplicate route GET /performance/public. This file is only mounted
   under adminRoutes (see index.js), so it was only ever reachable at
   /api/admin/performance/public — behind admin auth, never actually
   serving the public site. public.js already correctly and independently
   serves the real public version at /api/performance/public. */

export default app
