const WINDOW_MS = 2 * 60 * 1000
const visitors = globalThis.__lifeOfSunLiveVisitors || new Map()
globalThis.__lifeOfSunLiveVisitors = visitors

function prune(now = Date.now()) {
  for (const [id, seenAt] of visitors.entries()) {
    if (now - seenAt > WINDOW_MS) visitors.delete(id)
  }
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  const now = Date.now()
  prune(now)

  if (req.method === 'POST') {
    let body = req.body
    if (!body || typeof body === 'string') {
      try { body = body ? JSON.parse(body) : {} } catch { body = {} }
    }
    const id = String(body?.visitorId || '').slice(0, 80)
    if (!id) return send(res, 400, { ok: false, error: 'missing visitorId' })
    visitors.set(id, now)
    prune(now)
    return send(res, 200, { ok: true, activeNow: visitors.size, windowSeconds: WINDOW_MS / 1000 })
  }

  if (req.method === 'GET') {
    return send(res, 200, { ok: true, activeNow: visitors.size, windowSeconds: WINDOW_MS / 1000, generatedAt: new Date(now).toISOString() })
  }

  res.setHeader('Allow', 'GET, POST')
  return send(res, 405, { ok: false, error: 'method not allowed' })
}
