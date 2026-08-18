/* ================================================================
   src/utils/tursoUrl.js
   TURSO REPLICA URL — libsql:// → https:// conversion

   ✅ FIX (audit, systemic): every syncToReplicas()-style function across
   this backend (categories.js, playerAdmin.js, performance.js,
   adminServers.js, anime.js, securityAdmin.js, system.js, episodes.js,
   banners.js, searchAdmin.js, sidebar.js, deploy.js, seoAdmin.js,
   homepage.js, footer.js, player.js — 16 files, one function each)
   did `fetch(`${env.TURSO_REPLICA_URL}/v2/pipeline`, ...)` directly.
   Turso's own connection-string format is `libsql://your-db.turso.io`,
   and fetch() does not support the libsql:// scheme at all — confirmed
   directly: `fetch("libsql://host/path")` throws "TypeError: fetch
   failed" with cause "Error: unknown scheme". Every one of those 16
   sync calls was silently failing (caught by each function's own
   .catch(e => console.error(...)), so no request-time error surfaced —
   just a swallowed error in server logs) whenever TURSO_REPLICA_URL
   was actually set to the libsql:// form Turso documents and issues by
   default. db.js's own primary-connection code already did this
   conversion correctly (env.TURSO_REPLICA_URL.replace("libsql://",
   "https://")) for its own use — this just gives every sync function
   that same one-line fix from a single shared place instead of 16
   separate inline copies that could individually drift.

   Usage: replace `${env.TURSO_REPLICA_URL}/v2/pipeline` with
   `${tursoHttpUrl(env.TURSO_REPLICA_URL)}/v2/pipeline`.
================================================================ */

export function tursoHttpUrl(rawUrl) {
  if (!rawUrl) return rawUrl
  return rawUrl.replace("libsql://", "https://")
}
