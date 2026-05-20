import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom'

// ── Types ──────────────────────────────────────────────────────────────
type Block = {
  start: string; end: string; min: number
  category: string; activity: string; project: string
  screen_summary?: string; webcam?: string; image?: string; notes?: string
}
type Day = {
  date: string
  tracked_min: number
  by_category: Record<string, number>
  by_project:  Record<string, number>
  blocks: Block[]
}
type Snapshot = { generatedAt: string; days: Day[] }

// ── Constants ──────────────────────────────────────────────────────────
const CAT_ORDER = ['Productivity', 'Communications', 'Meetings', 'Leisure', 'Learning', 'Admin/Errands', 'AFK/Idle', 'Other'] as const
const CAT_COLOR: Record<string, string> = {
  Productivity:    '#1f3b2a',
  Communications:  '#4b8b9b',
  Meetings:        '#7a5cbf',
  Leisure:         '#d4a14a',
  Learning:        '#6b8e23',
  'Admin/Errands': '#a55c2a',
  'AFK/Idle':      '#9ca3af',
  Other:           '#cdbf9a',
}
const colorFor = (c: string) => CAT_COLOR[c] ?? '#cdbf9a'

// ── Date helpers ───────────────────────────────────────────────────────
// Accept BOTH ISO (2026-05-19) AND short M-D-YY (5-19-26 or 05-19-26).
function parseDateParam(p?: string): string | null {
  if (!p) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p
  const m = p.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
  if (!m) return null
  let [_, mm, dd, yy] = m
  if (yy.length === 2) yy = '20' + yy
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
const fmtH = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60
  return h ? `${h}h${r ? ' ' + r + 'm' : ''}` : `${m}m`
}
const toMin = (hhmm: string) => {
  const [h, mm] = hhmm.split(':').map(Number); return h * 60 + mm
}
const isUrl = (v?: string) => !!v && (v.startsWith('http://') || v.startsWith('https://'))
const dateAddDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Snapshot hook ──────────────────────────────────────────────────────
function useSnapshot() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    fetch('/snapshot.json').then(r => r.json()).then(setSnap).catch(() => setSnap({ generatedAt: '', days: [] }))
  }, [])
  return snap
}

// ── Range aggregator (for Pie weekly/monthly/yearly) ───────────────────
type Range = 'day' | 'week' | 'month' | 'year'
const RANGE_DAYS: Record<Range, number> = { day: 1, week: 7, month: 30, year: 365 }
function aggregateRange(snap: Snapshot, endDate: string, range: Range) {
  const days = RANGE_DAYS[range]
  const start = dateAddDays(endDate, -(days - 1))
  const inRange = snap.days.filter(d => d.date >= start && d.date <= endDate)
  const by_category: Record<string, number> = {}
  const by_project:  Record<string, number> = {}
  let tracked = 0, daysWithData = 0
  for (const d of inRange) {
    if (d.tracked_min > 0) daysWithData++
    tracked += d.tracked_min
    for (const [k, v] of Object.entries(d.by_category)) by_category[k] = (by_category[k] || 0) + v
    for (const [k, v] of Object.entries(d.by_project))  by_project[k]  = (by_project[k]  || 0) + v
  }
  return { start, end: endDate, days, daysWithData, tracked_min: tracked, by_category, by_project }
}

