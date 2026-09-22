/* ============================================================
   SenseWear — Dashboard
   ============================================================ */

let areaChart = null;
let trendChart = null;
let trendWindow = '24h';

/* ---- SUMMARY CARDS ---- */
function renderSummary() {
  const s = summary();
  const l = limits();

  const cards = [
    { label: 'Workers Monitored', value: s.workers,
      note: s.workers ? `Across ${s.areas} process areas` : 'No records in this period', state: 'within' },

    { label: 'Currently On Shift', value: s.onShift,
      note: s.onShift ? 'Badge reporting now' : 'No badge reporting in the last hour', state: 'within' },

    { label: 'Exposure Alerts', value: s.alerts,
      note: s.alerts ? `${s.pending} awaiting acknowledgement` : 'No alerts raised',
      state: s.alerts === 0 ? 'within' : s.pending ? 'over' : 'action' },

    { label: 'Highest Recorded', value: num(s.highest), unit: 'ppm',
      note: s.average == null ? 'No readings' : `Average ${num(s.average)} ppm · limit ${l.twa} ppm`,
      state: s.highest == null ? 'within' : statusKey(statusFor(s.highest)) },

    { label: 'Total Exposure Time', value: (s.exposedMin / 60).toFixed(1), unit: 'h',
      note: `${(s.workedMin / 60).toFixed(1)} h worked · ${s.scans} scans`, state: 'within' },
  ];

  document.getElementById('summaryCards').innerHTML = cards.map(c => `
    <article class="card card-${c.state}">
      <p class="card-label">${c.label}</p>
      <p class="card-value mono">${c.value}${c.unit ? `<span class="card-unit">${c.unit}</span>` : ''}</p>
      <p class="card-note">${c.note}</p>
    </article>`).join('');
}

/* ---- PROCESS AREAS ---- */
function renderAreaCards() {
  const host = document.getElementById('areaCards');
  const rows = areaBreakdown();

  if (!rows.length) { host.innerHTML = noRecords('exposure'); return; }

  host.innerHTML = rows.map(a => `
    <article class="area-card area-${statusKey(a.status)}">
      <p class="area-code mono">${escapeHtml(a.code)}</p>
      <h3>${escapeHtml(a.name)}</h3>
      <p class="area-block">${escapeHtml(a.block)}</p>
      <p class="area-count"><span class="mono">${a.workers}</span> workers monitored${a.onShift ? ` · <span class="mono">${a.onShift}</span> on shift` : ''}</p>
      <dl class="area-figures">
        <div><dt>Average</dt><dd class="mono">${num(a.average)}</dd></div>
        <div><dt>Highest</dt><dd class="mono">${num(a.highest)}</dd></div>
      </dl>
      ${statusTag(a.status)}
    </article>`).join('');
}

/* ---- AREA EXPOSURE BAR CHART ---- */
function renderAreaChart() {
  const el = document.getElementById('areaChart');
  if (!el || typeof Chart === 'undefined') return;

  const rows = areaBreakdown();
  if (areaChart) { areaChart.destroy(); areaChart = null; }

  const figures = document.getElementById('areaChartFigures');
  const box     = document.getElementById('areaChartBox');

  if (!rows.length) {
    box.hidden = true;
    figures.innerHTML = noRecords('area exposure');
    return;
  }
  box.hidden = false;

  const averages = rows.map(a => parseFloat(a.average.toFixed(1)));
  const l = limits();

  areaChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: rows.map(a => a.code),
      datasets: [{
        data: averages,
        backgroundColor: averages.map(v => v >= l.twa ? '#C0392B' : v >= l.actionLevel ? '#C98A00' : '#1E8E4E'),
        borderRadius: 2,
        maxBarThickness: 56,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: c => areaLabel(c[0].label),
          label: c => `${c.parsed.y} ppm average`,
        } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#5C6B7F' } },
        y: { beginAtZero: true, grid: { color: '#E8EDF2' }, ticks: { color: '#5C6B7F' },
             title: { display: true, text: 'H2S concentration (ppm)', color: '#5C6B7F' } },
      },
    },
  });

  const top    = Math.max(...averages);
  const bottom = Math.min(...averages);
  const all    = State.sessions.flatMap(s => s.scans.map(x => x.ppm));
  const mean   = all.reduce((a, b) => a + b, 0) / all.length;

  figures.innerHTML = `
    <div class="figure figure-high">
      <span>Highest area average</span><strong class="mono">${top.toFixed(1)} ppm</strong>
      <small>${escapeHtml(areaLabel(rows.find(a => parseFloat(a.average.toFixed(1)) === top).code))}</small>
    </div>
    <div class="figure">
      <span>Overall average</span><strong class="mono">${mean.toFixed(1)} ppm</strong>
      <small>All areas, all readings</small>
    </div>
    <div class="figure figure-low">
      <span>Lowest area average</span><strong class="mono">${bottom.toFixed(1)} ppm</strong>
      <small>${escapeHtml(areaLabel(rows.find(a => parseFloat(a.average.toFixed(1)) === bottom).code))}</small>
    </div>`;
}

