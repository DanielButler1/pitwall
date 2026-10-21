// Recomputes every season's championships from raw results using the era rules
// in src/lib/f1/points.ts and reports where they differ from the official F1DB tables.
//   node scripts/validate-standings.ts [--verbose]

import { readFileSync } from "node:fs";
import { hydrate, indexData, completedRaces, type StandingRow } from "../src/lib/f1/dataset.ts";
import { computeStandings, eraRules } from "../src/lib/f1/points.ts";

const verbose = process.argv.includes("--verbose");
const db = indexData(hydrate(JSON.parse(readFileSync(new URL("../data/f1.json", import.meta.url), "utf8"))));

function diff(kind: string, year: number, official: StandingRow[], computed: StandingRow[], key: (r: StandingRow) => string) {
	const byKey = new Map(computed.map((r) => [key(r), r]));
	const issues: string[] = [];
	for (const o of official) {
		const c = byKey.get(key(o));
		if (!c) {
			if (o.points > 0) issues.push(`${key(o)} missing (official ${o.points})`);
			continue;
		}
		if (Math.abs(c.points - o.points) > 0.01) issues.push(`${key(o)} ${c.points} vs official ${o.points}`);
		else if (o.position != null && c.position !== o.position && o.points > 0) issues.push(`${key(o)} P${c.position} vs official P${o.position}`);
	}
	const champO = official.find((r) => r.champion);
	const champC = computed[0];
	const championWrong = champO && champC && key(champO) !== key(champC);
	if (issues.length) {
		console.log(`${year} ${kind}: ${issues.length} differences${championWrong ? " — CHAMPION DIFFERS" : ""}`);
		if (verbose) for (const i of issues.slice(0, 8)) console.log("   ", i);
	}
	return { issues: issues.length, championWrong: Boolean(championWrong) };
}

let badYears = 0;
let wrongChampions = 0;
for (const year of db.years) {
	const races = completedRaces(db, year);
	if (!races.length) continue;
	const rules = eraRules(year);
	const computed = computeStandings(db, races, rules);
	const d = diff("drivers", year, db.driverStandings.get(year) ?? [], computed.drivers, (r) => r.id);
	let c = { issues: 0, championWrong: false };
	if (rules.hasConstructorsChampionship) {
		c = diff("constructors", year, db.constructorStandings.get(year) ?? [], computed.constructors, (r) => `${r.id}|${r.engineId}`);
	}
	if (d.issues || c.issues) badYears++;
	wrongChampions += Number(d.championWrong) + Number(c.championWrong);
}
console.log(`\n${badYears} seasons with differences, ${wrongChampions} champion mismatches`);
