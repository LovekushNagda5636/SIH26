# SenseWear — H₂S Exposure Monitoring

A monitoring console for industrial safety officers. It holds hydrogen sulphide
exposure recorded by SenseWear passive colorimetric badges at a registered
establishment, and produces the statutory return for the inspecting authority.

Exposure is scored against the limits prescribed under **The Factories Act, 1948**,
Second Schedule, Section 41F — permissible limit **10 ppm** (8-hour TWA), short
term limit **15 ppm** (15 minutes), action level **5 ppm**.

## Running it

No dependencies to install. Node 18 or later.

```
cd h2s-dashboard
node server.js
```

Then open <http://localhost:3000>.

If port 3000 is taken, `PORT=3001 node server.js` works instead.

## First run

A fresh clone has no roster, no readings and no accounts — `store/` is not
committed, so nothing ships with credentials or exposure data in it. Create an
operator and load records:

```
node admin.js add-officer SAFE01 "S. Murthy" "Chief Safety Officer" <password>
node admin.js import-workers  data-import/workers.csv
node admin.js import-readings data-import/readings.csv
node admin.js status
```

> The CSVs in `data-import/` are **modelled sample records**, not real
> measurements. Their exposure profile follows what a refinery would show —
> sour-service units running hot, storage low — but no value in them was
> measured. Run `node admin.js reset` before loading real records.

Blank templates with the required columns are in `templates/`.

## Loading real data

**By file.** Two CSVs, validated on import — the whole file is rejected if any
row names an unknown area or worker, or carries an unparseable number or date.

| File | Columns |
|---|---|
| workers | `id,name,areaCode,shift,department` |
| readings | `workerId,areaCode,ppm,at` |

`at` is a local timestamp (`2026-09-22T08:30:00`). `areaCode` must match a code
in `config.json`.

**From badges.** Generate a key, set it, and badges POST readings to
`/api/ingest` with an `X-Device-Key` header:

```
node admin.js device-key
export SENSEWEAR_DEVICE_KEY="<key>"      # PowerShell: $env:SENSEWEAR_DEVICE_KEY="<key>"
```

Without that variable set, ingest stays closed.

## What it shows

**Dashboard** — workers monitored, workers on shift, alerts, highest reading and
total exposure time; exposure by process area; a bar chart of area averages and a
trend line against the permissible limit.

**Workers** — one row per worker with latest reading, exposure duration and shift
times. Opening a row shows that worker's full record and exposure history.

**Exposure** — area-by-area concentrations with highest and lowest marked, and the
alert register with acknowledgement.

**Reports** — the statutory return in two formats, built from one shared model so
the figures always agree:

- **PDF** — cover, contents, nine numbered sections, captioned tables with totals,
  trend graph, incident register, signature block.
- **CSV** — the same figures as rows in four sections, for the authority's own
  analysis.

## Layout

```
h2s-dashboard/
  server.js          API and static server; derives sessions and alerts from raw readings
  admin.js           roster, readings, operator accounts, device key
  config.json        plant, statutory limits, process areas, shifts
  index.html
  style.css
  js/
    api.js           API client and derived figures
    ui.js            shell, navigation, reporting period, accessibility
    dashboard.js     summary cards, area cards, charts, alerts
    workers.js       monitoring table and worker record
    exposure.js      area record and alert register
    reports.js       PDF and CSV returns
  data-import/       modelled sample records
  templates/         blank CSVs with the required columns
  store/             roster, readings, acknowledgements, credentials — NOT committed
```

Raw badge readings are the only measurement stored. Work sessions, exposure
durations and alerts are derived from them on read, so the two can never drift
apart. Dates and clock times resolve in the plant's own timezone, set in
`config.json`.

## Accessibility

Built to the [Guidelines for Indian Government Websites](https://guidelines.india.gov.in/guidelines/):
skip links, screen reader access, text sizing, high contrast, keyboard
navigation, and a bilingual masthead.

The State Emblem of India is **not** reproduced anywhere — its use is restricted
under the State Emblem of India (Prohibition of Improper Use) Act, 2005. A
placeholder departmental mark is used instead, in both the page and the PDF
cover. Replace it with the authority's own registered mark.

## Configuration

`config.json` holds the establishment, the statutory limits, the process areas
and the shifts. Changing a limit re-scores every reading and every alert on the
next read.

Credentials are never kept here — operator accounts live in `store/officers.json`,
which is gitignored.
