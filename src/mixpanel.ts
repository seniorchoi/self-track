import mixpanel from 'mixpanel-browser'

const TOKEN = '6fb13bbb32220de30c42899af1533003'

let ready = false

export function initMixpanel() {
  if (ready || typeof window === 'undefined') return
  mixpanel.init(TOKEN, {
    debug: false,
    track_pageview: false,
    persistence: 'localStorage',
  })
  ready = true
}

export function trackPageView(pathname: string) {
  initMixpanel()
  mixpanel.track('page_viewed', {
    path: pathname,
    tab: pathname.split('/').filter(Boolean)[0] || 'home',
    site: 'life_of_sun',
  })
}

export function trackEvent(name: string, props: Record<string, unknown> = {}) {
  initMixpanel()
  mixpanel.track(name, { site: 'life_of_sun', ...props })
}


const VISITOR_KEY = 'life_of_sun_visitor_id'
let heartbeatStarted = false

export function getVisitorId() {
  if (typeof window === 'undefined') return 'server'
  let id = window.localStorage.getItem(VISITOR_KEY)
  if (!id) {
    const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    id = `los_${rand}`
    window.localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

export async function sendVisitorHeartbeat(pathname: string) {
  const visitorId = getVisitorId()
  trackEvent('visitor_heartbeat', { path: pathname, tab: pathname.split('/').filter(Boolean)[0] || 'home' })
  try {
    await fetch('/api/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, path: pathname }),
      keepalive: true,
    })
  } catch {
    // Best-effort only; Mixpanel still gets the heartbeat.
  }
}

export function startVisitorHeartbeat(pathname: string) {
  if (heartbeatStarted || typeof window === 'undefined') return
  heartbeatStarted = true
  sendVisitorHeartbeat(pathname)
  window.setInterval(() => sendVisitorHeartbeat(window.location.pathname), 45_000)
}
