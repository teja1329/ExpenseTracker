import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth.jsx'
import { apiClient } from '../lib/api.js'
import { useMemo, useEffect, useRef, useState } from 'react'
import { PageFade, CardRise } from '../components/motion.jsx'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts'
import { motion, animate, useMotionValue, AnimatePresence } from 'framer-motion'


const COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#E91E63', '#3F51B5', '#009688', '#FFC107',
  '#8BC34A', '#CDDC39', '#00BCD4', '#9C27B0', '#795548',
]
// Map 0..100 -> HSL (120=green → 0=red)

function spentBarColor(pct) {
  // pct = % of budget spent
  if (pct <= 60) return '#22c55e';     // green
  if (pct <= 90) return '#f59e0b';     // amber
  return '#ef4444';                    // red
}
function pctToColor(p) {
  const clamped = Math.max(0, Math.min(100, p))
  const hue = 120 - (clamped * 1.2)        // 0% => 120, 100% => ~0
  return `hsl(${hue} 85% 45%)`
}


function daysUntil(dateStr) {
  if (!dateStr) return null
  const end = new Date(dateStr + 'T23:59:59')
  const now = new Date()
  // normalize to dates (ignore time)
  const ms = new Date(end.getFullYear(), end.getMonth(), end.getDate()) -
             new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.ceil(ms / 86400000) // days
}
function daysBadgeClass(d) {
  if (d === null) return 'bg-slate-100 text-slate-600'
  if (d < 0) return 'bg-rose-100 text-rose-700'
  if (d <= 7) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}
