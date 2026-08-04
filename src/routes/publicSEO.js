/* ============================================================
  ANIMEHUNT — PUBLIC SEO META/SCHEMA ROUTES
  File: src/routes/publicSEO.js

  index.js mein mount karo:
    app.route("/api", publicSEO)

  ✅ FIX (audit, double-prefix bug): this file's route paths used to be
  hardcoded as "/api/seo/meta/:animeId" and "/api/seo/schema/:animeId",
  but index.js mounts this router at app.route("/api", publicSEO) —
  which prepends "/api" again. Hono's route-mounting concatenates the
  mount prefix with each registered path verbatim (it does not dedupe
  a repeated "/api"), so the real effective path was
  "/api/api/seo/meta/:animeId" — unreachable at the URL the frontend
  actually calls ("/api/seo/meta/:id", see js/api.js's BASE + path
  convention). Fixed by dropping the leading "/api" from each route
  below, matching the convention every other correctly-mounted route
  file in this project already uses (relative path only, prefix
  supplied by the mount).

  ✅ Also split out of this file (see publicSEORoot.js): the
  robots.txt/sitemap*.xml routes, which need to be mounted at the
  domain root (app.route("/", publicSEORoot)), not under /api at all —
  search engines request them at the root, never under /api/.

  BUGS FIXED (carried over from original file):
  ✅ FIXED: metaDesc undefined?.slice(0,155)+"..." = "undefined..." bug
              → proper null check before concat
  ✅ FIXED: KV cache on all heavy routes

  ROUTES:
  GET /api/seo/meta/:animeId
  GET /api/seo/schema/:animeId
============================================================ */

import { Hono } from "hono"

const app = new Hono()

const ok   = d => ({ success: true,  data: d })
const fail = m => ({ success: false, message: m })

/* ============================================================
  HELPER — safe canonical base URL
============================================================ */

async function getBase(db) {
  try {
    const row = await db.prepare(
      "SELECT canonical FROM seo_settings WHERE id=1"
    ).first()
    return (row?.canonical || "https://animehunt.in").replace(/\/$/, "")
  } catch {
    return "https://animehunt.in"
  }
}

/* ============================================================
  HELPER — safe description slice (FIXED: no "undefined..." bug)
============================================================ */

function safeDesc(desc, title, maxLen = 155) {
  if (desc && desc.trim()) {
    const s = desc.trim()
    return s.length > maxLen ? s.slice(0, maxLen) + "..." : s
  }
  return `Watch ${title} Hindi Dubbed online free on AnimeHunt.`
}

/* ============================================================
  GET /api/seo/meta/:animeId — OG + Twitter meta
  FIXED: metaDesc "undefined..." bug
  KV cached 1h
============================================================ */

