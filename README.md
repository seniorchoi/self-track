# SelfTrack Dashboard

Static React/Vite/TS dashboard for the SelfTrack project (every-15-min webcam + screen capture → activity blocks → Google Sheet).

Reads `public/snapshot.json` (regenerated daily by the gateway cron `selftrack-dashboard-refresh`).

## Local dev
```
npm install
npm run dev
```

## Deploy
Vercel auto-deploys on push to `main`. Set Project Root to repo root; framework: Vite.

## Data source
- Sheet `1PVRH_wnoJty0GO64hxK92PPNe7BljkhoeMCb-sCo0K0` ("SelfTrack — Daily Activity Log"), tab `Sheet1`.
- The refresh cron reads it and writes `public/snapshot.json` + git push.
