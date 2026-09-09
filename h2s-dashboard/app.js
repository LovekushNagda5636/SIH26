/* ============================================================
   SafeTrack Pro v3.0 — Fully Interactive & Connected
   All filters cascade: Company → Unit → Area → Shift → Worker → Date
   Every KPI, chart, table and alert reacts to active filters.
   ============================================================ */

// ── STATE ────────────────────────────────────────────────────
let currentUser      = null;
let currentRole      = 'worker';
let sidebarCollapsed = false;
let charts           = {};
let areaDetailBack   = 'adminAreas';
let workerDetailBack = 'adminWorkers';
let trendDays        = 14;

// Dashboard global filter state
const DASH_FILTERS = {
  unit: '', area: '', shift: '', worker: '',
  dateFrom: '2026-08-10', dateTo: '2026-09-08'
};

// ── COLOUR PALETTE ───────────────────────────────────────────
const CC = {
  blue:      'rgba(13,59,110,0.85)',
  teal:      'rgba(0,119,182,0.85)',
  green:     'rgba(27,126,59,0.85)',
  yellow:    'rgba(217,119,6,0.85)',
  red:       'rgba(185,28,28,0.85)',
  ltTeal:    'rgba(0,119,182,0.12)',
  ltBlue:    'rgba(13,59,110,0.15)',
};
const UNIT_CLR  = ['#0d3b6e','#0077b6','#00b4d8','#1b7e3b','#d97706'];
const SHIFT_CLR = ['#0077b6','#d97706','#0d3b6e'];

// ── UNIT → AREAS MAP (cascade) ────────────────────────────────
const UNIT_AREAS = {
  'Refinery':             ['Area A','Area B','Area C','Area D'],
  'Gas Processing':       ['Area A','Area B','Area C','Area D'],
  'Storage':              ['Area A','Area B','Area C','Area D'],
  'Maintenance':          ['Area A','Area B','Area C','Area D'],
  'Wastewater Treatment': ['Area A','Area B','Area C','Area D'],
};

// ── AREA → WORKERS MAP (derived from DB, generated on load) ──
let AREA_WORKERS = {};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);

  const today = '2026-09-08';
  const els = ['dashDate','workerDashDate'];
  els.forEach(id => { const e = document.getElementById(id); if(e) e.textContent = formatDate(today); });

  // Build area → workers map
  AREAS.forEach(a => {
    AREA_WORKERS[a] = DB.users.filter(u => u.role === 'worker' && u.area === a).map(u => u.id);
  });

  // Default date inputs
  document.querySelectorAll('input[type=date]').forEach(el => {
    if (el.id.endsWith('To') || el.id === 'reportDateTo' || el.id === 'dashWorkerTo' || el.id === 'expDateTo') {
      el.value = today;
    } else if (!el.value) {
      el.value = '2026-08-10';
    }
  });
});

function updateClock() {
  const now = new Date();
  const t = document.getElementById('topbarTime');
  const d = document.getElementById('topbarDate');
  if (t) t.textContent = now.toLocaleTimeString('en-IN', { hour12: true });
  if (d) d.textContent = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

// ============================================================
// LOGIN
// ============================================================
function switchLoginRole(role) {
  currentRole = role;
  document.getElementById('tab-worker').classList.toggle('active', role === 'worker');
  document.getElementById('tab-admin').classList.toggle('active',  role === 'admin');
  document.getElementById('loginIdLabel').textContent = role === 'worker' ? 'Worker ID' : 'Officer ID';
  document.getElementById('demoHint').innerHTML = role === 'worker'
    ? '<strong>Demo:</strong> W101 / pass123 &nbsp;|&nbsp; W102 / pass123'
    : '<strong>Demo:</strong> SAFE01 / admin123 &nbsp;|&nbsp; SAFE02 / admin123';
  document.getElementById('loginId').placeholder = role === 'worker' ? 'e.g. W101' : 'e.g. SAFE01';
  document.getElementById('loginError').textContent = '';
}

function togglePasswordVisibility() {
  const el = document.getElementById('loginPass');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function handleLogin(e) {
  e.preventDefault();
  const id   = document.getElementById('loginId').value.trim().toUpperCase();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginError');
  const user = DB.users.find(u => u.id === id && u.password === pass);
  if (!user)                                    { err.textContent = '❌ Invalid credentials. Please try again.'; return; }
  if (currentRole==='worker' && user.role!=='worker') { err.textContent = '❌ This ID is not registered as a Worker.'; return; }
  if (currentRole==='admin'  && user.role!=='admin')  { err.textContent = '❌ This ID is not a Safety Officer account.'; return; }
  currentUser = user;
  err.textContent = '';
  launchApp(user);
}

function launchApp(user) {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('topbarUser').innerHTML = `${user.role==='admin'?'🛡️':'👷'} ${user.name}`;
  document.getElementById('alertBadge').style.display = user.role==='admin' ? 'flex' : 'none';

  if (user.role === 'worker') {
    document.getElementById('workerNav').classList.remove('hidden');
    document.getElementById('adminNav').classList.add('hidden');
    showPage('workerDashboard');
    initWorkerDashboard();
  } else {
    document.getElementById('adminNav').classList.remove('hidden');
    document.getElementById('workerNav').classList.add('hidden');
    showPage('adminDashboard');
    initAdminDashboard();
  }
}

function logout() {
  currentUser = null;
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  charts = {};
  resetDashFilters();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('loginId').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').textContent = '';
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(pageId);
  if (target) target.classList.remove('hidden');

  if (navEl) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navEl.classList.add('active');
  }

  const titles = {
    workerDashboard:'My Dashboard', workerScan:'Scan Strip',
    workerHistory:'Exposure History', workerProfile:'My Profile',
    adminDashboard:'Overview Dashboard', adminWorkers:'Workers',
    adminIndustries:'Industries / Units', adminAreas:'Work Areas',
    areaDetail:'Area Detail', workerDetail:'Worker Detail',
    adminExposure:'Exposure Monitoring', adminAnalytics:'Analytics',
    adminAlerts:'Exposure Alerts', adminReports:'Reports', adminSettings:'Settings',
  };
  const t = document.getElementById('pageTitle');
  if (t) t.textContent = titles[pageId] || pageId;

  if (window.innerWidth <= 768) closeSidebarMobile();

  const init = {
    workerDashboard: initWorkerDashboard,
    workerHistory:   renderWorkerHistory,
    workerProfile:   renderWorkerProfile,
    adminDashboard:  initAdminDashboard,
    adminWorkers:    renderAdminWorkersTable,
    adminIndustries: initIndustriesPage,
    adminAreas:      initAreasPage,
    adminExposure:   () => { cascadeExpArea(''); cascadeExpWorker('',''); renderExposureTable(); },
    adminAnalytics:  initAnalyticsPage,
    adminAlerts:     renderAlerts,
    adminReports:    () => { cascadeReportArea(''); cascadeReportWorker('',''); },
    adminSettings:   initSettingsPage,
  };
  if (init[pageId]) setTimeout(() => init[pageId](), 50);
}

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    const sb  = document.getElementById('sidebar');
    const ov  = document.getElementById('sidebarOverlay');
    const open = sb.classList.contains('mobile-open');
    sb.classList.toggle('mobile-open', !open);
    ov.classList.toggle('active', !open);
  } else {
    sidebarCollapsed = !sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
    document.querySelector('.main-content').classList.toggle('expanded', sidebarCollapsed);
  }
}

function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// ============================================================
// WORKER MODULE  (unchanged)
// ============================================================
function initWorkerDashboard() {
  if (!currentUser || currentUser.role !== 'worker') return;
  const readings = getReadingsForWorker(currentUser.id).sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));
  const avgExp   = avg(readings.map(r=>r.exposure));
  const maxExp   = max(readings.map(r=>r.exposure));
  const alertCnt = readings.filter(r=>r.status!=='Normal').length;
  const latestSt = readings[0]?.status || 'Normal';

  document.getElementById('workerInfoCards').innerHTML = kpiCard('blue','👤',currentUser.id,currentUser.name,`${currentUser.dept} · ${currentUser.unit}`)
    + kpiCard('teal','📍',currentUser.area,'Work Area',`${currentUser.shift} Shift · ${currentUser.unit}`)
    + kpiCard('green','📊',avgExp.toFixed(1),'Avg Est. Exposure (ppm·hr)',`Last 30 days · ${readings.length} readings`)
    + kpiCard(alertCnt>0?'yellow':'green',alertCnt>0?'⚠️':'✅',alertCnt,'Elevated / High Readings',`Current: ${getStatusBadge(latestSt)}`);

  renderWorkerTrendChart(readings);

  document.getElementById('workerRecentReadings').innerHTML = readings.slice(0,6).map(r=>`
    <div class="reading-item">
      <div><div class="font-bold" style="font-size:13px">${formatDate(r.date)} · ${r.time}</div>
      <div class="reading-meta">${r.shift} Shift · ${r.area}</div></div>
      <div class="text-right">
        <div class="exp-value ${getStatusClass(r.status)}" style="font-size:17px">${r.exposure}</div>
        <div class="reading-unit">ppm·hr</div>${getStatusBadge(r.status)}
      </div>
    </div>`).join('') || '<div class="empty-state" style="padding:24px"><p>No readings yet.</p></div>';

  const byShift = {};
  SHIFTS.forEach(s => { const sr=readings.filter(r=>r.shift===s); if(sr.length) byShift[s]={count:sr.length,avg:avg(sr.map(r=>r.exposure)),max:max(sr.map(r=>r.exposure))}; });
  document.getElementById('workerShiftHistory').innerHTML = `
    <div class="overflow-x"><table class="data-table">
    <thead><tr><th>Shift</th><th>Readings</th><th>Avg Est. Exposure (ppm·hr)</th><th>Max Est. Exposure (ppm·hr)</th></tr></thead>
    <tbody>${Object.entries(byShift).map(([s,d])=>`<tr><td>${s}</td><td>${d.count}</td>
      <td><span class="exp-value ${getStatusClass(d.avg>=THRESHOLDS.elevated?'High':d.avg>=THRESHOLDS.normal?'Elevated':'Normal')}">${d.avg.toFixed(1)}</span></td>
      <td><span class="exp-value ${getStatusClass(d.max>=THRESHOLDS.elevated?'High':d.max>=THRESHOLDS.normal?'Elevated':'Normal')}">${d.max.toFixed(1)}</span></td></tr>`).join('')}
    </tbody></table></div>`;
}

function renderWorkerTrendChart(readings) {
  destroyChart('workerTrendChart');
  const last14 = getLast30Dates().slice(-14);
  const data   = last14.map(d=>{ const dr=readings.filter(r=>r.date===d); return dr.length ? parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)) : null; });
  charts['workerTrendChart'] = new Chart(document.getElementById('workerTrendChart'), {
    type:'line', data:{
      labels: last14.map(d=>shortDate(d)),
      datasets:[{ label:'Avg Estimated Exposure (ppm·hr)', data, borderColor:CC.teal, backgroundColor:CC.ltTeal,
        pointBackgroundColor:data.map(v=>!v?'#ccc':v>=THRESHOLDS.elevated?'#dc2626':v>=THRESHOLDS.normal?'#d97706':'#1b7e3b'),
        pointRadius:5, fill:true, tension:0.35, spanGaps:true }]
    }, options:lineChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });
}