// ── Pie chart (works for day OR range) ─────────────────────────────────
function CategoryPie({ totalsTitle, total24h, by_category, tracked_min }: {
  totalsTitle: string; total24h: boolean; by_category: Record<string, number>; tracked_min: number
}) {
  const totalScale = total24h ? 24 * 60 : Math.max(tracked_min, 1)
  const slices: { label: string; min: number; color: string }[] = []
  for (const c of CAT_ORDER) {
    const m = by_category[c] || 0
    if (m > 0) slices.push({ label: c, min: m, color: colorFor(c) })
  }
  const untracked = total24h ? totalScale - tracked_min : 0
  if (untracked > 0) slices.push({ label: 'Untracked', min: untracked, color: '#ece8db' })

  const r = 110, cx = 130, cy = 130
  let acc = 0
  const arcs = slices.map((s, i) => {
    const a0 = (acc / totalScale) * 2 * Math.PI - Math.PI / 2
    acc += s.min
    const a1 = (acc / totalScale) * 2 * Math.PI - Math.PI / 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
    return <path key={i} d={d} fill={s.color} stroke="#faf9f6" strokeWidth={1.5} />
  })

  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      <svg viewBox="0 0 260 260" className="w-full max-w-[260px] h-auto flex-shrink-0">
        {arcs}
        <circle cx={cx} cy={cy} r={50} fill="#faf9f6" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="font-serif" style={{ fontSize: 22 }}>{fmtH(tracked_min)}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 11, fill: '#6b7280' }}>{totalsTitle}</text>
      </svg>
      <ul className="text-sm space-y-1">
        {slices.filter(s => s.label !== 'Untracked').map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span style={{ background: s.color, width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
            <span className="w-32 truncate">{s.label}</span>
            <span className="text-gray-500 tabular-nums">{fmtH(s.min)}</span>
          </li>
        ))}
        {untracked > 0 && (
          <li className="flex items-center gap-2 text-gray-400 italic">
            <span style={{ background: '#ece8db', width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
            <span className="w-32 truncate">Untracked</span>
            <span className="tabular-nums">{fmtH(untracked)}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

// ── ChronoClock — clock-style 24h ring positioned by time-of-day ──────
function ChronoClock({ day }: { day: Day }) {
  const [hover, setHover] = useState<Block | null>(null)
  const cx = 180, cy = 180, rOuter = 150, rInner = 80
  const tau = 2 * Math.PI

  function arcPath(startMin: number, endMin: number) {
    const a0 = (startMin / 1440) * tau - Math.PI / 2
    const a1 = (endMin   / 1440) * tau - Math.PI / 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0o = cx + rOuter * Math.cos(a0), y0o = cy + rOuter * Math.sin(a0)
    const x1o = cx + rOuter * Math.cos(a1), y1o = cy + rOuter * Math.sin(a1)
    const x0i = cx + rInner * Math.cos(a0), y0i = cy + rInner * Math.sin(a0)
    const x1i = cx + rInner * Math.cos(a1), y1i = cy + rInner * Math.sin(a1)
    return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="relative">
        <svg viewBox="0 0 360 360" className="w-full max-w-[360px] h-auto">
          {/* faint background ring */}
          <circle cx={cx} cy={cy} r={rOuter} fill="#ece8db" />
          <circle cx={cx} cy={cy} r={rInner} fill="#faf9f6" />
          {/* 24-hour tick labels */}
          {[0,3,6,9,12,15,18,21].map(h => {
            const a = (h / 24) * tau - Math.PI / 2
            const tx = cx + (rOuter + 14) * Math.cos(a)
            const ty = cy + (rOuter + 14) * Math.sin(a) + 4
            return <text key={h} x={tx} y={ty} textAnchor="middle" style={{ fontSize: 11, fill: '#6b7280' }}>{String(h).padStart(2, '0')}</text>
          })}
          {/* hour tick marks */}
          {Array.from({ length: 24 }, (_, h) => {
            const a = (h / 24) * tau - Math.PI / 2
            const r1 = rOuter, r2 = rOuter - (h % 6 === 0 ? 8 : 4)
            return <line key={h} x1={cx + r1*Math.cos(a)} y1={cy + r1*Math.sin(a)} x2={cx + r2*Math.cos(a)} y2={cy + r2*Math.sin(a)} stroke="#cbc6b6" strokeWidth={1} />
          })}
          {/* blocks */}
          {day.blocks.map((b, i) => {
            const sm = toMin(b.start)
            // handle '00:00' end as 1440 (next-day boundary same day)
            let em = b.end === '00:00' ? 1440 : toMin(b.end)
            if (em <= sm) em = Math.min(1440, sm + b.min)
            return (
              <path key={i}
                d={arcPath(sm, em)}
                fill={colorFor(b.category)}
                opacity={hover && hover !== b ? 0.45 : 0.95}
                stroke="#faf9f6" strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(b)}
                onMouseLeave={() => setHover(null)} />
            )
          })}
          {/* center label */}
          <text x={cx} y={cy - 2} textAnchor="middle" className="font-serif" style={{ fontSize: 22 }}>{day.date.slice(5)}</text>
          <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontSize: 11, fill: '#6b7280' }}>{fmtH(day.tracked_min)} tracked</text>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        {hover ? (
          <div className="bg-white border border-[var(--line)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(hover.category) }} />
              <span className="text-xs uppercase tracking-wide text-gray-500">{hover.category}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500 font-mono">{hover.start}–{hover.end}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{fmtH(hover.min)}</span>
              {hover.project && hover.project !== '(unclassified)' && (
                <><span className="text-xs text-gray-400">·</span><span className="text-xs font-semibold">{hover.project}</span></>
              )}
            </div>
            <div className="font-serif text-lg leading-snug">{hover.activity}</div>
            {hover.screen_summary && <div className="text-sm text-gray-600 mt-1">{hover.screen_summary}</div>}
            {isUrl(hover.image) && (
              <img src={hover.image} alt="" loading="lazy" className="mt-3 rounded border border-[var(--line)] w-full max-w-md" />
            )}
            {hover.image && hover.image.includes('🔒') && (
              <div className="mt-3 text-xs text-gray-500 italic">🔒 image withheld (sensitive content)</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">Hover any arc to see what you were doing then (and the captured screen).</div>
        )}
      </div>
    </div>
  )
}

// ── By-day bars (horizontal OR vertical) ──────────────────────────────
function ByDayBars({ days, orientation }: { days: Day[]; orientation: 'horizontal' | 'vertical' }) {
  const maxTracked = Math.max(...days.map(d => d.tracked_min), 60)
  if (orientation === 'horizontal') {
    return (
      <div className="space-y-3">
        {days.slice().reverse().map(d => (
          <div key={d.date}>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span className="font-mono">{d.date}</span>
              <span>{fmtH(d.tracked_min)}</span>
            </div>
            <div className="h-7 rounded overflow-hidden flex" style={{ background: '#ece8db' }}>
              {CAT_ORDER.map(c => {
                const m = d.by_category[c] || 0
                if (!m) return null
                const w = (m / maxTracked) * 100
                return <div key={c} title={`${c}: ${fmtH(m)}`} style={{ width: w + '%', background: colorFor(c) }} />
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }
  // vertical: columns
  const cols = days.slice().reverse()
  return (
    <div className="flex gap-3 items-end overflow-x-auto" style={{ minHeight: 320 }}>
      {cols.map(d => (
        <div key={d.date} className="flex flex-col items-center flex-shrink-0" style={{ width: 56 }}>
          <div className="text-xs text-gray-500 mb-1">{fmtH(d.tracked_min)}</div>
          <div className="rounded overflow-hidden flex flex-col-reverse" style={{ width: 38, height: 260, background: '#ece8db' }}>
            {CAT_ORDER.map(c => {
              const m = d.by_category[c] || 0
              if (!m) return null
              const h = (m / maxTracked) * 100
              return <div key={c} title={`${c}: ${fmtH(m)}`} style={{ height: h + '%', background: colorFor(c) }} />
            })}
          </div>
          <div className="text-[10px] mt-1 text-gray-500 font-mono">{d.date.slice(5)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Timeline (existing) ───────────────────────────────────────────────
function Timeline({ day }: { day: Day }) {
  return (
    <ol className="space-y-3">
      {day.blocks.map((b, i) => {
        const sensitive = b.image && b.image.includes('🔒')
        const hasImage = isUrl(b.image)
        return (
          <li key={i} className="grid grid-cols-[56px_1fr] sm:grid-cols-[80px_1fr] gap-2 sm:gap-4 items-start">
            <div className="font-mono text-xs text-gray-500 pt-1 tabular-nums">{b.start}<br/>↓<br/>{b.end}</div>
            <div className="border border-[var(--line)] rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(b.category) }} />
                <span className="text-xs uppercase tracking-wide text-gray-500">{b.category}</span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500">{fmtH(b.min)}</span>
                {b.project && b.project !== '(unclassified)' && (<><span className="text-xs text-gray-400">·</span><span className="text-xs font-semibold">{b.project}</span></>)}
              </div>
              <div className="font-serif text-lg leading-snug">{b.activity}</div>
              {b.screen_summary && <div className="text-sm text-gray-600 mt-1">{b.screen_summary}</div>}
              {hasImage && <img src={b.image} alt="" loading="lazy" className="mt-3 rounded border border-[var(--line)] max-w-md w-full" />}
              {sensitive && <div className="mt-3 text-xs text-gray-500 italic">🔒 image withheld (sensitive content)</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Shell + nav (router-aware) ────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  const snap = useSnapshot()
  const loc = useLocation()
  if (!snap) return <div className="p-8 text-gray-500">Loading…</div>

  const latest = snap.days.length ? snap.days[snap.days.length - 1].date : new Date().toISOString().slice(0, 10)
  const tabs = [
    { key: 'pie',      label: '24h pie',  path: `/pie/day/${latest}` },
    { key: 'byday',    label: 'By day',   path: '/byday' },
    { key: 'timeline', label: 'Timeline', path: `/timeline/${latest}` },
    { key: 'chrono',   label: 'Chrono',   path: `/chrono/${latest}` },
  ]
  const activeKey = loc.pathname.split('/')[1] || 'pie'

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] px-4 sm:px-6 py-4 sm:py-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3">
          <div>
            <Link to="/" className="font-serif text-2xl sm:text-3xl hover:no-underline">Life of Sun</Link>
            <p className="text-xs text-gray-500 mt-1">Generated {snap.generatedAt ? new Date(snap.generatedAt).toLocaleString() : '—'}</p>
          </div>
          <nav className="flex gap-1 text-sm overflow-x-auto -mx-1 px-1">
            {tabs.map(t => (
              <Link key={t.key} to={t.path}
                className={'px-3 py-1.5 rounded whitespace-nowrap flex-shrink-0 ' + (activeKey === t.key ? 'bg-[var(--ink)] text-white' : 'text-gray-600 hover:bg-gray-100')}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">{children}</main>
    </div>
  )
}

function DateNav({ date, baseTo }: { date: string; baseTo: (d: string) => string }) {
  const snap = useSnapshot(); const nav = useNavigate()
  if (!snap) return null
  const idx = snap.days.findIndex(d => d.date === date)
  const prev = idx > 0 ? snap.days[idx - 1] : null
  const next = idx >= 0 && idx < snap.days.length - 1 ? snap.days[idx + 1] : null
  const btn = (label: string, t: Day | null, title: string) => (
    <button type="button" onClick={() => t && nav(baseTo(t.date))} disabled={!t}
      title={t ? `${title}: ${t.date}` : `no ${title}`}
      className={'w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--line)] bg-white ' +
        (t ? 'hover:bg-gray-100' : 'opacity-30 cursor-not-allowed')}>{label}</button>
  )
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">Day:</span>
      {btn('◀', prev, 'previous day')}
      <select value={date} onChange={e => nav(baseTo(e.target.value))}
        className="border border-[var(--line)] rounded px-2 py-1 bg-white">
        {snap.days.slice().reverse().map(d => <option key={d.date} value={d.date}>{d.date}</option>)}
      </select>
      {btn('▶', next, 'next day')}
    </div>
  )
}

// ── Routes ────────────────────────────────────────────────────────────
function PieRoute() {
  const { range = 'day', date } = useParams<{ range?: Range; date?: string }>()
  const snap = useSnapshot()
  const nav = useNavigate()
  if (!snap) return null
  const iso = parseDateParam(date) || (snap.days.length ? snap.days[snap.days.length - 1].date : new Date().toISOString().slice(0, 10))
  const r: Range = (['day','week','month','year'] as const).includes(range as any) ? (range as Range) : 'day'

  if (r === 'day') {
    const day = snap.days.find(d => d.date === iso)
    if (!day) return <p className="text-gray-500">No data for {iso}.</p>
    return (
      <Shell>
        <div className="flex flex-wrap items-center gap-3">
          <DateNav date={iso} baseTo={d => `/pie/day/${d}`} />
          <RangeSwitcher current={r} date={iso} />
        </div>
        <section className="bg-white border border-[var(--line)] rounded-xl p-4 sm:p-6">
          <h2 className="font-serif text-xl mb-4">Activities across the day</h2>
          <CategoryPie totalsTitle="tracked / 24h" total24h by_category={day.by_category} tracked_min={day.tracked_min} />
          {Object.keys(day.by_project).length > 0 && <TopProjects byProject={day.by_project} />}
        </section>
      </Shell>
    )
  }
  const agg = aggregateRange(snap, iso, r)
  const label = r === 'week' ? '7 days' : r === 'month' ? '30 days' : '365 days'
  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3">
        <DateNav date={iso} baseTo={d => `/pie/${r}/${d}`} />
        <RangeSwitcher current={r} date={iso} />
      </div>
      <section className="bg-white border border-[var(--line)] rounded-xl p-4 sm:p-6">
        <h2 className="font-serif text-xl mb-1">Activities — last {label}</h2>
        <p className="text-xs text-gray-500 mb-4">Window: {agg.start} → {agg.end} · {agg.daysWithData}/{agg.days} days with data</p>
        <CategoryPie totalsTitle={'tracked / ' + label} total24h={false} by_category={agg.by_category} tracked_min={agg.tracked_min} />
        {Object.keys(agg.by_project).length > 0 && <TopProjects byProject={agg.by_project} />}
      </section>
    </Shell>
  )
}

function RangeSwitcher({ current, date }: { current: Range; date: string }) {
  const opts: Range[] = ['day', 'week', 'month', 'year']
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-gray-500 mr-1">Range:</span>
      {opts.map(o => (
        <Link key={o} to={`/pie/${o}/${date}`}
          className={'px-2 py-1 rounded border ' + (current === o
            ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
            : 'bg-white border-[var(--line)] text-gray-600 hover:bg-gray-100')}>{o}</Link>
      ))}
    </div>
  )
}

function TopProjects({ byProject }: { byProject: Record<string, number> }) {
  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Top projects</div>
      <ul className="text-sm space-y-1">
        {Object.entries(byProject).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([p, m]) => (
          <li key={p} className="flex justify-between border-b border-dashed border-[var(--line)] py-1">
            <span>{p}</span><span className="tabular-nums text-gray-500">{fmtH(m)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ByDayRoute() {
  const snap = useSnapshot()
  const [orient, setOrient] = useState<'horizontal' | 'vertical'>('horizontal')
  if (!snap) return null
  return (
    <Shell>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Bars:</span>
        {(['horizontal', 'vertical'] as const).map(o => (
          <button key={o} onClick={() => setOrient(o)}
            className={'px-3 py-1 rounded border ' + (orient === o
              ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
              : 'bg-white border-[var(--line)] text-gray-600 hover:bg-gray-100')}>{o}</button>
        ))}
      </div>
      <section className="bg-white border border-[var(--line)] rounded-xl p-4 sm:p-6">
        <h2 className="font-serif text-xl mb-4">Last {snap.days.length} day{snap.days.length === 1 ? '' : 's'} — category mix</h2>
        <ByDayBars days={snap.days} orientation={orient} />
        <div className="mt-5 flex flex-wrap gap-3 text-xs">
          {CAT_ORDER.map(c => (
            <span key={c} className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(c) }} />{c}
            </span>
          ))}
        </div>
      </section>
    </Shell>
  )
}

function TimelineRoute() {
  const { date } = useParams<{ date?: string }>()
  const snap = useSnapshot()
  if (!snap) return null
  const iso = parseDateParam(date) || (snap.days.length ? snap.days[snap.days.length - 1].date : new Date().toISOString().slice(0, 10))
  const day = snap.days.find(d => d.date === iso)
  return (
    <Shell>
      <DateNav date={iso} baseTo={d => `/timeline/${d}`} />
      {day ? (
        <section>
          <h2 className="font-serif text-xl mb-4">Timeline — {iso}</h2>
          <Timeline day={day} />
        </section>
      ) : <p className="text-gray-500">No data for {iso}.</p>}
    </Shell>
  )
}

function ChronoRoute() {
  const { date } = useParams<{ date?: string }>()
  const snap = useSnapshot()
  if (!snap) return null
  const iso = parseDateParam(date) || (snap.days.length ? snap.days[snap.days.length - 1].date : new Date().toISOString().slice(0, 10))
  const day = snap.days.find(d => d.date === iso)
  return (
    <Shell>
      <DateNav date={iso} baseTo={d => `/chrono/${d}`} />
      {day ? (
        <section className="bg-white border border-[var(--line)] rounded-xl p-4 sm:p-6">
          <h2 className="font-serif text-xl mb-4">Chronological clock — {iso}</h2>
          <ChronoClock day={day} />
        </section>
      ) : <p className="text-gray-500">No data for {iso}.</p>}
    </Shell>
  )
}

function HomeRedirect() {
  const snap = useSnapshot()
  if (!snap) return null
  const latest = snap.days.length ? snap.days[snap.days.length - 1].date : new Date().toISOString().slice(0, 10)
  return <Navigate to={`/pie/day/${latest}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/pie/:range/:date" element={<PieRoute />} />
        <Route path="/pie/:date" element={<PieRoute />} />
        <Route path="/pie" element={<HomeRedirect />} />
        <Route path="/byday" element={<ByDayRoute />} />
        <Route path="/timeline/:date" element={<TimelineRoute />} />
        <Route path="/timeline" element={<TimelineRoute />} />
        <Route path="/chrono/:date" element={<ChronoRoute />} />
        <Route path="/chrono" element={<ChronoRoute />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}
