// backend/src/routes/budgets.js
import express from 'express'
import { getDb } from '../util/db.js'

const router = express.Router()
const db = getDb()

db.prepare(`CREATE TABLE IF NOT EXISTS budgets (
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, category_id)
)`).run()

// list (optional, useful for UI)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS categoryId, c.name AS categoryName, b.amount
    FROM categories c
    LEFT JOIN budgets b
      ON b.user_id = c.user_id AND b.category_id = c.id
    WHERE c.user_id = ?
    ORDER BY c.name COLLATE NOCASE
  `).all(req.user.id)
  res.json(rows)
})

// ✅ PUT /api/budgets/:categoryId  (the one your UI calls)
router.put('/:categoryId', (req, res) => {
  const amount = Number(req.body?.amount ?? 0)
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'invalid_amount' })
  }
  db.prepare(`
    INSERT INTO budgets (user_id, category_id, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount
  `).run(req.user.id, req.params.categoryId, amount)
  res.json({ ok: true })
})

// (optional) alternate upsert style used by some UIs
router.post('/', (req, res) => {
  const categoryId = String(req.body?.categoryId || '')
  const amount = Number(req.body?.amount ?? 0)
  if (!categoryId) return res.status(400).json({ error: 'missing_category' })
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'invalid_amount' })
  }
  db.prepare(`
    INSERT INTO budgets (user_id, category_id, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount
  `).run(req.user.id, categoryId, amount)
  res.json({ ok: true })
})

// DELETE /api/budgets/:categoryId → remove the budget row
router.delete('/:categoryId', (req, res) => {
    const r = db.prepare(`
      DELETE FROM budgets
      WHERE user_id = ? AND category_id = ?
    `).run(req.user.id, req.params.categoryId)
  
    // Be idempotent: if nothing was deleted, it was already "cleared".
    res.json({ ok: true, deleted: r.changes > 0 })
  })
  
  

export default router
