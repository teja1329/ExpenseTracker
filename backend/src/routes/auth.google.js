import express from 'express'
import { getDb } from '../util/db.js'
import { signJwtForUserId } from '../util/jwt.js'

const router = express.Router()

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

function oauthResultHTML(payload) {
  const json = JSON.stringify(payload)
  const origin = JSON.stringify(FRONTEND_ORIGIN)
  return `<!doctype html>
<meta charset="utf-8">
<title>Signing you in…</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; }
</style>
<script>
  (function () {
    var data = ${json};
    try {
      if (window.opener) {
        window.opener.postMessage(data, ${origin});
      }
    } catch (e) {}
    try { window.close(); } catch (e) {}
  })();
</script>
<p>You can close this window.</p>`
}

// STEP 1: Start Google OAuth (flow = login | signup)
router.get('/start', (req, res) => {
  const { flow = 'login' } = req.query
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    prompt: 'consent',
    access_type: 'offline',
    state: flow
  })
  res.redirect(`${GOOGLE_AUTH}?${params.toString()}`)
})

// STEP 2: Google redirects back with ?code
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    if (!code) throw new Error('Missing code')

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code.toString(),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    })
    if (!tokenRes.ok) throw new Error('Token exchange failed')
    const token = await tokenRes.json()

    // Get profile
    const uRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    })
    if (!uRes.ok) throw new Error('Userinfo fetch failed')
    const profile = await uRes.json() // { sub, email, name, ... }

    const db = getDb()
    const byProvider = db.prepare(
      'select * from users where provider=? and provider_id=? limit 1'
    ).get('google', profile.sub)

    const byEmail = db.prepare(
      'select * from users where lower(email)=lower(?) limit 1'
    ).get(profile.email)

    const exists = byProvider || byEmail

    if (state === 'signup') {
      if (exists) {
        // already registered — just tell opener to sign in instead
        const html = oauthResultHTML({ source:'oauth-google', status:'ok', token: null })
        return res.status(200).send(html)
      }
      // not registered — send back details to prefill signup
      const html = oauthResultHTML({
        source: 'oauth-google',
        status: 'needs_signup',
        email: profile.email,
        providerId: profile.sub
      })
      return res.status(200).send(html)
    }

    // state === 'login'
    if (!exists) {
      // Not registered -> ask to sign up
      const html = oauthResultHTML({
        source: 'oauth-google',
        status: 'needs_signup',
        email: profile.email,
        providerId: profile.sub
      })
      return res.status(200).send(html)
    }

    // issue your JWT
    const user = exists
    const jwt = signJwtForUserId(user.id)

    const html = oauthResultHTML({ source:'oauth-google', status:'ok', token: jwt })
    res.status(200).send(html)
  } catch (e) {
    const html = oauthResultHTML({
      source: 'oauth-google',
      status: 'error',
      message: e.message || 'OAuth error'
    })
    res.status(200).send(html)
  }
})

export default router
