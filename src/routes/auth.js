import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = new Hono()

app.post('/login', async (c) => {

  const body = await c.req.json()

  const username = body.username
  const password = body.password

  const env = c.env

  if (!username || !password) {
    return c.json({ success:false, error:"Missing credentials" },400)
  }

  if (username !== env.ADMIN_USERNAME) {
    return c.json({ success:false, error:"Invalid credentials" },401)
  }

  const match = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH)

  if (!match) {
    return c.json({ success:false, error:"Invalid credentials" },401)
  }

  const token = jwt.sign(
    {
      user: username,
      role: "admin"
    },
    env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  )

  return c.json({
    success:true,
    token
  })
})


app.get('/verify', async (c) => {

  const auth = c.req.header("Authorization")

  if (!auth) {
    return c.json({ valid:false })
  }

  const token = auth.replace("Bearer ","")

  try {

    const decoded = jwt.verify(token, c.env.JWT_SECRET)

    return c.json({
      valid:true,
      user: decoded.user
    })

  } catch(e){

    return c.json({ valid:false })

  }

})

export default app
