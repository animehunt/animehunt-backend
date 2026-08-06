/* ================================================================
   src/adapters/executionCtx.js
   EXECUTION-CONTEXT ADAPTER — makes c.executionCtx.waitUntil() work
   on plain Node.js, the same way it did on Cloudflare Workers.

   On Workers, c.executionCtx.waitUntil(promise) is populated
   automatically by the runtime, and tells the isolate "don't tear
   down until this background promise settles, even though the
   response has already been sent." Several route files already
   call it in this exact guarded shape:

     if (c.executionCtx?.waitUntil) {
       c.executionCtx.waitUntil(syncToReplicas(c.env, "insert", row))
     }

   @hono/node-server does not populate c.executionCtx at all — the
   guard above was silently evaluating to false on every request,
   which meant the background replica-sync calls in anime.js,
   episodes.js, categories.js, banners.js, and adminServers.js were
   never actually running on Node. No error, no log — just quietly
   skipped.

   Node doesn't need waitUntil() in the first place: unlike a
   Workers isolate, the process doesn't get torn down just because
   an HTTP response was sent, so an un-awaited promise keeps running
   on its own (this is exactly the pattern db.js's own getDB().execute()
   already uses for its Turso/Supabase background sync — a bare async
   IIFE with .catch(), no waitUntil equivalent required).

   Rather than rewrite every waitUntil() call site across five route
   files, this middleware gives c.executionCtx.waitUntil() a real,
   working implementation on Node: it fires the promise, and makes
   sure a rejection is caught and logged instead of becoming an
   unhandled promise rejection. Every existing call site now works
   completely unmodified, same as env.DB/env.KV against their own
   adapters.
================================================================ */

export function executionCtxShim(c, next) {
  c.executionCtx = {
    waitUntil(promise) {
      Promise.resolve(promise).catch((err) => {
        console.error(
          `⚠️ Background task error [${c.req.method} ${c.req.path}]:`,
          err?.message || err
        )
      })
    }
  }
  return next()
}
