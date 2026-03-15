import jwt from "jsonwebtoken"

export async function verifyAdmin(c,next){

const auth = c.req.header("Authorization")

if(!auth){
return c.json({error:"Unauthorized"},401)
}

const token = auth.replace("Bearer ","")

try{

const decoded = jwt.verify(token,c.env.JWT_SECRET)

c.set("admin",decoded)

await next()

}catch(e){

return c.json({error:"Invalid token"},401)

}

}
