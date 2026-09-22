/* ============================================================
   SenseWear — Statutory exposure report
   Two output formats only: a PDF laid out as a statutory return,
   and a CSV of the same figures for the authority's own analysis.
   ============================================================ */

const NAVY = [31, 78, 121];
const INK  = [27, 36, 48];
const GREY = [92, 107, 127];

function renderReportFacts() {
  const s = summary();
  const p = State.config ? State.config.plant : {};

  document.getElementById('reportFacts').innerHTML = `
    <div><dt>Establishment</dt><dd>${escapeHtml(p.name || '—')}</dd></div>
    <div><dt>Registration</dt><dd class="mono">${escapeHtml(p.registration || '—')}</dd></div>
    <div><dt>Reporting period</dt><dd>${escapeHtml(rangeLabel())}</dd></div>
    <div><dt>Workers monitored</dt><dd class="mono">${s.workers}</dd></div>
    <div><dt>Working hours</dt><dd class="mono">${(s.workedMin / 60).toFixed(1)}</dd></div>
    <div><dt>Exposure hours</dt><dd class="mono">${(s.exposedMin / 60).toFixed(1)}</dd></div>
    <div><dt>Badge scans</dt><dd class="mono">${s.scans}</dd></div>
    <div><dt>Alerts raised</dt><dd class="mono">${s.alerts}</dd></div>`;

  const ready = hasRecords();
  document.querySelectorAll('.report-action').forEach(b => { b.disabled = !ready; });
  document.getElementById('reportEmpty').hidden = ready;
}

/* Rows shared by both output formats, so the two can never disagree. */
function reportModel() {
  const s     = summary();
  const areas = areaBreakdown();
  const p     = State.config.plant;
  const st    = State.config.statute;
  const l     = limits();

  const workers = workerRows().map(r => {
    const t = periodTotalsFor(r.workerId);
    return {
      workerId: r.workerId, name: r.name, areaCode: r.areaCode,
      days: t.days, workedMin: t.workedMin, exposedMin: t.exposedMin,
      scans: t.scans, peak: t.peak, average: t.average,
      alerts: State.alerts.filter(a => a.workerId === r.workerId).length,
      status: statusFor(t.peak),
    };
  });

  return { s, areas, workers, plant: p, statute: st, limits: l, alerts: State.alerts };
}

/* ============================================================
   FORMAT 1 — PDF statutory return
   Laid out to the conventions of an Indian statutory safety
   report: cover page, contents, numbered paragraphs, captioned
   tables with totals, and a running head on every page.
   ============================================================ */
function generatePdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) { toast('The PDF library has not loaded yet.'); return; }
  if (!hasRecords()) { toast('There are no records in this period to report.'); return; }

  const m = reportModel();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 52;
  const now = new Date();

  const toc = [];      // contents entries, filled as sections are written
  let table = 0;

  /* ---------------- COVER ---------------- */
  doc.setDrawColor(...NAVY).setLineWidth(1.2);
  doc.rect(30, 30, W - 60, H - 60);
  doc.setLineWidth(0.5);
  doc.rect(36, 36, W - 72, H - 72);

  let y = 104;

  /* Departmental seal. The State Emblem of India is deliberately
     not reproduced: its use is restricted under the State Emblem
     of India (Prohibition of Improper Use) Act, 2005. */
  const cx = W / 2;
  doc.setDrawColor(...NAVY).setLineWidth(1.6);
  doc.circle(cx, y, 30);
  doc.setLineWidth(0.6);
  doc.circle(cx, y, 25);
  doc.setFont('times', 'bold').setFontSize(13).setTextColor(...NAVY);
  doc.text('DISH', cx, y + 4.5, { align: 'center' });

  y += 62;
  doc.setFont('times', 'bold').setFontSize(13.5);
  doc.text(doc.splitTextToSize(m.plant.authority.toUpperCase(), W - M * 2 - 40), cx, y, { align: 'center' });

  y += 20;
  doc.setFont('times', 'normal').setFontSize(10.5).setTextColor(...GREY);
  doc.text(m.plant.portal || '', cx, y, { align: 'center' });
  doc.setTextColor(...NAVY);

  y += 34;
  doc.setDrawColor(...NAVY).setLineWidth(0.9);
  doc.line(M + 50, y, W - M - 50, y);

  y += 48;
  doc.setTextColor(...INK).setFont('times', 'bold').setFontSize(21);
  doc.text('HYDROGEN SULPHIDE', cx, y, { align: 'center' });
  y += 27;
  doc.text('EXPOSURE MONITORING REPORT', cx, y, { align: 'center' });

  y += 26;
  doc.setFont('times', 'italic').setFontSize(11.5).setTextColor(...GREY);
  doc.text(`For the period ${formatDate(range.from)} to ${formatDate(range.to)}`, cx, y, { align: 'center' });

  y += 22;
  doc.setDrawColor(...NAVY).setLineWidth(0.9);
  doc.line(M + 50, y, W - M - 50, y);

  /* Particulars sit in a ruled box so the lower half is not empty. */
  y += 44;
  const boxTop = y - 18;
  const rows = [
    ['Establishment',    m.plant.name],
    ['Location',         m.plant.location],
    ['Registration No.', m.plant.registration],
    ['Occupier',         m.plant.occupier],
    ['Report No.',       `${m.plant.reportSeries}/${range.from}/${range.to}`],
    ['Monitoring system','SenseWear H2S exposure monitoring'],
  ];

  doc.setFontSize(10);
  rows.forEach(([k, v]) => {
    const lines = doc.splitTextToSize(String(v), W - M * 2 - 190);
    doc.setFont('helvetica', 'normal').setTextColor(...GREY);
    doc.text(k, M + 26, y);
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    lines.forEach((ln, i) => doc.text(ln, M + 176, y + i * 13));
    y += Math.max(lines.length, 1) * 13 + 7;
  });

  doc.setDrawColor(200, 208, 218).setLineWidth(0.6);
  doc.rect(M + 10, boxTop, W - (M + 10) * 2, y - boxTop - 4);

  /* Summary strip, so the lower half of the cover carries the
     figures a reader looks for first. */
  y += 26;
  const sTop = y - 16;
  doc.setFillColor(244, 247, 250);
  doc.rect(M + 10, sTop, W - (M + 10) * 2, 76, 'F');
  doc.setDrawColor(200, 208, 218).setLineWidth(0.6);
  doc.rect(M + 10, sTop, W - (M + 10) * 2, 76);

  const cells = [
    ['Workers monitored', String(m.s.workers)],
    ['Badge readings',    String(m.s.scans)],
    ['Highest recorded',  `${num(m.s.highest)} ppm`],
    ['Alerts raised',     String(m.s.alerts)],
  ];
  const cw = (W - (M + 10) * 2) / cells.length;
  cells.forEach(([label, value], i) => {
    const mid = M + 10 + cw * i + cw / 2;
    doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...NAVY);
    doc.text(value, mid, sTop + 34, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY);
    doc.text(label.toUpperCase(), mid, sTop + 54, { align: 'center' });
    if (i) {
      doc.setDrawColor(216, 222, 230).setLineWidth(0.5);
      doc.line(M + 10 + cw * i, sTop + 12, M + 10 + cw * i, sTop + 64);
    }
  });

  /* Footer block, anchored to the page rather than the flow. */
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GREY);
  doc.text(doc.splitTextToSize(
    `Prepared under ${m.statute.act}, ${m.statute.schedule}.`, W - M * 2 - 20), M + 10, H - 150);

  doc.setDrawColor(...NAVY).setLineWidth(0.7);
  doc.line(cx - 90, H - 118, cx + 90, H - 118);

  doc.setFont('times', 'bold').setFontSize(11).setTextColor(...NAVY);
  doc.text(now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
           cx, H - 100, { align: 'center' });

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GREY);
  doc.text('Confidential — for the use of the establishment and the inspecting authority',
           cx, H - 78, { align: 'center' });

  /* ---------------- BODY ---------------- */
  doc.addPage();
  y = 80;

  y = para(doc, M, y,
    `This report sets out the hydrogen sulphide exposure recorded at ${m.plant.name} during the ` +
    `period ${formatDate(range.from)} to ${formatDate(range.to)}. A total of ${m.s.workers} workers ` +
    `were monitored across ${m.s.areas} process areas, yielding ${m.s.scans} badge readings. ` +
    `The figures below are reproduced from the monitoring record without alteration.`);

  y = section(doc, toc, '1.', 'ESTABLISHMENT PARTICULARS', M, y + 6);
  y = facts(doc, M, y, [
    ['Name of establishment', m.plant.name],
    ['Location',              m.plant.location],
    ['Registration number',   m.plant.registration],
    ['Occupier',              m.plant.occupier],
    ['Reporting period',      rangeLabel()],
    ['Process areas covered', `${m.s.areas} of ${State.config.areas.length}`],
  ]);

  y = section(doc, toc, '2.', 'STATUTORY BASIS', M, y + 10);
  y = para(doc, M, y,
    `Permissible limits for hydrogen sulphide are prescribed under ${m.statute.schedule} of ` +
    `${m.statute.act}. An action level of ${m.limits.actionLevel} ppm, being fifty per cent of the ` +
    `permissible limit, is applied in accordance with standard industrial hygiene practice.`);
  y = facts(doc, M, y, [
    ['Act',               m.statute.act],
    ['Provision',         m.statute.schedule],
    ['Substance',         m.statute.substance],
    ['Permissible limit', `${m.limits.twa} ppm (8-hour time weighted average)`],
    ['Short term limit',  `${m.limits.stel} ppm (15 minutes)`],
    ['Action level',      `${m.limits.actionLevel} ppm`],
  ]);

  y = fresh(doc, y, 150);
  y = section(doc, toc, '3.', 'WORKFORCE MONITORED', M, y + 6);
  y = facts(doc, M, y, [
    ['Workers monitored',    String(m.s.workers)],
    ['Total working hours',  `${(m.s.workedMin / 60).toFixed(1)} hours`],
    ['Total exposure hours', `${(m.s.exposedMin / 60).toFixed(1)} hours`],
    ['Total badge scans',    String(m.s.scans)],
    ['Monitoring device',    State.config.device.model],
    ['Scan interval',        `${State.config.device.scanIntervalMinutes} minutes`],
  ]);

  y = section(doc, toc, '4.', 'EXPOSURE SUMMARY', M, y + 10);
  const overCount = m.alerts.filter(a => a.level === 'limit').length;
  y = para(doc, M, y,
    `The highest single reading recorded during the period was ${num(m.s.highest)} ppm and the ` +
    `mean of all readings was ${num(m.s.average)} ppm. ${overCount === 0
      ? 'No reading reached the permissible limit.'
      : `${overCount} occasion${overCount === 1 ? '' : 's'} reached or exceeded the permissible limit of ${m.limits.twa} ppm.`}`);
  y = facts(doc, M, y, [
    ['Highest recorded value', `${num(m.s.highest)} ppm`],
    ['Lowest recorded value',  `${num(m.s.lowest)} ppm`],
    ['Average recorded value', `${num(m.s.average)} ppm`],
    ['Readings at or above permissible limit', String(overCount)],
    ['Alerts raised', `${m.s.alerts} (${m.s.pending} awaiting acknowledgement)`],
  ]);

  /* ---- Area table ---- */
  y = fresh(doc, y, 210);
  y = section(doc, toc, '5.', 'AREA-WISE EXPOSURE', M, y);
  const worst = m.areas[0];
  y = para(doc, M, y,
    `Exposure recorded in each process area is set out in Table ${table + 1}. ` +
    `${worst ? `${worst.name} (${worst.code}) returned the highest average concentration at ${num(worst.average)} ppm.` : ''}`);
  y = caption(doc, ++table, 'RECORDED H2S EXPOSURE BY PROCESS AREA', M, y);

  doc.autoTable({
    startY: y, margin: { left: M, right: M },
    head: [['Sl. No', 'Code', 'Process Area', 'Workers', 'Scans', 'Highest', 'Lowest', 'Average', 'Status']],
    body: m.areas.map((a, i) => [i + 1, a.code, a.name, a.workers, a.scans,
                                 num(a.highest), num(a.lowest), num(a.average), a.status]),
    foot: [['', '', 'Total', m.s.workers, m.s.scans, num(m.s.highest), num(m.s.lowest), num(m.s.average), '']],
    ...style(),
  });
  y = doc.lastAutoTable.finalY + 26;

  /* ---- Worker table ---- */
  y = fresh(doc, y, 210);
  y = section(doc, toc, '6.', 'WORKER EXPOSURE RECORDS', M, y);
  y = para(doc, M, y,
    `Individual exposure for each monitored worker is set out in Table ${table + 1}. ` +
    `Working time and exposure time are accumulated across every day on which the worker's badge reported.`);
  y = caption(doc, ++table, 'INDIVIDUAL EXPOSURE RECORD FOR THE REPORTING PERIOD', M, y);

  doc.autoTable({
    startY: y, margin: { left: M, right: M },
    head: [['Sl. No', 'Worker ID', 'Area', 'Days', 'Working Time', 'Exposure Time', 'Peak', 'Average', 'Alerts']],
    body: m.workers.map((w, i) => [i + 1, w.workerId, w.areaCode, w.days,
                                   duration(w.workedMin), duration(w.exposedMin),
                                   num(w.peak), num(w.average), w.alerts || '—']),
    foot: [['', 'Total', '', '', duration(m.s.workedMin), duration(m.s.exposedMin),
            num(m.s.highest), num(m.s.average), String(m.s.alerts)]],
    ...style(),
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 6 && parseFloat(d.cell.raw) >= m.limits.twa) {
        d.cell.styles.textColor = [179, 38, 30];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 26;

  /* ---- Trend graph ---- */
  y = fresh(doc, y, 250);
  y = section(doc, toc, '7.', 'EXPOSURE TREND', M, y);

  const canvas = reportTrendCanvas(m);
  if (canvas) {
    y = para(doc, M, y,
      `Average recorded concentration across the reporting period. The dashed line marks the ` +
      `permissible limit of ${m.limits.twa} ppm.`);
    doc.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', M, y, W - M * 2, 180);
    y += 200;
  } else {
    y = para(doc, M, y, 'Trend graph unavailable for this reporting period.');
  }

  /* ---- Incidents ---- */
  y = fresh(doc, y, 190);
  y = section(doc, toc, '8.', 'ALERTS AND INCIDENTS', M, y);

  if (m.alerts.length) {
    y = para(doc, M, y,
      `${m.alerts.length} exposure alert${m.alerts.length === 1 ? ' was' : 's were'} raised during the ` +
      `period, of which ${m.s.pending} remain${m.s.pending === 1 ? 's' : ''} to be acknowledged. ` +
      `Particulars are given in Table ${table + 1}.`);
    y = caption(doc, ++table, 'EXPOSURE ALERTS RAISED DURING THE REPORTING PERIOD', M, y);
    doc.autoTable({
      startY: y, margin: { left: M, right: M },
      head: [['Sl. No', 'Date', 'Time', 'Worker ID', 'Area', 'Nature of Alert', 'Reading', 'Acknowledged']],
      body: m.alerts.map((a, i) => [i + 1, formatDate(a.date), hhmm(a.at), a.workerId, a.areaCode,
                                    a.title, num(a.ppm), a.acknowledged ? a.acknowledged.by : 'Pending']),
      ...style(),
    });
    y = doc.lastAutoTable.finalY + 24;
  } else {
    y = para(doc, M, y, 'No exposure alerts were raised during the reporting period.');
  }

  /* ---- Certification ---- */
  y = fresh(doc, y, 180);
  y = section(doc, toc, '9.', 'CERTIFICATION', M, y);
  y = para(doc, M, y,
    'The exposure values in this report are as recorded by SenseWear passive colorimetric badges ' +
    'and retrieved from the monitoring record without alteration.');

  y = facts(doc, M, y, [
    ['Generated on', now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Generated at', now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })],
    ['Generated by', State.officer ? `${State.officer.name} (${State.officer.id}), ${State.officer.title}` : '—'],
  ]);

  y += 34;
  doc.setDrawColor(...INK).setLineWidth(0.7);
  doc.line(W - M - 200, y, W - M, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...GREY);
  doc.text('Signature of Safety Officer', W - M - 200, y + 14);

  /* ---------------- CONTENTS ----------------
     Inserted after the body so the page numbers are known. */
  doc.insertPage(2);
  doc.setPage(2);
  contentsPage(doc, toc, M, W);

  runningHead(doc, W, M);
  doc.save(`SenseWear-H2S-Report-${range.from}-to-${range.to}.pdf`);
  toast('PDF report generated.');
}

/* The report graphs its own reporting period, not whatever window
   the dashboard toggle happens to be showing. Drawn off-screen into
   a detached canvas so the visible chart is left alone. */
function reportTrendCanvas(m) {
  if (typeof Chart === 'undefined') return null;

  const days = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
    const vals = State.sessions.filter(s => s.date === d).flatMap(s => s.scans.map(x => x.ppm));
    days.push({ label: shortDate(d), value: mean(vals) });
  }
  if (!days.some(p => p.value != null)) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 500;

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: days.map(p => p.label),
      datasets: [
        { data: days.map(p => p.value), borderColor: '#0B3C71',
          backgroundColor: 'rgba(11,60,113,0.08)', borderWidth: 3, fill: true,
          spanGaps: true, tension: 0.25, pointRadius: days.length > 31 ? 0 : 4,
          pointBackgroundColor: '#0B3C71' },
        { data: days.map(() => m.limits.twa), borderColor: '#B3261E', borderWidth: 2.5,
          borderDash: [8, 6], pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: false, animation: false, devicePixelRatio: 1,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#333', font: { size: 18 }, maxRotation: 0, autoSkipPadding: 20 } },
        y: { beginAtZero: true, grid: { color: '#DDD' },
             ticks: { color: '#333', font: { size: 18 } },
             title: { display: true, text: 'H2S concentration (ppm)', color: '#333', font: { size: 18 } } },
      },
    },
  });

  chart.update('none');
  const url = canvas.toDataURL('image/png', 1.0);
  chart.destroy();
  return { toDataURL: () => url };
}

