/* ============================================================
   SenseWear — API client and derived figures
   The console holds no measurements of its own. Everything on
   screen comes from /api, which returns only what SenseWear
   badges have recorded.
   ============================================================ */

const State = {
  token:    sessionStorage.getItem('sensewear.token') || null,
  officer:  null,
  config:   null,
  workers:  [],
  sessions: [],
  alerts:   [],
  trend:    [],
  loading:  false,
  error:    null,
};

/* ---- STATIC DEPLOYMENT ----
   This build is published to a static host, so there is no /api to
   call. The records under data/ were produced by the SenseWear server
   itself — its own /api/config, /workers, /sessions and /alerts
   responses, written out verbatim — so every figure on screen is the
   one the server computed from the badge readings. Nothing is
   generated here; this layer only selects and re-dates.

   Sessions and alerts carry a plant-local date plus minute offsets
   within that day, never absolute timestamps, so rolling the archive
   forward is a whole-day rename: the same measurements at the same
   clock times, on a window ending today. That keeps every reporting
   period populated whenever the console is opened. */
const DEMO = {
  files: { config: 'data/config.json', workers: 'data/workers.json',
           sessions: 'data/sessions.json', alerts: 'data/alerts.json' },
  cache: {},
  shiftDays: null,
  officer: { id: 'SAFE01', name: 'S. Murthy', title: 'Chief Safety Officer' },
  password: '12345678',
  acks: JSON.parse(sessionStorage.getItem('sensewear.acks') || '{}'),
};

