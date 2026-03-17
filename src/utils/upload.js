export async function uploadImage(base64, env) {

  try {

    if (!base64) throw new Error("No file")

    // remove prefix if present
    if (base64.startsWith("data:")) {
      base64 = base64.split(",")[1]
    }

    // size check (~2MB safe limit)
    const sizeKB = Math.round((base64.length * 3) / 4 / 1024)
    if (sizeKB > 2048) {
      throw new Error("Image too large (max 2MB)")
    }

    const form = new FormData()

    form.append("file", base64)
    form.append("fileName", Date.now() + ".jpg")
    form.append("folder", "/animehunt/banners")
    form.append("useUniqueFileName", "true")

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(env.IMAGEKIT_PRIVATE_KEY + ":")
      },
      body: form
    })

    const data = await res.json()

    if (!data.url) {
      console.error("ImageKit error:", data)
      throw new Error("Upload failed")
    }

    return data.url

  } catch (err) {

    console.error("Upload error:", err)

    throw err
  }
}