function daysLabel(d) {
  if (d === null) return 'No target date'
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d)===1?'':'s'} overdue`
  if (d === 0) return 'Due today'
  return `${d} day${d===1?'':'s'} left`
}

// Animated number
function CountUp({ value, decimals = 0 }) {
  const mv = useMotionValue(0)
  const out = useRef(null)
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: 'easeOut' })
    return () => controls.stop()
  }, [value])
  useEffect(() => {
    const unsub = mv.on('change', v => { if (out.current) out.current.textContent = Number(v).toFixed(decimals) })
    return () => unsub()
  }, [])
  return <span ref={out}>0</span>
}
// ===== Trends helpers (single, safe block) =====
// -------- Trend helpers (fixed buckets) --------
// -------- Trend helpers (monthly = 1st, weekly = 4 buckets of current month, daily = current week) --------

/// ===== Trend helpers (cursor-aware, fixed buckets) =====
const moneyTick = (val, currency) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(val);


// ===== Trend helpers (12 months / 4 weeks-of-month / 7 days-of-week; expenses only) =====
function pad2(n){ return String(n).padStart(2,'0') }
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function addMonths(d, n){ const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x }
function mondayOfWeek(d){
  const day = d.getDay();                 // 0=Sun ... 1=Mon
  const diff = (day === 0 ? -6 : 1 - day);
  return startOfDay(addDays(d, diff));
}
function sundayOfWeek(d){ return startOfDay(addDays(mondayOfWeek(d), 6)) }

// 12 calendar months ending at cursor's month, each starting on the 1st
function buildMonthlyBuckets12(cursor) {
  const lastMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const buckets = [];
  for (let i = 11; i >= 0; i--) {
    const first = addMonths(lastMonth, -i);
    const end   = endOfMonth(first);
    buckets.push({
      key:   `${first.getFullYear()}-${pad2(first.getMonth()+1)}`,
      label: first.toLocaleString(undefined, { month: 'short', year: '2-digit' }), // "Oct 25"
      spent: 0,
      _start: startOfDay(first),
      _end:   startOfDay(end),
    });
  }
  return buckets;
}

// 4 fixed weeks (1–7, 8–14, 15–21, 22–end) of the cursor's month
function buildWeeklyBucketsOfMonth(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last  = endOfMonth(first);
  const ranges = [
    { s: new Date(first.getFullYear(), first.getMonth(),  1), e: new Date(first.getFullYear(), first.getMonth(),  7) },
    { s: new Date(first.getFullYear(), first.getMonth(),  8), e: new Date(first.getFullYear(), first.getMonth(), 14) },
    { s: new Date(first.getFullYear(), first.getMonth(), 15), e: new Date(first.getFullYear(), first.getMonth(), 21) },
    { s: new Date(first.getFullYear(), first.getMonth(), 22), e: last },
  ];
  return ranges.map((r, i) => {
    const s = r.s, e = r.e;
    const label = `W${i+1} (${s.toLocaleDateString(undefined,{month:'short',day:'numeric'})}–${e.toLocaleDateString(undefined,{month:'short',day:'numeric'})})`;
    return {
      key: `W${i+1}`,
      label,
      spent: 0,
      _start: startOfDay(s),
      _end:   startOfDay(e),
    };
  });
}

// Strict Mon–Sun week of the cursor (always 7 days)
function buildDailyBucketsForWeek(cursor) {
  const cur = startOfDay(cursor);
  const mon = mondayOfWeek(cur);
  const sun = sundayOfWeek(cur);

  const buckets = [];
  let d = mon;
  while (d <= sun) {
    buckets.push({
      key:   `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`,
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), // "Mon, Oct 28"
      spent: 0,
      _start: d,
      _end:   d,
    });
    d = startOfDay(addDays(d, 1));
  }
  return buckets;
}

/**
 * Build data for chart based on mode + cursor.
 * - monthly: last 12 months (1st..end), expenses only
 * - weekly:  4 fixed ranges of the cursor's month, expenses only
 * - daily:   Mon–Sun week of cursor, expenses only
 */
function makeTrendData(expenses = [], mode = 'monthly', cursor = new Date()) {
  let buckets;
  if (mode === 'monthly')      buckets = buildMonthlyBuckets12(cursor);
  else if (mode === 'weekly')  buckets = buildWeeklyBucketsOfMonth(cursor);
  else                         buckets = buildDailyBucketsForWeek(cursor);

  // Aggregate into the prebuilt buckets
  for (const e of expenses || []) {
    const raw = e.incurred_on || e.incurredOn || e.date;
    const amt = Math.max(0, Number(e.amount || 0));
    if (!raw || !amt) continue;
    const d = startOfDay(new Date(raw));
    if (Number.isNaN(d.getTime())) continue;

    for (const b of buckets) {
      if (d >= b._start && d <= b._end) {
        b.spent += amt;
        break;
      }
    }
  }

  // Return only label + spent (no budgets)
  return buckets.map(b => ({ label: b.label, spent: b.spent }));
}


function GlowStatCard({ label, valueNumber = 0, valueText, tone = 'neutral', delay = 0, icon = '💡' }) {
  // tone colors
  const cfg = {
    good:   { from: 'from-emerald-400/70', to: 'to-teal-500/70',  bg: 'bg-emerald-50/60', ring: 'ring-emerald-100' },
    bad:    { from: 'from-rose-400/70',    to: 'to-orange-500/70', bg: 'bg-rose-50/60',    ring: 'ring-rose-100' },
    neutral:{ from: 'from-indigo-400/70',  to: 'to-fuchsia-500/70', bg: 'bg-white',         ring: 'ring-slate-100' },
  }[tone || 'neutral']

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: .98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: .35, ease: 'easeOut', delay }}
      whileHover={{ y: -2, scale: 1.01 }}
      className="relative"
    >
      {/* gradient border */}
      <div className={`rounded-2xl p-[1px] bg-gradient-to-r ${cfg.from} ${cfg.to}`}>
        <div className={`rounded-2xl ${cfg.bg} ring-1 ${cfg.ring} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </div>
          </div>

          <div className="mt-2 text-2xl font-semibold tracking-tight">
          {typeof valueNumber === 'number' && !valueText ? (
  <span className="tabular-nums">{fmtMoney(valueNumber, 'INR')}</span>
) : (
  valueText
)}

          </div>

          {/* soft glow on hover */}
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 0.06 }}
            transition={{ duration: .2 }}
            style={{ background: 'radial-gradient(600px 120px at 20% -20%, white, transparent 70%)' }}
          />
        </div>
      </div>
    </motion.div>
  )
}



