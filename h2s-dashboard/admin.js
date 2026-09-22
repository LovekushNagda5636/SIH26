#!/usr/bin/env node
/* ============================================================
   SenseWear — administration CLI
   Loads the worker roster and exposure records, and creates the
   operator accounts that can sign in to the console.
   ============================================================ */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT   = __dirname;
const STORE  = path.join(ROOT, 'store');
const CONFIG_FILE = path.join(ROOT, 'config.json');

const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function readStore(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(STORE, `${name}.json`), 'utf8')); }
  catch { return fallback; }
}

function writeStore(name, value) {
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(path.join(STORE, `${name}.json`), JSON.stringify(value, null, 2));
}

const config = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const saveConfig = c => fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2) + '\n');

/* Minimal CSV reader: first row is the header, quotes supported. */
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  row.push(cell);
  rows.push(row);

  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim() !== ''))
             .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

const COMMANDS = {

  status() {
    const c = config();
    const workers  = readStore('workers', []);
    const readings = readStore('readings', []);
    const dates    = [...new Set(readings.map(r => r.at.slice(0, 10)))].sort();

    console.log(`Plant     : ${c.plant.name}`);
    console.log(`Areas     : ${c.areas.length}`);
    console.log(`Operators : ${readStore('officers', []).filter(o => o.passwordHash).length} configured`);
    console.log(`Roster    : ${workers.length} workers`);
    console.log(`Readings  : ${readings.length}`);
    if (dates.length) console.log(`Records   : ${dates[0]} to ${dates[dates.length - 1]}`);
    console.log(`Device key: ${process.env.SENSEWEAR_DEVICE_KEY ? 'set' : 'NOT SET — ingest is closed'}`);
  },

  'add-officer'(id, name, title, password) {
    if (!id || !name || !password) {
      console.error('Usage: node admin.js add-officer <ID> "<Name>" "<Title>" <password>');
      process.exit(1);
    }
    if (password.length < 8) {
      console.error('Password must be at least 8 characters.');
      process.exit(1);
    }

    const list = readStore('officers', [])
      .filter(o => o.id !== id.toUpperCase())
      .concat([{ id: id.toUpperCase(), name, title: title || 'Safety Officer', passwordHash: sha256(password) }]);
    writeStore('officers', list);
    console.log(`Operator ${id.toUpperCase()} saved to store/officers.json. ${list.length} account(s) configured.`);
  },

  'remove-officer'(id) {
    const before = readStore('officers', []);
    const after  = before.filter(o => o.id !== String(id).toUpperCase());
    writeStore('officers', after);
    console.log(before.length === after.length ? 'No such operator.' : `Removed ${String(id).toUpperCase()}.`);
  },

  'import-workers'(file) {
    if (!file) {
      console.error('Usage: node admin.js import-workers <file.csv>');
      console.error('Columns: id,name,areaCode,shift,department');
      process.exit(1);
    }
    const codes = new Set(config().areas.map(a => a.code));
    const rows  = readCsv(file);
    const out   = [];

    rows.forEach((r, i) => {
      if (!r.id || !r.name) throw new Error(`Row ${i + 2}: id and name are required.`);
      if (r.areaCode && !codes.has(r.areaCode)) {
        throw new Error(`Row ${i + 2}: unknown area "${r.areaCode}". Known areas: ${[...codes].join(', ')}`);
      }
      out.push({ id: r.id, name: r.name, areaCode: r.areaCode || '', shift: r.shift || '', department: r.department || '' });
    });

    writeStore('workers', out);
    console.log(`Roster loaded: ${out.length} workers.`);
  },

  'import-readings'(file) {
    if (!file) {
      console.error('Usage: node admin.js import-readings <file.csv>');
      console.error('Columns: workerId,areaCode,ppm,at   (at = ISO timestamp, e.g. 2026-09-22T08:30:00)');
      process.exit(1);
    }
    const codes = new Set(config().areas.map(a => a.code));
    const known = new Set(readStore('workers', []).map(w => w.id));
    const rows  = readCsv(file);
    const clean = [];

    rows.forEach((r, i) => {
      const line = i + 2;
      if (!r.workerId || !r.areaCode || !r.ppm || !r.at) throw new Error(`Row ${line}: workerId, areaCode, ppm and at are all required.`);
      if (known.size && !known.has(r.workerId)) throw new Error(`Row ${line}: worker "${r.workerId}" is not on the roster.`);
      if (!codes.has(r.areaCode)) throw new Error(`Row ${line}: unknown area "${r.areaCode}".`);
      if (Number.isNaN(Number(r.ppm))) throw new Error(`Row ${line}: ppm "${r.ppm}" is not a number.`);
      if (Number.isNaN(Date.parse(r.at))) throw new Error(`Row ${line}: timestamp "${r.at}" cannot be read.`);
      clean.push({ workerId: r.workerId, areaCode: r.areaCode, ppm: Number(r.ppm), at: new Date(r.at).toISOString() });
    });

    const all = readStore('readings', []).concat(clean);
    writeStore('readings', all);
    console.log(`Imported ${clean.length} readings. ${all.length} stored in total.`);
  },

  'device-key'() {
    const key = crypto.randomBytes(32).toString('hex');
    console.log('Device ingest key generated. Set it before starting the server:\n');
    console.log(`  PowerShell : $env:SENSEWEAR_DEVICE_KEY = "${key}"`);
    console.log(`  bash       : export SENSEWEAR_DEVICE_KEY="${key}"\n`);
    console.log('Badges must send it as the X-Device-Key header when posting to /api/ingest.');
  },

  reset() {
    ['readings', 'workers', 'acknowledgements'].forEach(n => {   // officers are kept
      const f = path.join(STORE, `${n}.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    console.log('Stored roster, readings and acknowledgements deleted.');
  },
};

const [command, ...args] = process.argv.slice(2);

if (!command || !COMMANDS[command]) {
  console.log(`SenseWear administration

  node admin.js status
  node admin.js add-officer <ID> "<Name>" "<Title>" <password>
  node admin.js remove-officer <ID>
  node admin.js import-workers <file.csv>     columns: id,name,areaCode,shift,department
  node admin.js import-readings <file.csv>    columns: workerId,areaCode,ppm,at
  node admin.js device-key
  node admin.js reset
`);
  process.exit(command ? 1 : 0);
}

try { COMMANDS[command](...args); }
catch (err) { console.error(`Failed: ${err.message}`); process.exit(1); }
