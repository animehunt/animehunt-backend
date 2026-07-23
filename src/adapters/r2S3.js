/* ================================================================
   src/adapters/r2S3.js
   R2-COMPATIBLE ADAPTER — same R2 bucket, accessed via its S3 API

   Only used by dbRestore.js (snapshotToR2 / restoreFromR2 / GET /db/snapshots).
   Everything else in this codebase is already portable.

   R2 doesn't require Cloudflare Workers — it has a full S3-compatible
   API reachable from anywhere with an access key. This means you can
   keep your existing R2 bucket and existing snapshots; you're only
   swapping *how* you talk to it (S3 SDK instead of a Workers binding),
   not moving the data anywhere.

   Needs these env vars (create the key pair in the Cloudflare dashboard
   under R2 -> Manage R2 API Tokens):
     R2_ACCOUNT_ID          - your Cloudflare account ID
     R2_ACCESS_KEY_ID
     R2_SECRET_ACCESS_KEY
     R2_BUCKET_NAME

   If you'd rather not keep R2 at all, this same shape can point at any
   other S3-compatible bucket (Backblaze B2, AWS S3, self-hosted MinIO)
   by changing the endpoint/credentials below — dbRestore.js itself
   doesn't need to change either way.
================================================================ */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from "@aws-sdk/client-s3"

export function createR2Compatible({ accountId, accessKeyId, secretAccessKey, bucket }) {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    // Matches the existing "if (!env.R2_BUCKET) return {ok:false,...}" guard
    // pattern already used in dbRestore.js — return null so callers' existing
    // `if (!env.R2_BUCKET)` checks keep working unmodified.
    return null
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })

  return {
    async put(key, body, opts = {}) {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: opts.httpMetadata?.contentType || "application/octet-stream"
      }))
      return { key }
    },

    async get(key) {
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        const text = await res.Body.transformToString()
        return {
          key,
          async text() { return text },
          async json() { return JSON.parse(text) }
        }
      } catch (e) {
        if (e.name === "NoSuchKey") return null
        throw e
      }
    },

    async list({ prefix = "" } = {}) {
      const res = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix
      }))
      return {
        objects: (res.Contents || []).map(o => ({
          key: o.Key,
          size: o.Size,
          uploaded: o.LastModified
        }))
      }
    }
  }
}

