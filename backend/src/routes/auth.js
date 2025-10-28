import express from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import jwt from 'jsonwebtoken'
import { getDb } from '../util/db.js'
import { signToken } from '../util/jwt.js'

const db = getDb()
const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change' // same key as used in signToken

// Password: min 8 chars, at least 1 upper, 1 lower, 1 number, 1 special
const StrongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character')

const Currency = z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code (e.g., INR, USD)')

const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: StrongPassword,
  displayName: z.string().min(1, 'Name is required').max(80, 'Name is too long'),
  monthlyIncome: z.coerce.number().positive('Monthly income must be greater than 0'),
  currency: Currency.default('INR')
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

// Helper to send consistent validation errors
function badRequest(res, parseError) {
  const details = parseError?.flatten ? parseError.flatten() : undefined
  return res.status(400).json({ error: 'invalid_input', details })
}

// Extract user ID from Authorization header
function getUserIdFromAuth(req) {
  try {
    const header = req.headers.authorization || ''
    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match) return null
    const payload = jwt.verify(match[1], JWT_SECRET)
    return payload?.sub || payload?.id || null
  } catch {
    return null
  }
}

// ---- Signup
router.post('/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(res, parsed.error)

  const { email, password, displayName, monthlyIncome, currency } = parsed.data

  const exists = db.prepare('select 1 from users where email=?').get(email)
  if (exists) return res.status(409).json({ error: 'email_exists' })

  const id = uuid()
  const password_hash = bcrypt.hashSync(password, 10)

  db.prepare(`
    insert into users (id,email,password_hash,display_name,monthly_income,currency)
    values (?,?,?,?,?,?)
  `).run(id, email, password_hash, displayName.trim(), monthlyIncome, currency)

  // Seed default categories
  const defaults = [
    { id: uuid(), name: 'Food & Dining', color: '#EF4444' },
    { id: uuid(), name: 'Transport', color: '#3B82F6' },
    { id: uuid(), name: 'Shopping', color: '#F59E0B' },
    { id: uuid(), name: 'Bills', color: '#10B981' }
  ]
  const ins = db.prepare('insert into categories (id,user_id,name,color) values (?,?,?,?)')
  defaults.forEach(c => ins.run(c.id, id, c.name, c.color))

  const token = signToken({ id, email, display_name: displayName })
  res.status(201).json({ token })
})

// ---- Login
router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return badRequest(res, parsed.error)

  const { email, password } = parsed.data
  const user = db.prepare('select * from users where email=?').get(email)
  if (!user) return res.status(401).json({ error: 'invalid_credentials' })

  const ok = bcrypt.compareSync(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })

  const token = signToken(user)
  res.json({ token })
})

// ---- Change Password
router.post('/password', (req, res) => {
  const userId = getUserIdFromAuth(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })

  const { current, next } = req.body || {}
  if (!current || !next || String(next).length < 8) {
    return res.status(400).json({ error: 'invalid_input' })
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId)
  if (!user) return res.status(401).json({ error: 'unauthorized' })

  const ok = bcrypt.compareSync(String(current), user.password_hash)
  if (!ok) return res.status(400).json({ error: 'bad_current' })

  const newHash = bcrypt.hashSync(String(next), 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id)

  res.json({ ok: true })
})

export default router
