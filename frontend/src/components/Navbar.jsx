import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../lib/api.js'
import { motion, AnimatePresence } from 'framer-motion'

const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || 'http://localhost:8081'

function normalizeAvatarUrl(p) {
  if (!p) return ''
  const val =
    p.avatar || p.avatarUrl || p.avatar_url ||
    p.avatarPath || p.avatar_path ||
    p.photo || p.photoUrl || p.photo_url ||
    p.avatarFilename || p.avatar_filename || ''
  if (!val) return ''

  if (/^https?:\/\//i.test(val)) return val
  const path = val.startsWith('/') ? val : `/${val}`
  if (path.startsWith('/uploads/')) return `${BACKEND_ORIGIN}${path}`
  return `${BACKEND_ORIGIN}/uploads/${val.replace(/^\/+/, '')}`
}

export default function NavBar() {
  const { token, profile, logout } = useAuth()
  const navigate = useNavigate()
  const api = useMemo(() => apiClient(() => token), [token])

  const [displayName, setDisplayName] = useState(profile?.displayName || '')
  const [avatarUrl, setAvatarUrl] = useState(() => normalizeAvatarUrl(profile || {}))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // keep avatar & name in sync
  useEffect(() => {
    if (!token) return
    const load = async () => {
      try {
        const { data } = await api.get('/profile')
        setDisplayName(data?.displayName || '')
        const next = normalizeAvatarUrl(data || {})
        setAvatarUrl(next ? `${next}?t=${Date.now()}` : '')
      } catch {}
    }
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    const onAvatarUpdated = () => load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('avatar:updated', onAvatarUpdated)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('avatar:updated', onAvatarUpdated)
    }
  }, [token, api])

  // close dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/signin')
  }

  const initial = (displayName?.[0] || 'U').toUpperCase()

  return (
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur border-b border-slate-200 shadow-sm relative">
      {/* full-width animated strip (you asked thicker) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 nav-underline" />

      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        {/* Brand with subtle lift + underline slide */}
        <Link to="/" className="relative group select-none">
          <motion.span
            whileHover={{ y: -1.5 }}
            transition={{ duration: .18, ease: 'easeOut' }}
            className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent"
          >
            ExpenseTracker
          </motion.span>
          <span className="brand-underline" />
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-6">
          {/* Pretty nav link with pill hover + active dot */}
          <Link
            to="/expenses"
            className="nav-pill"
          >
            <span className="relative">
              Expenses
              <span className="active-dot" />
            </span>
          </Link>

          {/* Avatar dropdown (Settings + Logout here) */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="relative avatar-ring w-10 h-10 rounded-full overflow-hidden shadow-md ring-2 ring-transparent hover:ring-blue-400 transition"
              title={displayName || 'Profile'}
            >
              {avatarUrl ? (
                <img
                  key={avatarUrl}
                  src={avatarUrl}
                  alt="avatar"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display='none' }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-blue-500 to-purple-500 text-white flex items-center justify-center font-semibold">
                  {initial}
                </div>
              )}
              {/* online dot for a lively feel */}
              <span className="avatar-dot" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 mt-3 w-56 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 overflow-hidden"
                >
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 hover:bg-slate-50 transition"
                  >
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 hover:bg-slate-50 transition"
                  >
                    Settings
                  </Link>
                  <div className="h-px bg-slate-200" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-rose-600 transition"
                  >
                    Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  )
}
