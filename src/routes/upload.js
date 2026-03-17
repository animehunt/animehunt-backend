export async function uploadImage(base64, env) {

  // remove prefix if exists
  if (base64.startsWith("data:")) {
    base64 = base64.split(",")[1]
  }

  const form = new FormData()

  form.append("file", base64)
  form.append("fileName", Date.now() + ".jpg")

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(env.IMAGEKIT_PRIVATE_KEY + ":")
    },
    body: form
  })

  const data = await res.json()

  if (!data.url) {
    throw new Error("Upload failed")
  }

  return data.url
}
