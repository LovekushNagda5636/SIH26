SenseWear — data loading templates

workers.csv    id,name,areaCode,shift,department
               areaCode must match a code in config.json (CDU-III, DCU, HCU,
               DHDT, SRU, ARU, SWS, ETP, TF). shift is A, B or C.

readings.csv   workerId,areaCode,ppm,at
               at is a local timestamp, e.g. 2026-09-22T08:30:00
               ppm is the concentration recorded by the badge.

Load them with:
  node admin.js import-workers  templates/workers.csv
  node admin.js import-readings templates/readings.csv

Both importers reject the whole file if any row names an unknown area,
an unknown worker, an unparseable number or an unparseable timestamp.
