// Builds the compact driver list for the "Guess the driver" game (public/data/guess.json,
// written by scripts/build-client-data.ts). Unlike the hover cards it carries every team a
// driver raced for, which the team tile compares.

import type { Db } from "../f1/dataset.ts";
import { driverCareers } from "../f1/stats.ts";
import type { GuessFile, PackedGuessDriver } from "./guess.ts";

export function guessFile(db: Db): GuessFile {
	const careers = driverCareers(db);
	const titles = new Map<string, number>();
	for (const rows of db.driverStandings.values()) for (const r of rows) if (r.champion) titles.set(r.id, (titles.get(r.id) ?? 0) + 1);
	const teams: Record<string, string> = {};
	const drivers: PackedGuessDriver[] = [];
	for (const [id, c] of careers) {
		if (!c.starts) continue;
		const d = db.drivers.get(id);
		if (!d) continue;
		const results = [...(db.resultsByDriver.get(id) ?? [])].sort((a, b) => (db.raceById.get(a.raceId)?.date ?? "").localeCompare(db.raceById.get(b.raceId)?.date ?? ""));
		const teamIds = [...new Set(results.map((r) => r.constructorId))];
		for (const t of teamIds) teams[t] ??= db.constructors.get(t)?.name ?? t;
		const country = db.countries.get(d.nationality);
		drivers.push([id, d.name, country?.alpha2 ?? null, d.nationality, country?.name ?? d.nationality, c.firstYear, c.lastYear, c.starts, c.wins, c.podiums, c.poles, titles.get(id) ?? 0, teamIds]);
	}
	drivers.sort((a, b) => a[0].localeCompare(b[0]));
	return { teams, drivers };
}