function renderWorkerHistory() {
  if (!currentUser || currentUser.role!=='worker') return;
  let rd = getReadingsForWorker(currentUser.id);
  const shift  = document.getElementById('workerHistoryShift')?.value;
  const status = document.getElementById('workerHistoryStatus')?.value;
  const from   = document.getElementById('workerHistoryFrom')?.value;
  const to     = document.getElementById('workerHistoryTo')?.value;
  if (shift)  rd = rd.filter(r=>r.shift===shift);
  if (status) rd = rd.filter(r=>r.status===status);
  if (from)   rd = rd.filter(r=>r.date>=from);
  if (to)     rd = rd.filter(r=>r.date<=to);
  rd.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const container = document.getElementById('workerHistoryTable');
  if (!rd.length) { container.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><p>No readings match selected filters.</p></div>'; return; }
  container.innerHTML = summaryBar(rd) + `
    <div class="overflow-x"><table class="data-table">
    <thead><tr><th>Date</th><th>Time</th><th>Shift</th><th>Area</th><th>Duration</th>
    <th>Est. Cumulative H₂S Exposure</th><th>Temp</th><th>Humidity</th><th>Sensor</th><th>Status</th></tr></thead>
    <tbody>${rd.map(r=>`<tr><td>${formatDate(r.date)}</td><td>${r.time}</td><td>${r.shift}</td><td>${r.area}</td><td>${r.duration}</td>
      <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure} ppm·hr</span></td>
      <td>${r.temp}</td><td>${r.humidity}</td>
      <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
      <td>${getStatusBadge(r.status)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function clearWorkerHistoryFilters() {
  ['workerHistoryShift','workerHistoryStatus','workerHistoryFrom','workerHistoryTo'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  renderWorkerHistory();
}

function renderWorkerProfile() {
  if (!currentUser) return;
  const rd = getReadingsForWorker(currentUser.id);
  const avgE=avg(rd.map(r=>r.exposure)), maxE=max(rd.map(r=>r.exposure));
  const hc=rd.filter(r=>r.status==='High').length, ec=rd.filter(r=>r.status==='Elevated').length;
  document.getElementById('workerProfileContent').innerHTML = `
    <div class="card">
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
        <div class="worker-avatar">${currentUser.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
        <div style="flex:1">
          <h2 style="font-size:21px;color:var(--primary);font-weight:800">${currentUser.name}</h2>
          <p style="color:var(--text-secondary);margin:4px 0">${currentUser.id} · ${currentUser.dept}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
            <span class="company-badge">🏭 ${currentUser.unit}</span>
            <span class="company-badge">📍 ${currentUser.area}</span>
            <span class="company-badge">🕐 ${currentUser.shift} Shift</span>
          </div>
        </div>
      </div>
      <hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">
      <div class="kpi-grid">
        ${kpiCard('blue','📊',rd.length,'Total Readings','')}
        ${kpiCard('teal','📈',avgE.toFixed(1),'Avg Est. Exposure (ppm·hr)','')}
        ${kpiCard(maxE>=THRESHOLDS.elevated?'red':'yellow','⬆️',maxE.toFixed(1),'Max Est. Exposure (ppm·hr)','')}
        ${kpiCard(hc>0?'red':ec>0?'yellow':'green',hc>0?'🔴':'✅',hc+ec,'Elevated / High Readings','')}
      </div>
    </div>
    <div class="disclaimer-box mt-16">⚠ All values represent <strong>estimated cumulative H₂S exposure</strong> from passive colorimetric dosimeter strip analysis. Prototype data — not a certified measurement.</div>`;
}

// ============================================================
// SCAN
// ============================================================
let cameraStream = null;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    cameraStream = stream;
    const video = document.getElementById('cameraFeed');
    video.srcObject = stream; video.classList.remove('hidden');
    const placeholder = document.querySelector('#scanArea .scan-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    document.getElementById('btnCamera').textContent='📸 Capture Now';
    document.getElementById('btnCamera').onclick = captureImage;
    setStep(2);
  } catch(err) { showToast('Camera unavailable. Use Simulate Scan.','warning'); }
}

function captureImage() {
  const video=document.getElementById('cameraFeed'), canvas=document.getElementById('scanCanvas');
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  if (cameraStream) cameraStream.getTracks().forEach(t=>t.stop());
  video.classList.add('hidden'); setStep(3);
  setTimeout(()=>processAndShowResult(),800);
}

function handleImageUpload(e) {
  const file=e.target.files[0]; if(!file) return;
  setStep(2);
  const img=new Image(), url=URL.createObjectURL(file);
  img.onload=()=>{
    const canvas=document.getElementById('scanCanvas');
    canvas.width=img.width; canvas.height=img.height;
    canvas.getContext('2d').drawImage(img,0,0);
    const placeholder = document.querySelector('#scanArea .scan-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    canvas.classList.remove('hidden'); setStep(3);
    setTimeout(()=>processAndShowResult(),800);
  };
  img.src=url;
}

function simulateScan() {
  setStep(2);
  document.getElementById('scanArea').innerHTML=`<div style="text-align:center;padding:48px">
    <div style="font-size:52px;margin-bottom:16px">🔬</div>
    <p style="font-weight:700;color:var(--primary);font-size:15px">Analysing colorimetric strip...</p>
    <p style="font-size:12px;color:var(--text-secondary);margin-top:6px">AI colour processing model running</p></div>`;
  setStep(3); setTimeout(()=>processAndShowResult(),1200);
}

function processAndShowResult() {
  setStep(4);
  const exposure = parseFloat((2+Math.random()*11).toFixed(1));
  const status   = computeStatus(exposure);
  const sc       = getStatusClass(status);
  const icon     = status==='High'?'🔴':status==='Elevated'?'🟡':'✅';
  const dateStr  = '2026-09-08';
  const timeStr  = new Date().toLocaleTimeString('en-IN',{hour12:false}).slice(0,5);
  DB.readings.push({id:DB.readings.length+1,workerId:currentUser.id,workerName:currentUser.name,
    date:dateStr,time:timeStr,shift:currentUser.shift,area:currentUser.area,unit:currentUser.unit,
    duration:'8 hr',exposure,temp:'31°C',humidity:'65% RH',validity:'Valid',status});
  const r=document.getElementById('scanResult');
  r.innerHTML=`<div style="font-size:28px">${icon}</div>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;color:var(--text-secondary);margin-top:10px">Estimated Cumulative H₂S Exposure</div>
    <div class="result-value" style="color:${sc==='high'?'#b91c1c':sc==='elevated'?'#a16207':'#15803d'}">${exposure} <span style="font-size:17px;font-weight:600">ppm·hr</span></div>
    <div style="margin:10px 0">${getStatusBadge(status)}</div>
    <div style="font-size:11.5px;color:var(--text-secondary)">${dateStr} at ${timeStr} · ${currentUser.shift} Shift · ${currentUser.area}</div>
    ${status==='High'?'<div style="margin-top:14px;background:#fef2f2;padding:12px;border-radius:9px;font-size:12px;color:#b91c1c;border:1px solid #fecaca"><strong>⚠ Action Required:</strong> Report to Safety Officer immediately.</div>':''}
    ${status==='Elevated'?'<div style="margin-top:14px;background:#fffbeb;padding:12px;border-radius:9px;font-size:12px;color:#92400e;border:1px solid #fde68a"><strong>⚠ Note:</strong> Elevated — monitor closely and follow safety protocols.</div>':''}
    <div style="margin-top:14px;font-size:11px;color:var(--text-light);font-style:italic;line-height:1.6">⚠ Estimated reading from colorimetric strip analysis. Not a certified measurement.</div>`;
  r.className=`scan-result ${sc}`; r.classList.remove('hidden');
  showToast(`Scan complete: ${exposure} ppm·hr — ${status}`,sc==='normal'?'success':sc==='elevated'?'warning':'error');
}

function setStep(n) {
  document.querySelectorAll('.step').forEach((s,i)=>{
    s.classList.remove('active','done');
    if(i+1<n) s.classList.add('done'); else if(i+1===n) s.classList.add('active');
  });
}

// ============================================================
// ════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD — FULLY INTERACTIVE FILTER SYSTEM
// ════════════════════════════════════════════════════════════
// ============================================================

/* ── Helper: get filtered readings from global DASH_FILTERS ── */
function getDashReadings() {
  return getFilteredReadings({
    unit:     DASH_FILTERS.unit,
    area:     DASH_FILTERS.area,
    shift:    DASH_FILTERS.shift,
    workerId: DASH_FILTERS.worker,
    dateFrom: DASH_FILTERS.dateFrom,
    dateTo:   DASH_FILTERS.dateTo,
  });
}

/* ── Bootstrap the dashboard ── */
function initAdminDashboard() {
  buildFilterPanel();          // populate dropdowns & restore state
  refreshDashboard();          // render everything
}

/* ── Build the filter panel HTML once, then wire events ── */
function buildFilterPanel() {
  const panel = document.getElementById('dashFilterPanel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="cascade-filter-bar">
      <div class="cf-step">
        <div class="cf-step-label">1 · Industry / Unit</div>
        <select id="cf_unit" onchange="onDashUnitChange()">
          <option value="">All Industries</option>
          ${UNITS.map(u=>`<option value="${u}" ${DASH_FILTERS.unit===u?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="cf-arrow">→</div>
      <div class="cf-step">
        <div class="cf-step-label">2 · Work Area</div>
        <select id="cf_area" onchange="onDashAreaChange()">
          <option value="">All Areas</option>
        </select>
      </div>
      <div class="cf-arrow">→</div>
      <div class="cf-step">
        <div class="cf-step-label">3 · Shift</div>
        <select id="cf_shift" onchange="onDashShiftChange()">
          <option value="">All Shifts</option>
          ${SHIFTS.map(s=>`<option value="${s}" ${DASH_FILTERS.shift===s?'selected':''}>${s} Shift</option>`).join('')}
        </select>
      </div>
      <div class="cf-arrow">→</div>
      <div class="cf-step">
        <div class="cf-step-label">4 · Worker (optional)</div>
        <select id="cf_worker" onchange="onDashWorkerChange()">
          <option value="">All Workers</option>
        </select>
      </div>
      <div class="cf-arrow">→</div>
      <div class="cf-step">
        <div class="cf-step-label">5 · Date Range</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="date" id="cf_from" value="${DASH_FILTERS.dateFrom}" onchange="onDashDateChange()" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;outline:none" />
          <span style="color:var(--text-secondary);font-size:12px">to</span>
          <input type="date" id="cf_to" value="${DASH_FILTERS.dateTo}" onchange="onDashDateChange()" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;outline:none" />
        </div>
      </div>
      <button class="cf-reset-btn" onclick="resetDashFilters()">↺ Reset Filters</button>
    </div>
    <div id="activeFilterTags" class="active-filter-tags"></div>
  `;

  // Restore cascade state
  syncAreaDropdown();
  syncWorkerDropdown();
  renderActiveFilterTags();
}

/* ── Cascade: Unit changed → rebuild Area dropdown ── */
function onDashUnitChange() {
  DASH_FILTERS.unit   = document.getElementById('cf_unit').value;
  DASH_FILTERS.area   = '';
  DASH_FILTERS.worker = '';
  syncAreaDropdown();
  syncWorkerDropdown();
  renderActiveFilterTags();
  refreshDashboard();
}

/* ── Cascade: Area changed → rebuild Worker dropdown ── */
function onDashAreaChange() {
  DASH_FILTERS.area   = document.getElementById('cf_area').value;
  DASH_FILTERS.worker = '';
  syncWorkerDropdown();
  renderActiveFilterTags();
  refreshDashboard();
}

function onDashShiftChange() {
  DASH_FILTERS.shift = document.getElementById('cf_shift').value;
  renderActiveFilterTags();
  refreshDashboard();
}

function onDashWorkerChange() {
  DASH_FILTERS.worker = document.getElementById('cf_worker').value;
  renderActiveFilterTags();
  refreshDashboard();
}

function onDashDateChange() {
  DASH_FILTERS.dateFrom = document.getElementById('cf_from').value;
  DASH_FILTERS.dateTo   = document.getElementById('cf_to').value;
  renderActiveFilterTags();
  refreshDashboard();
}

/* ── Sync Area dropdown based on selected unit ── */
function syncAreaDropdown() {
  const sel = document.getElementById('cf_area');
  if (!sel) return;
  // Determine which areas are valid for the active unit (and have readings)
  let validAreas = AREAS;
  if (DASH_FILTERS.unit) {
    validAreas = AREAS.filter(a => DB.readings.some(r => r.unit===DASH_FILTERS.unit && r.area===a));
  }
  sel.innerHTML = `<option value="">All Areas</option>`
    + validAreas.map(a => `<option value="${a}" ${DASH_FILTERS.area===a?'selected':''}>${a}</option>`).join('');
}

/* ── Sync Worker dropdown based on selected unit + area ── */
function syncWorkerDropdown() {
  const sel = document.getElementById('cf_worker');
  if (!sel) return;
  let workers = DB.users.filter(u => u.role==='worker');
  if (DASH_FILTERS.unit)  workers = workers.filter(w => w.unit===DASH_FILTERS.unit);
  if (DASH_FILTERS.area)  workers = workers.filter(w => w.area===DASH_FILTERS.area);
  if (DASH_FILTERS.shift) workers = workers.filter(w => w.shift===DASH_FILTERS.shift);
  sel.innerHTML = `<option value="">All Workers</option>`
    + workers.map(w => `<option value="${w.id}" ${DASH_FILTERS.worker===w.id?'selected':''}>${w.id} — ${w.name}</option>`).join('');
}

/* ── Render active filter pills ── */
function renderActiveFilterTags() {
  const el = document.getElementById('activeFilterTags');
  if (!el) return;
  const tags = [];
  if (DASH_FILTERS.unit)   tags.push(`🏭 ${DASH_FILTERS.unit}`);
  if (DASH_FILTERS.area)   tags.push(`📍 ${DASH_FILTERS.area}`);
  if (DASH_FILTERS.shift)  tags.push(`🕐 ${DASH_FILTERS.shift} Shift`);
  if (DASH_FILTERS.worker) {
    const w = getWorkerById(DASH_FILTERS.worker);
    tags.push(`👷 ${DASH_FILTERS.worker}${w?' — '+w.name:''}`);
  }
  const defaultFrom = '2026-08-10', defaultTo = '2026-09-08';
  if (DASH_FILTERS.dateFrom !== defaultFrom || DASH_FILTERS.dateTo !== defaultTo)
    tags.push(`📅 ${formatDate(DASH_FILTERS.dateFrom)} → ${formatDate(DASH_FILTERS.dateTo)}`);

  if (!tags.length) {
    el.innerHTML = `<span style="font-size:12px;color:var(--text-light);font-style:italic">Showing all data — use filters above to narrow down</span>`;
    return;
  }
  el.innerHTML = `<span style="font-size:11.5px;color:var(--text-secondary);font-weight:600;margin-right:6px">Active:</span>`
    + tags.map(t=>`<span class="filter-tag">${t}</span>`).join('');
}

/* ── Reset all dashboard filters ── */
function resetDashFilters() {
  DASH_FILTERS.unit     = '';
  DASH_FILTERS.area     = '';
  DASH_FILTERS.shift    = '';
  DASH_FILTERS.worker   = '';
  DASH_FILTERS.dateFrom = '2026-08-10';
  DASH_FILTERS.dateTo   = '2026-09-08';
  buildFilterPanel();
  refreshDashboard();
  showToast('Filters reset — showing all data', 'success');
}

/* ═══════════════════════════════════════════════════════════
   REFRESH DASHBOARD  — Called every time a filter changes
   Rebuilds: KPIs · Area grid · Charts · Alerts · Worker table
   ═══════════════════════════════════════════════════════════ */
function refreshDashboard() {
  const rd      = getDashReadings();
  const workers = getFilteredWorkers();

  // Alert badge
  const highCnt = rd.filter(r=>r.status==='High').length;
  const elevCnt = rd.filter(r=>r.status==='Elevated').length;
  const ac = document.getElementById('alertCount');
  const sc = document.getElementById('sidebarAlertCount');
  if (ac) { ac.textContent = Math.min(highCnt,99); ac.style.display = highCnt?'flex':'none'; }
  if (sc)   sc.textContent = Math.min(highCnt,99);

  renderDashKPIs(rd, workers);
  renderDashAreaGrid(rd);
  renderDashUnitChart(rd);
  renderDashTrendChart(trendDays, rd);
  renderDashShiftChart(rd);
  renderDashAlerts(rd);
  renderDashWorkerTable(rd);
  updateDashboardSubtitle();
}

/* ── Subtitle shows active context ── */
function updateDashboardSubtitle() {
  const parts = ['MRPL'];
  if (DASH_FILTERS.unit)  parts.push(DASH_FILTERS.unit);
  if (DASH_FILTERS.area)  parts.push(DASH_FILTERS.area);
  if (DASH_FILTERS.shift) parts.push(DASH_FILTERS.shift+' Shift');
  if (DASH_FILTERS.worker) {
    const w = getWorkerById(DASH_FILTERS.worker);
    parts.push(w ? w.name : DASH_FILTERS.worker);
  }
  parts.push(formatDate(DASH_FILTERS.dateTo || '2026-09-08'));
  const el = document.getElementById('dashSubtitle');
  if (el) el.textContent = parts.join(' · ');
}

/* ── Workers that match current unit / area / shift filters ── */
function getFilteredWorkers() {
  let ws = DB.users.filter(u => u.role==='worker');
  if (DASH_FILTERS.unit)  ws = ws.filter(w => w.unit ===DASH_FILTERS.unit);
  if (DASH_FILTERS.area)  ws = ws.filter(w => w.area ===DASH_FILTERS.area);
  if (DASH_FILTERS.shift) ws = ws.filter(w => w.shift===DASH_FILTERS.shift);
  if (DASH_FILTERS.worker) ws = ws.filter(w => w.id  ===DASH_FILTERS.worker);
  return ws;
}

// ── 1. KPI CARDS ──
function renderDashKPIs(rd, workers) {
  const high = rd.filter(r=>r.status==='High').length;
  const elev = rd.filter(r=>r.status==='Elevated').length;
  const avgE = parseFloat(avg(rd.map(r=>r.exposure)).toFixed(2));
  const maxE = parseFloat(max(rd.map(r=>r.exposure)).toFixed(2));
  const wCount = DASH_FILTERS.worker
    ? 1
    : [...new Set(rd.map(r=>r.workerId))].length;
  const aCount = DASH_FILTERS.area
    ? 1
    : [...new Set(rd.map(r=>r.area))].length;

  document.getElementById('adminKPIs').innerHTML =
    kpiCard('blue','👷',wCount,'Workers Monitored', DASH_FILTERS.unit||DASH_FILTERS.area ? filterContext() : `Across ${UNITS.length} units`)
  + kpiCard('teal','📍',aCount,'Active Work Areas', DASH_FILTERS.unit ? `In ${DASH_FILTERS.unit}` : 'MRPL Facility')
  + kpiCard('green','🔬',rd.length.toLocaleString(),'Total Readings', filterDateContext())
  + kpiCard(high>0?'red':'yellow','⚠️',elev+high,'Elevated / High Cases',
      `<span style="color:#b91c1c">${high} High</span> · <span style="color:#a16207">${elev} Elevated</span>`)
  + kpiCard(avgE>=THRESHOLDS.elevated?'red':avgE>=THRESHOLDS.normal?'yellow':'green','📊',avgE,'Avg Est. Exposure (ppm·hr)', 'For selected scope')
  + kpiCard(maxE>=THRESHOLDS.elevated?'red':maxE>=THRESHOLDS.normal?'yellow':'green','⬆️',maxE,'Max Est. Exposure (ppm·hr)', 'For selected scope');
}

function filterContext() {
  const parts = [];
  if (DASH_FILTERS.unit)  parts.push(DASH_FILTERS.unit);
  if (DASH_FILTERS.area)  parts.push(DASH_FILTERS.area);
  if (DASH_FILTERS.shift) parts.push(DASH_FILTERS.shift);
  return parts.join(' · ') || 'All data';
}

function filterDateContext() {
  return `${formatDate(DASH_FILTERS.dateFrom || '2026-08-10')} – ${formatDate(DASH_FILTERS.dateTo || '2026-09-08')}`;
}

// ── 2. AREA GRID ──
function renderDashAreaGrid(rd) {
  // Only show areas that appear in filtered readings
  const visibleAreas = DASH_FILTERS.area
    ? [DASH_FILTERS.area]
    : AREAS.filter(a => rd.some(r=>r.area===a));

  const areaStats = visibleAreas.map(area => {
    const ar = rd.filter(r=>r.area===area);
    const ws = [...new Set(ar.map(r=>r.workerId))];
    return {
      area, workers: ws.length, readings: ar.length,
      avgE: parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2)),
      maxE: parseFloat(max(ar.map(r=>r.exposure)).toFixed(2)),
      high: ar.filter(r=>r.status==='High').length,
      elev: ar.filter(r=>r.status==='Elevated').length,
    };
  });

  const grid = document.getElementById('dashAreaGrid');
  if (!grid) return;

  if (!areaStats.length) {
    grid.innerHTML='<div class="empty-state" style="padding:32px;grid-column:1/-1"><div class="empty-icon">📍</div><p>No area data for current filters.</p></div>';
    return;
  }

  grid.innerHTML = areaStats.map(a => {
    const pct  = Math.min((a.avgE/15)*100,100);
    const fill = a.avgE>=THRESHOLDS.elevated?'#b91c1c':a.avgE>=THRESHOLDS.normal?'#d97706':'#1b7e3b';
    return `
      <div class="dash-area-card" onclick="drillToArea('${a.area}')">
        <div class="dac-top">
          <div><div class="dac-name">📍 ${a.area}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${a.workers} workers</div></div>
          ${getStatusBadge(a.avgE>=THRESHOLDS.elevated?'High':a.avgE>=THRESHOLDS.normal?'Elevated':'Normal')}
        </div>
        <div class="dac-stats">
          <div class="dac-stat"><div class="dac-stat-val">${a.workers}</div><div class="dac-stat-lbl">Workers</div></div>
          <div class="dac-stat"><div class="dac-stat-val">${a.readings}</div><div class="dac-stat-lbl">Readings</div></div>
          <div class="dac-stat"><div class="dac-stat-val exp-value ${a.avgE>=THRESHOLDS.elevated?'high':a.avgE>=THRESHOLDS.normal?'elevated':'normal'}">${a.avgE}</div><div class="dac-stat-lbl">Avg ppm·hr</div></div>
          <div class="dac-stat"><div class="dac-stat-val exp-value ${a.maxE>=THRESHOLDS.elevated?'high':a.maxE>=THRESHOLDS.normal?'elevated':'normal'}">${a.maxE}</div><div class="dac-stat-lbl">Max ppm·hr</div></div>
        </div>
        <div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px;display:flex;justify-content:space-between">
          <span>Avg Exposure Level</span><span>${a.avgE} ppm·hr</span>
        </div>
        <div class="dac-bar"><div class="dac-bar-fill" style="width:${pct}%;background:${fill}"></div></div>
        <div class="dac-risk-row">
          <span class="risk-chip high">🔴 ${a.high} High</span>
          <span class="risk-chip elev">🟡 ${a.elev} Elevated</span>
          <span class="risk-chip" style="background:#f0f4ff;color:#0077b6;font-size:10.5px;padding:2px 8px;border-radius:4px;font-weight:700">📊 Full Detail</span>
        </div>
      </div>`;
  }).join('');
}

/* Clicking an area card drills into it via filter */
function drillToArea(areaName) {
  areaDetailBack = 'adminDashboard';
  openAreaDetail(areaName);
}

// ── 3. UNIT CHART ──
function renderDashUnitChart(rd) {
  destroyChart('dashUnitChart');
  // Show only units that have readings in current filter
  const visUnits = DASH_FILTERS.unit
    ? [DASH_FILTERS.unit]
    : UNITS.filter(u => rd.some(r=>r.unit===u));

  const unitData = visUnits.map(unit => {
    const ur = rd.filter(r=>r.unit===unit);
    return { unit, avg: parseFloat(avg(ur.map(r=>r.exposure)).toFixed(2)), max: parseFloat(max(ur.map(r=>r.exposure)).toFixed(2)) };
  });

  const colors = visUnits.map(u => UNIT_CLR[UNITS.indexOf(u)] || '#0d3b6e');

  charts['dashUnitChart'] = new Chart(document.getElementById('dashUnitChart'), {
    type:'bar',
    data:{ labels: unitData.map(d=>d.unit),
      datasets:[
        {label:'Avg (ppm·hr)', data:unitData.map(d=>d.avg), backgroundColor:colors.map(c=>c+'cc'), borderRadius:7, borderSkipped:false},
        {label:'Max (ppm·hr)', data:unitData.map(d=>d.max), backgroundColor:colors.map(c=>c+'44'), borderColor:colors, borderWidth:2, borderRadius:7, borderSkipped:false},
      ]},
    options: barChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });
}

// ── 4. TREND CHART ──
function switchTrend(days) {
  trendDays = days;
  document.getElementById('trendBtn14').classList.toggle('active', days===14);
  document.getElementById('trendBtn30').classList.toggle('active', days===30);
  renderDashTrendChart(days, getDashReadings());
}

function renderDashTrendChart(days, rd) {
  destroyChart('dashTrendChart');
  const dates   = getLast30Dates().slice(-days);
  const avgData = dates.map(d => { const dr=rd.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null; });
  const maxData = dates.map(d => { const dr=rd.filter(r=>r.date===d); return dr.length?parseFloat(max(dr.map(r=>r.exposure)).toFixed(2)):null; });
  charts['dashTrendChart'] = new Chart(document.getElementById('dashTrendChart'), {
    type:'line', data:{
      labels: dates.map(d=>shortDate(d)),
      datasets:[
        {label:'Avg (ppm·hr)', data:avgData, borderColor:CC.teal, backgroundColor:CC.ltTeal, pointRadius:4, fill:true, tension:0.35, spanGaps:true},
        {label:'Max (ppm·hr)', data:maxData, borderColor:'#dc2626', backgroundColor:'transparent', pointRadius:3, fill:false, tension:0.35, spanGaps:true, borderDash:[5,3]},
      ]
    }, options: lineChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });
}

// ── 5. SHIFT CHART ──
function renderDashShiftChart(rd) {
  destroyChart('dashShiftChart');
  const visShifts = DASH_FILTERS.shift ? [DASH_FILTERS.shift] : SHIFTS;
  charts['dashShiftChart'] = new Chart(document.getElementById('dashShiftChart'), {
    type:'bar', data:{
      labels: visShifts.map(s=>s+' Shift'),
      datasets:[{
        label:'Avg Est. Exposure (ppm·hr)',
        data: visShifts.map(s => parseFloat(avg(rd.filter(r=>r.shift===s).map(r=>r.exposure)).toFixed(2))),
        backgroundColor: visShifts.map(s=>SHIFT_CLR[SHIFTS.indexOf(s)]),
        borderRadius:7, borderSkipped:false,
      }]
    }, options: barChartOptions('Avg Est. Exposure (ppm·hr)')
  });
}

// ── 6. ALERTS ──
function renderDashAlerts(rd) {
  const alerts = getAlerts(rd).slice(0,6);
  document.getElementById('dashAlerts').innerHTML = alerts.length
    ? alerts.map(r=>`
      <div class="alert-card ${getStatusClass(r.status)}" onclick="openWorkerDetail('${r.workerId}','adminDashboard')" style="cursor:pointer;padding:10px 14px">
        <div class="alert-icon" style="font-size:18px">${r.status==='High'?'🔴':'🟡'}</div>
        <div class="alert-body">
          <div style="font-weight:700;font-size:13px">${r.workerId} — ${r.workerName}</div>
          <div class="alert-meta" style="margin-top:4px">
            <span>📍 ${r.area}</span><span>🕐 ${r.shift}</span><span>🏭 ${r.unit}</span><span>📅 ${formatDate(r.date)}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:800;font-size:15px;color:${r.status==='High'?'#b91c1c':'#a16207'}">${r.exposure}</div>
          <div style="font-size:10px;color:var(--text-secondary)">ppm·hr</div>
          ${getStatusBadge(r.status)}
        </div>
      </div>`).join('')
    : '<div class="empty-state" style="padding:24px"><div class="empty-icon">✅</div><p>No alerts for current selection</p></div>';
}

// ── 7. WORKER TABLE ──
function renderDashWorkerTable(rd) {
  if (!rd) rd = getDashReadings();
  const search = (document.getElementById('dashWorkerSearch')?.value||'').toLowerCase();
  let data = rd;
  if (search) data = data.filter(r=>r.workerId.toLowerCase().includes(search)||r.workerName.toLowerCase().includes(search));
  data.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));

  const container = document.getElementById('dashWorkerTable');
  if (!data.length) {
    container.innerHTML='<div class="empty-state"><div class="empty-icon">👷</div><p>No records match current filters.</p></div>';
    return;
  }

  container.innerHTML = summaryBar(data, true) + `
    <div class="overflow-x"><table class="data-table">
    <thead><tr>
      <th>Worker ID</th><th>Worker Name</th><th>Industry/Unit</th><th>Area</th><th>Shift</th><th>Date</th>
      <th>Duration</th><th>Est. Cumulative H₂S Exposure</th><th>Temp</th><th>Humidity</th><th>Sensor</th><th>Risk Status</th>
    </tr></thead>
    <tbody>${data.slice(0,200).map(r=>`
      <tr class="clickable" onclick="openWorkerDetail('${r.workerId}','adminDashboard')">
        <td><strong>${r.workerId}</strong></td><td>${r.workerName}</td><td>${r.unit}</td><td>${r.area}</td>
        <td>${r.shift}</td><td>${formatDate(r.date)}</td><td>${r.duration}</td>
        <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure} ppm·hr</span></td>
        <td>${r.temp}</td><td>${r.humidity}</td>
        <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
        <td>${getStatusBadge(r.status)}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

/* Live search in worker table without rebuilding charts */
function onDashTableSearch() {
  renderDashWorkerTable(getDashReadings());
}

function clearDashTableSearch() {
  const el = document.getElementById('dashWorkerSearch');
  if (el) el.value = '';
  renderDashWorkerTable(getDashReadings());
}

// ============================================================
// WORKERS PAGE — with cascading unit → area filter
// ============================================================
function renderAdminWorkersTable() {
  const search  = (document.getElementById('workerSearch')?.value||'').toLowerCase();
  const unit    = document.getElementById('workerFilterUnit')?.value;
  const area    = document.getElementById('workerFilterArea')?.value;
  const statusF = document.getElementById('workerFilterStatus')?.value;

  // Cascade: if unit selected, restrict area dropdown
  cascadeWorkerPageArea(unit);

  const rows = DB.users.filter(u=>u.role==='worker').filter(w=>{
    if (search && !w.id.toLowerCase().includes(search) && !w.name.toLowerCase().includes(search)) return false;
    if (unit   && w.unit  !==unit)   return false;
    if (area   && w.area  !==area)   return false;
    return true;
  }).map(w=>{
    const rd=getReadingsForWorker(w.id);
    const lt=rd.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time))[0];
    return {...w, readingsCnt:rd.length, avgE:avg(rd.map(r=>r.exposure)), maxE:max(rd.map(r=>r.exposure)), latest:lt, lastSt:lt?.status||'Normal'};
  }).filter(w=>!statusF||w.lastSt===statusF);

  const container = document.getElementById('adminWorkersTable');
  if (!rows.length) { container.innerHTML='<div class="empty-state"><div class="empty-icon">👷</div><p>No workers match filters.</p></div>'; return; }

  container.innerHTML = `<div class="table-summary-bar"><strong>${rows.length}</strong> workers found</div>
    <div class="overflow-x"><table class="data-table">
    <thead><tr><th>Worker ID</th><th>Name</th><th>Industry/Unit</th><th>Area</th><th>Shift</th><th>Readings</th><th>Avg Exp.</th><th>Max Exp.</th><th>Last Reading</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows.map(w=>`
      <tr class="clickable" onclick="openWorkerDetail('${w.id}','adminWorkers')">
        <td><strong>${w.id}</strong></td><td>${w.name}</td><td>${w.unit}</td><td>${w.area}</td><td>${w.shift}</td>
        <td>${w.readingsCnt}</td>
        <td><span class="exp-value ${getStatusClass(w.avgE>=THRESHOLDS.elevated?'High':w.avgE>=THRESHOLDS.normal?'Elevated':'Normal')}">${w.avgE.toFixed(1)}</span></td>
        <td><span class="exp-value ${getStatusClass(w.maxE>=THRESHOLDS.elevated?'High':w.maxE>=THRESHOLDS.normal?'Elevated':'Normal')}">${w.maxE.toFixed(1)}</span></td>
        <td>${w.latest?formatDate(w.latest.date):'—'}</td>
        <td>${getStatusBadge(w.lastSt)}</td>
        <td><button class="btn-secondary" style="padding:4px 11px;font-size:11.5px" onclick="event.stopPropagation();openWorkerDetail('${w.id}','adminWorkers')">Detail ›</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function cascadeWorkerPageArea(unit) {
  const sel = document.getElementById('workerFilterArea');
  if (!sel) return;
  const cur = sel.value;
  let validAreas = AREAS;
  if (unit) validAreas = AREAS.filter(a=>DB.readings.some(r=>r.unit===unit&&r.area===a));
  sel.innerHTML = `<option value="">All Areas</option>`
    + validAreas.map(a=>`<option value="${a}" ${cur===a?'selected':''}>${a}</option>`).join('');
}

function onWorkersUnitChange() {
  cascadeWorkerPageArea(document.getElementById('workerFilterUnit').value);
  renderAdminWorkersTable();
}

function clearWorkerFilters() {
  ['workerSearch','workerFilterUnit','workerFilterArea','workerFilterStatus'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderAdminWorkersTable();
}

// ============================================================
// WORKER DETAIL
// ============================================================
function openWorkerDetail(workerId, backPage) {
  workerDetailBack = backPage||'adminWorkers';
  const worker  = getWorkerById(workerId);
  if (!worker) return;
  const rd  = getReadingsForWorker(workerId).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const avgE = avg(rd.map(r=>r.exposure)), maxE=max(rd.map(r=>r.exposure));
  const hc   = rd.filter(r=>r.status==='High').length;
  const ec   = rd.filter(r=>r.status==='Elevated').length;

  document.getElementById('workerDetailTitle').textContent = `${worker.id} — ${worker.name}`;
  document.getElementById('workerDetailContent').innerHTML = `
    <div class="card">
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
        <div class="worker-avatar">${worker.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
        <div style="flex:1">
          <h2 style="font-size:20px;color:var(--primary);font-weight:800">${worker.name}</h2>
          <p style="color:var(--text-secondary);margin:4px 0">${worker.id} · ${worker.dept} · ${worker.unit}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <span class="company-badge">📍 ${worker.area}</span>
            <span class="company-badge">🕐 ${worker.shift} Shift</span>
            <span class="company-badge">🏭 ${worker.unit}</span>
          </div>
        </div>
      </div>
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--border)">
      <div class="kpi-grid">
        ${kpiCard('blue','📊',rd.length,'Total Readings','')}
        ${kpiCard('teal','📈',avgE.toFixed(1),'Avg Est. Exposure (ppm·hr)','')}
        ${kpiCard(maxE>=THRESHOLDS.elevated?'red':'yellow','⬆️',maxE.toFixed(1),'Max Est. Exposure (ppm·hr)','')}
        ${kpiCard(hc>0?'red':ec>0?'yellow':'green',hc>0?'🔴':'✅',hc+ec,'Elevated / High Readings','')}
      </div>
    </div>
    <div class="card mt-16">
      <div class="card-header"><h3>📈 Exposure Trend (Last 14 Days)</h3></div>
      <canvas id="workerDetailChart" height="200"></canvas>
    </div>
    <div class="card mt-16">
      <div class="card-header"><h3>📋 Full Exposure History (${rd.length} records)</h3></div>
      <div class="overflow-x"><table class="data-table">
      <thead><tr><th>Date</th><th>Time</th><th>Shift</th><th>Area</th><th>Duration</th>
      <th>Est. Cumulative H₂S Exposure</th><th>Temp</th><th>Humidity</th><th>Sensor</th><th>Status</th></tr></thead>
      <tbody>${rd.slice(0,30).map(r=>`<tr>
        <td>${formatDate(r.date)}</td><td>${r.time}</td><td>${r.shift}</td><td>${r.area}</td><td>${r.duration}</td>
        <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure} ppm·hr</span></td>
        <td>${r.temp}</td><td>${r.humidity}</td>
        <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
        <td>${getStatusBadge(r.status)}</td>
      </tr>`).join('')}</tbody></table></div>
    </div>
    <div class="disclaimer-box mt-16">⚠ All values are <strong>estimated cumulative H₂S exposure</strong> from passive colorimetric strip analysis. Not a certified measurement.</div>`;

  showPage('workerDetail');

  setTimeout(()=>{
    destroyChart('workerDetailChart');
    const last14 = getLast30Dates().slice(-14);
    const data   = last14.map(d=>{ const dr=rd.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null; });
    charts['workerDetailChart'] = new Chart(document.getElementById('workerDetailChart'),{
      type:'line', data:{
        labels: last14.map(d=>shortDate(d)),
        datasets:[{label:`${worker.name} — Est. Exposure (ppm·hr)`, data,
          borderColor:CC.teal, backgroundColor:CC.ltTeal,
          pointBackgroundColor:data.map(v=>!v?'#ccc':v>=THRESHOLDS.elevated?'#dc2626':v>=THRESHOLDS.normal?'#d97706':'#1b7e3b'),
          pointRadius:5, fill:true, tension:0.35, spanGaps:true}]
      }, options:lineChartOptions('Est. Exposure (ppm·hr)')
    });
  },100);
}

function goBackFromWorkerDetail() {
  const back = workerDetailBack || 'adminWorkers';
  showPage(back);
  if      (back === 'adminWorkers')   renderAdminWorkersTable();
  else if (back === 'adminDashboard') initAdminDashboard();
  else if (back === 'adminAlerts')    renderAlerts();
  else if (back === 'adminExposure')  renderExposureTable();
  // areaDetail: page is still in DOM, charts still alive — no re-render needed
}

// ============================================================
// INDUSTRIES PAGE
// ============================================================
function initIndustriesPage() {
  const unitStats = UNITS.map(unit=>{
    const ur=DB.readings.filter(r=>r.unit===unit);
    const ws=DB.users.filter(u=>u.unit===unit&&u.role==='worker');
    return {unit, workers:ws.length, readings:ur.length,
      avg:parseFloat(avg(ur.map(r=>r.exposure)).toFixed(2)),
      max:parseFloat(max(ur.map(r=>r.exposure)).toFixed(2)),
      high:ur.filter(r=>r.status==='High').length,
      elevated:ur.filter(r=>r.status==='Elevated').length};
  });

  document.getElementById('industryKPIs').innerHTML =
    kpiCard('blue','🏭',UNITS.length,'Industry Units','')
    + kpiCard('teal','👷',DB.users.filter(u=>u.role==='worker').length,'Total Workers','')
    + kpiCard('green','🔬',DB.readings.length,'Total Readings','')
    + kpiCard('red','⚠️',DB.readings.filter(r=>r.status==='High').length,'High Risk Cases','');

  destroyChart('industryChart');
  charts['industryChart'] = new Chart(document.getElementById('industryChart'),{
    type:'bar', data:{
      labels:unitStats.map(u=>u.unit),
      datasets:[
        {label:'Avg Est. Exposure (ppm·hr)', data:unitStats.map(u=>u.avg), backgroundColor:UNIT_CLR.map(c=>c+'cc'), borderRadius:8, borderSkipped:false},
        {label:'Max Est. Exposure (ppm·hr)', data:unitStats.map(u=>u.max), backgroundColor:UNIT_CLR.map(c=>c+'33'), borderColor:UNIT_CLR, borderWidth:2, borderRadius:8, borderSkipped:false},
      ]}, options:barChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  document.getElementById('industryCards').innerHTML = unitStats.map((u,i)=>`
    <div class="industry-card" style="border-top-color:${UNIT_CLR[i]}">
      <div class="industry-card-name">🏭 ${u.unit}</div>
      <div class="industry-stats">
        <div class="industry-stat"><div class="val">${u.workers}</div><div class="lbl">Workers</div></div>
        <div class="industry-stat"><div class="val">${u.readings}</div><div class="lbl">Readings</div></div>
        <div class="industry-stat"><div class="val exp-value ${u.avg>=THRESHOLDS.elevated?'high':u.avg>=THRESHOLDS.normal?'elevated':'normal'}">${u.avg}</div><div class="lbl">Avg ppm·hr</div></div>
        <div class="industry-stat"><div class="val exp-value ${u.max>=THRESHOLDS.elevated?'high':u.max>=THRESHOLDS.normal?'elevated':'normal'}">${u.max}</div><div class="lbl">Max ppm·hr</div></div>
        <div class="industry-stat"><div class="val" style="color:#b91c1c">${u.high}</div><div class="lbl">High</div></div>
        <div class="industry-stat"><div class="val" style="color:#a16207">${u.elevated}</div><div class="lbl">Elevated</div></div>
      </div>
    </div>`).join('');
}

// ============================================================
// AREAS PAGE
// ============================================================
function initAreasPage() {
  const areaStats = AREAS.map(area=>{
    const ar=DB.readings.filter(r=>r.area===area);
    const ws=[...new Set(ar.map(r=>r.workerId))];
    return {area, workers:ws.length, readings:ar.length,
      avg:parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2)),
      max:parseFloat(max(ar.map(r=>r.exposure)).toFixed(2)),
      high:ar.filter(r=>r.status==='High').length, elevated:ar.filter(r=>r.status==='Elevated').length};
  });

  document.getElementById('areaCards').innerHTML = areaStats.map(a=>{
    const pct=Math.min((a.avg/15)*100,100);
    const fill=a.avg>=THRESHOLDS.elevated?'#b91c1c':a.avg>=THRESHOLDS.normal?'#d97706':'#1b7e3b';
    return `<div class="area-card" onclick="areaDetailBack='adminAreas';openAreaDetail('${a.area}')">
      <div class="area-card-header">
        <div><div class="area-name">📍 ${a.area}</div><div class="area-unit">${a.workers} workers monitored</div></div>
        ${getStatusBadge(a.avg>=THRESHOLDS.elevated?'High':a.avg>=THRESHOLDS.normal?'Elevated':'Normal')}
      </div>
      <div class="area-stats">
        <div class="area-stat"><div class="area-stat-val">${a.workers}</div><div class="area-stat-lbl">Workers</div></div>
        <div class="area-stat"><div class="area-stat-val">${a.readings}</div><div class="area-stat-lbl">Readings</div></div>
        <div class="area-stat"><div class="area-stat-val exp-value ${a.avg>=THRESHOLDS.elevated?'high':a.avg>=THRESHOLDS.normal?'elevated':'normal'}">${a.avg}</div><div class="area-stat-lbl">Avg ppm·hr</div></div>
        <div class="area-stat"><div class="area-stat-val exp-value ${a.max>=THRESHOLDS.elevated?'high':a.max>=THRESHOLDS.normal?'elevated':'normal'}">${a.max}</div><div class="area-stat-lbl">Max ppm·hr</div></div>
      </div>
      <div style="font-size:10.5px;color:var(--text-secondary);margin-bottom:4px;display:flex;justify-content:space-between">
        <span>Avg Exposure Level</span><span>${a.avg} / 15 ppm·hr</span>
      </div>
      <div class="area-exposure-bar"><div class="area-exposure-fill" style="width:${pct}%;background:${fill}"></div></div>
      <div style="display:flex;gap:7px;margin-top:10px">
        <span style="font-size:11px;background:#fef2f2;color:#b91c1c;padding:2px 8px;border-radius:4px;font-weight:700">🔴 ${a.high} High</span>
        <span style="font-size:11px;background:#fffbeb;color:#a16207;padding:2px 8px;border-radius:4px;font-weight:700">🟡 ${a.elevated} Elevated</span>
      </div>
    </div>`;
  }).join('');
}

function openAreaDetail(areaName) {
  const ar=DB.readings.filter(r=>r.area===areaName);
  const workerIds=[...new Set(ar.map(r=>r.workerId))];
  const avgE=parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2));
  const maxE=parseFloat(max(ar.map(r=>r.exposure)).toFixed(2));

  document.getElementById('areaDetailTitle').textContent=`📍 ${areaName} — Area Detail`;
  document.getElementById('areaDetailKPIs').innerHTML=
    kpiCard('blue','👷',workerIds.length,'Workers','')
    + kpiCard('teal','🔬',ar.length,'Total Readings','')
    + kpiCard(avgE>=THRESHOLDS.elevated?'red':avgE>=THRESHOLDS.normal?'yellow':'green','📊',avgE,'Avg Est. Exposure (ppm·hr)','')
    + kpiCard(maxE>=THRESHOLDS.elevated?'red':maxE>=THRESHOLDS.normal?'yellow':'green','⬆️',maxE,'Max Est. Exposure (ppm·hr)','')
    + kpiCard('yellow','🟡',ar.filter(r=>r.status==='Elevated').length,'Elevated Cases','')
    + kpiCard('red','🔴',ar.filter(r=>r.status==='High').length,'High Risk Cases','');

  const workerData=workerIds.map(wid=>{
    const wr=ar.filter(r=>r.workerId===wid);
    const w=getWorkerById(wid);
    const lt=wr.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time))[0];
    return {wid, name:w?.name||wid, unit:w?.unit||'', shift:w?.shift||'', readings:wr.length,
      avg:parseFloat(avg(wr.map(r=>r.exposure)).toFixed(2)), max:parseFloat(max(wr.map(r=>r.exposure)).toFixed(2)), status:lt?.status||'Normal'};
  });

  document.getElementById('areaDetailWorkers').innerHTML=`
    <div class="overflow-x"><table class="data-table">
    <thead><tr><th>Worker ID</th><th>Name</th><th>Unit</th><th>Shift</th><th>Readings</th><th>Avg (ppm·hr)</th><th>Max (ppm·hr)</th><th>Status</th></tr></thead>
    <tbody>${workerData.map(w=>`<tr class="clickable" onclick="openWorkerDetail('${w.wid}','areaDetail')">
      <td><strong>${w.wid}</strong></td><td>${w.name}</td><td>${w.unit}</td><td>${w.shift}</td><td>${w.readings}</td>
      <td><span class="exp-value ${getStatusClass(w.avg>=THRESHOLDS.elevated?'High':w.avg>=THRESHOLDS.normal?'Elevated':'Normal')}">${w.avg}</span></td>
      <td><span class="exp-value ${getStatusClass(w.max>=THRESHOLDS.elevated?'High':w.max>=THRESHOLDS.normal?'Elevated':'Normal')}">${w.max}</span></td>
      <td>${getStatusBadge(w.status)}</td>
    </tr>`).join('')}
    </tbody></table></div>`;

  showPage('areaDetail');

  setTimeout(()=>{
    destroyChart('areaDetailTrendChart'); destroyChart('areaDetailShiftChart'); destroyChart('areaWorkerCompChart');
    const last14=getLast30Dates().slice(-14);
    charts['areaDetailTrendChart']=new Chart(document.getElementById('areaDetailTrendChart'),{
      type:'line', data:{labels:last14.map(d=>shortDate(d)), datasets:[{
        label:`${areaName} Avg Est. Exposure (ppm·hr)`,
        data:last14.map(d=>{ const dr=ar.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null; }),
        borderColor:CC.teal, backgroundColor:CC.ltTeal, pointRadius:4, fill:true, tension:0.35, spanGaps:true
      }]}, options:lineChartOptions('Est. Exposure (ppm·hr)')
    });
    charts['areaDetailShiftChart']=new Chart(document.getElementById('areaDetailShiftChart'),{
      type:'bar', data:{labels:SHIFTS.map(s=>s+' Shift'), datasets:[{
        label:'Avg Est. Exposure (ppm·hr)',
        data:SHIFTS.map(s=>parseFloat(avg(ar.filter(r=>r.shift===s).map(r=>r.exposure)).toFixed(2))),
        backgroundColor:SHIFT_CLR, borderRadius:7, borderSkipped:false
      }]}, options:barChartOptions('Avg Est. Exposure (ppm·hr)')
    });
    charts['areaWorkerCompChart']=new Chart(document.getElementById('areaWorkerCompChart'),{
      type:'bar', data:{labels:workerData.map(w=>w.wid), datasets:[
        {label:'Avg (ppm·hr)', data:workerData.map(w=>w.avg), backgroundColor:CC.teal, borderRadius:7, borderSkipped:false},
        {label:'Max (ppm·hr)', data:workerData.map(w=>w.max), backgroundColor:CC.blue, borderRadius:7, borderSkipped:false},
      ]}, options:barChartOptions('Est. Exposure (ppm·hr)')
    });
  },100);
}

