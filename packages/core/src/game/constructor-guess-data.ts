// Builds the team list for the "Guess the constructor" game (public/data/constructor-guess.json,
// written by scripts/build-client-data.ts): every constructor that started a race, with the
// engines it used and its most successful drivers.

import { isStart, type Db } from "../f1/dataset.ts";
import { constructorCareers } from "../f1/stats.ts";
import type { ConstructorFile, PackedConstructor } from "./constructor-guess.ts";

export function constructorFile(db: Db): ConstructorFile {
	const careers = constructorCareers(db);
	const engines: Record<string, string> = {};
	const drivers: Record<string, string> = {};
	const constructors: PackedConstructor[] = [];
	for (const [id, c] of careers) {
		if (!c.starts) continue;
		const team = db.constructors.get(id);
		if (!team) continue;
		const results = db.resultsByConstructor.get(id) ?? [];

		// races per engine maker; one-off engines (a single race) are noise, unless that's all there is
		const engineRaces = new Map<string, Set<number>>();
		for (const r of results) (engineRaces.get(r.engineId) ?? engineRaces.set(r.engineId, new Set()).get(r.engineId)!).add(r.raceId);
		const ranked = [...engineRaces].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
		const engineIds = (ranked.some(([, s]) => s.size >= 2) ? ranked.filter(([, s]) => s.size >= 2) : ranked).map(([e]) => e);
		for (const e of engineIds) engines[e] ??= db.engines.get(e)?.name ?? e;

		// drivers who mattered most: wins, then races started
		const perDriver = new Map<string, { wins: number; starts: Set<number> }>();
		for (const r of results) {
			const d = perDriver.get(r.driverId) ?? perDriver.set(r.driverId, { wins: 0, starts: new Set() }).get(r.driverId)!;
			if (r.position === 1) d.wins++;
			if (isStart(r)) d.starts.add(r.raceId);
		}
		const top = [...perDriver]
			.sort((a, b) => b[1].wins - a[1].wins || b[1].starts.size - a[1].starts.size || a[0].localeCompare(b[0]))
			.slice(0, 3)
			.map(([d]) => d);
		for (const d of top) drivers[d] ??= db.drivers.get(d)?.name ?? d;

		const indyRaces = new Set(results.filter((r) => db.raceById.get(r.raceId)?.grandPrixId === "indianapolis").map((r) => r.raceId)).size;
		const country = db.countries.get(team.country);
		constructors.push([
			id,
			team.name,
			country?.alpha2 ?? null,
			team.country,
			country?.name ?? team.country,
			c.firstYear,
			c.lastYear,
			c.entries,
			c.starts,
			c.wins,
			c.podiums,
			c.poles,
			c.titles,
			engineIds,
			top,
			indyRaces * 2 > c.entries ? 1 : 0,
		]);
	}
	constructors.sort((a, b) => a[0].localeCompare(b[0]));
	return { engines, drivers, constructors };
}
