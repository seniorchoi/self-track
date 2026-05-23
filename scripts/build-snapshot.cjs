#!/usr/bin/env node
// Build SelfTrack dashboard snapshot from Sheet1 dumps.
const fs = require('fs');
const path = require('path');

const FORMATTED = process.argv[2] || '/home/ksngh/.claude/projects/-home-ksngh--openclaw-workspace/7e4954c6-aec8-45da-bde1-d423a01c7766/tool-results/mcp-google-docs-readSpreadsheet-1779512428021.txt';
const FORMULA   = process.argv[3] || '/home/ksngh/.claude/projects/-home-ksngh--openclaw-workspace/7e4954c6-aec8-45da-bde1-d423a01c7766/tool-results/mcp-google-docs-readSpreadsheet-1779512428660.txt';
const OUT = '/home/ksngh/projects/selftrack-dashboard/public/snapshot.json';

const DAILY_SUMMARIES = {
  '2026-05-20': {
    tracked_min: 480,
    cats: [255,0,0,150,30,0,45,0],
    headline: 'working on SelfTrack (4h 0m) · playing Total War (30m) · taking a bath (notepad note left on screen) (30m)',
    reflection: '4h on SelfTrack tooling but only 15m on MBTI Oracle and 0 TikTok shipped — zero motion on the actual revenue/acquisition levers. Tomorrow morning: film one Simple Rizz hook before opening the dashboard repo.',
    span: '15:58 / 00:03',
    note: "I made a new website today, which is this one. I called it self-track initially but changed it to Life of Sun.\nI'm trying to figure out how I can better optimize my time for max ROI. \nI was inspired by Mark Andreessen on a podcast. He had a similar setup to track his sleep.\nI hope this system gives me insight into how I can better spend my time."
  },
  '2026-05-21': {
    tracked_min: 1440,
    cats: [60,0,0,150,45,15,1170,0],
    headline: 'haircut errand (10h 30m) · sleeping (7h 15m) · away from desk (1h 45m)',
    reflection: '• 0 minutes on MBTI Oracle, 0 TikTok hooks, 0 SelfTrack ships — the revenue levers didn\'t move\n• Left at 13:22 for a haircut and the desk sat idle until midnight — that\'s 10h of dead clock\n• Set a hard return cutoff next time: if Sun\'s not back by 19:00, the day is the signal — pivot to mobile work',
    span: '00:03 / 23:53',
    note: 'I went out to get haircut, then met with friends and partied.\n\nBut did not have that much fun partying. I guess it felt pretty misaligned to my goals at the moment. Lock in!'
  },
  '2026-05-22': {
    tracked_min: 810,
    cats: [30,0,0,375,0,0,405,0],
    headline: 'haircut errand (6h 30m) · playing Total War: Warhammer (1h 30m) · watching movie/TV (1h 15m)',
    reflection: '• 30m on SelfTrack, 0 on MBTI Oracle and 0 Simple Rizz hooks — the revenue stack got nothing today\n• 6h+ Leisure (Warhammer → movies → AoE2) on a hangover day — film one Rizz hook before any game tomorrow\n• Party last night felt misaligned per your own note — pre-commit a return-by time before the next outing',
    span: '00:08 / 23:51',
    note: 'Hangover day. Was too hangover to do anything productive. Did workout in the morning though.'
  },
};

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function toMin(hhmm) { const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function fromMin(t) { t=((t%1440)+1440)%1440; return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'); }
function addDays(date, n) { const d=new Date(date+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }

const fmt = loadJSON(FORMATTED).values || [];
const formula = loadJSON(FORMULA).values || [];

// Build unified rows
const rows = [];
for (let i = 0; i < fmt.length; i++) {
  const f = fmt[i];
  const g = formula[i] || [];
  if (!f || !f[0]) continue;
  const date = f[0];
  const start = f[1];
  const end = f[2];
  const dur = parseInt(f[3], 10) || 15;
  const category = f[4] || '';
  const activity = f[5] || '';
  const project = f[6] || '';
  const summary = f[7] || '';
  const webcam = f[8] || '';
  // image: extract from formula col J (index 9)
  let image = null;
  const jForm = g[9];
  if (typeof jForm === 'string') {
    const m = jForm.match(/=IMAGE\("([^"]+)"\)/);
    if (m) image = m[1];
  }
  // sensitive marker in formatted col J (index 9)
  const jFmt = f[9];
  const sensitive = (typeof jFmt === 'string' && jFmt.includes('🔒')) || (activity.toLowerCase() === 'sleeping');
  rows.push({ date, start, end, dur, category, activity, project, summary, webcam, image: sensitive ? null : image, sensitive });
}

// Logical day rule v2:
// - sleep inherits previous logical day
// - if first row of new clock-date is at hour<4 AND that block is short (<4h continuous wake), inherit previous
// - else new day; first row hour<4 → date-1
function applyLogicalDays(rows) {
  // Rule v2:
  // - First row: if hour<4, logical = date-1, else logical = date
  // - For each subsequent row: if the row is on a calendar date strictly greater than currentLogical AND
  //   (hour>=4 OR (hour<4 but this is the start of a fresh wake-block > 4h cumulative)) → promote.
  // - Sleeping rows always inherit currentLogical.
  // - Late-night non-sleep rows with hour<4 inherit currentLogical (treated as same logical day's tail).
  let currentLogical = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const hour = parseInt(r.start.split(':')[0], 10);
    if (i === 0) {
      currentLogical = hour < 4 ? addDays(r.date, -1) : r.date;
      r.logical_date = currentLogical;
      continue;
    }
    const isSleep = r.activity.toLowerCase() === 'sleeping';
    if (isSleep) {
      r.logical_date = currentLogical;
      continue;
    }
    // promote when calendar date is past currentLogical AND we've crossed into "morning" (hour>=4)
    if (r.date > currentLogical && hour >= 4) {
      currentLogical = r.date;
    }
    r.logical_date = currentLogical;
  }
  return rows;
}

applyLogicalDays(rows);

// Group by logical_date, then blocks
function buildBlocks(dayRows) {
  const blocks = [];
  let cur = null;
  let prevEndMin = null;
  for (const r of dayRows) {
    let sMin = toMin(r.start);
    // adjust for crossing midnight relative to prev
    if (prevEndMin !== null && sMin + 1440 < prevEndMin + 60 && sMin < prevEndMin) {
      // handled by clock-date change; keep simple
    }
    const newBlock = !cur ||
      r.category !== cur.category ||
      r.activity !== cur.activity ||
      r.project !== cur.project ||
      (prevEndMin !== null && (sMin - prevEndMin > 30 && sMin >= prevEndMin));
    if (newBlock) {
      if (cur) blocks.push(cur);
      cur = {
        start: r.start,
        end: r.end,
        min: r.dur,
        category: r.category,
        activity: r.activity,
        project: r.project,
        screen_summary: r.summary,
        webcam_counts: { [r.webcam]: 1 },
        captures: [{ start: r.start, image: r.image, summary: r.summary, sensitive: r.sensitive }],
        images: r.image ? [r.image] : [],
        sensitive_count: r.sensitive ? 1 : 0,
        total_count: 1,
        notes: '',
      };
    } else {
      cur.end = r.end;
      cur.min += r.dur;
      cur.webcam_counts[r.webcam] = (cur.webcam_counts[r.webcam] || 0) + 1;
      cur.captures.push({ start: r.start, image: r.image, summary: r.summary, sensitive: r.sensitive });
      if (r.image) cur.images.push(r.image);
      if (r.sensitive) cur.sensitive_count++;
      cur.total_count++;
    }
    prevEndMin = toMin(r.end);
  }
  if (cur) blocks.push(cur);
  // finalize: majority webcam, sensitive=all
  return blocks.map(b => {
    let major = '';
    let best = -1;
    for (const k of Object.keys(b.webcam_counts)) {
      if (b.webcam_counts[k] > best) { best = b.webcam_counts[k]; major = k; }
    }
    return {
      start: b.start,
      end: b.end,
      min: b.min,
      category: b.category,
      activity: b.activity,
      project: b.project,
      screen_summary: b.screen_summary,
      webcam: major,
      captures: b.captures,
      images: b.images,
      sensitive_count: b.sensitive_count,
      sensitive: b.sensitive_count === b.total_count,
      notes: b.notes,
    };
  });
}

const byDay = new Map();
for (const r of rows) {
  if (!byDay.has(r.logical_date)) byDay.set(r.logical_date, []);
  byDay.get(r.logical_date).push(r);
}

const days = [];
const dates = [...byDay.keys()].sort();
for (const date of dates) {
  const dayRows = byDay.get(date);
  const blocks = buildBlocks(dayRows);
  const tracked_min = dayRows.reduce((s,r)=>s+r.dur,0);
  const by_category = {};
  const by_project = {};
  for (const r of dayRows) {
    by_category[r.category] = (by_category[r.category] || 0) + r.dur;
    if (r.project) by_project[r.project] = (by_project[r.project] || 0) + r.dur;
  }
  const day = { date, tracked_min, by_category, by_project, blocks };
  if (DAILY_SUMMARIES[date]) day.dailySummary = DAILY_SUMMARIES[date];
  days.push(day);
}

// KST timestamp
function kstNow() {
  const d = new Date();
  const kstMs = d.getTime() + 9*60*60*1000;
  const k = new Date(kstMs);
  const pad = (n)=>String(n).padStart(2,'0');
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth()+1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}+09:00`;
}

const out = { generatedAt: kstNow(), days };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

const captures = rows.length;
const blockCount = days.reduce((s,d)=>s+d.blocks.length,0);
const withSummary = days.filter(d=>d.dailySummary).length;
console.log(JSON.stringify({ logical_days: days.length, captures, blocks: blockCount, with_summary: withSummary }));
