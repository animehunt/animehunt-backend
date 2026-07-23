/* ================================================
   config.js — Shared runtime configuration
   Required by: upload.js, bulk-upload.js
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


