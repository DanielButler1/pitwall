// Builds the team-mate graph for the "Teammate chain" game (public/data/chain.json, written
// by scripts/build-client-data.ts). Two drivers are team-mates when they were entered for the
// same constructor in the same race (as on the head-to-head pages, lib/f1/teammates.ts);
// each edge keeps the constructors and seasons they shared so every link can be explained.

import type { Db } from "../f1/dataset.ts";
import { driverCareers } from "../f1/stats.ts";
import { YEAR0, type ChainFile, type PackedChainDriver, type PackedEdge } from "./chain.ts";

export function chainFile(db: Db): ChainFile {
	const careers = driverCareers(db);
	const titles = new Map<string, number>();
	for (const rows of db.driverStandings.values()) for (const r of rows) if (r.champion) titles.set(r.id, (titles.get(r.id) ?? 0) + 1);

	// pair "a|b" (a < b) → constructor → seasons together
	const pairs = new Map<string, Map<string, Set<number>>>();
	for (const [raceId, rows] of db.resultsByRace) {
		const year = db.raceById.get(raceId)?.year;
		if (year == null) continue;
		const byTeam = new Map<string, Set<string>>();
		for (const r of rows) {
			let s = byTeam.get(r.constructorId);
			if (!s) byTeam.set(r.constructorId, (s = new Set()));
			s.add(r.driverId);
		}
		for (const [team, set] of byTeam) {
			const ids = [...set].sort();
			for (let i = 0; i < ids.length; i++)
				for (let j = i + 1; j < ids.length; j++) {
					const key = `${ids[i]}|${ids[j]}`;
					let teams = pairs.get(key);
					if (!teams) pairs.set(key, (teams = new Map()));
					let years = teams.get(team);
					if (!years) teams.set(team, (years = new Set()));
					years.add(year);
				}
		}
	}

	const ids = [...db.resultsByDriver.keys()].filter((id) => db.drivers.has(id) && careers.has(id)).sort();
	const index = new Map(ids.map((id, i) => [id, i]));
	const drivers: PackedChainDriver[] = ids.map((id) => {
		const d = db.drivers.get(id)!;
		const c = careers.get(id)!;
		return [id, d.name, d.lastName, db.countries.get(d.nationality)?.alpha2 ?? null, c.firstYear, c.lastYear, c.starts, c.wins, titles.get(id) ?? 0];
	});

	const teamIds: string[] = [];
	const teamIndex = new Map<string, number>();
	const teamOf = (id: string) => {
		let i = teamIndex.get(id);
		if (i == null) {
			teamIndex.set(id, (i = teamIds.length));
			teamIds.push(id);
		}
		return i;
	};

	const edges: PackedEdge[] = [];
	for (const [key, teams] of pairs) {
		const [a, b] = key.split("|").map((id) => index.get(id));
		if (a == null || b == null) continue;
		const stints: [number, number, number][] = [];
		for (const [team, years] of teams) {
			const sorted = [...years].sort((x, y) => x - y);
			let from = sorted[0];
			for (let k = 1; k <= sorted.length; k++) {
				if (k < sorted.length && sorted[k] === sorted[k - 1] + 1) continue;
				stints.push([teamOf(team), from - YEAR0, sorted[k - 1] - YEAR0]);
				from = sorted[k];
			}
		}
		stints.sort((x, y) => x[1] - y[1] || x[2] - y[2]);
		edges.push([a, b, ...stints.flat()]);
	}
	edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
	return { teams: teamIds.map((id) => [id, db.constructors.get(id)?.name ?? id]), drivers, edges };
}