function contentsPage(doc, toc, M, W) {
  doc.setFont('times', 'bold').setFontSize(14).setTextColor(...NAVY);
  doc.text('CONTENTS', W / 2, 96, { align: 'center' });

  doc.setDrawColor(...NAVY).setLineWidth(0.9);
  doc.line(M, 106, W - M, 106);

  let y = 132;
  doc.setFontSize(8.5).setFont('helvetica', 'bold').setTextColor(...GREY);
  doc.text('PARA NO.', M, y);
  doc.text('SUBJECT', M + 70, y);
  doc.text('PAGE NO.', W - M, y, { align: 'right' });

  y += 8;
  doc.setDrawColor(200, 208, 218).setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 22;

  doc.setFontSize(10);
  toc.forEach(entry => {
    doc.setFont('helvetica', 'bold').setTextColor(...NAVY);
    doc.text(entry.no, M, y);

    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    doc.text(entry.title, M + 70, y);

    // Inserting this page pushed every recorded body page down by one.
    const page = String(entry.page + 1);
    doc.text(page, W - M, y, { align: 'right' });

    // Leader dots between the title and the page number.
    const from = M + 70 + doc.getTextWidth(entry.title) + 6;
    const to   = W - M - doc.getTextWidth(page) - 6;
    if (to > from) {
      doc.setTextColor(...GREY);
      doc.text('.'.repeat(Math.max(0, Math.floor((to - from) / doc.getTextWidth('.')))), from, y);
    }
    y += 21;
  });
}

