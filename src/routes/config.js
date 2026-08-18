/* ================================================
   config.js — Shared runtime configuration
   Required by: upload.js

   BULK_UPLOAD below is currently unused (bulk-upload.js's own
   download-links route was removed as a broken duplicate of
   downloadsAdmin.js — see that file's header for the full explanation).
   Left in place in case a future bulk-CSV-import route is built against
   the current schema and wants these limits.
================================================ */

const config = {
  UPLOAD: {
    MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5 MB
    ALLOWED_IMAGE_TYPES: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ]
  },

  BULK_UPLOAD: {
    MAX_CSV_ROWS: 5000,
    BATCH_SIZE: 50
  }
}

export default config
