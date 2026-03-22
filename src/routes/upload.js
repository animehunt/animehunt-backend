import { Hono } from "hono"

const app = new Hono()

app.post("/", async (c) => {

  try {

    const { file } = await c.req.json()

    if (!file) {
      return c.json({ success: false, error: "File required" }, 400)
    }

    let base64 = file

    // ✅ ensure full base64 format
    if (!base64.startsWith("data:")) {
      base64 = `data:image/jpeg;base64,${base64}`
    }

    const form = new FormData()

    form.append("file", base64)   // ✅ FIXED
    form.append("fileName", Date.now() + ".jpg")
    form.append("folder", "/animehunt")
    form.append("useUniqueFileName", "true")

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(c.env.IMAGEKIT_PRIVATE_KEY + ":")
      },
      body: form
    })

    const data = await res.json()

    if (!data.url) {
      console.error("ImageKit Error:", data)
      return c.json({ success: false, error: data.error || "Upload failed" }, 500)
    }

    return c.json({
      success: true,
      url: data.url
    })

  } catch (err) {

    console.error("Upload crash:", err)

    return c.json({
      success: false,
      error: err.message
    }, 500)

  }

})

export default app
