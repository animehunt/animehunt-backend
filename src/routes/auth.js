/* =====================================================
   auth.js — /api/auth mount point
   CRITICAL FIX #2: Was a frontend Auth object (not a Hono router).
   Real auth routes live in middleware/adminAuth.js,
   mounted at /api/admin/auth in index.js.
   This file provides an empty Hono router so the
   app.route('/api/auth', auth) line does not crash.
===================================================== */

import { Hono } from "hono"

const auth = new Hono()

export default auth