export default function Dashboard() {
  const { token } = useAuth()
  const api = apiClient(() => token)

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get('/profile')).data,
    enabled: !!token
  })

  const from = getFrom()
  const to = getTo()
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', '30d'],
    queryFn: async () => (await api.get('/expenses', { params: { from, to } })).data,
    enabled: !!token
  })

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => (await api.get('/budgets')).data,
    enabled: !!token
  })

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => (await api.get('/goals')).data,
    enabled: !!token
  })

  const { chartData, totalSpent, categorySpent } = useMemo(() => {
    const totals = {}
    const catTotals = {}
    let sum = 0
    for (const e of expenses) {
      const name = e.category_name || 'Uncategorized'
      const id = e.category_id || 'none'
      const amt = Number(e.amount) || 0
      totals[name] = (totals[name] || 0) + amt
      catTotals[id] = (catTotals[id] || 0) + amt
      sum += amt
    }
    const data = Object.entries(totals).map(([name, total]) => ({ name, total }))
    return { chartData: data, totalSpent: sum, categorySpent: catTotals }
  }, [expenses])

  const income = Number(profile?.monthlyIncome || 0)
  const currency = (profile?.currency || 'INR').toUpperCase()
  const leftover = income - totalSpent
  const pct = income > 0 ? Math.min(100, Math.max(0, (totalSpent / income) * 100)) : 0
  const coloredData = chartData.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }))
  // view and mode
const [view, setView] = useState('pie')
         // 'chart' | 'trends'
const [trendMode, setTrendMode] = useState('monthly') // 'monthly' | 'weekly' | 'daily'
const [trendCursor, setTrendCursor] = useState(new Date()); // ⬅️ NEW

