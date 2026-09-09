/* ============================================================
   SafeTrack Pro — Sample / Demo Data
   All data is SYNTHETIC for prototype demonstration purposes.
   Replace with real backend API calls in production.
   ============================================================ */

const DB = {

  // ---- USERS ----
  users: [
    { id: 'W101', name: 'Rajesh Kumar',    role: 'worker', password: 'pass123', unit: 'Refinery',              area: 'Area A', shift: 'Morning', dept: 'Operations' },
    { id: 'W102', name: 'Priya Sharma',    role: 'worker', password: 'pass123', unit: 'Gas Processing',        area: 'Area B', shift: 'Evening', dept: 'Processing' },
    { id: 'W103', name: 'Arun Nair',       role: 'worker', password: 'pass123', unit: 'Storage',               area: 'Area C', shift: 'Night',   dept: 'Storage Ops' },
    { id: 'W104', name: 'Suresh Menon',    role: 'worker', password: 'pass123', unit: 'Maintenance',           area: 'Area D', shift: 'Morning', dept: 'Maintenance' },
    { id: 'W105', name: 'Deepa Pillai',    role: 'worker', password: 'pass123', unit: 'Wastewater Treatment',  area: 'Area A', shift: 'Evening', dept: 'Env. Mgmt' },
    { id: 'W106', name: 'Mohan Rao',       role: 'worker', password: 'pass123', unit: 'Refinery',              area: 'Area B', shift: 'Night',   dept: 'Operations' },
    { id: 'W107', name: 'Kavya Reddy',     role: 'worker', password: 'pass123', unit: 'Gas Processing',        area: 'Area A', shift: 'Morning', dept: 'Processing' },
    { id: 'W108', name: 'Sanjay Verma',    role: 'worker', password: 'pass123', unit: 'Refinery',              area: 'Area C', shift: 'Evening', dept: 'Operations' },
    { id: 'W109', name: 'Anjali Singh',    role: 'worker', password: 'pass123', unit: 'Storage',               area: 'Area D', shift: 'Morning', dept: 'Storage Ops' },
    { id: 'W110', name: 'Ravi Krishnan',   role: 'worker', password: 'pass123', unit: 'Maintenance',           area: 'Area A', shift: 'Night',   dept: 'Maintenance' },
    { id: 'W111', name: 'Meena Iyer',      role: 'worker', password: 'pass123', unit: 'Wastewater Treatment',  area: 'Area B', shift: 'Morning', dept: 'Env. Mgmt' },
    { id: 'W112', name: 'Dinesh Patel',    role: 'worker', password: 'pass123', unit: 'Gas Processing',        area: 'Area C', shift: 'Evening', dept: 'Processing' },
    { id: 'W113', name: 'Latha Bose',      role: 'worker', password: 'pass123', unit: 'Refinery',              area: 'Area D', shift: 'Night',   dept: 'Operations' },
    { id: 'W114', name: 'Venkat Subbu',    role: 'worker', password: 'pass123', unit: 'Gas Processing',        area: 'Area A', shift: 'Evening', dept: 'Processing' },
    { id: 'W115', name: 'Pooja Joshi',     role: 'worker', password: 'pass123', unit: 'Storage',               area: 'Area B', shift: 'Morning', dept: 'Storage Ops' },
    { id: 'W116', name: 'Kiran Desai',     role: 'worker', password: 'pass123', unit: 'Maintenance',           area: 'Area C', shift: 'Night',   dept: 'Maintenance' },
    { id: 'W117', name: 'Ramesh Naidu',    role: 'worker', password: 'pass123', unit: 'Refinery',              area: 'Area A', shift: 'Morning', dept: 'Operations' },
    { id: 'W118', name: 'Sunita Yadav',    role: 'worker', password: 'pass123', unit: 'Gas Processing',        area: 'Area D', shift: 'Evening', dept: 'Processing' },
    { id: 'W119', name: 'Prakash Babu',    role: 'worker', password: 'pass123', unit: 'Wastewater Treatment',  area: 'Area B', shift: 'Night',   dept: 'Env. Mgmt' },
    { id: 'W120', name: 'Sudha Kumari',    role: 'worker', password: 'pass123', unit: 'Refinery',              area: 'Area C', shift: 'Morning', dept: 'Operations' },
    { id: 'W121', name: 'Arjun Pillai',    role: 'worker', password: 'pass123', unit: 'Gas Processing',        area: 'Area B', shift: 'Evening', dept: 'Processing' },
    { id: 'W122', name: 'Neha Gupta',      role: 'worker', password: 'pass123', unit: 'Storage',               area: 'Area A', shift: 'Night',   dept: 'Storage Ops' },
    { id: 'SAFE01', name: 'Dr. S. Murthy', role: 'admin',  password: 'admin123', unit: 'Safety', area: '-', shift: '-', dept: 'Safety & Health' },
    { id: 'SAFE02', name: 'Indira Nair',   role: 'admin',  password: 'admin123', unit: 'Safety', area: '-', shift: '-', dept: 'Safety & Health' },
  ],

  // ---- EXPOSURE READINGS ----
  // Fields: id, workerId, date, shift, area, unit, duration, exposure, temp, humidity, validity, status
  readings: [],

  // Will be generated below
};

