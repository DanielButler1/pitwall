// Prints race facts, to read through and tune the scoring:
//   pnpm --filter @pitwall/core facts 2026          (a season)
//   pnpm --filter @pitwall/core facts 2026 17 10    (one race, up to 10 facts)
//   pnpm --filter @pitwall/core facts next          (what's at stake at the next race)
// Reads apps/web/data/f1.json (or PITWALL_DATA), built by the web app's data scripts.

import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../src/f1/dataset.ts";
import { factText, raceFacts, upcomingFacts, type RaceFact } from "../src/f1/race-facts.ts";
import { dataFile } from "../src/test-data.ts";

const args = process.argv.slice(2);
const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
const print = (list: RaceFact[]) => {
	if (!list.length) console.log("  (nothing unusual)");
	for (const f of list) console.log(`  ${f.score.toFixed(1).padStart(4)}  ${factText(f.cells)}`);
};

if (args[0] === "next") {
	const next = upcomingFacts(db, Number(args[1]) || 10);
	if (!next) console.log("No race to come.");
	else {
		console.log(`\nComing up: ${next.race.year} round ${next.race.round}, ${db.grandsPrix.get(next.race.grandPrixId)?.fullName ?? next.race.officialName}`);
		print(next.facts);
	}
} else {
	const [year, round, limit] = args.map(Number);
	if (!year) {
		console.error("usage: facts <year> [round] [limit] | facts next [limit]");
		process.exit(1);
	}
	for (const race of db.racesByYear.get(year) ?? []) {
		if ((round && race.round !== round) || !db.resultsByRace.has(race.id)) continue;
		console.log(`\n${race.year} round ${race.round}: ${db.grandsPrix.get(race.grandPrixId)?.fullName ?? race.officialName}`);
		print(raceFacts(db, race.id, limit || 6));
	}
}
