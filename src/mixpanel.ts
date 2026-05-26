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
