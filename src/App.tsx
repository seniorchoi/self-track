import { useEffect, useMemo, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────
type Block = {
  start: string          // 'HH:MM'
  end:   string          // 'HH:MM'
  min:   number
  category: string
  activity: string
  project: string
  screen_summary?: string
  webcam?: string
  image?: string         // imgur URL OR '🔒 sensitive ...' OR local path
}
type Day = {
  date: string                          // 'YYYY-MM-DD'
  tracked_min: number
  by_category: Record<string, number>   // category -> minutes
  by_project:  Record<string, number>   // project  -> minutes
  blocks: Block[]
}
type Snapshot = {
  generatedAt: string
  days: Day[]                           // sorted oldest → newest
}

// ── Palette per fixed broad category ──────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────
const fmtH = (m: number) => {
  const h = Math.floor(m / 60); const r = m % 60
  return h ? `${h}h${r ? ' ' + r + 'm' : ''}` : `${m}m`
}
const toMin = (hhmm: string) => {
  const [h, mm] = hhmm.split(':').map(Number); return h * 60 + mm
}
const isImageFormulaOrUrl = (v?: string) =>
  !!v && (v.startsWith('https://') || v.startsWith('http://'))

// ── Pie (24h ring) ─────────────────────────────────────────────────────
function CategoryPie({ day }: { day: Day }) {
  const total = 24 * 60
  // ordered slices, with an "Untracked" filler so the pie always = 24h
  const slices: { label: string; min: number; color: string }[] = []
  for (const c of CAT_ORDER) {
    const m = day.by_category[c] || 0
    if (m > 0) slices.push({ label: c, min: m, color: colorFor(c) })
  }
  const untracked = total - day.tracked_min
  if (untracked > 0) slices.push({ label: 'Untracked', min: untracked, color: '#ece8db' })

  const r = 110, cx = 130, cy = 130
  let acc = 0
  const arcs = slices.map((s, i) => {
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2
    acc += s.min
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
    return <path key={i} d={d} fill={s.color} stroke="#faf9f6" strokeWidth={1.5} />
  })

  return (
    <div className="flex flex-col md:flex-row gap-6 items-center">
      <svg width={260} height={260} viewBox="0 0 260 260">
        {arcs}
        <circle cx={cx} cy={cy} r={50} fill="#faf9f6" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="font-serif" style={{ fontSize: 22 }}>{fmtH(day.tracked_min)}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" style={{ fontSize: 11, fill: '#6b7280' }}>tracked / 24h</text>
      </svg>
      <ul className="text-sm space-y-1">
        {slices.filter(s => s.label !== 'Untracked').map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span style={{ background: s.color, width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
            <span className="w-32 truncate">{s.label}</span>
            <span className="text-gray-500 tabular-nums">{fmtH(s.min)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-gray-400 italic">
          <span style={{ background: '#ece8db', width: 10, height: 10, borderRadius: 2, display: 'inline-block' }} />
          <span className="w-32 truncate">Untracked</span>
          <span className="tabular-nums">{fmtH(untracked)}</span>
        </li>
      </ul>
    </div>
  )
}

// ── By-day stacked bars ────────────────────────────────────────────────
function ByDayBars({ days }: { days: Day[] }) {
  const maxTracked = Math.max(...days.map(d => d.tracked_min), 60)
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

// ── Timeline ───────────────────────────────────────────────────────────
function Timeline({ day }: { day: Day }) {
  return (
    <ol className="space-y-3">
      {day.blocks.map((b, i) => {
        const sensitive = b.image && b.image.includes('🔒')
        const hasImage = isImageFormulaOrUrl(b.image)
        return (
          <li key={i} className="grid grid-cols-[80px_1fr] gap-4 items-start">
            <div className="font-mono text-xs text-gray-500 pt-1 tabular-nums">
              {b.start}<br/>↓<br/>{b.end}
            </div>
            <div className="border border-[var(--line)] rounded-lg p-3 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(b.category) }} />
                <span className="text-xs uppercase tracking-wide text-gray-500">{b.category}</span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500">{fmtH(b.min)}</span>
                {b.project && b.project !== '(unclassified)' && (
                  <>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs font-semibold">{b.project}</span>
                  </>
                )}
              </div>
              <div className="font-serif text-lg leading-snug">{b.activity}</div>
              {b.screen_summary && <div className="text-sm text-gray-600 mt-1">{b.screen_summary}</div>}
              {hasImage && (
                <img src={b.image} alt="" loading="lazy"
                     className="mt-3 rounded border border-[var(--line)] max-w-md w-full" />
              )}
              {sensitive && (
                <div className="mt-3 text-xs text-gray-500 italic">🔒 image withheld (sensitive content)</div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Main ───────────────────────────────────────────────────────────────
type View = 'today' | 'byday' | 'timeline'

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [view, setView] = useState<View>('today')
  const [activeDate, setActiveDate] = useState<string | null>(null)

  useEffect(() => {
    fetch('/snapshot.json').then(r => r.json()).then((s: Snapshot) => {
      setSnap(s)
      if (s.days.length) setActiveDate(s.days[s.days.length - 1].date)
    })
  }, [])

  const day = useMemo(() => snap?.days.find(d => d.date === activeDate) ?? null, [snap, activeDate])
  if (!snap) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-3xl">SelfTrack</h1>
            <p className="text-xs text-gray-500 mt-1">Generated {new Date(snap.generatedAt).toLocaleString()}</p>
          </div>
          <nav className="flex gap-1 text-sm">
            {(['today', 'byday', 'timeline'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={'px-3 py-1.5 rounded ' + (view === v ? 'bg-[var(--ink)] text-white' : 'text-gray-600 hover:bg-gray-100')}>
                {v === 'today' ? '24h pie' : v === 'byday' ? 'By day' : 'Timeline'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Date picker — relevant for pie + timeline */}
        {view !== 'byday' && day && (() => {
          const idx = snap.days.findIndex(d => d.date === day.date)
          const prev = idx > 0 ? snap.days[idx - 1] : null
          const next = idx >= 0 && idx < snap.days.length - 1 ? snap.days[idx + 1] : null
          const navBtn = (label: string, target: Day | null, title: string) => (
            <button
              type="button"
              onClick={() => target && setActiveDate(target.date)}
              disabled={!target}
              title={target ? `${title}: ${target.date}` : `no ${title}`}
              className={'w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--line)] bg-white ' +
                (target ? 'hover:bg-gray-100' : 'opacity-30 cursor-not-allowed')}>
              {label}
            </button>
          )
          return (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Day:</span>
              {navBtn('◀', prev, 'previous day')}
              <select
                value={day.date}
                onChange={e => setActiveDate(e.target.value)}
                className="border border-[var(--line)] rounded px-2 py-1 bg-white">
                {snap.days.slice().reverse().map(d => (
                  <option key={d.date} value={d.date}>{d.date}</option>
                ))}
              </select>
              {navBtn('▶', next, 'next day')}
              <span className="text-gray-400">·</span>
              <span className="text-gray-600">{fmtH(day.tracked_min)} tracked</span>
            </div>
          )
        })()}

        {view === 'today' && day && (
          <section className="bg-white border border-[var(--line)] rounded-xl p-6">
            <h2 className="font-serif text-xl mb-4">Activities across the day</h2>
            <CategoryPie day={day} />
            {/* Top projects today */}
            {Object.keys(day.by_project).length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Top projects</div>
                <ul className="text-sm space-y-1">
                  {Object.entries(day.by_project)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([p, m]) => (
                      <li key={p} className="flex justify-between border-b border-dashed border-[var(--line)] py-1">
                        <span>{p}</span><span className="tabular-nums text-gray-500">{fmtH(m)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {view === 'byday' && (
          <section className="bg-white border border-[var(--line)] rounded-xl p-6">
            <h2 className="font-serif text-xl mb-4">Last {snap.days.length} day{snap.days.length === 1 ? '' : 's'} — category mix</h2>
            <ByDayBars days={snap.days} />
            <div className="mt-5 flex flex-wrap gap-3 text-xs">
              {CAT_ORDER.map(c => (
                <span key={c} className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: colorFor(c) }} />{c}
                </span>
              ))}
            </div>
          </section>
        )}

        {view === 'timeline' && day && (
          <section className="bg-transparent">
            <h2 className="font-serif text-xl mb-4">Timeline — {day.date}</h2>
            <Timeline day={day} />
          </section>
        )}
      </main>
    </div>
  )
}