function goBackFromAreaDetail() {
  const back = areaDetailBack||'adminAreas';
  showPage(back);
  if (back==='adminAreas')      initAreasPage();
  else if (back==='adminDashboard') { buildFilterPanel(); refreshDashboard(); }
}

// ============================================================
// EXPOSURE MONITORING PAGE — cascading filters
// ============================================================
function renderExposureTable() {
  // Cascade area based on unit
  const unit  = document.getElementById('expUnit')?.value;
  cascadeExpArea(unit);

  const area  = document.getElementById('expArea')?.value;
  const shift = document.getElementById('expShift')?.value;
  const from  = document.getElementById('expDateFrom')?.value;
  const to    = document.getElementById('expDateTo')?.value;

  let rd = getFilteredReadings({unit, area, shift, dateFrom:from, dateTo:to});
  rd.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));

  const container = document.getElementById('exposureTableContainer');
  if (!rd.length) { container.innerHTML='<div class="empty-state"><div class="empty-icon">🔬</div><p>No readings match selected filters.</p></div>'; return; }

  container.innerHTML = summaryBar(rd, true) + `
    <div class="overflow-x"><table class="data-table">
    <thead><tr><th>Worker ID</th><th>Worker Name</th><th>Industry/Unit</th><th>Work Area</th>
    <th>Shift</th><th>Date</th><th>Duration</th><th>Est. Cumulative H₂S Exposure</th>
    <th>Temp</th><th>Humidity</th><th>Sensor</th><th>Risk Status</th></tr></thead>
    <tbody>${rd.slice(0,300).map(r=>`
      <tr class="clickable" onclick="openWorkerDetail('${r.workerId}','adminExposure')">
        <td><strong>${r.workerId}</strong></td><td>${r.workerName}</td><td>${r.unit}</td><td>${r.area}</td>
        <td>${r.shift}</td><td>${formatDate(r.date)}</td><td>${r.duration}</td>
        <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure} ppm·hr</span></td>
        <td>${r.temp}</td><td>${r.humidity}</td>
        <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
        <td>${getStatusBadge(r.status)}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

