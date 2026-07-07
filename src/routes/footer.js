/* ================================================
   ANIMEHUNT — FOOTER ADMIN (VERIFIED + FIXED)
   File: src/routes/footer.js
   Auth handled by adminAuth middleware in index.js

   ✅ VERIFIED: No AuthService import (was using wrong auth)
   ✅ Auth is handled by middleware — no requireAuth() needed inside
   ✅ D1 native .prepare().bind() — no convertToPostgres()
   ✅ No await-in-loop — single UPDATE for all fields
   ✅ KV cache invalidated on every write
   ✅ All existing routes preserved

   ROUTES:
   GET  /footer         — Admin get config
   GET  /footer/public  — Frontend get (KV cached)
   POST /footer         — Save config (single UPDATE)
   POST /footer/reset   — Reset to defaults
   POST /footer/kill    — Disable footer
================================================ */

import { Hono } from "hono"

// ✅ CORRECT: Auth.protect() is handled by adminAuth middleware in index.js
// ❌ WRONG (deleted): import AuthService from './authService.js'
// ❌ WRONG (deleted): import { requireAuth } from './adminAuth.js' — not needed, middleware handles it

const app = new Hono()

const success = (data) => ({ success: true,  data })
const failure = (msg)  => ({ success: false, message: msg })
const now     = ()     => new Date().toISOString()
const bool    = (v)    => (v ? 1 : 0)

const KV_FOOTER_KEY = "public:footer"
const KV_TTL        = 600 // 10 minutes

/* ================================================
   ENSURE TABLE + ROW
================================================ */

async function ensureRow(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS footer_config (
        id              INTEGER PRIMARY KEY DEFAULT 1,

        /* Footer Global */
        footerOn        INTEGER DEFAULT 1,
        footerLazy      INTEGER DEFAULT 0,
        footerBlur      INTEGER DEFAULT 0,
        footerLock      INTEGER DEFAULT 0,
        footerTheme     TEXT    DEFAULT 'Dark',
        footerText      TEXT    DEFAULT '© 2026 AnimeHunt. All Rights Reserved.',

        /* Footer Links */
        about           INTEGER DEFAULT 1,
        privacy         INTEGER DEFAULT 1,
        disclaimer      INTEGER DEFAULT 1,
        dmca            INTEGER DEFAULT 1,
        telegram        INTEGER DEFAULT 1,
        linkBadges      INTEGER DEFAULT 0,

        /* Custom Links (JSON) */
        customLinks     TEXT    DEFAULT '[]',

        /* Social */
        socialTelegram  TEXT    DEFAULT 'https://t.me/toons15',
        socialTwitter   TEXT    DEFAULT '',
        socialYoutube   TEXT    DEFAULT '',
        socialInstagram TEXT    DEFAULT '',

        /* A-Z Navigation */
        azOn            INTEGER DEFAULT 1,
        azAuto          INTEGER DEFAULT 1,
        azSticky        INTEGER DEFAULT 0,
        azCompact       INTEGER DEFAULT 0,
        azMode          TEXT    DEFAULT 'Scroll',

        /* Mobile Bottom Nav */
        mobileNav        INTEGER DEFAULT 1,
        mobileFloat      INTEGER DEFAULT 0,
        mobileBlur       INTEGER DEFAULT 0,
        mobileHideScroll INTEGER DEFAULT 1,

        /* Promo Bar */
        promoOn         INTEGER DEFAULT 0,
        promoText       TEXT    DEFAULT '',
        promoLink       TEXT    DEFAULT '',
        promoAutoHide   INTEGER DEFAULT 0,
        promoBg         TEXT    DEFAULT '#ffcc00',
        promoColor      TEXT    DEFAULT '#000000',

        updated_at      TEXT
      )
    `).run()

    const row = await db.prepare("SELECT id FROM footer_config WHERE id=1").first()
    if (!row) {
      await db.prepare(`
        INSERT INTO footer_config (id, footerOn, updated_at)
        VALUES (1, 1, ?)
      `).bind(now()).run()
    }
  } catch (err) {
    console.error("footer ensureRow:", err)
  }
}

/* ================================================
   FORMAT ROW → API shape
================================================ */

function format(r) {
  let customLinks = []
  try { customLinks = JSON.parse(r.customLinks || "[]") } catch {}

  return {
    footer: {
      on:    !!r.footerOn,
      lazy:  !!r.footerLazy,
      blur:  !!r.footerBlur,
      lock:  !!r.footerLock,
      theme: r.footerTheme || "Dark",
      text:  r.footerText  || "© 2026 AnimeHunt. All Rights Reserved."
    },
    links: {
      about:      !!r.about,
      privacy:    !!r.privacy,
      disclaimer: !!r.disclaimer,
      dmca:       !!r.dmca,
      telegram:   !!r.telegram,
      badges:     !!r.linkBadges,
      custom:     customLinks
    },
    social: {
      telegram:  r.socialTelegram  || "",
      twitter:   r.socialTwitter   || "",
      youtube:   r.socialYoutube   || "",
      instagram: r.socialInstagram || ""
    },
    az: {
      on:      !!r.azOn,
      auto:    !!r.azAuto,
      sticky:  !!r.azSticky,
      compact: !!r.azCompact,
      mode:    r.azMode || "Scroll"
    },
    mobile: {
      nav:        !!r.mobileNav,
      float:      !!r.mobileFloat,
      blur:       !!r.mobileBlur,
      hideScroll: !!r.mobileHideScroll
    },
    promo: {
      on:       !!r.promoOn,
      text:     r.promoText     || "",
      link:     r.promoLink     || "",
      autoHide: !!r.promoAutoHide,
      bg:       r.promoBg       || "#ffcc00",
      color:    r.promoColor    || "#000000"
    },
    updated_at: r.updated_at
  }
}

/* ================================================
   SYNC TO REPLICAS (non-blocking)
================================================ */

function syncToReplicas(env, row) {
  if (env.TURSO_URL && env.TURSO_AUTH_TOKEN) {
    fetch(`${env.TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN}`,
        "Content-Type":  "application/json"
      },
      body: JSON.stringify({
        requests: [{
          type: "execute",
          stmt: {
            sql: `INSERT OR REPLACE INTO footer_config (
              id,footerOn,footerLazy,footerBlur,footerLock,footerTheme,footerText,
              about,privacy,disclaimer,dmca,telegram,linkBadges,customLinks,
              socialTelegram,socialTwitter,socialYoutube,socialInstagram,
              azOn,azAuto,azSticky,azCompact,azMode,
              mobileNav,mobileFloat,mobileBlur,mobileHideScroll,
              promoOn,promoText,promoLink,promoAutoHide,promoBg,promoColor,updated_at
            ) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args: [
              row.footerOn, row.footerLazy, row.footerBlur, row.footerLock,
              row.footerTheme, row.footerText,
              row.about, row.privacy, row.disclaimer, row.dmca, row.telegram, row.linkBadges,
              row.customLinks,
              row.socialTelegram, row.socialTwitter, row.socialYoutube, row.socialInstagram,
              row.azOn, row.azAuto, row.azSticky, row.azCompact, row.azMode,
              row.mobileNav, row.mobileFloat, row.mobileBlur, row.mobileHideScroll,
              row.promoOn, row.promoText, row.promoLink, row.promoAutoHide,
              row.promoBg, row.promoColor, row.updated_at
            ].map(v => ({
              type:  typeof v === "number" ? "integer" : "text",
              value: String(v ?? "")
            }))
          }
        }]
      })
    }).catch(e => console.error("Turso footer sync:", e))
  }

  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    fetch(`${env.SUPABASE_URL}/rest/v1/footer_config?id=eq.1`, {
      method: "PATCH",
      headers: {
        "apikey":        env.SUPABASE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    }).catch(e => console.error("Supabase footer sync:", e))
  }
}