/* ---- PDF building blocks ---- */
function section(doc, toc, no, title, M, y) {
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY);
  doc.text(`${no} ${title}`, M, y);
  doc.setDrawColor(...NAVY).setLineWidth(1);
  doc.line(M, y + 5, doc.internal.pageSize.getWidth() - M, y + 5);
  toc.push({ no, title, page: doc.internal.getCurrentPageInfo().pageNumber });
  return y + 26;   // clear of the rule before the first row below
}

function para(doc, M, y, text) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
  const lines = doc.splitTextToSize(text, W - M * 2);
  doc.text(lines, M, y, { lineHeightFactor: 1.45 });
  return y + lines.length * 13.5 + 12;
}

function caption(doc, n, title, M, y) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK);
  doc.text(`Table : ${n}`, M, y);
  doc.text(doc.splitTextToSize(title, W - M * 2 - 62), M + 62, y);
  return y + 15;
}

/* Label left, value right. A value that wraps pushes the whole
   row down, so a long value can never overrun the next label. */
function facts(doc, M, y, pairs) {
  const W = doc.internal.pageSize.getWidth();
  const valueX = M + 200;
  doc.setFontSize(9.5);

  pairs.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(String(value), W - M - valueX);

    doc.setFont('helvetica', 'normal').setTextColor(...GREY);
    doc.text(String(label), M, y);

    // Each line is placed at an explicit y: passing the array lets
    // jsPDF advance its own cursor, which desynchronises the next
    // label from its value for the rest of the block.
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    lines.forEach((line, i) => doc.text(line, valueX, y + i * 12.5));

    y += Math.max(lines.length, 1) * 12.5 + 4.5;
  });
  return y + 8;
}

