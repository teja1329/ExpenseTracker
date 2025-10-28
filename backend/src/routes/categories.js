// backend/src/routes/categories.js
import express from 'express'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { getDb } from '../util/db.js'

const router = express.Router()
const db = getDb()

// Ensure unique name per user (recommended; run once)
db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name
  ON categories(user_id, name)`).run()

// GET /api/categories  → list
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT id, name, color
     FROM categories
     WHERE user_id = ?
     ORDER BY name COLLATE NOCASE`
  ).all(req.user.id)
  res.json(rows)
})

// POST /api/categories  → create
router.post('/', (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(1).max(60),
    // kept optional; ignored if you don’t use colors anymore
    color: z.string().trim().max(16).optional().nullable()
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

  const name = parsed.data.name.trim()
  const color = parsed.data.color || null

  // duplicate check
  const exists = db.prepare(
    'SELECT 1 FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)'
  ).get(req.user.id, name)
  if (exists) return res.status(409).json({ error: 'category_exists' })

  const id = uuid()
  db.prepare(
    `INSERT INTO categories (id, user_id, name, color)
     VALUES (?, ?, ?, ?)`
  ).run(id, req.user.id, name, color)

  res.status(201).json({ id, name, color })
})

// PUT /api/categories/:id  → rename (optional)
router.put('/:id', (req, res) => {
  const schema = z.object({ name: z.string().trim().min(1).max(60) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })
  const { name } = parsed.data

  // ensure it belongs to the user & rename
  const r = db.prepare(
    `UPDATE categories
     SET name = ?
     WHERE id = ? AND user_id = ?`
  ).run(name, req.params.id, req.user.id)

  if (r.changes === 0) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

// DELETE /api/categories/:id  → delete (optional; nice for the trash icon)
// backend/src/routes/categories.js
router.delete('/:id', (req, res) => {
  // 1) Detach expenses that used this category (keeps history)
  db.prepare(`
    UPDATE expenses SET category_id = NULL
    WHERE user_id = ? AND category_id = ?
  `).run(req.user.id, req.params.id)

  // 2) Remove any per-category budget row for this category
  db.prepare(`
    DELETE FROM budgets
    WHERE user_id = ? AND category_id = ?
  `).run(req.user.id, req.params.id)

  // 3) Delete the actual category
  const r = db.prepare(`
    DELETE FROM categories
    WHERE user_id = ? AND id = ?
  `).run(req.user.id, req.params.id)

  if (r.changes === 0) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})


export default router
