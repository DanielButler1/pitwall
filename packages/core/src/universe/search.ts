// Search entries that only exist in a universe: invented drivers and teams
// (`sim-<seed>-…`) and simulated seasons beyond the real data. Built from the
// already-applied universe Db (what the worker's diff merged in), compared with
// real history; the real-world index comes from public/data/search-index.json as usual.

import { isStart, type Db } from "../f1/dataset.ts";
import type { SearchEntry } from "../f1/views.ts";

const cache = new WeakMap<Db, SearchEntry[]>();

export function universeSearchEntries(db: Db, base: Db): SearchEntry[] {
	const hit = cache.get(db);
	if (hit) return hit;
	const flag = (countryId: string | null | undefined) => (countryId && db.countries.get(countryId)?.alpha2.toLowerCase()) || "";
	const span = (years: number[]) => {
		if (!years.length) return "";
		const a = Math.min(...years);
		const b = Math.max(...years);
		return a === b ? String(a) : `${a}-${b}`;
	};
	/** Seasons raced and wins, from a list of results. */
	const career = (results: Db["results"] | undefined) => {
		const years: number[] = [];
		let wins = 0;
		for (const r of results ?? []) {
			if (!isStart(r)) continue;
			const y = db.raceById.get(r.raceId)?.year;
			if (y != null) years.push(y);
			if (r.position === 1) wins++;
		}
		return { years, wins };
	};

	const drivers: { e: SearchEntry; wins: number }[] = [];
	for (const [id, d] of db.drivers) {
		if (base.drivers.has(id)) continue;
		const c = career(db.resultsByDriver.get(id));
		drivers.push({ e: ["driver", id, d.name, flag(d.nationality), span(c.years)], wins: c.wins });
	}
	const teams: { e: SearchEntry; wins: number }[] = [];
	const extraTeams = [...db.constructors.keys()].filter((id) => !base.constructors.has(id));
	if (extraTeams.length) {
		const byTeam = new Map<string, { years: number[]; wins: number }>(extraTeams.map((id) => [id, { years: [], wins: 0 }]));
		for (const r of db.results) {
			const t = byTeam.get(r.constructorId);
			if (!t || !isStart(r)) continue;
			const y = db.raceById.get(r.raceId)?.year;
			if (y != null) t.years.push(y);
			if (r.position === 1) t.wins++;
		}
		for (const id of extraTeams) {
			const t = db.constructors.get(id)!;
			const c = byTeam.get(id)!;
			teams.push({ e: ["constructor", id, t.name, flag(t.country), [t.fullName ?? "", span(c.years)].join(" ").trim()], wins: c.wins });
		}
	}
	const byWins = (a: { wins: number }, b: { wins: number }) => b.wins - a.wins;
	const realYears = new Set(base.years);
	const seasons: SearchEntry[] = db.years
		.filter((y) => !realYears.has(y))
		.sort((a, b) => b - a)
		.map((y) => ["season", String(y), `${y} season`, "", "Simulated"]);

	const out = [...drivers.sort(byWins).map((d) => d.e), ...teams.sort(byWins).map((t) => t.e), ...seasons];
	cache.set(db, out);
	return out;
}