/* ================================================
   GET /footer — Admin
================================================ */

app.get("/footer", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)
    const row = await db.prepare("SELECT * FROM footer_config WHERE id=1").first()
    return c.json(success(format(row || {})))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   GET /footer/public — Frontend (KV cached)
================================================ */

app.get("/footer/public", async (c) => {
  try {
    // KV cache check
    if (c.env.KV) {
      const cached = await c.env.KV.get(KV_FOOTER_KEY, "json").catch(() => null)
      if (cached) return c.json(success(cached), 200, { "X-Cache": "HIT" })
    }

    const db  = c.env.DB
    const row = await db.prepare("SELECT * FROM footer_config WHERE id=1").first()
    const data = format(row || {})

    if (c.env.KV) {
      await c.env.KV.put(KV_FOOTER_KEY, JSON.stringify(data), {
        expirationTtl: KV_TTL
      }).catch(() => {})
    }

    return c.json(success(data), 200, { "X-Cache": "MISS" })
  } catch (err) {
    return c.json(success(format({})))
  }
})

/* ================================================
   POST /footer — Save (single UPDATE — not 20 separate queries)
================================================ */

app.post("/footer", async (c) => {
  try {
    const db = c.env.DB

    let body
    try { body = await c.req.json() }
    catch { return c.json(failure("Invalid JSON body"), 400) }

    await ensureRow(db)

    const timestamp = now()

    const row = {
      footerOn:        bool(body.footer?.on),
      footerLazy:      bool(body.footer?.lazy),
      footerBlur:      bool(body.footer?.blur),
      footerLock:      bool(body.footer?.lock),
      footerTheme:     body.footer?.theme || "Dark",
      footerText:      body.footer?.text  || "© 2026 AnimeHunt. All Rights Reserved.",

      about:           bool(body.links?.about),
      privacy:         bool(body.links?.privacy),
      disclaimer:      bool(body.links?.disclaimer),
      dmca:            bool(body.links?.dmca),
      telegram:        bool(body.links?.telegram),
      linkBadges:      bool(body.links?.badges),
      customLinks:     JSON.stringify(Array.isArray(body.links?.custom) ? body.links.custom : []),

      socialTelegram:  body.social?.telegram  || "",
      socialTwitter:   body.social?.twitter   || "",
      socialYoutube:   body.social?.youtube   || "",
      socialInstagram: body.social?.instagram || "",

      azOn:            bool(body.az?.on),
      azAuto:          bool(body.az?.auto),
      azSticky:        bool(body.az?.sticky),
      azCompact:       bool(body.az?.compact),
      azMode:          body.az?.mode || "Scroll",

      mobileNav:        bool(body.mobile?.nav),
      mobileFloat:      bool(body.mobile?.float),
      mobileBlur:       bool(body.mobile?.blur),
      mobileHideScroll: bool(body.mobile?.hideScroll),

      promoOn:        bool(body.promo?.on),
      promoText:      body.promo?.text     || "",
      promoLink:      body.promo?.link     || "",
      promoAutoHide:  bool(body.promo?.autoHide),
      promoBg:        body.promo?.bg       || "#ffcc00",
      promoColor:     body.promo?.color    || "#000000",

      updated_at: timestamp
    }

    // Single UPDATE — not 20 separate queries
    await db.prepare(`
      UPDATE footer_config SET
        footerOn=?,footerLazy=?,footerBlur=?,footerLock=?,footerTheme=?,footerText=?,
        about=?,privacy=?,disclaimer=?,dmca=?,telegram=?,linkBadges=?,customLinks=?,
        socialTelegram=?,socialTwitter=?,socialYoutube=?,socialInstagram=?,
        azOn=?,azAuto=?,azSticky=?,azCompact=?,azMode=?,
        mobileNav=?,mobileFloat=?,mobileBlur=?,mobileHideScroll=?,
        promoOn=?,promoText=?,promoLink=?,promoAutoHide=?,promoBg=?,promoColor=?,
        updated_at=?
      WHERE id=1
    `).bind(
      row.footerOn, row.footerLazy, row.footerBlur, row.footerLock,
      row.footerTheme, row.footerText,
      row.about, row.privacy, row.disclaimer, row.dmca, row.telegram,
      row.linkBadges, row.customLinks,
      row.socialTelegram, row.socialTwitter, row.socialYoutube, row.socialInstagram,
      row.azOn, row.azAuto, row.azSticky, row.azCompact, row.azMode,
      row.mobileNav, row.mobileFloat, row.mobileBlur, row.mobileHideScroll,
      row.promoOn, row.promoText, row.promoLink, row.promoAutoHide,
      row.promoBg, row.promoColor,
      row.updated_at
    ).run()

    // Invalidate KV public cache
    if (c.env.KV) {
      await c.env.KV.delete(KV_FOOTER_KEY).catch(() => {})
    }

    syncToReplicas(c.env, row)

    return c.json(success({ saved: true, updated_at: timestamp }))
  } catch (err) {
    console.error("footer POST:", err)
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /footer/reset
================================================ */

app.post("/footer/reset", async (c) => {
  try {
    const db = c.env.DB
    const ts = now()
    await ensureRow(db)

    await db.prepare(`
      UPDATE footer_config SET
        footerOn=1,footerLazy=0,footerBlur=0,footerLock=0,
        footerTheme='Dark',footerText='© 2026 AnimeHunt. All Rights Reserved.',
        about=1,privacy=1,disclaimer=1,dmca=1,telegram=1,linkBadges=0,
        customLinks='[]',
        socialTelegram='https://t.me/toons15',socialTwitter='',
        socialYoutube='',socialInstagram='',
        azOn=1,azAuto=1,azSticky=0,azCompact=0,azMode='Scroll',
        mobileNav=1,mobileFloat=0,mobileBlur=0,mobileHideScroll=1,
        promoOn=0,promoText='',promoLink='',promoAutoHide=0,
        promoBg='#ffcc00',promoColor='#000000',
        updated_at=?
      WHERE id=1
    `).bind(ts).run()

    if (c.env.KV) {
      await c.env.KV.delete(KV_FOOTER_KEY).catch(() => {})
    }

    return c.json(success({ reset: true, updated_at: ts }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

/* ================================================
   POST /footer/kill — Disable footer
================================================ */

app.post("/footer/kill", async (c) => {
  try {
    const db = c.env.DB
    await ensureRow(db)

    await db.prepare("UPDATE footer_config SET footerOn=0,updated_at=? WHERE id=1")
      .bind(now()).run()

    if (c.env.KV) {
      await c.env.KV.delete(KV_FOOTER_KEY).catch(() => {})
    }

    return c.json(success({ killed: true }))
  } catch (err) {
    return c.json(failure(err.message), 500)
  }
})

export default app
