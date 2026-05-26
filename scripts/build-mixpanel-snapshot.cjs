#!/usr/bin/env node
// Build a small public Mixpanel rollup for Life of Sun.
// Requires either:
//   MIXPANEL_SERVICE_ACCOUNT_USERNAME + MIXPANEL_SERVICE_ACCOUNT_PASSWORD
// or MIXPANEL_API_SECRET / MIXPANEL_PROJECT_SECRET for basic auth.
// Optional: MIXPANEL_PROJECT_ID (not required for Export API projects that infer it from auth).

const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'public', 'mixpanel.json')
const PROJECT_TOKEN = process.env.MIXPANEL_PROJECT_TOKEN || '6fb13bbb32220de30c42899af1533003'
const username = process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME || process.env.MIXPANEL_API_SECRET || process.env.MIXPANEL_PROJECT_SECRET
const password = process.env.MIXPANEL_SERVICE_ACCOUNT_PASSWORD || ''

const now = new Date()
const isoDate = d => d.toISOString().slice(0, 10)
const daysAgo = n => { const d = new Date(now); d.setUTCDate(d.getUTCDate() - n); return d }
const since = Math.floor(now.getTime() / 1000) - 7 * 24 * 60 * 60
const activeSince = Math.floor(now.getTime() / 1000) - 5 * 60

function empty(reason) {
  return {
    generatedAt: now.toISOString(),
    source: 'mixpanel',
    status: reason ? 'needs_credentials' : 'ok',
    reason: reason || '',
    dailyVisitors: [],
    weeklyVisitors: { visitors: 0, visits: 0 },
    activeNow: 0,
    topCities: [],
    topCountries: [],
    topPages: [],
    topReferrers: [],
  }
}

function inc(map, key, by = 1) {
  if (!key || key === '$direct') return
  map.set(key, (map.get(key) || 0) + by)
}
function top(map, n = 6) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }))
}

async function main() {
  if (!username) {
    fs.writeFileSync(OUT, JSON.stringify(empty('Set MIXPANEL_SERVICE_ACCOUNT_USERNAME/PASSWORD or MIXPANEL_API_SECRET to publish visitor rollups.'), null, 2))
    return
  }

  const params = new URLSearchParams({
    from_date: isoDate(daysAgo(7)),
    to_date: isoDate(now),
    event: JSON.stringify(['page_viewed']),
    where: `properties[\"token\"] == \"${PROJECT_TOKEN}\"`,
  })
  const url = `https://data.mixpanel.com/api/2.0/export?${params}`
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) throw new Error(`Mixpanel export failed: ${res.status} ${await res.text()}`)
  const text = await res.text()

  const daily = new Map()
  const weeklyVisitors = new Set()
  const active = new Set()
  const cities = new Map(), countries = new Map(), pages = new Map(), referrers = new Map()
  let visits = 0

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const event = JSON.parse(line)
    const p = event.properties || {}
    const t = Number(p.time || 0)
    if (!t || t < since) continue
    visits++
    const id = p.distinct_id || event.distinct_id || p.$device_id || 'anon'
    const day = new Date(t * 1000).toISOString().slice(0, 10)
    if (!daily.has(day)) daily.set(day, new Set())
    daily.get(day).add(id)
    weeklyVisitors.add(id)
    if (t >= activeSince) active.add(id)
    inc(cities, p.$city || p.city)
    inc(countries, p.mp_country_code || p.$country_code || p.country)
    inc(pages, p.path || p.$current_url)
    const ref = p.$referring_domain || p.referrer || p.utm_source
    inc(referrers, ref)
  }

  const out = {
    generatedAt: now.toISOString(),
    source: 'mixpanel',
    status: 'ok',
    dailyVisitors: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ids]) => ({ date, visitors: ids.size })),
    weeklyVisitors: { visitors: weeklyVisitors.size, visits },
    activeNow: active.size,
    topCities: top(cities),
    topCountries: top(countries),
    topPages: top(pages, 5),
    topReferrers: top(referrers, 5),
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
}

main().catch(err => {
  console.error(err)
  fs.writeFileSync(OUT, JSON.stringify({ ...empty('Mixpanel snapshot failed.'), status: 'error', reason: err.message }, null, 2))
  process.exitCode = 1
})