app.get("/seo/meta/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    const cacheKey = `seo:meta:${animeId}`
    const cached   = await c.env.KV?.get(cacheKey, "json").catch(() => null)
    if (cached) return c.json(ok(cached))

    // Try pre-generated seo_meta first
    const meta = await db.prepare(
      "SELECT * FROM seo_meta WHERE id=?"
    ).bind(animeId).first().catch(() => null)

    if (meta) {
      const result = {
        metaTitle:  meta.meta_title  || "",
        metaDesc:   meta.meta_desc   || "",
        keywords:   meta.keywords    || "",
        ogImage:    meta.og_image    || "",
        schemaJson: meta.schema_json || null
      }
      if (c.env.KV) {
        await c.env.KV.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 3600
        }).catch(() => {})
      }
      return c.json(ok(result))
    }

    // Fallback: generate from anime table
    // ✅ FIX (audit ISSUE-032): added is_hidden=0 — this file's own sitemap
    // routes (GET /api/seo/sitemap) correctly check both is_hidden=0 AND
    // active=1, but this metadata fallback only checked active=1. Matching
    // the pairing used consistently everywhere else in this codebase
    // (public.js, publicSearch.js, recommendations.js, trending.js) so a
    // hidden anime's OG/Twitter meta can't be generated even when the
    // exact animeId/slug is known directly.
    const anime = await db.prepare(
      "SELECT id, title, slug, description, poster, banner, rating, year, type, genres, language FROM anime WHERE (id=? OR slug=?) AND active=1 AND is_hidden=0 LIMIT 1"
    ).bind(animeId, animeId).first()

    if (!anime) return c.json(fail("Not found"), 404)

    const seoRow = await db.prepare(
      "SELECT canonical, tpl_anime, tpl_movie, tpl_cartoon FROM seo_settings WHERE id=1"
    ).first().catch(() => null)

    const base = (seoRow?.canonical || "https://animehunt.in").replace(/\/$/, "")

    const template = anime.type === "movie"
      ? (seoRow?.tpl_movie   || "{title} Hindi Dubbed Movie — AnimeHunt")
      : anime.type === "cartoon"
        ? (seoRow?.tpl_cartoon || "{title} Hindi Dubbed Cartoon — AnimeHunt")
        : (seoRow?.tpl_anime   || "{title} Hindi Dubbed — Watch Free | AnimeHunt")

    const metaTitle = template.replace("{title}", anime.title || "").slice(0, 65)

    let genres = []
    try { genres = JSON.parse(anime.genres || "[]") } catch {}

    // FIXED: no more "undefined..." bug — safeDesc handles null/undefined desc
    const result = {
      metaTitle,
      metaDesc:   safeDesc(anime.description, anime.title, 155),
      keywords:   [anime.title, `${anime.title || ""} hindi dubbed`, ...genres.slice(0,3), "anime", "animehunt"].filter(Boolean).join(", "),
      ogImage:    anime.poster || anime.banner || "",
      schemaJson: null,
      og: {
        type:        anime.type === "movie" ? "video.movie" : "video.tv_show",
        title:       metaTitle,
        description: safeDesc(anime.description, anime.title, 200),
        image:       anime.poster || anime.banner || "",
        url:         `${base}/details.html?id=${anime.slug}`
      }
    }

    if (c.env.KV) {
      await c.env.KV.put(cacheKey, JSON.stringify(result), {
        expirationTtl: 3600
      }).catch(() => {})
    }

    return c.json(ok(result))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

/* ============================================================
  GET /api/seo/schema/:animeId — JSON-LD schema.org
============================================================ */

app.get("/seo/schema/:animeId", async (c) => {
  const db      = c.env.DB
  const animeId = c.req.param("animeId")

  try {
    // ✅ FIX (audit ISSUE-032): same is_hidden=0 addition as the /seo/meta
    // route above.
    const anime = await db.prepare(
      "SELECT id, title, slug, description, poster, rating, year, type, genres, language FROM anime WHERE (id=? OR slug=?) AND active=1 AND is_hidden=0 LIMIT 1"
    ).bind(animeId, animeId).first()

    if (!anime) return c.json(fail("Not found"), 404)

    const base = await getBase(db)

    let genres = []
    try { genres = JSON.parse(anime.genres || "[]") } catch {}

    const schema = {
      "@context":    "https://schema.org",
      "@type":       anime.type === "movie" ? "Movie" : "TVSeries",
      "name":        anime.title || "",
      "description": anime.description || "",
      "image":       anime.poster || "",
      "url":         `${base}/details.html?id=${anime.slug}`,
      "genre":       genres,
      "inLanguage":  anime.language || "hi"
    }

    if (anime.rating) {
      schema.aggregateRating = {
        "@type":       "AggregateRating",
        "ratingValue": String(anime.rating),
        "bestRating":  "10",
        "worstRating": "1"
      }
    }

    if (anime.year) schema.dateCreated = String(anime.year)

    return c.json(ok(schema))
  } catch (err) {
    return c.json(fail(err.message), 500)
  }
})

export default app


