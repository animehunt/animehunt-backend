/* ================================================================
   src/utils/tmdb.js
   Shared TMDB (The Movie Database) API helper.

   Used by:
     src/routes/anime.js    — POST /anime/auto-add
     src/routes/episodes.js — POST /episodes/auto-add

   Factored out here rather than duplicated in both route files —
   both need the same auth header, retry/error handling, and
   image-URL building, and this keeps that logic in one place to
   verify/update (same reasoning as src/utils/clientIp.js).

   Auth: TMDB's own current recommendation is the "API Read Access
   Token" (a long JWT string starting "eyJ...", found on your TMDB
   account under Settings → API) sent as a Bearer token — this works
   for every endpoint used here and keeps the credential out of URLs
   and server logs, unlike the older api_key query-param style.
   Despite the "API key" name, TMDB_API_KEY below should be that
   Read Access Token, not the shorter v3 "API Key" string (both are
   on the same TMDB settings page — the JWT one is what belongs here).

   TMDB ToS note (informational, not enforced by this code): TMDB's
   terms distinguish personal/non-commercial use from commercial use
   (monetized products, sites carrying ads, etc.) and ask for
   attribution ("This product uses the TMDB API but is not endorsed
   or certified by TMDB"). Worth a read of TMDB's current terms for
   your specific deployment — that's a business/legal question for
   you, not something this code enforces.
================================================================ */

const TMDB_BASE  = "https://api.themoviedb.org/3"
const IMAGE_BASE = "https://image.tmdb.org/t/p"

/* ================= CORE FETCH ================= */
/* Retries on 429 (rate limited — respects Retry-After if TMDB sends
   one) and 5xx (transient server error), NOT on 4xx like 401/404 —
   retrying "invalid key" or "not found" just burns time for no
   chance of a different result. Throws with TMDB's own status_message
   when available, so callers get an actionable error instead of a
   bare HTTP status. */
export async function tmdbFetch(env, path, params = {}, attempts = 3) {
  if (!env.TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is not configured — set it in your .env")
  }

  const url = new URL(`${TMDB_BASE}${path}`)
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") url.searchParams.set(key, val)
  }

  let lastErr
  for (let i = 0; i < attempts; i++) {
    let res
    try {
      res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${env.TMDB_API_KEY}`,
          "Content-Type":  "application/json;charset=utf-8"
        }
      })
    } catch (networkErr) {
      // Network-level failure (DNS, connection reset, etc.) — worth a retry
      lastErr = networkErr
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)))
      continue
    }

    if (res.ok) return res.json()

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After")) || (1 * (i + 1))
      lastErr = new Error("TMDB rate limit hit")
      if (i < attempts - 1) await new Promise(r => setTimeout(r, retryAfter * 1000))
      continue
    }

    if (res.status >= 500) {
      lastErr = new Error(`TMDB server error: ${res.status}`)
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)))
      continue
    }

    // 4xx (other than 429) — don't retry, fail with TMDB's own message
    let body = {}
    try { body = await res.json() } catch {}
    const notFound = res.status === 404
    throw new Error(
      body?.status_message
        ? `TMDB: ${body.status_message}${notFound ? "" : ` (HTTP ${res.status})`}`
        : `TMDB request failed: HTTP ${res.status}`
    )
  }

  throw lastErr || new Error("TMDB request failed after retries")
}

/* ================= RESOLVE tmdb_id/title -> {tmdbId, mediaType} ================= */
/* mediaType hint (optional) skips the tv/movie guessing entirely.
   Given only a bare tmdb_id with no hint, tries /tv first (this is
   an anime CMS — TV/episodic is the common case — see index.js's
   own "type defaults to anime" convention in buildRow()), falls back
   to /movie on a 404. Given a title, uses /search/multi and takes
   the top (TMDB's own relevance-ranked) movie/tv result, optionally
   narrowed by an explicit year if one was passed. */
export async function resolveTmdbTarget(env, { tmdb_id, title, media_type, year } = {}) {
  if (tmdb_id) {
    if (media_type === "movie" || media_type === "tv") {
      return { tmdbId: String(tmdb_id), mediaType: media_type }
    }
    try {
      await tmdbFetch(env, `/tv/${tmdb_id}`, {})
      return { tmdbId: String(tmdb_id), mediaType: "tv" }
    } catch (tvErr) {
      if (!/HTTP 404|status_message/.test(tvErr.message)) throw tvErr
      // fall through to movie
    }
    try {
      await tmdbFetch(env, `/movie/${tmdb_id}`, {})
      return { tmdbId: String(tmdb_id), mediaType: "movie" }
    } catch {
      throw new Error(`TMDB: no tv or movie found for id ${tmdb_id}`)
    }
  }

  if (title) {
    const results = await tmdbFetch(env, "/search/multi", { query: title })
    const candidates = (results?.results || [])
      .filter(r => r.media_type === "movie" || r.media_type === "tv")

    const match = year
      ? candidates.find(r => {
          const d = r.release_date || r.first_air_date || ""
          return d.startsWith(String(year))
        }) || candidates[0]
      : candidates[0]

    if (!match) throw new Error(`TMDB: no movie or tv match found for "${title}"`)

    return { tmdbId: String(match.id), mediaType: match.media_type }
  }

  throw new Error("Either tmdb_id or title is required")
}

/* ================= IMAGE URL ================= */
/* "original" for anything getting downloaded + re-hosted on ImageKit
   (best quality for a one-time archival copy). Episode stills use a
   smaller size (see episodes.js) since those are only ever hotlinked
   from TMDB's CDN directly, not re-uploaded. */
export function tmdbImageUrl(path, size = "original") {
  if (!path) return null
  return `${IMAGE_BASE}/${size}${path}`
}

/* ================= MAPPERS: TMDB fields -> this CMS's fields ================= */

export function mapTmdbGenres(genres) {
  return (Array.isArray(genres) ? genres : [])
    .map(g => g?.name)
    .filter(Boolean)
}

/* Maps onto this CMS's existing status enum
   (["airing","completed","upcoming","dropped","ongoing","hidden"] —
   see anime.js's bulk-status route). TMDB's own status strings for
   tv vs movie are different vocabularies entirely, so mediaType
   matters here. Adjust this mapping if your taxonomy differs. */
export function mapTmdbStatus(rawStatus, mediaType) {
  const s = String(rawStatus || "").toLowerCase()

  if (mediaType === "movie") {
    if (s === "released") return "completed"
    if (s === "canceled" || s === "cancelled") return "dropped"
    return "upcoming" // planned, in production, post production, rumored
  }

  // tv
  if (s === "returning series" || s === "in production") return "airing"
  if (s === "ended")                                     return "completed"
  if (s === "canceled" || s === "cancelled")              return "dropped"
  return "upcoming" // planned, pilot
}

/* release_date ("YYYY-MM-DD") / first_air_date -> integer year, or null */
export function extractYear(dateStr) {
  const y = Number(String(dateStr || "").slice(0, 4))
  return Number.isFinite(y) && y > 0 ? y : null
}


