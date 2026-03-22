export async function uploadImage(base64, env){

  if(!base64){
    throw new Error("No file provided")
  }

  /* REMOVE PREFIX */
  let clean = base64
  if(base64.startsWith("data:")){
    clean = base64.split(",")[1]
  }

  /* SIZE CHECK (2MB) */
  const sizeKB = Math.round((clean.length * 3) / 4 / 1024)
  if(sizeKB > 2048){
    throw new Error("Image too large (max 2MB)")
  }

  /* IMPORTANT: ImageKit needs full base64 */
  const file = base64.startsWith("data:")
    ? base64
    : "data:image/jpeg;base64," + clean

  const form = new FormData()

  form.append("file", file)
  form.append("fileName", "anime_"+Date.now()+".jpg")
  form.append("folder", "/animehunt")

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
    method:"POST",
    headers:{
      Authorization:"Basic "+btoa(env.IMAGEKIT_PRIVATE_KEY + ":")
    },
    body:form
  })

  const data = await res.json()

  if(!data.url){
    console.error("ImageKit error:", data)
    throw new Error("Upload failed")
  }

  return data.url
}
