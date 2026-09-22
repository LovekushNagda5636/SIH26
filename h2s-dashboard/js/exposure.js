/* ============================================================
   SenseWear — Exposure page
   ============================================================ */

function renderExposureTable() {
  const host = document.getElementById('exposureTable');
  const rows = areaBreakdown();

  if (!rows.length) { host.innerHTML = noRecords('area exposure'); return; }

  const averages = rows.map(r => r.average);
  const top      = Math.max(...averages);
  const bottom   = Math.min(...averages);

  host.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Code</th><th>Process Area</th><th>Block</th>
            <th class="num">Workers</th><th class="num">Scans</th>
            <th class="num">Highest</th><th class="num">Lowest</th><th class="num">Average</th>
            <th>Status</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="mono">${escapeHtml(r.code)}</td>
            <td>${escapeHtml(r.name)}
              ${r.average === top    ? '<span class="marker marker-high">Highest</span>' : ''}
              ${r.average === bottom ? '<span class="marker marker-low">Lowest</span>'  : ''}
            </td>
            <td class="dim">${escapeHtml(r.block)}</td>
            <td class="num mono">${r.workers}</td>
            <td class="num mono">${r.scans}</td>
            <td class="num mono ${r.highest >= limits().twa ? 'is-over' : ''}">${num(r.highest)}</td>
            <td class="num mono">${num(r.lowest)}</td>
            <td class="num mono">${num(r.average)}</td>
            <td>${statusTag(r.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAllAlerts() {
  const level = document.getElementById('alertLevel').value;
  const state = document.getElementById('alertState').value;

  const rows = State.alerts.filter(a => {
    if (level && a.level !== level) return false;
    if (state === 'pending' && a.acknowledged)  return false;
    if (state === 'done'    && !a.acknowledged) return false;
    return true;
  });

  document.getElementById('alertCount').textContent = State.alerts.length
    ? `${rows.length} shown · ${State.alerts.filter(a => !a.acknowledged).length} pending`
    : '';

  document.getElementById('allAlerts').innerHTML = alertList(rows);
}
