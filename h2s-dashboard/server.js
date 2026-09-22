/* ============================================================
   SenseWear — application server
   Serves the console and the monitoring API. Exposure records
   are persisted to disk under store/ and are only ever what
   has been ingested from SenseWear badges or imported by an
   administrator. Nothing here generates readings.
   ============================================================ */

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const PORT  = process.env.PORT || 3000;
const ROOT  = __dirname;
const STORE = path.join(ROOT, 'store');

const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

/* Operator credentials are kept in store/, never in config.json —
   config.json is committed, store/ is not. */
function officers() {
  try { return JSON.parse(fs.readFileSync(path.join(STORE, 'officers.json'), 'utf8')); }
  catch { return []; }
}

/* ---- PERSISTENCE ---- */
function storePath(name) { return path.join(STORE, `${name}.json`); }

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(storePath(name), 'utf8')); }
  catch { return fallback; }
}

function write(name, value) {
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(storePath(name), JSON.stringify(value, null, 2));
}

/* ---- SESSIONS (operator login) ---- */
const tokens = new Map();                       // token -> { officer, issued }
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

function authenticate(id, password) {
  const officer = officers().find(o => o.id === String(id).toUpperCase());
  if (!officer || !officer.passwordHash) return null;
  if (sha256(password) !== officer.passwordHash) return null;
  return { id: officer.id, name: officer.name, title: officer.title };
}

function tokenFor(officer) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { officer, issued: Date.now() });
  return token;
}

function officerFor(req) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  const held   = token && tokens.get(token);
  if (!held) return null;
  if (Date.now() - held.issued > TOKEN_TTL_MS) { tokens.delete(token); return null; }
  return held.officer;
}

/* ---- DERIVATION ----------------------------------------------
   Raw badge readings are the only stored measurement. Work
   sessions and alerts are computed from them on read, so the
   two can never drift apart.
----------------------------------------------------------------*/
/* Readings are stored as UTC instants but a shift belongs to the
   plant's own calendar day. Grouping by UTC would split a night
   shift across two dates and report absurd durations, so every
   date and clock time here is resolved in the plant timezone. */
const TZ = CONFIG.plant.timezone || 'UTC';
const PLANT_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function plantTime(iso) {
  const parts = Object.fromEntries(
    PLANT_CLOCK.formatToParts(new Date(iso))
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value]));
  return {
    date:    `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

function localDate(iso) { return plantTime(iso).date; }
function minutesOf(iso) { return plantTime(iso).minutes; }

function buildSessions(readings, workers) {
  const byKey = new Map();

  readings.forEach(r => {
    const key = `${r.workerId}|${localDate(r.at)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  });

  const out = [];
  byKey.forEach((rows, key) => {
    const [workerId, date] = key.split('|');
    const worker = workers.find(w => w.id === workerId);
    rows.sort((a, b) => new Date(a.at) - new Date(b.at));

    const scans  = rows.map(r => ({ at: minutesOf(r.at), ppm: Number(r.ppm), area: r.areaCode }));
    const values = scans.map(s => s.ppm);
    const last   = scans[scans.length - 1];
    const gap    = CONFIG.device.scanIntervalMinutes;

    /* Each reading accounts for the interval it closes, so exposure
       time can never exceed time worked. A missed scan is credited
       at most two intervals, rather than the whole silent stretch. */
    let workedMin = 0, exposedMin = 0;
    scans.forEach((s, i) => {
      const span = i === 0 ? gap : Math.min(s.at - scans[i - 1].at, gap * 2);
      workedMin += span;
      if (s.ppm >= CONFIG.limits.actionLevel) exposedMin += span;
    });

    out.push({
      id:         key,
      workerId,
      name:       worker ? worker.name : workerId,
      areaCode:   last.area,
      shift:      worker ? worker.shift : '',
      date,
      startMin:   scans[0].at,
      endMin:     last.at,
      workedMin,
      exposedMin,
      scans,
      scanCount:  scans.length,
      latestPpm:  last.ppm,
      peakPpm:    Math.max(...values),
      avgPpm:     values.reduce((a, b) => a + b, 0) / values.length,
      lastScanAt: last.at,
    });
  });

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function buildAlerts(sessions, acks) {
  const alerts = [];

  sessions.forEach(s => {
    const over = s.scans.find(x => x.ppm >= CONFIG.limits.twa);
    if (over) {
      alerts.push({
        id: `${s.workerId}|${s.date}|limit`,
        level: 'limit', title: 'Exposure at or above permissible limit',
        workerId: s.workerId, name: s.name, areaCode: over.area,
        date: s.date, at: over.at, ppm: over.ppm,
      });
    } else if (s.scans.filter(x => x.ppm >= CONFIG.limits.actionLevel).length >= 4) {
      alerts.push({
        id: `${s.workerId}|${s.date}|repeated`,
        level: 'action', title: 'Repeated exposure above action level',
        workerId: s.workerId, name: s.name, areaCode: s.areaCode,
        date: s.date, at: s.endMin, ppm: s.peakPpm,
      });
    }
  });

  return alerts.map(a => ({ ...a, acknowledged: acks[a.id] || null }))
               .sort((a, b) => (b.date + String(b.at).padStart(4, '0'))
                      .localeCompare(a.date + String(a.at).padStart(4, '0')));
}

