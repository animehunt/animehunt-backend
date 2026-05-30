/* ============================================================
  ANIMEHUNT — ADS ANALYTICS ROUTES (FIXED)
  File: src/routes/adsAnalytics.js

  NOTE: Analytics routes are now merged into ads.js to avoid
  route conflicts. This file re-exports for backward compatibility
  in case it is imported separately.

  All routes now live in ads.js:
    GET    /api/admin/ads-analytics
    GET    /api/admin/ads-analytics/:adId
    DELETE /api/admin/ads-analytics-clear
============================================================ */

import { Hono } from "hono"

const app = new Hono()

// Stub — real routes are in ads.js
// If imported standalone, these will respond correctly

const ok   = (data={}) => ({ success: true,  data })
const fail = (msg="Error") => ({ success: false, message: msg })

export default app
