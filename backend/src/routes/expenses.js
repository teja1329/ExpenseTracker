// backend/src/routes/expenses.js
import express from 'express'
import { z } from 'zod'
import { getDb } from '../util/db.js'
import { v4 as uuid } from 'uuid'

const router = express.Router()

// Strict add schema
const expenseSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  categoryId: z.string().uuid('Invalid category id').nullable().optional(),
  note: z.string().max(280, 'Note too long').optional()
})

// Partial update schema (all optional, but validated if present)
const expensePatchSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  categoryId: z.string().uuid('Invalid category id').nullable().optional(),
  note: z.string().max(280, 'Note too long').optional()
})

router.get('/', (req, res) => {
  const db = getDb()
  const { from, to, limit = 100 } = req.query
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) {
    return res.status(400).json({ error: 'invalid_input', details: { query: ['from/to must be YYYY-MM-DD'] } })
  }

  const rows = db.prepare(`
    select e.*, c.name as category_name, c.color as category_color
    from expenses e
    left join categories c on e.category_id=c.id
    where e.user_id=? and e.incurred_on between ? and ?
    order by e.incurred_on desc, e.created_at desc
    limit ?
  `).all(req.user.sub, String(from), String(to), Number(limit))
  res.json(rows)
})

router.post('/', (req, res) => {
  const parsed = expenseSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() })

  const db = getDb()
  const { amount, incurredOn, categoryId = null, note } = parsed.data

  const id = uuid()
  db.prepare('insert into expenses (id,user_id,category_id,amount,note,incurred_on) values (?,?,?,?,?,?)')
    .run(id, req.user.sub, categoryId, amount, note || null, incurredOn)
  res.status(201).json({ id, ok: true })
})

router.put('/:id', (req, res) => {
  const parsed = expensePatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() })
  const updates = parsed.data

  // ensure exists & belongs to user
  const db = getDb()
  const exists = db.prepare('select id from expenses where id=? and user_id=?').get(req.params.id, req.user.sub)
  if (!exists) return res.status(404).json({ error: 'not_found' })

  // build SET clause dynamically
  const sets = []
  const vals = []
  if (updates.amount !== undefined) { sets.push('amount=?'); vals.push(updates.amount) }
  if (updates.incurredOn !== undefined) { sets.push('incurred_on=?'); vals.push(updates.incurredOn) }
  if (updates.categoryId !== undefined) { sets.push('category_id=?'); vals.push(updates.categoryId) }
  if (updates.note !== undefined) { sets.push('note=?'); vals.push(updates.note || null) }

  if (sets.length === 0) return res.json({ ok: true }) // nothing to change

  vals.push(req.params.id, req.user.sub)
  db.prepare(`update expenses set ${sets.join(', ')} where id=? and user_id=?`).run(...vals)
  res.json({ ok: true })
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const r = db.prepare('delete from expenses where id=? and user_id=?').run(req.params.id, req.user.sub)
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' })
  res.json({ ok: true })
})

export default router