function inRange(rows, from, to) {
  return rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
}

/* ---- API ---- */
function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 5e6) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Body is not valid JSON')); }
    });
  });
}

async function api(req, res, url) {
  const route = url.pathname.replace(/^\/api\/?/, '');
  const q     = url.searchParams;

  if (route === 'health') {
    return json(res, 200, { ok: true, readings: read('readings', []).length });
  }

  if (route === 'config') {
    const { officers, ...safe } = CONFIG;               // never expose credentials
    return json(res, 200, safe);
  }

  if (route === 'session' && req.method === 'POST') {
    const { id, password } = await body(req);
    const officer = authenticate(id, password);
    if (!officer) return json(res, 401, { error: 'Incorrect officer ID or password.' });
    return json(res, 200, { token: tokenFor(officer), officer });
  }

  /* Badge ingest is authenticated by device key, not by operator login. */
  if (route === 'ingest' && req.method === 'POST') {
    const key = req.headers['x-device-key'];
    if (!process.env.SENSEWEAR_DEVICE_KEY || key !== process.env.SENSEWEAR_DEVICE_KEY) {
      return json(res, 401, { error: 'Invalid or missing device key.' });
    }
    const payload  = await body(req);
    const incoming = Array.isArray(payload) ? payload : [payload];
    const clean    = [];

    for (const r of incoming) {
      if (!r || !r.workerId || !r.areaCode || r.ppm == null || !r.at) {
        return json(res, 400, { error: 'Each reading needs workerId, areaCode, ppm and at.' });
      }
      if (Number.isNaN(Date.parse(r.at)))    return json(res, 400, { error: `Unparseable timestamp: ${r.at}` });
      if (Number.isNaN(Number(r.ppm)))       return json(res, 400, { error: `Unparseable ppm: ${r.ppm}` });
      clean.push({ workerId: r.workerId, areaCode: r.areaCode, ppm: Number(r.ppm), at: new Date(r.at).toISOString() });
    }

    const readings = read('readings', []).concat(clean);
    write('readings', readings);
    return json(res, 201, { accepted: clean.length, total: readings.length });
  }

  /* Everything past here needs an operator session. */
  const officer = officerFor(req);
  if (!officer) return json(res, 401, { error: 'Sign in to continue.' });

  const workers  = read('workers', []);
  const readings = read('readings', []);
  const acks     = read('acknowledgements', {});
  const from = q.get('from'), to = q.get('to');

  if (route === 'workers')  return json(res, 200, workers);

  if (route === 'sessions') {
    return json(res, 200, inRange(buildSessions(readings, workers), from, to));
  }

  if (route === 'alerts') {
    return json(res, 200, inRange(buildAlerts(buildSessions(readings, workers), acks), from, to));
  }

  if (route === 'alerts/acknowledge' && req.method === 'POST') {
    const { id } = await body(req);
    if (!id) return json(res, 400, { error: 'An alert id is required.' });
    acks[id] = { by: officer.name || officer.id, at: new Date().toISOString() };
    write('acknowledgements', acks);
    return json(res, 200, { id, acknowledged: acks[id] });
  }

  return json(res, 404, { error: `No such endpoint: ${route}` });
}

/* ---- STATIC ---- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function serveStatic(req, res, url) {
  const rel  = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(ROOT, rel));

  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  if (file.startsWith(STORE) || path.basename(file) === 'config.json') {
    res.writeHead(403).end('Forbidden');                 // credentials and records are API-only
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type':  MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/* ---- SERVER ---- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (err) {
    json(res, 400, { error: err.message });
  }
}).listen(PORT, () => {
  const readings = read('readings', []).length;
  const workers  = read('workers', []).length;
  console.log(`SenseWear — ${CONFIG.plant.shortName}`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  ${workers} workers on roster, ${readings} readings stored`);
  if (!workers || !readings) console.log('  Load records with: node admin.js');
  if (!officers().some(o => o.passwordHash)) {
    console.log('  No operator account configured. Run: node admin.js add-officer <ID> "<Name>" "<Title>"');
  }
});
