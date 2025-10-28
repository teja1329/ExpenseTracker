import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret'

export function signToken(user) {
  const payload = { sub: user.id, email: user.email, name: user.display_name }
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}
export function signJwtForUserId(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '30d' })
}

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Missing token' })
    const payload = jwt.verify(token, SECRET)
    req.user = { sub: payload.sub, email: payload.email, name: payload.name }
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
