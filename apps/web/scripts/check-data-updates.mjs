// Moves data/sources.json forward when a newer F1DB release or Jolpica dump exists.
// Run daily by .github/workflows/data-update.yml; committing the change triggers a deploy.
//
//   node scripts/check-data-updates.mjs
//
// A new F1DB release (after each Grand Prix) always counts. A new Jolpica dump on its own only
// counts once the pinned one is a week old, so a daily dump doesn't mean a daily rebuild.
// Prints "changed=true|false" and appends it to $GITHUB_OUTPUT when that is set.

import { appendFileSync } from "node:fs";
import { latestF1db, latestJolpica, readSources, writeSources } from "./lib/sources.mjs";

const JOLPICA_MIN_DAYS = 7;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

const pinned = readSources();
const [f1db, jolpica] = await Promise.all([latestF1db(), latestJolpica()]);
const next = { ...pinned };
const notes = [];

if (f1db !== pinned.f1db) {
	next.f1db = f1db;
	notes.push(`F1DB ${pinned.f1db} -> ${f1db}`);
}
if (jolpica !== pinned.jolpica && (next.f1db !== pinned.f1db || !pinned.jolpica || days(pinned.jolpica, jolpica) >= JOLPICA_MIN_DAYS)) {
	next.jolpica = jolpica;
	notes.push(`Jolpica dump ${pinned.jolpica} -> ${jolpica}`);
}

const changed = notes.length > 0;
if (changed) writeSources(next);
console.log(changed ? notes.join("; ") : `Up to date (F1DB ${pinned.f1db}, Jolpica dump ${pinned.jolpica}; newest dump ${jolpica})`);
console.log(`changed=${changed}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nsummary=${notes.join("; ")}\n`);
