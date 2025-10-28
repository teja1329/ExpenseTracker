import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import googleAuthRouter from './routes/auth.google.js'

import { initDb } from './util/db.js'
import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import expenseRoutes from './routes/expenses.js'
import categoriesRoutes from './routes/categories.js'
import budgetsRoutes from './routes/budgets.js'
import goalsRoutes from './routes/goals.js'

// ----------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 8081
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change'

// Initialize DB
initDb()

// ----------------------------------------------------------------------
// Auth middleware (used for all protected routes)
// ----------------------------------------------------------------------
function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match) return res.status(401).json({ error: 'unauthorized' })

    const payload = jwt.verify(match[1], JWT_SECRET)
    const userId = payload?.sub || payload?.id
    if (!userId) return res.status(401).json({ error: 'unauthorized' })

    req.user = {
      id: userId,
      email: payload.email || payload.user?.email || undefined,
      ...payload
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' })
  }
}

// ----------------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------------
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true }))
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))
app.use('/api/auth/google', googleAuthRouter)

// ----------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'api', ts: new Date().toISOString() }))

// Auth (public)
app.use('/api/auth', authRoutes)

// Protected routes (require JWT)
app.use('/api/profile', authRequired, profileRoutes)
app.use('/api/expenses', authRequired, expenseRoutes)
app.use('/api/categories', authRequired, categoriesRoutes)
app.use('/api/budgets', authRequired, budgetsRoutes)
app.use('/api/goals', authRequired, goalsRoutes)

// ----------------------------------------------------------------------
// Start server
// ----------------------------------------------------------------------
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`))