function cascadeExpArea(unit) {
  const sel = document.getElementById('expArea');
  if (!sel) return;
  const cur = sel.value;
  let validAreas = AREAS;
  if (unit) validAreas = AREAS.filter(a=>DB.readings.some(r=>r.unit===unit&&r.area===a));
  sel.innerHTML = `<option value="">All Areas</option>`
    + validAreas.map(a=>`<option value="${a}" ${cur===a?'selected':''}>${a}</option>`).join('');
}

function clearExposureFilters() {
  ['expUnit','expArea','expShift','expDateFrom','expDateTo'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  cascadeExpArea('');
  renderExposureTable();
}

// ============================================================
// ANALYTICS PAGE
// ============================================================
function initAnalyticsPage() {
  destroyChart('analyticsAreaChart');
  const areaData=AREAS.map(area=>{const ar=DB.readings.filter(r=>r.area===area); return {area, avg:parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2)), max:parseFloat(max(ar.map(r=>r.exposure)).toFixed(2))};});
  charts['analyticsAreaChart']=new Chart(document.getElementById('analyticsAreaChart'),{
    type:'bar',data:{labels:areaData.map(d=>d.area),datasets:[
      {label:'Avg (ppm·hr)',data:areaData.map(d=>d.avg),backgroundColor:CC.teal,borderRadius:7,borderSkipped:false},
      {label:'Max (ppm·hr)',data:areaData.map(d=>d.max),backgroundColor:CC.blue,borderRadius:7,borderSkipped:false},
    ]},options:barChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  destroyChart('analyticsUnitChart');
  const unitData=UNITS.map(unit=>{const ur=DB.readings.filter(r=>r.unit===unit); return {unit, avg:parseFloat(avg(ur.map(r=>r.exposure)).toFixed(2)), max:parseFloat(max(ur.map(r=>r.exposure)).toFixed(2))};});
  charts['analyticsUnitChart']=new Chart(document.getElementById('analyticsUnitChart'),{
    type:'bar',data:{labels:unitData.map(d=>d.unit),datasets:[
      {label:'Avg (ppm·hr)',data:unitData.map(d=>d.avg),backgroundColor:UNIT_CLR.map(c=>c+'cc'),borderRadius:7,borderSkipped:false},
      {label:'Max (ppm·hr)',data:unitData.map(d=>d.max),backgroundColor:UNIT_CLR.map(c=>c+'44'),borderColor:UNIT_CLR,borderWidth:2,borderRadius:7,borderSkipped:false},
    ]},options:barChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  destroyChart('analyticsTrendChart');
  const last14=getLast30Dates().slice(-14);
  charts['analyticsTrendChart']=new Chart(document.getElementById('analyticsTrendChart'),{
    type:'line',data:{labels:last14.map(d=>shortDate(d)),datasets:[{
      label:'Avg Est. Exposure (ppm·hr)',
      data:last14.map(d=>{const dr=DB.readings.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null;}),
      borderColor:CC.teal,backgroundColor:CC.ltTeal,pointRadius:5,fill:true,tension:0.35,spanGaps:true
    }]},options:lineChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  destroyChart('analyticsShiftChart');
  charts['analyticsShiftChart']=new Chart(document.getElementById('analyticsShiftChart'),{
    type:'bar',data:{labels:['Morning Shift','Evening Shift','Night Shift'],datasets:[{
      label:'Avg Est. Exposure (ppm·hr)',
      data:SHIFTS.map(s=>parseFloat(avg(DB.readings.filter(r=>r.shift===s).map(r=>r.exposure)).toFixed(2))),
      backgroundColor:SHIFT_CLR,borderRadius:7,borderSkipped:false
    }]},options:barChartOptions('Avg Est. Exposure (ppm·hr)')
  });

  const sel=document.getElementById('analyticsWorkerSelect');
  sel.innerHTML=DB.users.filter(u=>u.role==='worker').map(u=>`<option value="${u.id}">${u.id} — ${u.name}</option>`).join('');
  renderWorkerAnalyticsChart();
}

function renderWorkerAnalyticsChart() {
  const wid=document.getElementById('analyticsWorkerSelect')?.value;
  if (!wid) return;
  const rd=getReadingsForWorker(wid);
  const last14=getLast30Dates().slice(-14);
  destroyChart('analyticsWorkerChart');
  charts['analyticsWorkerChart']=new Chart(document.getElementById('analyticsWorkerChart'),{
    type:'line',data:{labels:last14.map(d=>shortDate(d)),datasets:[{
      label:`${wid} — Est. Exposure (ppm·hr)`,
      data:last14.map(d=>{const dr=rd.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null;}),
      borderColor:CC.blue,backgroundColor:CC.ltBlue,
      pointBackgroundColor:last14.map(d=>{const dr=rd.filter(r=>r.date===d);const v=dr.length?avg(dr.map(r=>r.exposure)):0; return v>=THRESHOLDS.elevated?'#dc2626':v>=THRESHOLDS.normal?'#d97706':'#1b7e3b';}),
      pointRadius:5,fill:true,tension:0.35,spanGaps:true
    }]},options:lineChartOptions('Est. Exposure (ppm·hr)')
  });
}

// ============================================================
// ALERTS PAGE — cascading filters
// ============================================================
function renderAlerts() {
  const statusF = document.getElementById('alertFilterStatus')?.value;
  const areaF   = document.getElementById('alertFilterArea')?.value;
  const unitF   = document.getElementById('alertFilterUnit')?.value;
  const shiftF  = document.getElementById('alertFilterShift')?.value;

  // Cascade area based on unit
  cascadeAlertArea(unitF);

  let alerts=getAlerts(DB.readings);
  if (statusF) alerts=alerts.filter(r=>r.status===statusF);
  if (areaF)   alerts=alerts.filter(r=>r.area===areaF);
  if (unitF)   alerts=alerts.filter(r=>r.unit===unitF);
  if (shiftF)  alerts=alerts.filter(r=>r.shift===shiftF);

  const container=document.getElementById('alertsContainer');
  if (!alerts.length) { container.innerHTML='<div class="empty-state"><div class="empty-icon">✅</div><p>No alerts match selected filters.</p></div>'; return; }

  container.innerHTML=`<div class="table-summary-bar">
      <strong>${alerts.length}</strong> alerts &nbsp;·&nbsp;
      <span style="color:#b91c1c">🔴 High: ${alerts.filter(r=>r.status==='High').length}</span> &nbsp;·&nbsp;
      <span style="color:#a16207">🟡 Elevated: ${alerts.filter(r=>r.status==='Elevated').length}</span>
    </div><div class="mt-16">
    ${alerts.slice(0,60).map(r=>`
      <div class="alert-card ${getStatusClass(r.status)}" onclick="openWorkerDetail('${r.workerId}','adminAlerts')" style="cursor:pointer">
        <div class="alert-icon">${r.status==='High'?'🔴':'🟡'}</div>
        <div class="alert-body">
          <div class="alert-title">⚠ Worker ${r.workerId} — ${r.workerName}</div>
          <div class="alert-meta">
            <span>📍 ${r.area}</span><span>🕐 ${r.shift} Shift</span>
            <span>🏭 ${r.unit}</span><span>📅 ${formatDate(r.date)} at ${r.time}</span><span>⏱ ${r.duration}</span>
          </div>
          <div style="margin-top:5px;font-size:11.5px;color:var(--text-secondary)">
            Reason: Estimated cumulative H₂S exposure ${r.status==='High'?'exceeds high-risk threshold (≥10 ppm·hr)':'exceeds elevated threshold (≥5 ppm·hr)'}
          </div>
        </div>
        <div class="alert-exposure" style="color:${r.status==='High'?'#b91c1c':'#a16207'}">
          ${r.exposure}<div class="reading-unit">ppm·hr</div>${getStatusBadge(r.status)}
        </div>
      </div>`).join('')}</div>`;
}

function cascadeAlertArea(unit) {
  const sel=document.getElementById('alertFilterArea');
  if (!sel) return;
  const cur=sel.value;
  let validAreas=AREAS;
  if (unit) validAreas=AREAS.filter(a=>DB.readings.some(r=>r.unit===unit&&r.area===a));
  sel.innerHTML=`<option value="">All Areas</option>`+validAreas.map(a=>`<option value="${a}" ${cur===a?'selected':''}>${a}</option>`).join('');
}

// ============================================================
// REPORTS
// ============================================================
function generateReport() {
  const from=document.getElementById('reportDateFrom')?.value;
  const to=document.getElementById('reportDateTo')?.value;
  const unit=document.getElementById('reportUnit')?.value;
  const area=document.getElementById('reportArea')?.value;
  const shift=document.getElementById('reportShift')?.value;
  const wf=(document.getElementById('reportWorker')?.value||'').toUpperCase();

  // Cascade area in reports too
  cascadeReportArea(unit);

  const rd=getFilteredReadings({unit,area,shift,dateFrom:from,dateTo:to,workerId:wf});
  const totalW=[...new Set(rd.map(r=>r.workerId))].length;
  const avgE=parseFloat(avg(rd.map(r=>r.exposure)).toFixed(2));
  const maxE=parseFloat(max(rd.map(r=>r.exposure)).toFixed(2));
  const high=rd.filter(r=>r.status==='High').length;
  const elev=rd.filter(r=>r.status==='Elevated').length;

  document.getElementById('reportPreview').innerHTML=`
    <div class="report-preview-box">
      <div class="report-header-section">
        <h2>🏢 MRPL — Estimated H₂S Exposure Monitoring Report</h2>
        <p>Passive Colorimetric Wristband Dosimeter System · SafeTrack Pro v1.0 (Prototype)</p>
        <p>Period: ${from?formatDate(from):'All dates'} to ${to?formatDate(to):'All dates'} · Generated: ${formatDate('2026-09-08')}</p>
        ${unit||area||shift?`<p>Filter: ${[unit,area,shift?shift+' Shift':''].filter(Boolean).join(' · ')}</p>`:''}
        <div style="margin-top:12px;padding:10px 14px;background:rgba(255,255,255,0.12);border-radius:8px;font-size:11.5px;line-height:1.6">
          ⚠ This report contains <strong>estimated cumulative H₂S exposure</strong> data from passive colorimetric dosimeter strip analysis.
          Intended to support occupational health and safety awareness. <strong>NOT</strong> officially DGMS/OISD compliant unless formally validated.
        </div>
      </div>
      <div class="report-body">
        <div class="report-summary-grid">
          <div class="report-summary-card"><div class="val">${totalW}</div><div class="lbl">Workers Monitored</div></div>
          <div class="report-summary-card"><div class="val">${rd.length}</div><div class="lbl">Total Readings</div></div>
          <div class="report-summary-card"><div class="val">${avgE}</div><div class="lbl">Avg Exp. (ppm·hr)</div></div>
          <div class="report-summary-card"><div class="val">${maxE}</div><div class="lbl">Max Exp. (ppm·hr)</div></div>
          <div class="report-summary-card" style="border-top:3px solid #d97706"><div class="val" style="color:#a16207">${elev}</div><div class="lbl">Elevated Cases</div></div>
          <div class="report-summary-card" style="border-top:3px solid #b91c1c"><div class="val" style="color:#b91c1c">${high}</div><div class="lbl">High Risk Cases</div></div>
        </div>
        <h3 style="font-size:14px;font-weight:700;color:var(--primary);margin-bottom:12px">Area-wise Summary</h3>
        <table class="data-table" style="margin-bottom:22px">
          <thead><tr><th>Area</th><th>Readings</th><th>Avg (ppm·hr)</th><th>Max (ppm·hr)</th><th>Elevated</th><th>High</th></tr></thead>
          <tbody>${AREAS.map(a=>{const ar=rd.filter(r=>r.area===a); return ar.length?`<tr><td>${a}</td><td>${ar.length}</td>
            <td>${parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2))}</td>
            <td>${parseFloat(max(ar.map(r=>r.exposure)).toFixed(2))}</td>
            <td>${ar.filter(r=>r.status==='Elevated').length}</td>
            <td>${ar.filter(r=>r.status==='High').length}</td></tr>`:'';}).join('')}
          </tbody>
        </table>
        <h3 style="font-size:14px;font-weight:700;color:var(--primary);margin-bottom:12px">Worker-wise Records (first 50)</h3>
        <div class="overflow-x"><table class="data-table">
        <thead><tr><th>Worker ID</th><th>Name</th><th>Unit</th><th>Area</th><th>Shift</th><th>Date</th><th>Duration</th>
        <th>Est. Cumulative H₂S Exp.</th><th>Temp</th><th>Humidity</th><th>Sensor</th><th>Status</th></tr></thead>
        <tbody>${rd.slice(0,50).map(r=>`<tr>
          <td>${r.workerId}</td><td>${r.workerName}</td><td>${r.unit}</td><td>${r.area}</td>
          <td>${r.shift}</td><td>${formatDate(r.date)}</td><td>${r.duration}</td>
          <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure} ppm·hr</span></td>
          <td>${r.temp}</td><td>${r.humidity}</td>
          <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
          <td>${getStatusBadge(r.status)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="report-disclaimer">
          <strong>Disclaimer:</strong> All exposure values represent <em>estimated cumulative H₂S exposure</em> from passive colorimetric dosimeter strip colour analysis using AI image processing.
          These are prototype research readings and do not constitute certified occupational exposure measurements.
          This report supports internal occupational health and safety monitoring awareness only.
          For regulatory compliance, use certified real-time H₂S monitoring instruments.
        </div>
      </div>
    </div>`;
  showToast('Report generated successfully!','success');
}

function cascadeReportArea(unit) {
  const sel=document.getElementById('reportArea');
  if (!sel) return;
  const cur=sel.value;
  let validAreas=AREAS;
  if (unit) validAreas=AREAS.filter(a=>DB.readings.some(r=>r.unit===unit&&r.area===a));
  sel.innerHTML=`<option value="">All Areas</option>`+validAreas.map(a=>`<option value="${a}" ${cur===a?'selected':''}>${a}</option>`).join('');
}

function exportCSV() {
  const from=document.getElementById('reportDateFrom')?.value;
  const to=document.getElementById('reportDateTo')?.value;
  const unit=document.getElementById('reportUnit')?.value;
  const area=document.getElementById('reportArea')?.value;
  const shift=document.getElementById('reportShift')?.value;
  const wf=(document.getElementById('reportWorker')?.value||'').toUpperCase();
  const rd=getFilteredReadings({unit,area,shift,dateFrom:from,dateTo:to,workerId:wf});
  const headers=['Worker ID','Worker Name','Industry/Unit','Work Area','Shift','Date','Time','Duration','Est. Cumulative H2S Exposure (ppm.hr)','Temperature','Humidity','Sensor Validity','Risk Status'];
  let csv=headers.join(',')+'\n';
  csv+=rd.map(r=>[r.workerId,r.workerName,r.unit,r.area,r.shift,r.date,r.time,r.duration,r.exposure,r.temp,r.humidity,r.validity,r.status].map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`MRPL_H2S_Exposure_Report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('CSV exported!','success');
}

function exportPDF() {
  try {
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const from=document.getElementById('reportDateFrom')?.value;
    const to=document.getElementById('reportDateTo')?.value;
    const unit=document.getElementById('reportUnit')?.value;
    const area=document.getElementById('reportArea')?.value;
    const shift=document.getElementById('reportShift')?.value;
    const wf=(document.getElementById('reportWorker')?.value||'').toUpperCase();
    const rd=getFilteredReadings({unit,area,shift,dateFrom:from,dateTo:to,workerId:wf});
    doc.setFillColor(13,59,110); doc.rect(0,0,297,32,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont('helvetica','bold');
    doc.text('MRPL \u2014 Estimated H\u2082S Exposure Monitoring Report',14,11);
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('SafeTrack Pro v1.0 (Prototype) \u00B7 Passive Colorimetric Wristband Dosimeter',14,19);
    doc.text(`Period: ${from||'All'} to ${to||'All'}${unit?' \u00B7 '+unit:''} \u00B7 Generated: 2026-09-08`,14,26);
    doc.setTextColor(0,0,0); doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Worker-wise Estimated Cumulative H\u2082S Exposure Records',14,42);
    doc.autoTable({startY:46,
      head:[['Worker ID','Name','Unit','Area','Shift','Date','Duration','Est. Exp. (ppm\u00B7hr)','Temp','Humidity','Sensor','Status']],
      body:rd.slice(0,100).map(r=>[r.workerId,r.workerName,r.unit,r.area,r.shift,formatDate(r.date),r.duration,r.exposure+' ppm\u00B7hr',r.temp,r.humidity,r.validity,r.status]),
      styles:{fontSize:7.5,cellPadding:2.5},
      headStyles:{fillColor:[13,59,110],textColor:255,fontStyle:'bold',fontSize:8},
      alternateRowStyles:{fillColor:[240,245,255]},
    });
    doc.save(`MRPL_H2S_Exposure_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF exported!','success');
  } catch(err) { showToast('PDF export failed. Try CSV.','error'); console.error(err); }
}

function saveThresholds() {
  const n = parseFloat(document.getElementById('threshNormal')?.value)   || 5;
  const e = parseFloat(document.getElementById('threshElevated')?.value) || 10;
  if (n >= e) { showToast('Normal threshold must be less than Elevated threshold.','error'); return; }
  applyThresholds(n, e);
  updateThresholdPreview();
  showToast(`Thresholds saved: Normal <${n} · Elevated ${n}–${e} · High ≥${e} ppm·hr`, 'success');
}

function resetThresholds() {
  document.getElementById('threshNormal').value   = 5;
  document.getElementById('threshElevated').value = 10;
  document.getElementById('threshHigh').value     = 10;
  applyThresholds(5, 10);
  updateThresholdPreview();
  showToast('Thresholds reset to defaults (5 / 10 ppm·hr)', 'success');
}

function updateThresholdPreview() {
  const el = document.getElementById('thresholdPreview');
  if (!el) return;
  const n = THRESHOLDS.normal, e = THRESHOLDS.elevated;
  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <span style="background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700">🟢 Normal: &lt; ${n} ppm·hr</span>
      <span style="background:#fef9c3;color:#a16207;border:1px solid #fde047;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700">🟡 Elevated: ${n} – ${e} ppm·hr</span>
      <span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700">🔴 High / Review: ≥ ${e} ppm·hr</span>
    </div>`;
}

function initSettingsPage() {
  updateThresholdPreview();
  const totalW  = DB.users.filter(u=>u.role==='worker').length;
  const totalR  = DB.readings.length;
  const tw = document.getElementById('settingsTotalWorkers');
  const tr = document.getElementById('settingsTotalRecords');
  if (tw) tw.textContent = totalW;
  if (tr) tr.textContent = totalR.toLocaleString();

  const summary = document.getElementById('settingsDataSummary');
  if (summary) {
    const high = DB.readings.filter(r=>r.status==='High').length;
    const elev = DB.readings.filter(r=>r.status==='Elevated').length;
    const norm = DB.readings.filter(r=>r.status==='Normal').length;
    const avgE = parseFloat(avg(DB.readings.map(r=>r.exposure)).toFixed(2));
    summary.innerHTML =
      kpiCard('blue',  '👷', totalW,  'Registered Workers',   `Across ${UNITS.length} industry units`)
    + kpiCard('teal',  '🔬', totalR.toLocaleString(), 'Total Readings', 'Last 30 days')
    + kpiCard('green', '🟢', norm,    'Normal Readings',       `${((norm/totalR)*100).toFixed(1)}% of total`)
    + kpiCard('yellow','🟡', elev,    'Elevated Readings',     `${((elev/totalR)*100).toFixed(1)}% of total`)
    + kpiCard('red',   '🔴', high,    'High Risk Readings',    `${((high/totalR)*100).toFixed(1)}% of total`)
    + kpiCard(avgE>=THRESHOLDS.elevated?'red':avgE>=THRESHOLDS.normal?'yellow':'green','📊', avgE, 'Overall Avg Est. Exposure', 'ppm·hr across all readings');
  }
}

// ============================================================
// EXPOSURE MONITORING — Full cascade handlers
// ============================================================

function onExpUnitChange() {
  const unit = document.getElementById('expUnit')?.value;
  cascadeExpArea(unit);
  cascadeExpWorker(unit, '');
  renderExposureTable();
}

function onExpAreaChange() {
  const unit = document.getElementById('expUnit')?.value;
  const area = document.getElementById('expArea')?.value;
  cascadeExpWorker(unit, area);
  renderExposureTable();
}

function cascadeExpWorker(unit, area) {
  const sel = document.getElementById('expWorker');
  if (!sel) return;
  const cur = sel.value;
  let workers = DB.users.filter(u => u.role === 'worker');
  if (unit) workers = workers.filter(w => w.unit === unit);
  if (area) workers = workers.filter(w => w.area === area);
  sel.innerHTML = `<option value="">All Workers</option>`
    + workers.map(w => `<option value="${w.id}" ${cur===w.id?'selected':''}>${w.id} — ${w.name}</option>`).join('');
}

function renderExposureTable() {
  const unit   = document.getElementById('expUnit')?.value;
  const area   = document.getElementById('expArea')?.value;
  const shift  = document.getElementById('expShift')?.value;
  const worker = document.getElementById('expWorker')?.value;
  const status = document.getElementById('expStatus')?.value;
  const from   = document.getElementById('expDateFrom')?.value;
  const to     = document.getElementById('expDateTo')?.value;

  // Cascade area based on unit
  cascadeExpArea(unit);

  let rd = getFilteredReadings({ unit, area, shift, workerId: worker, status, dateFrom: from, dateTo: to });
  rd.sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));

  // Update context label
  const countEl = document.getElementById('expActiveCount');
  if (countEl) countEl.textContent = `${rd.length} record${rd.length!==1?'s':''}`;

  // Render KPIs for current filter
  renderExpKPIs(rd);

  const container = document.getElementById('exposureTableContainer');
  if (!rd.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔬</div><p>No readings match selected filters.</p><small>Try removing or changing some filters.</small></div>';
    return;
  }

  container.innerHTML = summaryBar(rd, true) + `
    <div class="table-scroll-container">
    <table class="data-table">
      <thead><tr>
        <th>Worker ID</th><th>Worker Name</th><th>Industry/Unit</th><th>Work Area</th>
        <th>Shift</th><th>Date</th><th>Time</th><th>Duration</th>
        <th>Est. Cumulative H₂S Exposure</th><th>Temp</th><th>Humidity</th><th>Sensor</th><th>Risk Status</th>
      </tr></thead>
      <tbody>${rd.slice(0,300).map(r => `
        <tr class="clickable ${r.status==='High'?'row-high':r.status==='Elevated'?'row-elevated':''}"
            onclick="openWorkerDetail('${r.workerId}','adminExposure')">
          <td><strong>${r.workerId}</strong></td>
          <td>${r.workerName}</td>
          <td>${r.unit}</td>
          <td>${r.area}</td>
          <td>${r.shift}</td>
          <td>${formatDate(r.date)}</td>
          <td>${r.time}</td>
          <td>${r.duration}</td>
          <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure} ppm·hr</span></td>
          <td>${r.temp}</td>
          <td>${r.humidity}</td>
          <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
          <td>${getStatusBadge(r.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

function renderExpKPIs(rd) {
  const el = document.getElementById('expKPIs');
  if (!el || !rd) return;
  const wCount = [...new Set(rd.map(r=>r.workerId))].length;
  const high   = rd.filter(r=>r.status==='High').length;
  const elev   = rd.filter(r=>r.status==='Elevated').length;
  const avgE   = parseFloat(avg(rd.map(r=>r.exposure)).toFixed(2));
  const maxE   = parseFloat(max(rd.map(r=>r.exposure)).toFixed(2));
  el.innerHTML =
    kpiCard('blue',  '👷', wCount,           'Workers in Selection', '')
  + kpiCard('teal',  '🔬', rd.length,         'Readings', '')
  + kpiCard(avgE>=THRESHOLDS.elevated?'red':avgE>=THRESHOLDS.normal?'yellow':'green', '📊', avgE, 'Avg Est. Exposure (ppm·hr)', '')
  + kpiCard(maxE>=THRESHOLDS.elevated?'red':maxE>=THRESHOLDS.normal?'yellow':'green', '⬆️', maxE, 'Max Est. Exposure (ppm·hr)', '')
  + kpiCard('yellow','🟡', elev,              'Elevated Cases', '')
  + kpiCard('red',   '🔴', high,              'High Risk Cases', '');
}

function clearExposureFilters() {
  ['expUnit','expArea','expShift','expWorker','expStatus','expDateFrom','expDateTo'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  cascadeExpArea('');
  cascadeExpWorker('','');
  renderExposureTable();
}

// ============================================================
// ANALYTICS — Full cascade + refresh
// ============================================================

function onAnlUnitChange() {
  const unit = document.getElementById('anlUnit')?.value;
  // Cascade area
  const asel = document.getElementById('anlArea');
  if (asel) {
    const cur = asel.value;
    let validAreas = AREAS;
    if (unit) validAreas = AREAS.filter(a => DB.readings.some(r=>r.unit===unit&&r.area===a));
    asel.innerHTML = `<option value="">All Areas</option>`
      + validAreas.map(a=>`<option value="${a}" ${cur===a?'selected':''}>${a}</option>`).join('');
  }
  refreshAnalytics();
}

function getAnlReadings() {
  const unit  = document.getElementById('anlUnit')?.value  || '';
  const area  = document.getElementById('anlArea')?.value  || '';
  const shift = document.getElementById('anlShift')?.value || '';
  const from  = document.getElementById('anlDateFrom')?.value || '';
  const to    = document.getElementById('anlDateTo')?.value   || '';
  return getFilteredReadings({ unit, area, shift, dateFrom: from, dateTo: to });
}

function refreshAnalytics() {
  const rd   = getAnlReadings();
  const unit = document.getElementById('anlUnit')?.value  || '';
  const area = document.getElementById('anlArea')?.value  || '';

  // Context labels
  const ctx = [unit, area].filter(Boolean).join(' · ') || 'All data';
  ['anlAreaLabel','anlUnitLabel','anlTrendLabel','anlShiftLabel'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.textContent = ctx;
  });

  // A. Area chart
  destroyChart('analyticsAreaChart');
  const visAreas = area ? [area] : AREAS.filter(a => rd.some(r=>r.area===a));
  const aData = visAreas.map(a => {
    const ar=rd.filter(r=>r.area===a);
    return { a, avg: parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2)), max: parseFloat(max(ar.map(r=>r.exposure)).toFixed(2)) };
  });
  charts['analyticsAreaChart'] = new Chart(document.getElementById('analyticsAreaChart'), {
    type:'bar', data:{
      labels: aData.map(d=>d.a),
      datasets:[
        {label:'Avg (ppm·hr)', data:aData.map(d=>d.avg), backgroundColor:CC.teal, borderRadius:7, borderSkipped:false},
        {label:'Max (ppm·hr)', data:aData.map(d=>d.max), backgroundColor:CC.blue, borderRadius:7, borderSkipped:false},
      ]}, options: barChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  // B. Unit chart
  destroyChart('analyticsUnitChart');
  const visUnits = unit ? [unit] : UNITS.filter(u => rd.some(r=>r.unit===u));
  const uColors  = visUnits.map(u => UNIT_CLR[UNITS.indexOf(u)] || '#0d3b6e');
  const uData    = visUnits.map(u => {
    const ur=rd.filter(r=>r.unit===u);
    return { u, avg: parseFloat(avg(ur.map(r=>r.exposure)).toFixed(2)), max: parseFloat(max(ur.map(r=>r.exposure)).toFixed(2)) };
  });
  charts['analyticsUnitChart'] = new Chart(document.getElementById('analyticsUnitChart'), {
    type:'bar', data:{
      labels: uData.map(d=>d.u),
      datasets:[
        {label:'Avg (ppm·hr)', data:uData.map(d=>d.avg), backgroundColor:uColors.map(c=>c+'cc'), borderRadius:7, borderSkipped:false},
        {label:'Max (ppm·hr)', data:uData.map(d=>d.max), backgroundColor:uColors.map(c=>c+'44'), borderColor:uColors, borderWidth:2, borderRadius:7, borderSkipped:false},
      ]}, options: barChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  // C. Trend chart
  destroyChart('analyticsTrendChart');
  const last14 = getLast30Dates().slice(-14);
  charts['analyticsTrendChart'] = new Chart(document.getElementById('analyticsTrendChart'), {
    type:'line', data:{
      labels: last14.map(d=>shortDate(d)),
      datasets:[{
        label:'Avg Est. Exposure (ppm·hr)',
        data: last14.map(d=>{ const dr=rd.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null; }),
        borderColor:CC.teal, backgroundColor:CC.ltTeal, pointRadius:5, fill:true, tension:0.35, spanGaps:true,
      }]}, options: lineChartOptions('Est. Cumulative H₂S Exposure (ppm·hr)')
  });

  // D. Shift chart
  destroyChart('analyticsShiftChart');
  const anlShiftVal = document.getElementById('anlShift')?.value || '';
  const visShifts = anlShiftVal ? [anlShiftVal] : SHIFTS.filter(s=>rd.some(r=>r.shift===s));
  charts['analyticsShiftChart'] = new Chart(document.getElementById('analyticsShiftChart'), {
    type:'bar', data:{
      labels: visShifts.map(s=>s+' Shift'),
      datasets:[{
        label:'Avg Est. Exposure (ppm·hr)',
        data: visShifts.map(s=>parseFloat(avg(rd.filter(r=>r.shift===s).map(r=>r.exposure)).toFixed(2))),
        backgroundColor: visShifts.map(s=>SHIFT_CLR[SHIFTS.indexOf(s)]), borderRadius:7, borderSkipped:false,
      }]}, options: barChartOptions('Avg Est. Exposure (ppm·hr)')
  });

  // E. Worker dropdown — filtered by current unit/area
  const wSel = document.getElementById('analyticsWorkerSelect');
  if (wSel) {
    const wCur = wSel.value;
    let workers = DB.users.filter(u=>u.role==='worker');
    if (unit) workers = workers.filter(w=>w.unit===unit);
    if (area) workers = workers.filter(w=>w.area===area);
    wSel.innerHTML = workers.map(u=>`<option value="${u.id}" ${wCur===u.id?'selected':''}>${u.id} — ${u.name}</option>`).join('');
    renderWorkerAnalyticsChart();
  }
}

function initAnalyticsPage() {
  // Set default date values
  const from = document.getElementById('anlDateFrom');
  const to   = document.getElementById('anlDateTo');
  if (from && !from.value) from.value = '2026-08-10';
  if (to   && !to.value)   to.value   = '2026-09-08';
  refreshAnalytics();
}

function resetAnalyticsFilters() {
  ['anlUnit','anlArea','anlShift'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  const from=document.getElementById('anlDateFrom'); if(from) from.value='2026-08-10';
  const to=document.getElementById('anlDateTo');     if(to)   to.value='2026-09-08';
  refreshAnalytics();
  showToast('Analytics reset — showing all data','success');
}

function renderWorkerAnalyticsChart() {
  const wid = document.getElementById('analyticsWorkerSelect')?.value;
  if (!wid) return;
  const rd     = getReadingsForWorker(wid);
  const last14 = getLast30Dates().slice(-14);
  destroyChart('analyticsWorkerChart');
  charts['analyticsWorkerChart'] = new Chart(document.getElementById('analyticsWorkerChart'),{
    type:'line', data:{
      labels: last14.map(d=>shortDate(d)),
      datasets:[{
        label:`${wid} — Est. Exposure (ppm·hr)`,
        data: last14.map(d=>{ const dr=rd.filter(r=>r.date===d); return dr.length?parseFloat(avg(dr.map(r=>r.exposure)).toFixed(2)):null; }),
        borderColor:CC.blue, backgroundColor:CC.ltBlue,
        pointBackgroundColor: last14.map(d=>{ const dr=rd.filter(r=>r.date===d); const v=dr.length?avg(dr.map(r=>r.exposure)):0; return v>=THRESHOLDS.elevated?'#dc2626':v>=THRESHOLDS.normal?'#d97706':'#1b7e3b'; }),
        pointRadius:5, fill:true, tension:0.35, spanGaps:true,
      }]}, options:lineChartOptions('Est. Exposure (ppm·hr)')
  });
}

// ============================================================
// ALERTS — Full cascade + date filters
// ============================================================

function onAlertUnitChange() {
  const unit = document.getElementById('alertFilterUnit')?.value;
  cascadeAlertArea(unit);
  renderAlerts();
}

function clearAlertFilters() {
  ['alertFilterStatus','alertFilterUnit','alertFilterArea','alertFilterShift','alertDateFrom','alertDateTo']
    .forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  cascadeAlertArea('');
  renderAlerts();
  showToast('Alert filters cleared','success');
}

function renderAlerts() {
  const statusF = document.getElementById('alertFilterStatus')?.value;
  const unitF   = document.getElementById('alertFilterUnit')?.value;
  const areaF   = document.getElementById('alertFilterArea')?.value;
  const shiftF  = document.getElementById('alertFilterShift')?.value;
  const fromF   = document.getElementById('alertDateFrom')?.value;
  const toF     = document.getElementById('alertDateTo')?.value;

  cascadeAlertArea(unitF);

  let alerts = getAlerts(DB.readings);
  if (statusF) alerts = alerts.filter(r=>r.status===statusF);
  if (unitF)   alerts = alerts.filter(r=>r.unit  ===unitF);
  if (areaF)   alerts = alerts.filter(r=>r.area  ===areaF);
  if (shiftF)  alerts = alerts.filter(r=>r.shift ===shiftF);
  if (fromF)   alerts = alerts.filter(r=>r.date  >= fromF);
  if (toF)     alerts = alerts.filter(r=>r.date  <= toF);

  const container = document.getElementById('alertsContainer');
  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No alerts match selected filters.</p><small>All clear for this selection.</small></div>';
    return;
  }

  container.innerHTML = summaryBar(alerts) + `
    <div style="margin-top:12px">
    ${alerts.slice(0,80).map(r=>`
      <div class="alert-card ${getStatusClass(r.status)}" onclick="openWorkerDetail('${r.workerId}','adminAlerts')" style="cursor:pointer">
        <div class="alert-icon">${r.status==='High'?'🔴':'🟡'}</div>
        <div class="alert-body">
          <div class="alert-title">⚠ Worker ${r.workerId} — ${r.workerName}</div>
          <div class="alert-meta">
            <span>📍 ${r.area}</span>
            <span>🕐 ${r.shift} Shift</span>
            <span>🏭 ${r.unit}</span>
            <span>📅 ${formatDate(r.date)} at ${r.time}</span>
            <span>⏱ ${r.duration}</span>
            <span>🌡 ${r.temp} · 💧 ${r.humidity}</span>
            <span>🔬 Sensor: ${r.validity}</span>
          </div>
          <div style="margin-top:5px;font-size:11.5px;color:var(--text-secondary)">
            Reason: Estimated cumulative H₂S exposure ${r.status==='High'
              ?`exceeds high-risk threshold (≥${THRESHOLDS.elevated} ppm·hr)`
              :`exceeds elevated threshold (≥${THRESHOLDS.normal} ppm·hr)`}
          </div>
        </div>
        <div class="alert-exposure" style="color:${r.status==='High'?'#b91c1c':'#a16207'}">
          ${r.exposure}
          <div class="reading-unit">ppm·hr</div>
          ${getStatusBadge(r.status)}
        </div>
      </div>`).join('')}
    </div>`;
}

// ============================================================
// REPORTS — Full cascade + worker dropdown + status filter
// ============================================================

function onReportUnitChange() {
  const unit = document.getElementById('reportUnit')?.value;
  cascadeReportArea(unit);
  cascadeReportWorker(unit, '');
}

function onReportAreaChange() {
  const unit = document.getElementById('reportUnit')?.value;
  const area = document.getElementById('reportArea')?.value;
  cascadeReportWorker(unit, area);
}

function cascadeReportWorker(unit, area) {
  const sel = document.getElementById('reportWorkerSelect');
  if (!sel) return;
  const cur = sel.value;
  let workers = DB.users.filter(u => u.role === 'worker');
  if (unit) workers = workers.filter(w => w.unit === unit);
  if (area) workers = workers.filter(w => w.area === area);
  sel.innerHTML = `<option value="">All Workers</option>`
    + workers.map(w=>`<option value="${w.id}" ${cur===w.id?'selected':''}>${w.id} — ${w.name}</option>`).join('');
}

function clearReportFilters() {
  ['reportDateFrom','reportDateTo','reportUnit','reportArea','reportShift','reportWorkerSelect','reportWorker','reportStatus']
    .forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  cascadeReportArea('');
  cascadeReportWorker('','');
  document.getElementById('reportPreview').innerHTML = '';
  showToast('Report filters cleared','success');
}

function generateReport() {
  const from   = document.getElementById('reportDateFrom')?.value;
  const to     = document.getElementById('reportDateTo')?.value;
  const unit   = document.getElementById('reportUnit')?.value;
  const area   = document.getElementById('reportArea')?.value;
  const shift  = document.getElementById('reportShift')?.value;
  const status = document.getElementById('reportStatus')?.value;
  // Manual ID overrides dropdown
  const wfManual = (document.getElementById('reportWorker')?.value||'').trim().toUpperCase();
  const wfSelect = document.getElementById('reportWorkerSelect')?.value||'';
  const workerId = wfManual || wfSelect;

  cascadeReportArea(unit);
  cascadeReportWorker(unit, area);

  const rd = getFilteredReadings({ unit, area, shift, dateFrom: from, dateTo: to, workerId, status });
  const totalW  = [...new Set(rd.map(r=>r.workerId))].length;
  const avgE    = parseFloat(avg(rd.map(r=>r.exposure)).toFixed(2));
  const maxE    = parseFloat(max(rd.map(r=>r.exposure)).toFixed(2));
  const high    = rd.filter(r=>r.status==='High').length;
  const elev    = rd.filter(r=>r.status==='Elevated').length;
  const norm    = rd.filter(r=>r.status==='Normal').length;

  const filterSummary = [
    unit   ? `Unit: ${unit}` : '',
    area   ? `Area: ${area}` : '',
    shift  ? `Shift: ${shift}` : '',
    workerId ? `Worker: ${workerId}` : '',
    status ? `Status: ${status}` : '',
  ].filter(Boolean).join(' · ') || 'All data';

  // Area summary table rows — only areas that have data
  const areaSummaryRows = AREAS.map(a=>{
    const ar=rd.filter(r=>r.area===a);
    if (!ar.length) return '';
    return `<tr>
      <td><strong>${a}</strong></td><td>${ar.length}</td>
      <td><span class="exp-value ${getStatusClass(avg(ar.map(r=>r.exposure))>=THRESHOLDS.elevated?'High':avg(ar.map(r=>r.exposure))>=THRESHOLDS.normal?'Elevated':'Normal')}">${parseFloat(avg(ar.map(r=>r.exposure)).toFixed(2))}</span></td>
      <td><span class="exp-value ${getStatusClass(max(ar.map(r=>r.exposure))>=THRESHOLDS.elevated?'High':max(ar.map(r=>r.exposure))>=THRESHOLDS.normal?'Elevated':'Normal')}">${parseFloat(max(ar.map(r=>r.exposure)).toFixed(2))}</span></td>
      <td style="color:#a16207;font-weight:700">${ar.filter(r=>r.status==='Elevated').length}</td>
      <td style="color:#b91c1c;font-weight:700">${ar.filter(r=>r.status==='High').length}</td>
    </tr>`;
  }).join('');

  document.getElementById('reportPreview').innerHTML=`
    <div class="report-preview-box">
      <div class="report-header-section">
        <h2>🏢 MRPL — Estimated H₂S Exposure Monitoring Report</h2>
        <p>Passive Colorimetric Wristband Dosimeter System &nbsp;·&nbsp; SafeTrack Pro v1.0 (Prototype)</p>
        <p>Period: ${from?formatDate(from):'All dates'} to ${to?formatDate(to):'All dates'} &nbsp;·&nbsp; Generated: ${formatDate('2026-09-08')}</p>
        <p>Filter scope: <strong>${filterSummary}</strong></p>
        <div style="margin-top:12px;padding:10px 14px;background:rgba(255,255,255,0.12);border-radius:8px;font-size:11.5px;line-height:1.6">
          ⚠ This report contains <strong>estimated cumulative H₂S exposure</strong> data from passive colorimetric dosimeter strip analysis.
          Intended to support occupational health and safety awareness.
          <strong>NOT</strong> officially DGMS/OISD compliant unless formally validated.
        </div>
      </div>
      <div class="report-body">
        <div class="report-summary-grid">
          <div class="report-summary-card"><div class="val">${totalW}</div><div class="lbl">Workers Monitored</div></div>
          <div class="report-summary-card"><div class="val">${rd.length}</div><div class="lbl">Total Readings</div></div>
          <div class="report-summary-card"><div class="val">${avgE}</div><div class="lbl">Avg Est. Exp. (ppm·hr)</div></div>
          <div class="report-summary-card"><div class="val">${maxE}</div><div class="lbl">Max Est. Exp. (ppm·hr)</div></div>
          <div class="report-summary-card" style="border-top:3px solid #15803d"><div class="val" style="color:#15803d">${norm}</div><div class="lbl">Normal Readings</div></div>
          <div class="report-summary-card" style="border-top:3px solid #d97706"><div class="val" style="color:#a16207">${elev}</div><div class="lbl">Elevated Cases</div></div>
          <div class="report-summary-card" style="border-top:3px solid #b91c1c"><div class="val" style="color:#b91c1c">${high}</div><div class="lbl">High Risk Cases</div></div>
          <div class="report-summary-card" style="border-top:3px solid #0077b6"><div class="val" style="color:#0077b6">${THRESHOLDS.normal}/${THRESHOLDS.elevated}</div><div class="lbl">Thresholds (ppm·hr)</div></div>
        </div>

        ${areaSummaryRows ? `
        <h3 style="font-size:14px;font-weight:700;color:var(--primary);margin-bottom:12px;margin-top:4px">📍 Area-wise Summary</h3>
        <table class="data-table" style="margin-bottom:22px">
          <thead><tr><th>Area</th><th>Readings</th><th>Avg (ppm·hr)</th><th>Max (ppm·hr)</th><th>Elevated</th><th>High</th></tr></thead>
          <tbody>${areaSummaryRows}</tbody>
        </table>` : ''}

        <h3 style="font-size:14px;font-weight:700;color:var(--primary);margin-bottom:12px">👷 Worker-wise Exposure Records (first 50 of ${rd.length})</h3>
        <div class="overflow-x"><table class="data-table">
        <thead><tr>
          <th>Worker ID</th><th>Name</th><th>Unit</th><th>Area</th><th>Shift</th><th>Date</th>
          <th>Duration</th><th>Est. Cumulative H₂S Exp. (ppm·hr)</th><th>Temp</th><th>Humidity</th><th>Sensor</th><th>Status</th>
        </tr></thead>
        <tbody>${rd.slice(0,50).map(r=>`<tr class="${r.status==='High'?'row-high':r.status==='Elevated'?'row-elevated':''}">
          <td><strong>${r.workerId}</strong></td><td>${r.workerName}</td><td>${r.unit}</td><td>${r.area}</td>
          <td>${r.shift}</td><td>${formatDate(r.date)}</td><td>${r.duration}</td>
          <td><span class="exp-value ${getStatusClass(r.status)}">${r.exposure}</span></td>
          <td>${r.temp}</td><td>${r.humidity}</td>
          <td><span class="validity-chip ${r.validity==='Valid'?'validity-valid':'validity-warning'}">${r.validity}</span></td>
          <td>${getStatusBadge(r.status)}</td>
        </tr>`).join('')}
        </tbody></table></div>

        <div class="report-disclaimer">
          <strong>Disclaimer:</strong> All exposure values represent <em>estimated cumulative H₂S exposure</em> from passive colorimetric dosimeter strip colour analysis using smartphone AI image processing.
          These are prototype research readings and do not constitute certified occupational exposure measurements.
          Thresholds used: Normal &lt;${THRESHOLDS.normal} ppm·hr · Elevated ${THRESHOLDS.normal}–${THRESHOLDS.elevated} ppm·hr · High ≥${THRESHOLDS.elevated} ppm·hr.
          For regulatory compliance, use certified real-time H₂S monitoring instruments.
        </div>
      </div>
    </div>`;
  showToast(`Report generated: ${rd.length} readings, ${totalW} workers`,'success');
}

function exportCSV() {
  const from   = document.getElementById('reportDateFrom')?.value;
  const to     = document.getElementById('reportDateTo')?.value;
  const unit   = document.getElementById('reportUnit')?.value;
  const area   = document.getElementById('reportArea')?.value;
  const shift  = document.getElementById('reportShift')?.value;
  const status = document.getElementById('reportStatus')?.value;
  const wfManual = (document.getElementById('reportWorker')?.value||'').trim().toUpperCase();
  const wfSelect = document.getElementById('reportWorkerSelect')?.value||'';
  const workerId = wfManual || wfSelect;
  const rd = getFilteredReadings({ unit, area, shift, dateFrom: from, dateTo: to, workerId, status });

  const headers = ['Worker ID','Worker Name','Industry/Unit','Work Area','Shift','Date','Time','Duration',
    'Est. Cumulative H2S Exposure (ppm.hr)','Temperature','Humidity','Sensor Validity','Risk Status'];
  let csv = headers.join(',') + '\n';
  csv += rd.map(r => [r.workerId,r.workerName,r.unit,r.area,r.shift,r.date,r.time,
    r.duration,r.exposure,r.temp,r.humidity,r.validity,r.status].map(v=>`"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download = `MRPL_H2S_Exposure_Report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast(`CSV exported: ${rd.length} records`,'success');
}

function exportPDF() {
  try {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const from   = document.getElementById('reportDateFrom')?.value;
    const to     = document.getElementById('reportDateTo')?.value;
    const unit   = document.getElementById('reportUnit')?.value;
    const area   = document.getElementById('reportArea')?.value;
    const shift  = document.getElementById('reportShift')?.value;
    const status = document.getElementById('reportStatus')?.value;
    const wfManual = (document.getElementById('reportWorker')?.value||'').trim().toUpperCase();
    const wfSelect = document.getElementById('reportWorkerSelect')?.value||'';
    const workerId = wfManual || wfSelect;
    const rd = getFilteredReadings({ unit, area, shift, dateFrom: from, dateTo: to, workerId, status });

    const totalW = [...new Set(rd.map(r=>r.workerId))].length;
    const avgE   = parseFloat(avg(rd.map(r=>r.exposure)).toFixed(2));
    const high   = rd.filter(r=>r.status==='High').length;
    const elev   = rd.filter(r=>r.status==='Elevated').length;

    // Header band
    doc.setFillColor(13,59,110); doc.rect(0,0,297,36,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(15); doc.setFont('helvetica','bold');
    doc.text('MRPL \u2014 Estimated H\u2082S Exposure Monitoring Report', 14, 12);
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('SafeTrack Pro v1.0 (Prototype) \u00B7 Passive Colorimetric Wristband Dosimeter', 14, 20);
    doc.text(`Period: ${from||'All'} to ${to||'All'}${unit?' \u00B7 '+unit:''}${area?' \u00B7 '+area:''}${shift?' \u00B7 '+shift+' Shift':''} \u00B7 Generated: 2026-09-08`, 14, 27);
    doc.text(`Workers: ${totalW} \u00B7 Readings: ${rd.length} \u00B7 Avg: ${avgE} ppm\u00B7hr \u00B7 High: ${high} \u00B7 Elevated: ${elev}`, 14, 34);

    doc.setTextColor(0,0,0);
    doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('Worker-wise Estimated Cumulative H\u2082S Exposure Records', 14, 46);

    doc.autoTable({
      startY: 50,
      head: [['Worker ID','Name','Unit','Area','Shift','Date','Duration','Est. Exp. (ppm\u00B7hr)','Temp','Humidity','Sensor','Status']],
      body: rd.slice(0,150).map(r=>[
        r.workerId, r.workerName, r.unit, r.area, r.shift,
        formatDate(r.date), r.duration, r.exposure+' ppm\u00B7hr',
        r.temp, r.humidity, r.validity, r.status
      ]),
      styles: { fontSize:7.5, cellPadding:2.5 },
      headStyles: { fillColor:[13,59,110], textColor:255, fontStyle:'bold', fontSize:8 },
      alternateRowStyles: { fillColor:[240,245,255] },
      didParseCell: (data) => {
        if (data.section==='body') {
          const status = rd.slice(0,150)[data.row.index]?.status;
          if (status==='High')     data.cell.styles.textColor = [185,28,28];
          if (status==='Elevated') data.cell.styles.textColor = [161,98,7];
        }
      }
    });

    // Footer disclaimer
    const finalY = doc.lastAutoTable?.finalY || 200;
    if (finalY < 185) {
      doc.setFontSize(7); doc.setTextColor(120,120,120);
      doc.text('Disclaimer: Estimated data from colorimetric strip analysis. Prototype — not DGMS/OISD certified.', 14, finalY + 8);
    }

    doc.save(`MRPL_H2S_Exposure_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast(`PDF exported: ${rd.length} records`,'success');
  } catch(err) {
    showToast('PDF export failed — try CSV instead.','error');
    console.error(err);
  }
}
function lineChartOptions(yLabel) {
  return {
    responsive:true, interaction:{intersect:false,mode:'index'},
    plugins:{
      legend:{position:'top',labels:{usePointStyle:true,font:{size:11},padding:12}},
      tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y!==null?ctx.parsed.y+' ppm·hr':'—'}`}}
    },
    scales:{
      x:{grid:{display:false},ticks:{font:{size:10},maxRotation:45}},
      y:{beginAtZero:true,title:{display:true,text:yLabel,font:{size:10.5}},ticks:{font:{size:10}},grid:{color:'rgba(0,0,0,0.04)'}}
    }
  };
}

function barChartOptions(yLabel) {
  return {
    responsive:true,
    plugins:{
      legend:{position:'top',labels:{usePointStyle:true,font:{size:11},padding:12}},
      tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y} ppm·hr`}}
    },
    scales:{
      x:{grid:{display:false},ticks:{font:{size:11}}},
      y:{beginAtZero:true,title:{display:true,text:yLabel,font:{size:10.5}},ticks:{font:{size:10}},grid:{color:'rgba(0,0,0,0.04)'}}
    }
  };
}

function destroyChart(id) {
  if (charts[id]) { try{charts[id].destroy();}catch(e){} delete charts[id]; }
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg,type='') {
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const t=document.createElement('div');
  t.className=`toast ${type}`; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(10px)';setTimeout(()=>t.remove(),300);},3500);
}

// ============================================================
// SHARED UI HELPERS
// ============================================================

/* Build a KPI card string */
function kpiCard(color,icon,value,label,sub) {
  return `<div class="kpi-card ${color}"><div class="kpi-card-inner">
    <div class="kpi-icon-wrap">${icon}</div>
    <div class="kpi-text">
      <div class="kpi-value">${value}</div>
      <div class="kpi-label">${label}</div>
      ${sub?`<div class="kpi-sub">${sub}</div>`:''}
    </div>
  </div></div>`;
}

/* Summary bar for tables */
function summaryBar(rd, showLimit=false) {
  const lim = showLimit && rd.length>200 ? ` (showing first 200)` : '';
  return `<div class="table-summary-bar">
    <strong>${rd.length}</strong> readings${lim} &nbsp;·&nbsp;
    <span style="color:#b91c1c">🔴 High: ${rd.filter(r=>r.status==='High').length}</span> &nbsp;·&nbsp;
    <span style="color:#a16207">🟡 Elevated: ${rd.filter(r=>r.status==='Elevated').length}</span> &nbsp;·&nbsp;
    <span style="color:#15803d">🟢 Normal: ${rd.filter(r=>r.status==='Normal').length}</span>
  </div>`;
}

/* Short date label for charts */
function shortDate(dateStr) {
  if (!dateStr) return '';
  const d=new Date(dateStr);
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
