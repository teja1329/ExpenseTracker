import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth.jsx'
import { apiClient } from '../lib/api.js'
import { useEffect, useRef, useState, useMemo } from 'react'
import { useToast } from '../components/Toast.jsx'
import { PageFade, CardRise, Tap } from '../components/motion.jsx'
import { motion, AnimatePresence } from 'framer-motion'

const normalizeName = (s = '') => s.trim().replace(/\s+/g, ' ')

const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || 'http://localhost:8081'

function Section({ title, children }) {
  return (
    <CardRise>
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm ring-1 ring-slate-100 space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </CardRise>
  )
}

export default function Profile() {
  const { token } = useAuth()
  const api = apiClient(() => token)
  const qc = useQueryClient()
  const toast = useToast()

  // base queries
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get('/profile')).data,
    enabled: !!token,
  })

  

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
    enabled: !!token,
  })

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => (await api.get('/budgets')).data,
    enabled: !!token,
  })

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => (await api.get('/goals')).data,
    enabled: !!token,
  })
  // ---------- ACCOUNT ----------
  const [form, setForm] = useState({ displayName: '', monthlyIncome: '', currency: 'INR' })
  useEffect(() => {
    if (!profile) return
    setForm({
      displayName: profile.displayName || '',
      monthlyIncome: profile.monthlyIncome ?? '',
      currency: (profile.currency || 'INR').toUpperCase()
    })
  }, [profile])

  const saveProfile = useMutation({
    mutationFn: async (payload) => (await api.put('/profile', payload)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.success('Profile saved') },
    onError: () => toast.error('Failed to save profile')
  })

  // avatar
  const fileRef = useRef(null)
  const [avatarBust, setAvatarBust] = useState(0)
  const avatarUrl = useMemo(() => {
    if (profile?.avatarUrl) return `${profile.avatarUrl}?t=${avatarBust}`
    if (profile?.avatar?.startsWith('/uploads/')) return `${BACKEND_ORIGIN}${profile.avatar}?t=${avatarBust}`
    return '/placeholder-avatar.png'
  }, [profile, avatarBust])

  async function uploadAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${BACKEND_ORIGIN}/api/profile/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
    if (!res.ok) { toast.error('Avatar upload failed'); return }
    await qc.invalidateQueries({ queryKey: ['profile'] })
    setAvatarBust(Date.now())
    window.dispatchEvent(new CustomEvent('avatar:updated'))
    toast.success('Avatar updated')
  }

  // change password
  const [pass, setPass] = useState({ current: '', next: '', confirm: '' })
  const changePwd = useMutation({
    mutationFn: async (p) => (await api.post('/auth/password', p)).data,
    onSuccess: () => { setPass({ current: '', next: '', confirm: '' }); toast.success('Password changed') },
    onError: (e) => toast.error(e?.response?.data?.error === 'bad_current' ? 'Current password is wrong' : 'Could not change password')
  })

  function submitProfile(e) {
    e.preventDefault()
    const name = String(form.displayName || '').trim()
    const income = Number(form.monthlyIncome)
    const curr = String(form.currency || '').trim().toUpperCase()
    if (!name) return toast.error('Name required')
    if (!Number.isFinite(income) || income <= 0) return toast.error('Income must be > 0')
    if (!/^[A-Z]{3}$/.test(curr)) return toast.error('Currency must be 3 letters')
    saveProfile.mutate({ displayName: name, monthlyIncome: income, currency: curr })
  }
  function submitPassword(e) {
    e.preventDefault()
    if (!pass.current || !pass.next) return toast.error('Enter current & new password')
    if (pass.next.length < 8) return toast.error('New password must be ≥ 8 chars')
    if (pass.next !== pass.confirm) return toast.error('Passwords do not match')
    changePwd.mutate({ current: pass.current, next: pass.next })
  }


  const [newCat, setNewCat] = useState({ name: '', amount: '' })


  const addCategory = useMutation({
    mutationFn: async ({ name, amount }) => {
      const n = normalizeName(name)
  
      // Frontend check: do we already have this name?
      const existing = (categories || []).find(
        c => String(c.name).toLowerCase() === n.toLowerCase()
      )
  
      let categoryId
  
      if (existing) {
        // Already exists -> just set budget if provided
        categoryId = existing.id
        if (amount && Number(amount) > 0) {
          await api.put(`/budgets/${categoryId}`, { amount: Number(amount) })
        }
        return { id: categoryId, name: existing.name, reused: true }
      }
  
      // Create new category
      try {
        const created = (await api.post('/categories', { name: n })).data
        categoryId = created.id
  
        if (amount && Number(amount) > 0) {
          await api.put(`/budgets/${categoryId}`, { amount: Number(amount) })
        }
        return created
      } catch (e) {
        // If backend still says 409 due to race, reuse that existing one
        if (e?.response?.status === 409) {
          const again = (await api.get('/categories')).data
          const found = (again || []).find(
            c => String(c.name).toLowerCase() === n.toLowerCase()
          )
          if (found) {
            if (amount && Number(amount) > 0) {
              await api.put(`/budgets/${found.id}`, { amount: Number(amount) })
            }
            return { id: found.id, name: found.name, reused: true }
          }
        }
        throw e
      }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
      if (res?.reused) {
        toast.success('Category already existed — budget updated')
      } else {
        toast.success('Category added')
      }
      setNewCat({ name: '', amount: '' })
    },
    onError: (e) => {
      const msg = e?.response?.data?.error
      if (msg === 'category_exists') {
        toast.error('That category already exists')
      } else {
        toast.error('Could not add category')
      }
    }
  })
  
  

  // ---------- BUDGETS ----------
  const upsertBudget = useMutation({
    mutationFn: async ({ categoryId, amount }) => (await api.post('/budgets', { categoryId, amount })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); toast.success('Budget saved') },
    onError: () => toast.error('Failed to save budget')
  })
  const deleteBudget = useMutation({
    mutationFn: async (categoryId) => (await api.delete(`/budgets/${categoryId}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); toast.success('Budget removed') },
    onError: () => toast.error('Failed to remove budget')
  })

  // map budgets by category
  const budgetMap = useMemo(() => Object.fromEntries(budgets.map(b => [b.categoryId, b])), [budgets])

  // ---------- GOALS ----------
  const addGoal = useMutation({
    mutationFn: async (payload) => (await api.post('/goals', payload)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast.success('Goal added') },
    onError: () => toast.error('Failed to add goal')
  })
  const updateGoal = useMutation({
    mutationFn: async ({ id, ...rest }) => (await api.put(`/goals/${id}`, rest)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast.success('Goal updated') },
    onError: () => toast.error('Failed to update goal')
  })
  const deleteGoal = useMutation({
    mutationFn: async (id) => (await api.delete(`/goals/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast.success('Goal deleted') },
    onError: () => toast.error('Failed to delete goal')
  })

  return (
    <PageFade>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">Profile</span>
          </h1>
          <p className="text-slate-600 mt-1">Manage your account, preferences, budgets & goals</p>
        </div>

        {/* ACCOUNT */}
        <Section title="Account">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="relative w-20 h-20 rounded-full overflow-hidden shadow-md ring-2 ring-transparent avatar-ring">
                <img src={avatarUrl} className="w-full h-full object-cover bg-gray-200" />
              </div>
              <span className="absolute right-0 bottom-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>

            <div>
              <Tap>
                <button className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-50"
                        onClick={()=>fileRef.current?.click()}>Upload Avatar</button>
              </Tap>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              <div className="text-xs text-slate-500 mt-1">PNG/JPG up to ~5MB. Square looks best.</div>
            </div>
          </div>

          <form onSubmit={submitProfile} className="grid md:grid-cols-2 gap-4 pt-2" noValidate>
            <label className="block">
              <span className="text-sm text-slate-600">Full name</span>
              <input className="w-full border rounded-lg p-2 mt-1 border-slate-300 focus:ring-2 focus:ring-blue-500/30"
                     value={form.displayName} onChange={e=>setForm(f=>({...f, displayName:e.target.value}))}/>
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Monthly income</span>
              <input type="number" min="0.01" step="0.01"
                     className="w-full border rounded-lg p-2 mt-1 border-slate-300 focus:ring-2 focus:ring-blue-500/30"
                     value={form.monthlyIncome} onChange={e=>setForm(f=>({...f, monthlyIncome:e.target.value}))}/>
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm text-slate-600">Currency (3-letter)</span>
              <input className="w-full border rounded-lg p-2 mt-1 border-slate-300 focus:ring-2 focus:ring-blue-500/30 uppercase tracking-widest"
                     maxLength={3}
                     value={form.currency} onChange={e=>setForm(f=>({...f, currency:e.target.value.toUpperCase()}))}/>
            </label>
            <Tap><button className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl shadow-sm">Save profile</button></Tap>
          </form>

          {/* change password */}
          <div className="pt-3">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Change password</h3>
            <form onSubmit={submitPassword} className="grid md:grid-cols-3 gap-3" noValidate>
              <input type="password" className="border rounded-lg p-2 border-slate-300" placeholder="Current"
                     value={pass.current} onChange={e=>setPass(p=>({...p, current:e.target.value}))}/>
              <input type="password" className="border rounded-lg p-2 border-slate-300" placeholder="New (≥ 8 chars)"
                     value={pass.next} onChange={e=>setPass(p=>({...p, next:e.target.value}))}/>
              <input type="password" className="border rounded-lg p-2 border-slate-300" placeholder="Confirm"
                     value={pass.confirm} onChange={e=>setPass(p=>({...p, confirm:e.target.value}))}/>
              <div className="md:col-span-3">
                <Tap><button className="px-4 py-2 bg-slate-900 text-white rounded-xl">Update password</button></Tap>
              </div>
            </form>
          </div>
        </Section>

      

        {/* Per-category budgets */}
        <CardRise>
          <div className="bg-white p-5 rounded-2xl shadow-sm ring-1 ring-slate-100">
            <h3 className="text-lg font-semibold">Per-category budgets</h3>
            <p className="text-sm text-gray-500 mb-4">Set a monthly cap for each category.</p>

           {/* Add Category inline form */}
<div className="mb-5 p-3 rounded-xl border border-slate-200 bg-slate-50">
  <div className="grid md:grid-cols-3 gap-3 items-center">
    <input
      className="border rounded-lg p-2 w-full"
      placeholder="New category name"
      value={newCat.name}
      onChange={(e)=>setNewCat(c=>({...c, name:e.target.value}))}
    />

    <input
      className="border rounded-lg p-2 w-full"
      type="number"
      min="0"
      step="0.01"
      placeholder="Initial monthly budget (optional)"
      value={newCat.amount}
      onChange={(e)=>setNewCat(c=>({...c, amount:e.target.value}))}
    />

    <button
      className="justify-self-start md:justify-self-end inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
      disabled={addCategory.isLoading}
     onClick={()=>{
  const name = normalizeName(newCat.name || '')
  if (!name) { toast.error('Please enter a category name'); return }
  addCategory.mutate({ name, amount: newCat.amount })
}}

    >
      {addCategory.isLoading ? 'Adding…' : 'Add category'}
    </button>
  </div>
</div>


            {/* Budgets table */}
            {/* Budgets list (scrollable) */}
<div className="rounded-xl ring-1 ring-slate-200 bg-white max-h-72 overflow-y-auto shadow-sm">
  <table className="w-full text-sm">
    <thead className="sticky top-0 bg-slate-50 text-left text-gray-600 z-10 shadow-sm">
      <tr>
        <th className="px-4 py-2">Category</th>
        <th className="px-4 py-2">Monthly budget</th>
        <th className="px-4 py-2 w-40">Actions</th>
      </tr>
    </thead>
    <tbody className="divide-y">
      {budgets.map(b => (
        <BudgetRow key={b.categoryId} row={b} api={api} qc={qc} toast={toast} />
      ))}
    </tbody>
  </table>
</div>

          </div>
        </CardRise>


        <Section title="Savings goals">
  <GoalEditor onAdd={(g) => addGoal.mutate(g)} />

  {/* Scrollable goals container */}
  <div className="max-h-72 overflow-y-auto divide-y rounded-xl ring-1 ring-slate-200 bg-white shadow-sm mt-3">
    {goals.map((g) => (
      <GoalRow
        key={g.id}
        goal={g}
        onSave={(data) => updateGoal.mutate({ id: g.id, ...data })}
        onDelete={() => deleteGoal.mutate(g.id)}
      />
    ))}
    {goals.length === 0 && (
      <div className="text-slate-500 text-sm p-3 text-center">No goals yet.</div>
    )}
  </div>
</Section>


        {/* DANGER ZONE */}
        <Section title="Danger zone">
          <DangerZone />
        </Section>
      </div>
    </PageFade>
  )
}

