import { Hono } from 'hono'

type Bindings = {
  CLOUDINARY_CLOUD_NAME: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
}

const cloudinary = new Hono<{ Bindings: Bindings }>()

// Generate SHA1 hash (Cloudflare Workers compatible)
async function sha1(message: string) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Signed upload signature generator
cloudinary.post('/api/admin/cloudinary-sign', async (c) => {
  const { CLOUDINARY_API_SECRET, CLOUDINARY_API_KEY } = c.env

  const timestamp = Math.floor(Date.now() / 1000)

  const paramsToSign = `timestamp=${timestamp}${CLOUDINARY_API_SECRET}`
  const signature = await sha1(paramsToSign)

  return c.json({
    timestamp,
    signature,
    apiKey: CLOUDINARY_API_KEY
  })
})

export default cloudinary