// ---- GENERATE REALISTIC EXPOSURE READINGS ----
(function generateReadings() {
  const workerIds = DB.users.filter(u => u.role === 'worker').map(u => u.id);
  const dates = [];
  const today = new Date('2026-09-08');
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Exposure profiles per area (ppm·hr base range)
  const areaProfiles = {
    'Area A': { min: 2, max: 9 },
    'Area B': { min: 4, max: 13 },
    'Area C': { min: 1, max: 7 },
    'Area D': { min: 3, max: 11 },
  };

  const unitProfiles = {
    'Refinery':             { factor: 1.2 },
    'Gas Processing':       { factor: 1.5 },
    'Storage':              { factor: 0.9 },
    'Maintenance':          { factor: 1.0 },
    'Wastewater Treatment': { factor: 1.3 },
  };

  const shiftFactors = { Morning: 1.0, Evening: 1.15, Night: 0.85 };

  let readingId = 1;
  const temps = { 'Area A': [30, 32], 'Area B': [31, 34], 'Area C': [28, 31], 'Area D': [29, 33] };
  const humid = { 'Area A': [58, 68], 'Area B': [60, 72], 'Area C': [55, 65], 'Area D': [62, 75] };

  workerIds.forEach(wid => {
    const worker = DB.users.find(u => u.id === wid);
    const profile = areaProfiles[worker.area];
    const unitFactor = unitProfiles[worker.unit].factor;
    const shiftFactor = shiftFactors[worker.shift];

    // Use most dates but skip ~20% randomly
    dates.forEach(date => {
      if (Math.random() < 0.15) return; // occasional day off

      // 1-3 readings per day per worker
      const numReadings = Math.floor(Math.random() * 2) + 1;
      for (let r = 0; r < numReadings; r++) {
        let base = profile.min + Math.random() * (profile.max - profile.min);
        base *= unitFactor * shiftFactor;
        // Add some workers with consistently high exposure
        if (['W114', 'W121', 'W108', 'W118'].includes(wid)) base *= 1.3;
        const exposure = parseFloat(base.toFixed(1));

        let status = 'Normal';
        if (exposure >= 10) status = 'High';
        else if (exposure >= 5) status = 'Elevated';

        const tRange = temps[worker.area];
        const hRange = humid[worker.area];

        const hour = r === 0 ? (6 + Math.floor(Math.random() * 4)) : (12 + Math.floor(Math.random() * 5));
        const min = Math.floor(Math.random() * 60);
        const timeStr = `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;

        DB.readings.push({
          id: readingId++,
          workerId: wid,
          workerName: worker.name,
          date,
          time: timeStr,
          shift: worker.shift,
          area: worker.area,
          unit: worker.unit,
          duration: (5 + Math.floor(Math.random() * 4)) + ' hr',
          exposure,
          temp: (tRange[0] + Math.floor(Math.random() * (tRange[1] - tRange[0]))) + '°C',
          humidity: (hRange[0] + Math.floor(Math.random() * (hRange[1] - hRange[0]))) + '% RH',
          validity: Math.random() > 0.08 ? 'Valid' : 'Flagged',
          status,
        });
      }
    });
  });
})();

// ---- THRESHOLDS (live, editable from Settings) ----
const THRESHOLDS = { normal: 5, elevated: 10 };

function applyThresholds(normal, elevated) {
  THRESHOLDS.normal   = parseFloat(normal)   || 5;
  THRESHOLDS.elevated = parseFloat(elevated) || 10;
  // Recompute status on all existing readings
  DB.readings.forEach(r => { r.status = computeStatus(r.exposure); });
}

function computeStatus(exposure) {
  if (exposure >= THRESHOLDS.elevated) return 'High';
  if (exposure >= THRESHOLDS.normal)   return 'Elevated';
  return 'Normal';
}

// ---- HELPER FUNCTIONS ----

function getWorkerById(id) {
  return DB.users.find(u => u.id === id) || null;
}

function getReadingsForWorker(workerId) {
  return DB.readings.filter(r => r.workerId === workerId);
}

function getFilteredReadings({ unit = '', area = '', shift = '', dateFrom = '', dateTo = '', workerId = '', status = '' } = {}) {
  return DB.readings.filter(r => {
    if (unit     && r.unit     !== unit)     return false;
    if (area     && r.area     !== area)     return false;
    if (shift    && r.shift    !== shift)    return false;
    if (workerId && r.workerId !== workerId) return false;
    if (status   && r.status   !== status)   return false;
    if (dateFrom && r.date < dateFrom)       return false;
    if (dateTo   && r.date > dateTo)         return false;
    return true;
  });
}

function getStatusClass(status) {
  if (status === 'Normal')   return 'normal';
  if (status === 'Elevated') return 'elevated';
  return 'high';
}

function getStatusBadge(status) {
  const cls  = getStatusClass(status);
  const icons = { Normal:'🟢', Elevated:'🟡', High:'🔴' };
  const label = status === 'High' ? 'High / Review Required' : status;
  return `<span class="status-badge status-${cls}">${icons[status]||'⚪'} ${label}</span>`;
}

// Status computed from live thresholds (used when re-labelling readings)
function recomputeStatus(exposure) {
  if (exposure >= THRESHOLDS.elevated) return 'High';
  if (exposure >= THRESHOLDS.normal)   return 'Elevated';
  return 'Normal';
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function max(arr) {
  if (!arr.length) return 0;
  return Math.max(...arr);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getAlerts(readings) {
  return readings.filter(r => r.status === 'High' || r.status === 'Elevated')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

const AREAS = ['Area A', 'Area B', 'Area C', 'Area D'];
const UNITS = ['Refinery', 'Gas Processing', 'Storage', 'Maintenance', 'Wastewater Treatment'];
const SHIFTS = ['Morning', 'Evening', 'Night'];

// Last 30 dates
function getLast30Dates() {
  const dates = [];
  const today = new Date('2026-09-08');
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
