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

async function request(route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (State.token) headers.Authorization = `Bearer ${State.token}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`/api/${route}`, { ...options, headers });
  } catch {
    throw new Error('Cannot reach the SenseWear server. Check that it is running.');
  }

  let payload = {};
  try { payload = await response.json(); } catch { /* empty body */ }

  if (response.status === 401 && State.token) { signOut(); throw new Error('Your session expired. Sign in again.'); }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
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
