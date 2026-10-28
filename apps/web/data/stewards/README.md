# Stewards

What the FIA's published documents say about each race, 2018 on: one file per season (`2024.json`), one entry per round. It's generated, so don't edit it by hand; fix the parser instead and run it again.

```bash
node scripts/fia-docs.mjs index    # list every document, from the mirror's manifest
node scripts/fia-docs.mjs fetch    # download the ones worth reading, keep their text (.cache/fia)
node scripts/fia-docs.mjs parse    # write these files
```

Each round has:
- **`decisions`:** every stewards' decision on a car:
  - the car and driver (F1DB id), and the session;
  - the offence and the facts as written;
  - the decision's wording;
  - its penalties: time, stop-and-go, drive-through, grid places, back of the grid, pit-lane start, disqualification, reprimand (driving or not), warning, fine (€) and penalty points.

  "No further action" is kept as a penalty of type `none`.
- **`deletedLaps`:** lap times deleted for leaving the track, per session and driver.
- **`newPu`:** power unit elements fitted new at the event, per driver: ICE, TC, MGU-H, MGU-K, ES, CE and EX.
- **`compounds`:** Pirelli's three dry compounds, from its preview.

## Where it comes from

The documents are on [fia.com](https://www.fia.com/documents/championships/fia-formula-one-world-championship-14) from 2019. The site sits behind a bot check, so `fia-docs.mjs` reads them from [TracingInsights/DDocs](https://github.com/TracingInsights/DDocs) instead, which mirrors them every few hours and goes back to 2018.

The text comes from `pdftotext`, which Git for Windows includes. Some documents lay out badly as text: a value can sit one label up, and some tables come out jumbled. The parser allows for the common cases. A decision it can't read is left out rather than guessed.

The documents are the FIA's own publications. The data here is facts taken from them, not copies of the documents.
