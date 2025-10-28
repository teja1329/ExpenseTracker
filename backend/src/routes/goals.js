import { Router } from 'express'
import { getDb } from '../util/db.js'

const r = Router()
const db = getDb()

db.prepare(`
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    target_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run()

r.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, target_amount AS targetAmount, target_date AS targetDate
    FROM goals WHERE user_id = ?
    ORDER BY target_date IS NULL, target_date
  `).all(req.user.id)
  res.json(rows)
})

r.post('/', (req, res) => {
  const { name, targetAmount, targetDate } = req.body || {}
  if (!name || Number(targetAmount) <= 0) return res.status(400).json({ error: 'invalid_input' })
  const info = db.prepare(`
    INSERT INTO goals (user_id, name, target_amount, target_date)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, String(name).trim(), Number(targetAmount), targetDate || null)
  res.json({ id: info.lastInsertRowid })
})

r.put('/:id', (req, res) => {
  const { name, targetAmount, targetDate } = req.body || {}
  db.prepare(`
    UPDATE goals SET name = ?, target_amount = ?, target_date = ?
    WHERE id = ? AND user_id = ?
  `).run(String(name).trim(), Number(targetAmount), targetDate || null, Number(req.params.id), req.user.id)
  res.json({ ok: true })
})

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?')
    .run(Number(req.params.id), req.user.id)
  res.json({ ok: true })
})

export default r
