// Prints each race's facts, to read through and tune the scoring:
//   pnpm --filter @pitwall/core facts 2026          (a season)
//   pnpm --filter @pitwall/core facts 2026 17 10    (one race, up to 10 facts)
// Reads apps/web/data/f1.json (or PITWALL_DATA), built by the web app's data scripts.

import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../src/f1/dataset.ts";
import { factText, raceFacts } from "../src/f1/race-facts.ts";
import { dataFile } from "../src/test-data.ts";

const [year, round, limit] = process.argv.slice(2).map(Number);
if (!year) {
	console.error("usage: facts <year> [round] [limit]");
	process.exit(1);
}
const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
for (const race of db.racesByYear.get(year) ?? []) {
	if ((round && race.round !== round) || !db.resultsByRace.has(race.id)) continue;
	console.log(`\n${race.year} round ${race.round}: ${db.grandsPrix.get(race.grandPrixId)?.fullName ?? race.officialName}`);
	const list = raceFacts(db, race.id, limit || 6);
	if (!list.length) console.log("  (nothing unusual)");
	for (const f of list) console.log(`  ${f.score.toFixed(1).padStart(4)}  ${factText(f.cells)}`);
}
