import { useEffect, useState, useCallback } from 'react'
import { jwtDecode } from 'jwt-decode'

export function useAuth() {
  const [token, setToken] = useState(()=> sessionStorage.getItem('id_token'))
  const [profile, setProfile] = useState(()=> token ? jwtDecode(token) : null)

  const loginWithToken = useCallback((t)=>{
    sessionStorage.setItem('id_token', t)
    setToken(t)
    try { setProfile(jwtDecode(t)) } catch { setProfile(null) }
  }, [])

  const logout = useCallback(()=>{
    sessionStorage.removeItem('id_token')
    setToken(null)
    setProfile(null)
    window.location.href = '/signin'
  }, [])

  useEffect(()=>{
    if (token) {
      try { setProfile(jwtDecode(token)) } catch { logout() }
    }
  }, [token, logout])

  return { token, profile, isAuthed: !!token, loginWithToken, logout }
}
