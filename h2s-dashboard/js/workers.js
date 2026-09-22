/* ============================================================
   SenseWear — Worker monitoring table and record panel
   ============================================================ */

function initWorkers() {
  document.getElementById('workerArea').innerHTML =
    '<option value="">All process areas</option>' +
    (State.config ? State.config.areas.map(a => `<option value="${a.code}">${a.code} — ${a.name}</option>`).join('') : '');
}

function visibleWorkers() {
  const q      = document.getElementById('workerSearch').value.trim().toLowerCase();
  const code   = document.getElementById('workerArea').value;
  const status = document.getElementById('workerStatus').value;

  return workerRows().filter(s => {
    if (code   && s.areaCode !== code)   return false;
    if (status && s.status   !== status) return false;
    if (q && !`${s.workerId} ${s.name}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderWorkerTable() {
  const host = document.getElementById('workerTable');
  const all  = workerRows();

  if (!all.length) {
    document.getElementById('workerCount').textContent = '';
    host.innerHTML = noRecords('worker monitoring');
    return;
  }

  const rows = visibleWorkers();
  document.getElementById('workerCount').textContent =
    rows.length === all.length ? `${all.length} workers` : `${rows.length} of ${all.length} workers`;

  if (!rows.length) {
    host.innerHTML = `<p class="empty">No worker matches these filters.</p>`;
    return;
  }

  host.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Worker ID</th><th>Name</th><th>Process Area</th>
          <th class="num">Latest Reading</th><th class="num">Exposure Duration</th>
          <th>Start</th><th>End</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(s => `
          <tr tabindex="0" role="button" onclick="openWorker('${s.workerId}')"
              onkeydown="if(event.key==='Enter')openWorker('${s.workerId}')">
            <td class="mono">${escapeHtml(s.workerId)}</td>
            <td>${escapeHtml(s.name)}</td>
            <td><span class="mono area-chip">${escapeHtml(s.areaCode)}</span> ${escapeHtml(area(s.areaCode).name)}</td>
            <td class="num mono">${num(s.latestPpm)}</td>
            <td class="num mono">${duration(s.exposedMin)}</td>
            <td class="mono">${hhmm(s.startMin)}</td>
            <td class="mono">${s.ongoing ? 'On shift' : hhmm(s.endMin)}</td>
            <td>${statusTag(s.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function clearWorkerFilters() {
  document.getElementById('workerSearch').value = '';
  document.getElementById('workerArea').value   = '';
  document.getElementById('workerStatus').value = '';
  renderWorkerTable();
}

/* ---- WORKER RECORD ---- */
function openWorker(workerId) {
  const current = workerRows().find(s => s.workerId === workerId);
  if (!current) return;

  const worker = getWorker(workerId);
  const totals = periodTotalsFor(workerId);

  document.getElementById('workerPanel').innerHTML = `
    <header class="panel-head">
      <div>
        <p class="panel-id mono">${escapeHtml(workerId)}</p>
        <h2>${escapeHtml(current.name)}</h2>
        ${worker && worker.department ? `<p class="panel-dept">${escapeHtml(worker.department)}</p>` : ''}
      </div>
      <button class="panel-close" onclick="closeWorker()" aria-label="Close">&times;</button>
    </header>

    <div class="panel-reading">
      <p class="panel-reading-value mono">${num(current.latestPpm)}<span>ppm</span></p>
      ${statusTag(current.status)}
      <p class="panel-reading-note">
        Recorded ${hhmm(current.lastScanAt)} on ${formatDate(current.date)}
        · permissible limit ${limits().twa} ppm
      </p>
    </div>

    <dl class="panel-facts">
      <div><dt>Process area</dt><dd>${escapeHtml(areaLabel(current.areaCode))}</dd></div>
      <div><dt>Shift</dt><dd>${escapeHtml(current.shift || '—')}</dd></div>
      <div><dt>Work start</dt><dd class="mono">${hhmm(current.startMin)}</dd></div>
      <div><dt>Work end</dt><dd class="mono">${current.ongoing ? 'On shift' : hhmm(current.endMin)}</dd></div>
      <div><dt>Working time, latest day</dt><dd class="mono">${duration(current.workedMin)}</dd></div>
      <div><dt>Exposure time, latest day</dt><dd class="mono">${duration(current.exposedMin)}</dd></div>
      <div><dt>Scans, latest day</dt><dd class="mono">${current.scanCount}</dd></div>
    </dl>

    <h3 class="panel-sub">Selected period — ${escapeHtml(rangeLabel())}</h3>
    <dl class="panel-facts">
      <div><dt>Days monitored</dt><dd class="mono">${totals.days}</dd></div>
      <div><dt>Total working time</dt><dd class="mono">${duration(totals.workedMin)}</dd></div>
      <div><dt>Total exposure time</dt><dd class="mono">${duration(totals.exposedMin)}</dd></div>
      <div><dt>Total scans</dt><dd class="mono">${totals.scans}</dd></div>
      <div><dt>Peak reading</dt><dd class="mono">${num(totals.peak)} ppm</dd></div>
      <div><dt>Average reading</dt><dd class="mono">${num(totals.average)} ppm</dd></div>
    </dl>

    <h3 class="panel-sub">Exposure history</h3>
    <table class="table table-compact">
      <thead>
        <tr><th>Date</th><th>Area</th><th class="num">Peak</th><th class="num">Avg</th>
            <th class="num">Worked</th><th class="num">Exposed</th></tr>
      </thead>
      <tbody>
        ${totals.sessions.map(s => `
          <tr>
            <td>${formatDate(s.date)}</td>
            <td class="mono">${escapeHtml(s.areaCode)}</td>
            <td class="num mono ${s.peakPpm >= limits().twa ? 'is-over' : s.peakPpm >= limits().actionLevel ? 'is-action' : ''}">${num(s.peakPpm)}</td>
            <td class="num mono">${num(s.avgPpm)}</td>
            <td class="num mono">${duration(s.workedMin)}</td>
            <td class="num mono">${duration(s.exposedMin)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  document.getElementById('workerPanel').hidden = false;
  document.getElementById('panelScrim').hidden  = false;
  document.body.classList.add('is-locked');
}

function closeWorker() {
  document.getElementById('workerPanel').hidden = true;
  document.getElementById('panelScrim').hidden  = true;
  document.body.classList.remove('is-locked');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeWorker(); });