function style() {
  return {
    theme: 'grid',
    styles:     { font: 'helvetica', fontSize: 8, cellPadding: 4.5, textColor: INK, lineColor: [180, 190, 202] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [228, 234, 241], textColor: INK, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  };
}

function fresh(doc, y, needed) {
  if (y + needed > doc.internal.pageSize.getHeight() - 82) { doc.addPage(); return 80; }
  return y;
}

/* Running head and footer on every page except the cover. */
function runningHead(doc, W, M) {
  const H = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();
  const head = `SENSEWEAR H2S EXPOSURE REPORT — ${State.config.plant.shortName} — ${range.from} TO ${range.to}`;

  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...NAVY);
    doc.text(head, W - M, 44, { align: 'right' });
    doc.setDrawColor(180, 190, 202).setLineWidth(0.7);
    doc.line(M, 52, W - M, 52);

    doc.line(M, H - 48, W - M, H - 48);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GREY);
    doc.text(`${State.config.plant.reportSeries}/${range.from}/${range.to}`, M, H - 34);
    doc.text(`Page ${p - 1} of ${pages - 1}`, W - M, H - 34, { align: 'right' });
  }
}

/* ============================================================
   FORMAT 2 — CSV
   ============================================================ */
function generateCsv() {
  if (!hasRecords()) { toast('There are no records in this period to export.'); return; }

  const m = reportModel();
  const rows = [];
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (...vals) => rows.push(vals.map(cell).join(','));

  line('SenseWear H2S Exposure Report');
  line('Establishment',    m.plant.name);
  line('Location',         m.plant.location);
  line('Registration',     m.plant.registration);
  line('Reporting period', range.from, 'to', range.to);
  line('Permissible limit (ppm TWA)', m.limits.twa);
  line('Action level (ppm)',          m.limits.actionLevel);
  line('Generated',        new Date().toISOString());
  line('Generated by',     State.officer ? `${State.officer.name} (${State.officer.id})` : '');
  line();

  line('SECTION 1 — EXPOSURE SUMMARY');
  line('Workers monitored',  m.s.workers);
  line('Working hours',      (m.s.workedMin / 60).toFixed(1));
  line('Exposure hours',     (m.s.exposedMin / 60).toFixed(1));
  line('Badge scans',        m.s.scans);
  line('Highest ppm',        num(m.s.highest));
  line('Lowest ppm',         num(m.s.lowest));
  line('Average ppm',        num(m.s.average));
  line('Alerts raised',      m.s.alerts);
  line();

  line('SECTION 2 — AREA-WISE EXPOSURE');
  line('Sl No', 'Area Code', 'Process Area', 'Block', 'Workers', 'Scans', 'Highest ppm', 'Lowest ppm', 'Average ppm', 'Status');
  m.areas.forEach((a, i) => line(i + 1, a.code, a.name, a.block, a.workers, a.scans,
                                 num(a.highest), num(a.lowest), num(a.average), a.status));
  line();

  line('SECTION 3 — WORKER EXPOSURE RECORDS');
  line('Sl No', 'Worker ID', 'Name', 'Area Code', 'Days Monitored', 'Working Minutes',
       'Exposure Minutes', 'Scans', 'Peak ppm', 'Average ppm', 'Alerts', 'Status');
  m.workers.forEach((w, i) => line(i + 1, w.workerId, w.name, w.areaCode, w.days,
                                   w.workedMin, w.exposedMin, w.scans,
                                   num(w.peak), num(w.average), w.alerts, w.status));
  line();

  line('SECTION 4 — ALERTS AND INCIDENTS');
  line('Sl No', 'Date', 'Time', 'Worker ID', 'Name', 'Area Code', 'Nature of Alert', 'Reading ppm', 'Acknowledged By', 'Acknowledged At');
  m.alerts.forEach((a, i) => line(i + 1, a.date, hhmm(a.at), a.workerId, a.name, a.areaCode,
                                  a.title, num(a.ppm),
                                  a.acknowledged ? a.acknowledged.by : 'Pending',
                                  a.acknowledged ? a.acknowledged.at : ''));

  download(`SenseWear-H2S-Report-${range.from}-to-${range.to}.csv`,
           '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV report exported.');
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
