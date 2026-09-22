/* ============================================================
   SenseWear — Shell: sign-in, tabs, reporting period, loading
   ============================================================ */

let currentPage = 'pageDashboard';

/* ---- DATES AND FORMATTING ---- */
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/* The console must agree with the server about which day it is,
   so "today" follows the plant's timezone, not the browser's. */
function plantNow() {
  const tz = State.config && State.config.plant.timezone;
  if (!tz) return new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${String(Number(parts.hour) % 24).padStart(2, '0')}:${parts.minute}:00`);
}

function todayISO() { return toISODate(plantNow()); }

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function formatDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}
function shortDate(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
}
function hhmm(mins) {
  return mins == null ? '—' : `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(Math.round(mins) % 60).padStart(2, '0')}`;
}
function duration(mins) {
  if (!mins || mins < 1) return '0h 00m';
  return `${Math.floor(mins / 60)}h ${String(Math.round(mins) % 60).padStart(2, '0')}m`;
}
function nowMinutes() {
  const d = plantNow();
  return d.getHours() * 60 + d.getMinutes();
}
function num(value, digits = 1) {
  return value == null ? '—' : Number(value).toFixed(digits);
}

/* ---- REPORTING PERIOD ---- */
const range = { preset: 'today', from: todayISO(), to: todayISO() };

function setRange(preset, from, to) {
  const today = todayISO();
  range.preset = preset;
  if (preset === 'today')  { range.from = today;               range.to = today; }
  if (preset === '7days')  { range.from = addDays(today, -6);  range.to = today; }
  if (preset === '30days') { range.from = addDays(today, -29); range.to = today; }
  if (preset === 'custom') { range.from = from;                range.to = to; }
}

function rangeLabel() {
  return range.preset === 'today'
    ? `Today, ${formatDate(range.from)}`
    : `${formatDate(range.from)} to ${formatDate(range.to)}`;
}

/* The masthead appears on both the login screen and the console,
   so these are filled by attribute rather than by id. */
function fillAll(plant) {
  const values = {
    authorityHi: plant.authorityHi || '',
    authorityEn: plant.authority   || '',
    portalName:  plant.portal      || '',
  };
  Object.entries(values).forEach(([key, value]) => {
    document.querySelectorAll(`[data-fill="${key}"]`).forEach(el => { el.textContent = value; });
  });
}

/* ---- SIGN IN ---- */
async function handleSignIn(e) {
  e.preventDefault();
  const id   = document.getElementById('signInId').value.trim().toUpperCase();
  const pass = document.getElementById('signInPass').value;
  const err  = document.getElementById('signInError');
  const btn  = document.getElementById('signInBtn');

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  err.hidden = true;

  try {
    const { token, officer } = await Api.signIn(id, pass);
    State.token   = token;
    State.officer = officer;
    sessionStorage.setItem('sensewear.token', token);
    sessionStorage.setItem('sensewear.officer', JSON.stringify(officer));
    await openConsole();
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function openConsole() {
  document.getElementById('signInScreen').hidden = true;
  document.getElementById('app').hidden          = false;

  const plant = State.config.plant;
  fillAll(plant);
  document.getElementById('heroPlant').textContent     = `${plant.name}, ${plant.location}`;
  document.getElementById('footerPlant').textContent   = `${plant.name} · ${plant.location}`;
  document.getElementById('authorityName').textContent = plant.authority;
  document.getElementById('officerName').textContent = State.officer.name || State.officer.id;
  document.getElementById('lastUpdated').textContent =
    new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  document.getElementById('limitNote').textContent =
    `Action level ${limits().actionLevel} ppm · Permissible limit ${limits().twa} ppm (TWA) · STEL ${limits().stel} ppm`;

  const today = todayISO();
  const from = document.getElementById('rangeFrom'), to = document.getElementById('rangeTo');
  from.value = addDays(today, -6); from.max = today;
  to.value   = today;             to.max   = today;

  initWorkers();
  await loadPeriod();
}

function signOut() {
  State.token = null; State.officer = null;
  State.sessions = []; State.alerts = []; State.workers = [];
  sessionStorage.removeItem('sensewear.token');
  sessionStorage.removeItem('sensewear.officer');
  document.getElementById('app').hidden          = true;
  document.getElementById('signInScreen').hidden = false;
  document.getElementById('signInPass').value    = '';
}

/* ---- LOADING THE SELECTED PERIOD ---- */
async function loadPeriod() {
  State.loading = true;
  State.error   = null;
  paintLoading();

  try {
    const [workers, sessions, alerts] = await Promise.all([
      Api.workers(),
      Api.sessions(range.from, range.to),
      Api.alerts(range.from, range.to),
    ]);
    State.workers  = workers;
    State.sessions = sessions;
    State.alerts   = alerts;
    await loadTrend();
  } catch (e) {
    State.error = e.message;
  } finally {
    State.loading = false;
    renderAll();
  }
}

/* The trend chart spans its own window, independent of the
   reporting period. */
async function loadTrend() {
  const days = trendWindow === '24h' ? 1 : trendWindow === '7d' ? 7 : 30;
  try { State.trend = await Api.sessions(addDays(todayISO(), -(days - 1)), todayISO()); }
  catch { State.trend = []; }
}

function paintLoading() {
  document.getElementById('loadingBar').hidden = !State.loading;
}

function renderAll() {
  document.getElementById('rangeLabel').textContent = rangeLabel();
  paintLoading();

  const banner = document.getElementById('errorBanner');
  banner.hidden = !State.error;
  if (State.error) banner.textContent = State.error;

  renderSummary();
  renderAreaCards();
  renderAreaChart();
  renderTrendChart();
  renderDashAlerts();
  renderWorkerTable();
  renderExposureTable();
  renderAllAlerts();
  renderReportFacts();
}

const hasRecords = () => State.sessions.length > 0;

/* Shown wherever a figure would otherwise be invented. */
function noRecords(what) {
  return `<p class="empty">
    <strong>No ${what} recorded for this period.</strong>
    Records appear once SenseWear badges report readings, or once an administrator
    imports them with <code>node admin.js import-readings</code>.
  </p>`;
}

/* ---- TABS ---- */
function showPage(pageId, tabEl) {
  document.querySelectorAll('.page').forEach(p => { p.hidden = p.id !== pageId; });
  currentPage = pageId;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-current'));
  const tab = tabEl || document.querySelector(`.tab[data-page="${pageId}"]`);
  if (tab) {
    tab.classList.add('is-current');
    document.getElementById('crumb').textContent = tab.textContent.trim();
    const heroes = { pageDashboard: 'Exposure Monitoring Dashboard', pageWorkers: 'Worker Monitoring Register',
                     pageExposure: 'Area Exposure and Incidents', pageReports: 'Statutory Returns' };
    document.getElementById('heroTitle').textContent = heroes[pageId] || tab.textContent.trim();
  }
  document.getElementById('tabs').classList.remove('is-open');
  window.scrollTo({ top: 0 });
  if (pageId === 'pageDashboard') { renderAreaChart(); renderTrendChart(); }
}

function toggleNav() { document.getElementById('tabs').classList.toggle('is-open'); }

/* ---- ACCESSIBILITY CONTROLS ----
   Text sizing and high contrast are standard on government
   portals, so both persist across visits. */
function setTextSize(scale) {
  document.documentElement.setAttribute('data-scale', String(scale));
  try { localStorage.setItem('sensewear.scale', String(scale)); } catch { /* storage blocked */ }
}

/* Search in the masthead jumps to Workers and filters it, which is
   the only thing on this console worth searching. */
function siteSearch(e) {
  e.preventDefault();
  const q = document.getElementById('siteQuery').value.trim();
  document.getElementById('workerSearch').value = q;
  showPage('pageWorkers');
  renderWorkerTable();
  return false;
}

/* Hindi labels for the chrome. Page data stays in English, which is
   how the record is held. */
const HI = {
  Dashboard: 'डैशबोर्ड', Workers: 'कर्मचारी', Exposure: 'अनावरण', Reports: 'रिपोर्ट',
  Home: 'मुख्य पृष्ठ', Logout: 'लॉग आउट', 'Reporting Period': 'रिपोर्टिंग अवधि',
  Today: 'आज', 'Last 7 Days': 'पिछले 7 दिन', 'Last 30 Days': 'पिछले 30 दिन',
  'Custom Range': 'अवधि चुनें',
};
let hindi = false;

function toggleLanguage() {
  hindi = !hindi;
  document.querySelectorAll('.js-lang').forEach(btn => {
    btn.textContent = hindi ? 'English' : 'हिन्दी';
    btn.lang = hindi ? 'en' : 'hi';
  });

  document.querySelectorAll('.tab').forEach(t => {
    const en = t.dataset.en || (t.dataset.en = t.textContent.trim());
    t.textContent = hindi ? (HI[en] || en) : en;
  });
  document.querySelectorAll('.period').forEach(p => {
    const en = p.dataset.en || (p.dataset.en = p.textContent.trim());
    p.textContent = hindi ? (HI[en] || en) : en;
  });
  const label = document.querySelector('.periodbar-label');
  label.textContent = hindi ? HI['Reporting Period'] : 'Reporting Period';
  document.querySelector('.btn-logout').textContent = hindi ? HI.Logout : 'Logout';

  document.documentElement.lang = hindi ? 'hi' : 'en';
  try { localStorage.setItem('sensewear.lang', hindi ? 'hi' : 'en'); } catch { /* blocked */ }
}

function toggleContrast() {
  const on = document.body.classList.toggle('contrast');
  document.querySelectorAll('.js-contrast').forEach(b => {
    b.textContent = on ? 'Normal Contrast' : 'High Contrast';
  });
  try { localStorage.setItem('sensewear.contrast', on ? '1' : '0'); } catch { /* storage blocked */ }
}

function restorePreferences() {
  let scale = '0', contrast = '0';
  try {
    scale    = localStorage.getItem('sensewear.scale')    || '0';
    contrast = localStorage.getItem('sensewear.contrast') || '0';
  } catch { /* storage blocked */ }

  document.documentElement.setAttribute('data-scale', scale);
  try { if (localStorage.getItem('sensewear.lang') === 'hi') toggleLanguage(); } catch { /* blocked */ }
  if (contrast === '1') {
    document.body.classList.add('contrast');
    document.querySelectorAll('.js-contrast').forEach(b => { b.textContent = 'Normal Contrast'; });
  }
}

/* ---- PERIOD CONTROLS ---- */
function pickRange(preset, el) {
  markPeriod(el);
  document.getElementById('customRange').hidden = true;
  setRange(preset);
  loadPeriod();
}

function openCustom(el) {
  markPeriod(el);
  document.getElementById('customRange').hidden = false;
  applyCustom();
}

function applyCustom() {
  let from = document.getElementById('rangeFrom').value;
  let to   = document.getElementById('rangeTo').value;
  if (!from || !to) return;
  if (from > to) {
    [from, to] = [to, from];
    document.getElementById('rangeFrom').value = from;
    document.getElementById('rangeTo').value   = to;
  }
  setRange('custom', from, to);
  loadPeriod();
}

function markPeriod(el) {
  document.querySelectorAll('.period').forEach(p => p.classList.remove('is-current'));
  if (el) el.classList.add('is-current');
}

/* ---- SHARED PIECES ---- */
function statusTag(status) {
  return `<span class="tag tag-${statusKey(status)}">${status}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(message) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ---- BOOT ---- */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('signInForm').addEventListener('submit', handleSignIn);
  restorePreferences();

  try {
    State.config = await Api.config();
    const p = State.config.plant;
    fillAll(p);
    document.getElementById('signInPlantLine').textContent = `Registered establishment: ${p.name}, ${p.location}`;
    document.getElementById('signInAuthority').textContent = p.authority || '';
  } catch (e) {
    const err = document.getElementById('signInError');
    err.textContent = e.message;
    err.hidden = false;
    return;
  }

  // Resume an existing session rather than asking again on reload.
  const saved = sessionStorage.getItem('sensewear.officer');
  if (State.token && saved) {
    State.officer = JSON.parse(saved);
    try { await openConsole(); }
    catch { signOut(); }
  }
});
