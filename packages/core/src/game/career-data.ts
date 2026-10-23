// Builds public/data/career.json for "Career path" (written by scripts/build-client-data.ts):
// every driver who started a race, with their career split into team stints. Within a season
// teams are ordered by their first race, then consecutive seasons with one team are merged.

import { isStart, type Db } from "../f1/dataset.ts";
import { driverCareers } from "../f1/stats.ts";
import type { CareerFile, PackedCareerDriver, PackedStint } from "./career.ts";

/** "A. S." from the first name and the surname (its first capital, so "de Cesaris" gives C). */
export function initials(firstName: string, lastName: string): string {
	const f = firstName.trim()[0]?.toUpperCase() ?? "";
	const l = lastName.match(/\p{Lu}/u)?.[0] ?? lastName.trim()[0]?.toUpperCase() ?? "";
	return [f, l].filter(Boolean).map((c) => `${c}.`).join(" ");
}

export function careerFile(db: Db): CareerFile {
	const careers = driverCareers(db);
	const teamIndex = new Map<string, number>();
	const teams: [string, string][] = [];
	const teamAt = (id: string) => {
		let i = teamIndex.get(id);
		if (i == null) {
			i = teams.push([id, db.constructors.get(id)?.name ?? id]) - 1;
			teamIndex.set(id, i);
		}
		return i;
	};
	const drivers: PackedCareerDriver[] = [];
	for (const [id, c] of careers) {
		const d = db.drivers.get(id);
		if (!d || !c.starts) continue;
		// per season, teams in order of their first race (results are already chronological)
		type Season = { year: number; team: string; starts: Set<number>; wins: Set<number>; podiums: Set<number> };
		const seasons: Season[] = [];
		for (const r of db.resultsByDriver.get(id) ?? []) {
			const year = db.raceById.get(r.raceId)!.year;
			let s = seasons.find((x) => x.year === year && x.team === r.constructorId);
			if (!s) seasons.push((s = { year, team: r.constructorId, starts: new Set(), wins: new Set(), podiums: new Set() }));
			if (isStart(r)) s.starts.add(r.raceId);
			if (r.position === 1) s.wins.add(r.raceId);
			if (r.position != null && r.position <= 3) s.podiums.add(r.raceId);
		}
		const stints: PackedStint[] = [];
		let prev: string | null = null;
		for (const s of seasons) {
			const last = stints[stints.length - 1];
			// a year out (even back with the same team) starts a new stint
			if (last && prev === s.team && s.year - last[2] <= 1) {
				last[2] = s.year;
				last[3] += s.starts.size;
				last[4] += s.wins.size;
				last[5] += s.podiums.size;
			} else stints.push([teamAt(s.team), s.year, s.year, s.starts.size, s.wins.size, s.podiums.size]);
			prev = s.team;
		}
		const country = db.countries.get(d.nationality);
		drivers.push([id, d.name, country?.alpha2 ?? null, country?.name ?? d.nationality, initials(d.firstName, d.lastName), c.starts, c.wins, c.podiums, c.titles, stints]);
	}
	drivers.sort((a, b) => a[0].localeCompare(b[0]));
	return { teams, drivers };
}
