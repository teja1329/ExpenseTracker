// backend/src/util/db.js
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, '..', '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })
const dbPath = path.join(dataDir, 'expense_app.db')

let db
export function getDb() {
  if (!db) db = new Database(dbPath)
  return db
}

export function initDb() {
  const db = getDb()
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      monthly_income REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      avatar_path TEXT
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      color TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      category_id TEXT,
      amount REAL,
      note TEXT,
      incurred_on TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    )
  `).run()
}