async function demoLoad(name) {
  if (!DEMO.cache[name]) {
    const response = await fetch(DEMO.files[name], { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Records unavailable (${DEMO.files[name]}).`);
    DEMO.cache[name] = await response.json();
  }
  return DEMO.cache[name];
}

/* Whole days between the newest recorded day and today. Computed once
   from the archive itself, so the roll is the same for every route. */
async function demoShift() {
  if (DEMO.shiftDays === null) {
    const sessions = await demoLoad('sessions');
    const newest = sessions.reduce((a, s) => (s.date > a ? s.date : a), sessions[0].date);
    const days = Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) / 86400000);
    DEMO.shiftDays = Math.max(0, days);
  }
  return DEMO.shiftDays;
}

/* Row ids embed the date ("W-1101|2026-09-23|limit"), and alert ids are
   what an acknowledgement is filed against, so they move with it. */
function demoRoll(rows, days) {
  if (!days) return rows;
  return rows.map(row => {
    const date = addDays(row.date, days);
    return { ...row, date, id: row.id ? row.id.split('|').map(p => (p === row.date ? date : p)).join('|') : row.id };
  });
}

function demoRange(rows, query) {
  const from = query.get('from'), to = query.get('to');
  return rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
}

async function request(route, options = {}) {
  const [path, search] = route.split('?');
  const query = new URLSearchParams(search || '');
  const sent  = options.body ? JSON.parse(options.body) : {};

  if (path === 'config') return demoLoad('config');

  if (path === 'session') {
    if (String(sent.id).toUpperCase() !== DEMO.officer.id || sent.password !== DEMO.password) {
      throw new Error('Incorrect officer ID or password.');
    }
    return { token: 'demo', officer: DEMO.officer };
  }

  if (!State.token) { signOut(); throw new Error('Sign in to continue.'); }

  if (path === 'workers') return demoLoad('workers');

  if (path === 'sessions' || path === 'alerts') {
    const rows = demoRoll(await demoLoad(path), await demoShift());
    if (path === 'alerts') {
      return demoRange(rows.map(a => ({ ...a, acknowledged: DEMO.acks[a.id] || null })), query);
    }
    return demoRange(rows, query);
  }

  if (path === 'alerts/acknowledge') {
    if (!sent.id) throw new Error('An alert id is required.');
    DEMO.acks[sent.id] = { by: DEMO.officer.name, at: new Date().toISOString() };
    sessionStorage.setItem('sensewear.acks', JSON.stringify(DEMO.acks));
    return { id: sent.id, acknowledged: DEMO.acks[sent.id] };
  }

  throw new Error(`No such endpoint: ${path}`);
}

const Api = {
  config:  ()              => request('config'),
  signIn:  (id, password)  => request('session', { method: 'POST', body: JSON.stringify({ id, password }) }),
  workers: ()              => request('workers'),
  sessions:(from, to)      => request(`sessions?from=${from}&to=${to}`),
  alerts:  (from, to)      => request(`alerts?from=${from}&to=${to}`),
  acknowledge: id          => request('alerts/acknowledge', { method: 'POST', body: JSON.stringify({ id }) }),
};

/* ---- CONFIG LOOKUPS ---- */
const areaCodes = () => (State.config ? State.config.areas.map(a => a.code) : []);

function area(code) {
  return (State.config && State.config.areas.find(a => a.code === code)) || { code, name: code, block: '' };
}

function areaLabel(code) {
  const a = area(code);
  return a.name === a.code ? a.code : `${a.name} (${a.code})`;
}

const limits = () => (State.config ? State.config.limits : { twa: 10, stel: 15, actionLevel: 5 });

/* Status is defined by the statutory limits in config.json. */
function statusFor(ppm) {
  const l = limits();
  if (ppm >= l.twa)         return 'Above Limit';
  if (ppm >= l.actionLevel) return 'Action Level';
  return 'Within Limit';
}

function statusKey(status) {
  return status === 'Above Limit' ? 'over' : status === 'Action Level' ? 'action' : 'within';
}

function rank(status) {
  return status === 'Above Limit' ? 0 : status === 'Action Level' ? 1 : 2;
}

/* ---- DERIVED FIGURES ---- */
function summary() {
  const rows   = State.sessions;
  const values = rows.flatMap(s => s.scans.map(x => x.ppm));
  const onShift = rows.filter(s => s.date === todayISO() && isOngoing(s)).length;

  return {
    workers:    new Set(rows.map(s => s.workerId)).size,
    onShift,
    alerts:     State.alerts.length,
    pending:    State.alerts.filter(a => !a.acknowledged).length,
    highest:    values.length ? Math.max(...values) : null,
    lowest:     values.length ? Math.min(...values) : null,
    average:    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    areas:      new Set(rows.map(s => s.areaCode)).size,
    workedMin:  rows.reduce((t, s) => t + s.workedMin, 0),
    exposedMin: rows.reduce((t, s) => t + s.exposedMin, 0),
    scans:      rows.reduce((t, s) => t + s.scanCount, 0),
  };
}

/* A session counts as in progress while its last scan is inside
   the badge's reporting interval. */
function isOngoing(session) {
  if (session.date !== todayISO()) return false;
  const gap = State.config ? State.config.device.scanIntervalMinutes : 30;
  return nowMinutes() - session.endMin <= gap * 2;
}

function areaBreakdown() {
  const present = areaCodes().filter(code => State.sessions.some(s => s.areaCode === code));

  return present.map(code => {
    const rows   = State.sessions.filter(s => s.areaCode === code);
    const values = rows.flatMap(s => s.scans.map(x => x.ppm));
    const average = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      code,
      name:    area(code).name,
      block:   area(code).block,
      workers: new Set(rows.map(s => s.workerId)).size,
      onShift: rows.filter(isOngoing).length,
      highest: Math.max(...values),
      lowest:  Math.min(...values),
      average,
      status:  statusFor(average),
      peakStatus: statusFor(Math.max(...values)),
      scans:   rows.reduce((t, s) => t + s.scanCount, 0),
    };
  }).sort((a, b) => b.average - a.average);
}

/* Latest session per worker inside the selected period. */
function workerRows() {
  const latest = new Map();
  State.sessions.forEach(s => {
    const held = latest.get(s.workerId);
    if (!held || s.date > held.date) latest.set(s.workerId, s);
  });

  return [...latest.values()]
    .map(s => ({ ...s, status: statusFor(s.latestPpm), ongoing: isOngoing(s) }))
    .sort((a, b) => rank(a.status) - rank(b.status) || b.latestPpm - a.latestPpm);
}

function periodTotalsFor(workerId) {
  const mine = State.sessions.filter(s => s.workerId === workerId);
  const values = mine.flatMap(s => s.scans.map(x => x.ppm));
  return {
    days:       mine.length,
    workedMin:  mine.reduce((t, s) => t + s.workedMin, 0),
    exposedMin: mine.reduce((t, s) => t + s.exposedMin, 0),
    scans:      mine.reduce((t, s) => t + s.scanCount, 0),
    peak:       values.length ? Math.max(...values) : null,
    average:    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    sessions:   mine.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/* ---- TREND ----
   24 hours reads hourly, longer windows read daily. Built from
   whatever sessions the trend window itself loaded. */
function trendSeries(window) {
  const rows = State.trend;

  if (window === '24h') {
    const today = rows.filter(s => s.date === todayISO());
    return Array.from({ length: 24 }, (_, h) => {
      const vals = today.flatMap(s => s.scans.filter(x => Math.floor(x.at / 60) === h).map(x => x.ppm));
      return { label: `${String(h).padStart(2, '0')}:00`, value: mean(vals) };
    });
  }

  const days = window === '7d' ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(todayISO(), -(days - 1 - i));
    const vals = rows.filter(s => s.date === date).flatMap(s => s.scans.map(x => x.ppm));
    return { label: shortDate(date), value: mean(vals) };
  });
}

function mean(values) {
  return values.length ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null;
}

function getWorker(id) { return State.workers.find(w => w.id === id) || null; }
