import axios from 'axios'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081/api'

export function apiClient(getToken) {
  const instance = axios.create({ baseURL: API_BASE })
  instance.interceptors.request.use((cfg)=>{
    const t = getToken?.()
    if (t) cfg.headers['Authorization'] = `Bearer ${t}`
    return cfg
  })
  return instance
}
