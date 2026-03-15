export async function uploadImage(file,env){

const form = new FormData()

form.append("file",file)
form.append("fileName",Date.now()+".jpg")
form.append("publicKey",env.IMAGEKIT_PUBLIC)

const res = await fetch("https://upload.imagekit.io/api/v1/files/upload",{
method:"POST",
headers:{
Authorization:"Basic "+btoa(env.IMAGEKIT_PRIVATE+":")
},
body:form
})

const data = await res.json()

return data.url

}
