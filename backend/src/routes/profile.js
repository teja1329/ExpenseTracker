import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { z } from 'zod'
import { fileURLToPath } from 'url'
import { getDb } from '../util/db.js'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadDir = path.join(__dirname, '..', '..', 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g,'_'))
})
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) cb(null, true)
    else cb(new Error('Only image files are allowed (png, jpg, jpeg, webp, gif)'))
  }
})

const profileSchema = z.object({
  displayName: z.string().min(1, 'Name is required').max(80),
  monthlyIncome: z.coerce.number().positive('Monthly income must be greater than 0'),
  currency: z.string().regex(/^[A-Z]{3}$/,'Currency must be 3-letter code (e.g., INR)')
})

router.get('/', (req, res) => {
  const db = getDb()
  const user = db.prepare(
    'select id,email,display_name as displayName,monthly_income as monthlyIncome,currency,avatar_path as avatar from users where id=?'
  ).get(req.user.sub)
  if (!user) return res.json({})
  const absolute = user.avatar ? `${req.protocol}://${req.get('host')}${user.avatar}` : null
  res.json({ ...user, avatarUrl: absolute })
})

router.put('/', (req, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() })

  const db = getDb()
  const { displayName, monthlyIncome, currency } = parsed.data
  db.prepare('update users set display_name=?, monthly_income=?, currency=? where id=?')
    .run(displayName.trim(), monthlyIncome, currency, req.user.sub)
  res.json({ ok: true })
})

router.post('/avatar', upload.single('file'), (req, res) => {
  const db = getDb()
  if (!req.file) return res.status(400).json({ error: 'no_file' })
  const rel = '/uploads/' + req.file.filename
  db.prepare('update users set avatar_path=? where id=?').run(rel, req.user.sub)
  const absolute = `${req.protocol}://${req.get('host')}${rel}`
  res.json({ ok: true, url: absolute, path: rel })
})

export default router
