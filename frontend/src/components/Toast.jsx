import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  function push(type, message, opts = {}) {
    const id = crypto.randomUUID()
    const ttl = opts.ttl ?? 3000
    setToasts(t => [...t, { id, type, message }])
    // auto-dismiss
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl)
  }

  const api = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  }), [])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={
                'px-4 py-2 rounded-xl shadow text-white backdrop-blur ' +
                (t.type === 'success' ? 'bg-emerald-600/90' :
                 t.type === 'error'   ? 'bg-rose-600/90'    :
                                        'bg-blue-600/90')
              }
              
            role="status"
            aria-live="polite"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
