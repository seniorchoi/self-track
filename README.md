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

## Mixpanel
- Client tracking is installed with project token `6fb13bbb32220de30c42899af1533003`.
- The app tracks `page_viewed` with `{ path, tab, site: "life_of_sun" }`.
- Public visitor cards read `public/mixpanel.json` and appear at the bottom of Timeline and Crons.
- To publish visitor rollups, provide Mixpanel API credentials in the environment and run:

```bash
MIXPANEL_SERVICE_ACCOUNT_USERNAME=... \
MIXPANEL_SERVICE_ACCOUNT_PASSWORD=... \
npm run mixpanel:snapshot
```

Alternative: set `MIXPANEL_API_SECRET` or `MIXPANEL_PROJECT_SECRET` for basic auth.