// Build trend data (memoized)
const trendData = useMemo(() => {
  return makeTrendData(expenses || [], trendMode, trendCursor);
}, [expenses, trendMode, trendCursor]);

  
  return (
    <PageFade>
      <div className="flex flex-col items-center w-full">
        <h2 className="text-2xl font-semibold mb-6 text-center">Last 30 Days Spending</h2>

       {/* Summary cards */}
{/* Summary cards */}
<div className="w-full max-w-5xl mx-auto grid md:grid-cols-3 gap-4 mb-6 px-4">
  {/* Monthly Income (neutral) */}
  <GlowStatCard
    delay={0.02}
    label="Monthly Income"
    icon="💰"
    // split value into number + text so it animates nicely
    valueNumber={income} // keeps format stable
    tone="neutral"
  />

<motion.div
  animate={leftover < 0 ? { scale: [1, 1.02, 1] } : {}}
  transition={leftover < 0 ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : {}}
>
  <GlowStatCard
    delay={0.06}
    label="Spent (30 days)"
    icon="🔥"
    valueText={fmtMoney(totalSpent, currency)}
    tone="bad"
  />
</motion.div>


  {/* Leftover / Over Budget — green if positive, red if overspent */}
  <GlowStatCard
    delay={0.10}
    label={leftover >= 0 ? 'Leftover' : 'Over Budget'}
    icon={leftover >= 0 ? '✅' : '⚠️'}
    valueText={fmtMoney(Math.abs(leftover), currency)}
    tone={leftover >= 0 ? 'good' : 'bad'}
  />
</div>


 {/* Budget usage (rounded, animated, with hover tooltip for spent) */}
<section className="w-full flex justify-center mb-7">
  <div className="w-full max-w-5xl px-4">
    {(() => {
      const tone        = pct < 60 ? 'good' : pct < 90 ? 'warn' : 'danger'
      const badgeColor  = pct < 60 ? '#16a34a' : pct < 90 ? '#f59e0b' : '#ef4444'
      const statusLabel = pct < 60 ? 'Safe' : pct < 90 ? 'Watch' : 'High'
      const remainingAmt = Math.max(0, income - totalSpent)

      return (
        <motion.div
          className="bg-white p-5 rounded-2xl shadow-sm ring-1 ring-slate-100"
          whileHover={{ scale: 1.005 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        >
          {/* header: left = title + Safe/Watch/High; right = Remaining */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-slate-700">Budget usage</div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  tone === 'good'
                    ? 'bg-emerald-100 text-emerald-700'
                    : tone === 'warn'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="text-xs text-slate-500">
              Remaining {fmtMoney(remainingAmt, currency)} of {fmtMoney(income, currency)}
            </div>
          </div>

          {/* rail + fill + % badge + spark + hover tooltip */}
          <div className="relative group">
           {/* rail */}
<div className="progress-rail rounded" />

{/* fill */}
<motion.div
  className={`progress-fill rounded ${tone}`}
  style={{ position: 'absolute', inset: 0, right: 'auto' }}
  initial={{ width: 0 }}
  animate={{ width: `${pct}%` }}
  transition={{ type: 'spring', stiffness: 140, damping: 18 }}
/>



{/* spark at the tip */}
<motion.div
  className="spark absolute top-1/2 -translate-y-1/2"
  initial={{ left: '0%' }}
  animate={{ left: `calc(${pct}% - 5px)` }}
  transition={{ type: 'spring', stiffness: 140, damping: 18 }}
/>

{/* HOVER TOOLTIP: shows spent amount + percentage */}
<div
  className="absolute -top-8 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200"
  style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
>
  <div className="bg-white text-gray-700 text-xs px-2.5 py-1 rounded-md shadow-sm ring-1 ring-slate-100 whitespace-nowrap flex items-center gap-2">
    <span>💰 Spent {fmtMoney(totalSpent, currency)}</span>
    <span className="text-slate-400">•</span>
    <span
      className={`font-semibold ${
        tone === 'good'
          ? 'text-emerald-600'
          : tone === 'warn'
          ? 'text-amber-600'
          : 'text-rose-600'
      }`}
    >
      {pct.toFixed(0)}%
    </span>
  </div>
</div>



          </div>
        </motion.div>
      )
    })()}
  </div>
</section>


{/* Savings Goals — animated rail + centered marker + signed % at fill tip */}
{goals?.length > 0 && (
  <section className="w-full flex justify-center mb-10">
    <div className="w-full max-w-5xl px-4">
      <CardRise>
        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-100">
          <h3 className="text-lg font-semibold mb-4">Savings Goals</h3>

          {goals.map((g) => {
            const incomeAmt = Math.max(0, Number(profile?.monthlyIncome || 0));
            const spentAmt  = Math.max(0, Number(totalSpent || 0));
            const remaining = Math.max(0, incomeAmt - spentAmt);

            const goalAmt   = Number(g.targetAmount || 0);

            // Rail math (remaining portion of income is the green fill)
            const fillPct   = incomeAmt > 0 ? Math.min(100, (remaining / incomeAmt) * 100) : 0;
            const goalPct   = incomeAmt > 0 ? Math.min(100, (goalAmt   / incomeAmt) * 100) : 0;

            // Signed % relative to the goal (0 at marker, + above goal, − below)
            const signedPct = goalAmt > 0 ? ((remaining - goalAmt) / goalAmt) * 100 : 0;
            const pctLabel  = `${signedPct >= 0 ? '+' : ''}${Math.round(signedPct)}%`;
            const pctColor  = signedPct >= 0 ? '#16a34a' : '#ef4444';

            const toGoal    = Math.max(0, goalAmt - remaining);
            const cushion   = Math.max(0, remaining - goalAmt);

            // Status logic
            const d          = daysUntil(g.targetDate);
            const usagePct   = incomeAmt > 0 ? (spentAmt / incomeAmt) * 100 : 0;
            const overBudget = usagePct >= 100;
            const onTrack    = remaining >= goalAmt;

            let status      = '';
            let statusColor = '';

            if (overBudget) {
              status = 'Over budget — goal missed';
              statusColor = 'text-rose-600';
            } else if (onTrack) {
              status = 'You’re in the safe zone';
              statusColor = 'text-emerald-600';
            } else if (d !== null && d < 0) {
              status = 'Goal missed — plan better next month';
              statusColor = 'text-rose-600';
            } else {
              status = 'Spending high — control expenses';
              statusColor = 'text-amber-600';
            }

            const tone =
              overBudget ? 'danger'
                : onTrack ? 'good'
                : 'warn';

            const badgeCls = daysBadgeClass(d);

            return (
              <motion.div
                key={g.id}
                className="mb-7 last:mb-0"
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {/* Header row */}
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{g.name}</div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${badgeCls}`}>
                      {daysLabel(d)}
                    </span>
                  </div>

                  {/* Right side: remaining amount toward goal */}
                  <div className="text-xs text-gray-500">
                    {onTrack
                      ? `Within Goal (+${fmtMoney(cushion, currency)})`
                      : `${fmtMoney(toGoal, currency)} remaining to reach goal`}
                  </div>
                </div>

                {/* Goal meta */}
                <div className="text-xs text-gray-500 mb-3">
                  Goal: {fmtMoney(goalAmt, currency)} ({goalPct.toFixed(0)}% of income)
                </div>

       {/* Animated rail + moving goal marker + shimmer fill */}
<div className="relative group pt-2 pb-2">
  {/* 1) The rail (keeps overflow hidden only for the fill) */}
  <div className="progress-rail relative overflow-hidden rounded">
    {/* Fill (animated, tone-aware) */}
    <motion.div
      className={`progress-fill ${tone === 'good' ? 'good' : tone === 'warn' ? 'warn' : 'danger'}`}
      style={{ position: 'absolute', inset: 0, right: 'auto' }}
      initial={{ width: 0 }}
      animate={{ width: `${fillPct}%` }}
      transition={{ type: 'spring', stiffness: 140, damping: 18, mass: 0.6 }}
    />


{/* spark at the tip */}
<motion.div
  className="spark absolute top-1/2 -translate-y-1/2"
  initial={{ left: '0%' }}
  animate={{ left: `calc(${fillPct}% - 5px)` }}
  transition={{ type: 'spring', stiffness: 140, damping: 18 }}
/>
    {/* Signed % badge that rides the tip */}
    <motion.div
      className="progress-badge--above"
      initial={{ left: '0%', opacity: 0, y: 6 }}
      animate={{ left: `calc(${fillPct}% - 18px)`, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 160, damping: 16 }}
      style={{ background: pctColor }}
      title={`${pctLabel} vs goal`}
    >
      {pctLabel}
    </motion.div>
  </div>

  {/* 2) Marker OVERLAY (outside the rail so it won't be clipped) */}
  <div
    className="absolute z-10"
    // position it at the middle line of the rail
    style={{
      left: `${goalPct}%`,
      top: '50%',
      transform: 'translate(-50%, -50%)'
    }}
    aria-label={`Goal marker at ${goalPct.toFixed(0)}% of income`}
  >
    {/* Use a local group for hover targeting */}
    <div className="relative group">
      {/* Marker bar */}
      <div className="w-[3px] h-[18px] rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.15)] pointer-events-none" />

      {/* Soft glow on hover */}
      <div className="pointer-events-none absolute -left-3 -right-3 -top-2 -bottom-2 rounded-full ring-0 ring-sky-400/0 transition-all duration-200 group-hover:ring-2 group-hover:ring-sky-400/40" />

      {/* Tooltip (appears when hovering near the marker) */}
      <div
        className="
          pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2
          bg-white text-gray-700 text-xs px-2 py-1 rounded-md shadow-sm ring-1 ring-slate-100 whitespace-nowrap
          opacity-0 translate-y-1 transition-all duration-200
          group-hover:opacity-100 group-hover:translate-y-0
        "
      >
        🎯 {fmtMoney(goalAmt, currency)} goal
        {d !== null && d >= 0 && (
          <span className="text-gray-400 ml-1">({daysLabel(d)})</span>
        )}
      </div>
    </div>
 


      </div>
        </div>

          {/* Status line (color-coded) */}
          <motion.div
            className={`text-xs font-medium ${statusColor}`}
              initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
                >
              {status}
                </motion.div>
              </motion.div>
            )
          })}
        </div>
      </CardRise>
    </div>
  </section>
)}




{/* Categories vs Trends */}
<section className="w-full">
  <div className="mx-auto px-4" style={{ width: 'min(100%, 1000px)' }}>
    <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-slate-100 overflow-hidden">

      {/* Header: title (left) + view switch (right) */}
<div className="flex items-center justify-between pb-2">
  <h3 className="text-base font-semibold text-slate-800">
    {view === 'trends' ? 'Watch your trends' : 'Graphical representation'}
  </h3>

  {/* Right side: toggle + (when trends) pager */}
  <div className="flex items-center gap-3">
    {/* Toggle pill */}
    <div className="bg-slate-100 rounded-full p-1 flex gap-1">
      <button
        onClick={()=>setView('pie')}
        className={`px-3 py-1 text-sm rounded-full transition ${
          view==='pie' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-800'
        }`}
      >
        Categories
      </button>
      <button
        onClick={()=>setView('trends')}
        className={`px-3 py-1 text-sm rounded-full transition ${
          view==='trends' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-800'
        }`}
      >
        Trends
      </button>
    </div>

    {/* Pager + label (only in trends) */}
    {view === 'trends' && (
      <div className="flex items-center gap-2">
        {/* Prev */}
        <button
          className="h-8 w-8 grid place-items-center rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50"
          onClick={()=>{
            if (trendMode==='monthly') setTrendCursor(c=>addMonths(c,-12));
            else if (trendMode==='weekly') setTrendCursor(c=>addMonths(c,-1));
            else setTrendCursor(c=>addDays(c,-7)); // daily
          }}
          title="Previous"
        >
          ‹
        </button>

        {/* Period label */}
        <div className="text-sm text-slate-700 min-w-[180px] text-center">
          {trendMode==='monthly' && (()=> {
            const end = new Date(trendCursor.getFullYear(), trendCursor.getMonth(), 1);
            const start = addMonths(end, -11);
            return `${start.toLocaleString(undefined,{month:'short',year:'2-digit'})} – ${end.toLocaleString(undefined,{month:'short',year:'2-digit'})}`;
          })()}
          {trendMode==='weekly' && (()=> {
            const m = new Date(trendCursor.getFullYear(), trendCursor.getMonth(), 1);
            return m.toLocaleString(undefined,{month:'long', year:'numeric'});
          })()}
          {trendMode==='daily' && (()=> {
            const mon = mondayOfWeek(trendCursor);
            const sun = sundayOfWeek(trendCursor);
            // clamp start label if first week spills before 1st
            const first = new Date(trendCursor.getFullYear(), trendCursor.getMonth(), 1);
            const start = mon < first && mon.getMonth() === first.getMonth()-1 ? first : mon;
            return `${start.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${sun.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
          })()}
        </div>

        {/* Next */}
        <button
          className="h-8 w-8 grid place-items-center rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50"
          onClick={()=>{
            if (trendMode==='monthly') setTrendCursor(c=>addMonths(c,12));
            else if (trendMode==='weekly') setTrendCursor(c=>addMonths(c,1));
            else setTrendCursor(c=>addDays(c,7)); // daily
          }}
          title="Next"
        >
          ›
        </button>
      </div>
    )}
  </div>
</div>

{/* Trend mode tabs */}
{view === 'trends' && (
  <div className="flex items-center gap-2 pb-3">
    {['monthly','weekly','daily'].map((m) => (
      <button
        key={m}
        onClick={() => setTrendMode(m)}
        className={`text-xs px-3 py-1 rounded-full border transition
          ${trendMode === m
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
      >
        {m === 'monthly' ? 'Monthly' : m === 'weekly' ? 'Weekly' : 'Daily'}
      </button>
    ))}
  </div>
)}


   {/* Content */}
<div style={{ width: '100%', height: 440 }}>
  <AnimatePresence mode="wait">
    {view === 'pie' ? (
      // ---------- PIE (categories) ----------
      <motion.div
        key="pie"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="h-full"
      >
        {chartData.length === 0 ? (
          <div className="text-gray-500 h-full grid place-items-center">
            No data yet. Add some expenses!
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 48, right: 72, bottom: 72, left: 72 }}>
              <Pie
                data={coloredData}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="56%"
                outerRadius="68%"
                paddingAngle={1.5}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
              >
                {coloredData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} stroke={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmtMoney(v, currency)} />
              <Legend verticalAlign="bottom" align="center" height={36} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </motion.div>
    ) : (
      // ---------- TRENDS (bars; expenses only) ----------
      <motion.div
        key="trends"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="h-full"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={trendData}
            margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v)=>fmtMoney(v, currency)} />
            <Tooltip formatter={(v, n) => [fmtMoney(v, currency), n]} labelStyle={{ fontWeight: 600 }} />
            <Legend />
            <Bar dataKey="spent" name="Spent" fill="#60a5fa" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    )}
  </AnimatePresence>
</div>



      {/* Footer for total spent (only in pie) */}
      {view !== 'trends' && (
        <div className="text-center text-gray-600 mt-2">
          Total Spent: <span className="font-semibold">{fmtMoney(totalSpent, currency)}</span>
        </div>
      )}
    </div>
  </div>
</section>


{/* Category Budgets */}
{budgets?.length > 0 && (
  <section className="w-full flex justify-center mt-10 mb-10">   {/* 👈 added mt-10 here */}
    <div className="w-full max-w-5xl px-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-100">
        <h3 className="text-lg font-semibold mb-4">Category Budgets</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((b) => {
            const limit = Number(b.amount || 0);

            // sum spent in the last 30d for this category
            const spent = expenses
              .filter(e => e.category_id === b.categoryId)
              .reduce((sum, e) => sum + Number(e.amount || 0), 0);

            const remaining = limit - spent;
            const over = remaining < 0;
            const pct = limit > 0 ? Math.min(100, Math.max(0, (spent / limit) * 100)) : 0;

            return (
              <div
                key={b.categoryId}
                className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium truncate">{b.categoryName}</div>
                  <div className={`text-xs ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                    {fmtMoney(spent, currency)} / {fmtMoney(limit, currency)}
                  </div>
                </div>

                {/* progress rail */}
                <div className="h-2.5 bg-slate-200/70 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: spentBarColor(pct)
                    }}
                  />
                </div>

                <div className={`text-xs mt-1 ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                  {over
                    ? `Over by ${fmtMoney(Math.abs(remaining), currency)}`
                    : `Remaining ${fmtMoney(remaining, currency)}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </section>
)}

      </div>
    </PageFade>
  )
}

function getTo() { return new Date().toISOString().slice(0, 10) }
function getFrom() { return new Date(Date.now() - 29 * 86400e3).toISOString().slice(0, 10) }

function fmtMoney(v, currency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(v || 0);
}


function StatCard({ label, value, tone = 'neutral' }) {
  const ring = tone === 'good' ? 'ring-green-200' : tone === 'bad' ? 'ring-red-200' : 'ring-gray-200'
  return (
    <div className={`bg-white p-4 rounded-2xl shadow-sm ring-1 ${ring}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  )
}
