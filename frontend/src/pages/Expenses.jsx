// src/pages/Expenses.jsx
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth.jsx'
import { apiClient } from '../lib/api.js'
import { useToast } from '../components/Toast.jsx'
import { PageFade, CardRise, Tap } from '../components/motion.jsx'
import { motion, AnimatePresence } from 'framer-motion'

export default function Expenses() {
  const { token } = useAuth()
  const api = apiClient(()=>token)
  const qc = useQueryClient()
  const toast = useToast()

  // list shows last 30 days (you can widen if you want)
 // ---- Range state (default = last 30d). We’ll also keep a month anchor for auto-switching.
const [rangeMode, setRangeMode] = useState('30d')         // '30d' | 'month' | 'custom' (custom unused here)
const [monthAnchor, setMonthAnchor] = useState(new Date()) // used when rangeMode==='month'

// Utility to format YYYY-MM-DD
// Safe local YYYY-MM-DD (no UTC shift)
const ymdLocal = (d) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
const lastOfMonth  = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

// Compute active window from state (default: last 30 days)
const { from, to } = useMemo(() => {
  if (rangeMode === 'month') {
    const f = firstOfMonth(monthAnchor)
    const t = lastOfMonth(monthAnchor)
    return { from: ymdLocal(f), to: ymdLocal(t) }
  }
  const t = new Date()
  const f = new Date(t)
  f.setDate(t.getDate() - 29) // 30-day window inclusive
  return { from: ymdLocal(f), to: ymdLocal(t) }
}, [rangeMode, monthAnchor])

  
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async ()=> (await api.get('/categories')).data,
    enabled: !!token,
  })

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', 'list', from, to],
    queryFn: async ()=> (await api.get('/expenses', { params: { from, to, limit: 200 } })).data,
    enabled: !!token,
  })
  
  

  // ---------- Add form ----------
  const [form, setForm] = useState({
    amount: '',
    date: to,                 // <-- safe local YYYY-MM-DD from the memo above
    selectedCategoryId: '',
    newCategoryName: '',
    note: ''
  })
  
  const [errors, setErrors] = useState({ amount: '', date: '', general: '' })

  function validate() {
    const e = { amount: '', date: '', general: '' }
    const amt = Number(form.amount)
    if (!form.amount || Number.isNaN(amt)) e.amount = 'Amount is required'
    else if (amt <= 0) e.amount = 'Amount must be greater than 0'
    if (!form.date) e.date = 'Date is required'
    setErrors(e)
    return !e.amount && !e.date
  }

  const createCategory = useMutation({
    mutationFn: async (name) => (await api.post('/categories', { name })).data,
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['categories'] })
  })

  const createExpense = useMutation({
    mutationFn: async ({ amount, date, selectedCategoryId, newCategoryName, note }) => {
      let categoryId = selectedCategoryId || null
      if (!categoryId && newCategoryName.trim()) {
        const c = await createCategory.mutateAsync(newCategoryName.trim())
        categoryId = c.id
      }
      return api.post('/expenses', {
        amount: Number(amount),
        incurredOn: date,     // ✅ camelCase matches backend schema
        categoryId,           // can be null
        note
      })
    },
   // CREATE
onSuccess: () => {
  const addedDate = new Date(form.date)
  const inWindow = (form.date >= from && form.date <= to)
  if (!inWindow) {
    setRangeMode('month')
    setMonthAnchor(addedDate)
  }

  // Invalidate ALL expenses queries to avoid stale caches
  qc.invalidateQueries({ queryKey: ['expenses'], exact: false })

  // Reset form (default to current 'to')
  setForm({ amount:'', date: to, selectedCategoryId:'', newCategoryName:'', note:'' })
  setErrors({ amount:'', date:'', general:'' })
  toast.success('Expense added')
},

    onError: (err) => {
      const data = err?.response?.data
      if (data?.error === 'invalid_input') {
        const first = data?.details?.fieldErrors && Object.values(data.details.fieldErrors)[0]?.[0]
        setErrors((e)=>({ ...e, general: first || 'Please check your input.' }))
      } else {
        setErrors((e)=>({ ...e, general: 'Could not add expense. Try again.' }))
      }
      toast.error('Could not add expense')
    }
  })
  
  

  function submit(e) {
    e.preventDefault()
    setErrors({ amount:'', date:'', general:'' })
    if (!validate()) { toast.error('Please fix form errors'); return }
    createExpense.mutate(form)
  }

  // ---------- Edit / Delete ----------
  const [editId, setEditId] = useState(null)
  const current = useMemo(() => expenses.find(e => e.id === editId) || null, [editId, expenses])
  const [editForm, setEditForm] = useState({ amount:'', incurredOn:'', categoryId:'', note:'' })

  function openEdit(exp) {
    setEditId(exp.id)
    setEditForm({
      amount: String(exp.amount ?? ''),
      incurredOn: exp.incurred_on,
      categoryId: exp.category_id || '',
      note: exp.note || ''
    })
  }
  function closeEdit() { setEditId(null) }

  const updateExpense = useMutation({
    mutationFn: async ({ id, patch }) => {
      const body = {
        amount: patch.amount ? Number(patch.amount) : undefined,
        incurredOn: patch.incurredOn || undefined,  // ✅ camelCase
        categoryId: patch.categoryId !== '' ? patch.categoryId : null,
        note: patch.note ?? undefined
      }
      return (await api.put(`/expenses/${id}`, body)).data
    },
    // UPDATE
onSuccess: () => {
  const changedDateStr = editForm.incurredOn
  if (changedDateStr) {
    const inWindow = (changedDateStr >= from && changedDateStr <= to)
    if (!inWindow) {
      setRangeMode('month')
      setMonthAnchor(new Date(changedDateStr))
    }
  }

  qc.invalidateQueries({ queryKey: ['expenses'], exact: false })
  toast.success('Expense updated')
  closeEdit()
},

    onError: () => toast.error('Could not update expense')
  })
  

  const deleteExpense = useMutation({
    mutationFn: async (id) => (await api.delete(`/expenses/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses','list',from,to] })
      qc.invalidateQueries({ queryKey: ['expenses','30d'] })
      toast.success('Expense deleted')
      if (editId) closeEdit()
    },
    onError: () => toast.error('Could not delete expense')
  })

  return (
    <PageFade>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Add */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Add Expense</h2>

          {errors.general && <div className="mb-2 text-sm text-rose-600">{errors.general}</div>}

          <CardRise>
            <form onSubmit={submit} className="space-y-3 bg-white p-4 rounded-2xl shadow-sm ring-1 ring-slate-100" noValidate>
              <div>
                <input
                  className="w-full border rounded p-2"
                  placeholder="Amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={e=>setForm(f=>({...f, amount:e.target.value}))}
                  required
                />
                {errors.amount && <div className="text-xs text-rose-600 mt-1">{errors.amount}</div>}
              </div>

              <div>
                <input
                  className="w-full border rounded p-2"
                  type="date"
                  value={form.date}
                  onChange={e=>setForm(f=>({...f, date:e.target.value}))}
                  required
                />
                {errors.date && <div className="text-xs text-rose-600 mt-1">{errors.date}</div>}
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">Choose existing category</div>
                <select
                  className="w-full border rounded p-2 bg-white"
                  value={form.selectedCategoryId}
                  onChange={e=>setForm(f=>({...f, selectedCategoryId:e.target.value}))}
                >
                  <option value="">-- None --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm text-gray-600 mb-1">Or add new category</div>
                <input
                  className="w-full border rounded p-2"
                  placeholder="e.g., Groceries"
                  value={form.newCategoryName}
                  onChange={e=>setForm(f=>({...f, newCategoryName:e.target.value}))}
                />
                <div className="text-xs text-gray-500 mt-1">
                  If you enter a new name here, it will be created automatically.
                </div>
              </div>

              <input
                className="w-full border rounded p-2"
                placeholder="Note"
                value={form.note}
                onChange={e=>setForm(f=>({...f, note:e.target.value}))}
              />

              <Tap>
                <button
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-sm hover:shadow
                  disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={createExpense.isLoading}
                >
                  {createExpense.isLoading ? 'Adding…' : 'Add'}
                </button>
              </Tap>
            </form>
          </CardRise>
        </div>

        {/* List */}
        <CardRise delay={.05}>
          <div className="lg:sticky lg:top-24">
            <h2 className="text-xl font-semibold mb-3">Recent Expenses</h2>

            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 divide-y
                            max-h-[65vh] overflow-y-auto pr-2 custom-scroll">
              {expenses.map(e => (
                <div key={e.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">₹{Number(e.amount).toFixed(2)}</div>
                      <div className="text-sm text-gray-500">
                        {e.incurred_on} • {e.category_name || 'Uncategorized'}
                        {e.planned ? <span className="ml-2 text-xs text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">planned</span> : null}
                      </div>
                      {e.note && <div className="text-sm mt-0.5">{e.note}</div>}
                    </div>

                    {/* actions */}
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm"
                        onClick={()=>openEdit(e)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-sm"
                        onClick={()=>{
                          if (confirm('Delete this expense?')) deleteExpense.mutate(e.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Inline editor */}
                  <AnimatePresence initial={false}>
                    {editId === e.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-3 overflow-hidden"
                      >
                        <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                          <div className="grid sm:grid-cols-4 gap-3">
                            <input
                              className="border rounded p-2"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editForm.amount}
                              onChange={e=>setEditForm(f=>({...f, amount:e.target.value}))}
                              placeholder="Amount"
                            />
                            <input
                              className="border rounded p-2"
                              type="date"
                              value={editForm.incurredOn}
                              onChange={e=>setEditForm(f=>({...f, incurredOn:e.target.value}))}
                            />
                            <select
                              className="border rounded p-2 bg-white"
                              value={editForm.categoryId}
                              onChange={e=>setEditForm(f=>({...f, categoryId:e.target.value}))}
                            >
                              <option value="">-- None --</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <input
                              className="border rounded p-2 sm:col-span-4"
                              placeholder="Note"
                              value={editForm.note}
                              onChange={e=>setEditForm(f=>({...f, note:e.target.value}))}
                            />
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={()=>{
                                const patch = {
                                  amount: editForm.amount ? Number(editForm.amount) : undefined,
                                  incurredOn: editForm.incurredOn || undefined,
                                  categoryId: editForm.categoryId || null,
                                  note: editForm.note ?? ''
                                }
                                updateExpense.mutate({ id: e.id, patch })
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300"
                              onClick={closeEdit}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {expenses.length === 0 && (
                <div className="p-4 text-gray-500">No expenses yet.</div>
              )}
            </div>
          </div>
        </CardRise>
      </div>
    </PageFade>
  )
}
