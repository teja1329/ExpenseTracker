import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { apiClient } from '../lib/api.js'
import { useToast } from '../components/Toast.jsx'

// Use a base that may include /api. Derive origin & oauthStart safely.
const RAW_API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081/api'
const BACKEND_ORIGIN = new URL(RAW_API_BASE).origin               // e.g. http://localhost:8081
const OAUTH_START = `${BACKEND_ORIGIN}/api/auth/google/start`     // never double /api

export default function SignIn() {
  const { loginWithToken } = useAuth()
  const [form, setForm] = useState({ email:'', password:'' })
  const [err, setErr] = useState('')
  const api = apiClient()
  const toast = useToast()
  const popupRef = useRef(null)

  // listen for popup message
  useEffect(() => {
    function onMsg(e) {
      // Only accept messages from the backend origin
      if (e.origin !== BACKEND_ORIGIN) return
      const data = e.data || {}
      if (data?.source !== 'oauth-google') return

      popupRef.current = null

      if (data.status === 'ok' && data.token) {
        loginWithToken(data.token)
        toast.success('Signed in with Google')
        window.location.href = '/'
        return
      }
      if (data.status === 'needs_signup') {
        // send user to signup with prefilled email/providerId
        const params = new URLSearchParams({
          email: data.email || '',
          providerId: data.providerId || ''
        })
        window.location.href = `/signup?${params.toString()}`
        return
      }
      if (data.status === 'ok' && !data.token) {
        toast.info('Account exists. Please sign in.')
        return
      }
      toast.error(data.message || 'Google sign-in failed')
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [loginWithToken, toast])

  function openGoogle(flow = 'login') {
    const w = 500, h = 600
    const left = window.screenX + (window.outerWidth - w) / 2
    const top = window.screenY + (window.outerHeight - h) / 2
    const url = `${OAUTH_START}?flow=${encodeURIComponent(flow)}`
    popupRef.current = window.open(
      url,
      'google-oauth',
      `width=${w},height=${h},left=${left},top=${top},resizable,scrollbars`
    )
  }

  async function submit(e){
    e.preventDefault()
    setErr('')
    try {
      const r = await api.post('/auth/login', form)
      loginWithToken(r.data.token)
      toast.success('Signed in')
      window.location.href = '/'
    } catch {
      setErr('Invalid credentials')
      toast.error('Invalid credentials')
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm">
      <h1 className="text-2xl font-semibold mb-4">Sign In</h1>

      <button
        onClick={()=>openGoogle('login')}
        className="w-full mb-4 px-4 py-2 bg-white border rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50"
        type="button"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="" />
        Continue with Google
      </button>

      <div className="relative my-4 text-center text-sm text-slate-500">
        <span className="px-2 bg-white relative z-10">or</span>
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-slate-200"></div>
      </div>

      {err && <div className="text-red-600 mb-2">{err}</div>}
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded p-2" placeholder="Email" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} />
        <input className="w-full border rounded p-2" type="password" placeholder="Password" value={form.password} onChange={e=>setForm(f=>({...f, password:e.target.value}))} />
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg w-full">Sign In</button>
      </form>

      <div className="text-sm text-gray-500 mt-3">
        No account? <a className="text-blue-600" href="/signup">Sign Up</a>
      </div>
    </div>
  )
}