// ---------- small subcomponents ----------

function BudgetRow({ row, api, qc, toast }) {
  const [val, setVal] = useState(row.amount || 0)

  const save = async () => {
    try {
      await api.put(`/budgets/${row.categoryId}`, { amount: Number(val || 0) })
      qc.invalidateQueries({ queryKey: ['budgets'] })
      toast.success('Budget saved')
    } catch {
      toast.error('Failed to save budget')
    }
  }

  // 🔴 Delete the whole category (and its budget row, server handles both)
  const removeCategory = async () => {
    if (!confirm(`Delete category “${row.categoryName}”? This keeps your past expenses but unassigns them.`)) return
    try {
      await api.delete(`/categories/${row.categoryId}`)
      // refresh category list + budgets (dashboard widgets will also pick this up)
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
      toast.success('Category deleted')
    } catch {
      toast.error('Failed to delete category')
    }
  }

  return (
    <tr>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {row.color && <span className="h-3 w-3 rounded-full" style={{ background: row.color }} />}
          <span>{row.categoryName}</span>
        </div>
      </td>

      <td className="px-4 py-2">
        <input
          type="number"
          min="0"
          step="0.01"
          className="border rounded-lg p-2 w-40"
          value={val}
          onChange={(e)=>setVal(e.target.value)}
        />
      </td>

      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={save}
            title="Update budget amount"
          >
            Save
          </button>

          {/* Trash button */}
          <button
            onClick={removeCategory}
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
            title="Delete category"
          >
            {/* simple trash icon (heroicons-like) */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
              <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1zm-3 6h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9z"/>
            </svg>
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}

function GoalEditor({ onAdd }) {
  const [f,setF] = useState({ name:'', targetAmount:'', targetDate:'' })
  return (
    <form className="flex flex-wrap items-end gap-3 mb-3" onSubmit={(e)=>{e.preventDefault(); if(!f.name||Number(f.targetAmount)<=0) return; onAdd({ name:f.name, targetAmount:Number(f.targetAmount), targetDate:f.targetDate||null }); setF({name:'',targetAmount:'',targetDate:''})}}>
      <label className="block">
        <div className="text-sm text-slate-600">Goal</div>
        <input className="border rounded-lg p-2 w-56" value={f.name} onChange={e=>setF(s=>({...s, name:e.target.value}))}/>
      </label>
      <label className="block">
        <div className="text-sm text-slate-600">Target amount</div>
        <input type="number" min="0.01" step="0.01" className="border rounded-lg p-2 w-40"
               value={f.targetAmount} onChange={e=>setF(s=>({...s, targetAmount:e.target.value}))}/>
      </label>
      <label className="block">
        <div className="text-sm text-slate-600">Target date</div>
        <input type="date" className="border rounded-lg p-2" value={f.targetDate} onChange={e=>setF(s=>({...s, targetDate:e.target.value}))}/>
      </label>
      <Tap><button className="px-3 py-2 bg-blue-600 text-white rounded-lg">Add goal</button></Tap>
    </form>
  )
}

function GoalRow({ goal, onSave, onDelete }) {
  const [g,setG] = useState(goal)
  useEffect(()=>setG(goal),[goal])
  return (
    <div className="py-3 flex flex-wrap items-center gap-3">
      <input className="border rounded-lg p-2 w-56" value={g.name} onChange={e=>setG(s=>({...s, name:e.target.value}))}/>
      <input type="number" min="0.01" step="0.01" className="border rounded-lg p-2 w-40"
             value={g.targetAmount} onChange={e=>setG(s=>({...s, targetAmount:e.target.value}))}/>
      <input type="date" className="border rounded-lg p-2"
             value={g.targetDate || ''} onChange={e=>setG(s=>({...s, targetDate:e.target.value}))}/>
      <div className="ml-auto flex gap-2">
        <button className="px-3 py-2 bg-emerald-600 text-white rounded-lg" onClick={()=>onSave({ name:g.name, targetAmount:Number(g.targetAmount||0), targetDate:g.targetDate||null })}>Save</button>
        <button className="px-3 py-2 bg-rose-50 text-rose-600 rounded-lg" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

function DangerZone() {
  async function deleteAccount() {
    const v = prompt('Type DELETE to confirm account deletion:')
    if (v !== 'DELETE') return
    alert('Stub: implement /api/account/delete on backend when ready.')
  }
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="font-semibold text-rose-700 mb-1">Delete account</div>
      <p className="text-sm text-rose-600 mb-3">This removes all your data permanently.</p>
      <Tap><button className="px-3 py-2 bg-rose-600 text-white rounded-lg" onClick={deleteAccount}>Delete my account</button></Tap>
    </div>
  )
}