/* ---- EXPOSURE TREND ---- */
async function pickTrend(window, el) {
  trendWindow = window;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('is-current'));
  if (el) el.classList.add('is-current');
  await loadTrend();
  renderTrendChart();
}

function renderTrendChart() {
  const el = document.getElementById('trendChart');
  if (!el || typeof Chart === 'undefined') return;

  if (trendChart) { trendChart.destroy(); trendChart = null; }

  const series = trendSeries(trendWindow);
  const box    = document.getElementById('trendChartBox');
  const empty  = document.getElementById('trendEmpty');

  if (!series.some(p => p.value != null)) {
    box.hidden = true; empty.hidden = false;
    empty.innerHTML = noRecords('readings');
    return;
  }
  box.hidden = false; empty.hidden = true;

  const l = limits();

  trendChart = new Chart(el, {
    type: 'line',
    data: {
      labels: series.map(p => p.label),
      datasets: [
        { data: series.map(p => p.value), borderColor: '#1F4E79',
          backgroundColor: 'rgba(31,78,121,0.08)', borderWidth: 2, fill: true,
          spanGaps: true, tension: 0.25,
          pointRadius: series.length > 24 ? 0 : 3, pointBackgroundColor: '#1F4E79' },
        { data: series.map(() => l.twa), borderColor: '#C0392B', borderWidth: 1.5,
          borderDash: [5, 4], pointRadius: 0, fill: false, label: 'Permissible limit' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { filter: c => c.datasetIndex === 0, callbacks: { label: c => `${c.parsed.y} ppm average` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#5C6B7F', maxRotation: 0, autoSkipPadding: 14 } },
        y: { beginAtZero: true, grid: { color: '#E8EDF2' }, ticks: { color: '#5C6B7F' },
             title: { display: true, text: 'H2S concentration (ppm)', color: '#5C6B7F' } },
      },
    },
  });
}

/* ---- ALERTS ---- */
function renderDashAlerts() {
  document.getElementById('dashAlerts').innerHTML = alertList(State.alerts.slice(0, 6));
}

function alertList(rows) {
  if (!rows.length) return noRecords('exposure alerts');

  return `<ul class="alerts">${rows.map(a => `
    <li class="alert alert-${a.level}${a.acknowledged ? ' is-done' : ''}">
      <span class="alert-bar"></span>
      <div class="alert-main">
        <p class="alert-title">${escapeHtml(a.title)}</p>
        <p class="alert-meta">
          ${escapeHtml(a.workerId)} · ${escapeHtml(a.name)} · ${escapeHtml(areaLabel(a.areaCode))}
          · ${formatDate(a.date)} ${hhmm(a.at)}
        </p>
        ${a.acknowledged ? `<p class="alert-ack">Acknowledged by ${escapeHtml(a.acknowledged.by)} on ${formatDate(a.acknowledged.at.slice(0, 10))}</p>` : ''}
      </div>
      <p class="alert-reading"><span class="mono">${num(a.ppm)}</span> ppm</p>
      ${a.acknowledged ? '' : `<button class="btn btn-plain" onclick="acknowledge('${a.id}')">Acknowledge</button>`}
    </li>`).join('')}</ul>`;
}

async function acknowledge(id) {
  try {
    const { acknowledged } = await Api.acknowledge(id);
    const alert = State.alerts.find(a => a.id === id);
    if (alert) alert.acknowledged = acknowledged;
    renderSummary();
    renderDashAlerts();
    renderAllAlerts();
    toast('Alert acknowledged and recorded.');
  } catch (e) {
    toast(e.message);
  }
}
