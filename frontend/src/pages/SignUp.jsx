import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { apiClient } from '../lib/api.js'
import { useToast } from '../components/Toast.jsx'

const RAW_API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081/api'
const BACKEND_ORIGIN = new URL(RAW_API_BASE).origin
const OAUTH_START = `${BACKEND_ORIGIN}/api/auth/google/start`

export default function SignUp() {
  const { loginWithToken } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()
  const preEmail = params.get('email') || ''
  const preProviderId = params.get('providerId') || ''

  const [form, setForm] = useState({
    displayName: '',
    email: preEmail,
    password: '',
    monthlyIncome: '',
    currency: 'INR',
    provider: preProviderId ? 'google' : null,
    providerId: preProviderId || null
  })
  const [err, setErr] = useState('')
  const api = apiClient()
  const popupRef = useRef(null)

  function openGoogleSignup() {
    const w = 500, h = 600
    const left = window.screenX + (window.outerWidth - w) / 2
    const top = window.screenY + (window.outerHeight - h) / 2
    popupRef.current = window.open(
      `${OAUTH_START}?flow=signup`,
      'google-oauth',
      `width=${w},height=${h},left=${left},top=${top},resizable,scrollbars`
    )
  }

  // Popup message handler to prefill email/providerId
  useEffect(() => {
    function onMsg(e) {
      if (e.origin !== BACKEND_ORIGIN) return
      const data = e.data || {}
      if (data?.source !== 'oauth-google') return

      if (popupRef.current && !popupRef.current.closed) {
        try { popupRef.current.close() } catch {}
      }

      if (data.status === 'needs_signup') {
        setForm(f => ({
          ...f,
          email: data.email || '',
          provider: 'google',
          providerId: data.providerId || null
        }))
        toast.success('Google verified — please complete your details')
        return
      }
      if (data.status === 'ok' && !data.token) {
        toast.info('Account exists. Please sign in.')
        window.location.href = '/signin'
        return
      }
      if (data.status === 'error') {
        toast.error(data.message || 'Google verification failed')
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [toast])

  async function submit(e){
    e.preventDefault()
    setErr('')

    const payload = {
      displayName: (form.displayName || '').trim(),
      email: (form.email || '').trim(),
      password: form.provider === 'google' ? undefined : (form.password || ''),
      monthlyIncome: Number.isFinite(Number(form.monthlyIncome)) ? Number(form.monthlyIncome) : 0,
      currency: (form.currency || 'INR').trim().toUpperCase(),
      provider: form.provider || null,
      providerId: form.providerId || null
    }

    try {
      const r = await api.post('/auth/signup', payload)
      if (form.provider === 'google') {
        toast.success('Account created — please sign in with Google')
        window.location.href = '/signin'
      } else {
        if (r.data?.token) {
          loginWithToken(r.data.token)
          toast.success('Account created')
          window.location.href = '/'
        } else {
          toast.success('Account created — please sign in')
          window.location.href = '/signin'
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.error
      if (msg === 'email_exists') return setErr('Email already exists')
      if (msg === 'invalid_input') {
        const d = e?.response?.data?.details
        const first =
          (d?.fieldErrors && Object.values(d.fieldErrors)[0]?.[0]) ||
          (typeof d === 'string' ? d : null)
        return setErr(first || 'Please check your input and try again.')
      }
      setErr('Could not sign up. Please try again.')
      toast.error('Sign up failed')
    }
  }

  const googleMode = form.provider === 'google'

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-sm">
      <h1 className="text-2xl font-semibold mb-4">Create your account</h1>

      <button
        onClick={openGoogleSignup}
        className="w-full mb-4 px-4 py-2 bg-white border rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50"
        type="button"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" height="18" alt="" />
        Sign up with Google
      </button>

      <div className="relative my-4 text-center text-sm text-slate-500">
        <span className="px-2 bg-white relative z-10">or</span>
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-slate-200"></div>
      </div>

      {err && <div className="text-red-600 mb-3">{err}</div>}

      <form onSubmit={submit} className="space-y-3" noValidate>
        <input
          className="w-full border rounded p-2"
          placeholder="Full Name"
          value={form.displayName}
          onChange={e=>setForm(f=>({...f, displayName:e.target.value}))}
          required
          maxLength={80}
        />

        <input
          className="w-full border rounded p-2"
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={e=>setForm(f=>({...f, email:e.target.value}))}
          required
          maxLength={254}
          readOnly={googleMode}
        />

        {!googleMode && (
          <input
            className="w-full border rounded p-2"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e=>setForm(f=>({...f, password:e.target.value}))}
            required
            minLength={8}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z^0-9]).+"
            title="At least 8 characters, with 1 uppercase, 1 lowercase, 1 number, and 1 special character"
          />
        )}

        <input
          className="w-full border rounded p-2"
          placeholder="Monthly Income"
          type="number"
          value={form.monthlyIncome}
          onChange={e=>setForm(f=>({...f, monthlyIncome:e.target.value}))}
          required
          min="0.01"
          step="0.01"
        />

        <input
          className="w-full border rounded p-2"
          placeholder="Currency (e.g., INR)"
          value={form.currency}
          onChange={e=>setForm(f=>({...f, currency:e.target.value.toUpperCase()}))}
          required
          maxLength={3}
          pattern="[A-Z]{3}"
          title="3-letter currency code like INR, USD, EUR"
        />

        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg w-full">
          {googleMode ? 'Create account (Google)' : 'Sign Up'}
        </button>
      </form>

      <div className="text-sm text-gray-500 mt-3">
        Already have an account? <a className="text-blue-600" href="/signin">Sign In</a>
      </div>
    </div>
  )
}
