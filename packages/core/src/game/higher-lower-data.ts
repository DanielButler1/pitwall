// Builds public/data/higher-lower.json for "Higher or lower" (written by
// scripts/build-client-data.ts): recognisable drivers (30+ starts, or a win outside the
// 1950s Indianapolis 500s) and constructors (50+ races) with their career counts. Laps led
// only exist from LAPS_FROM, so they're kept for drivers whose whole career is covered.

import type { Db } from "../f1/dataset.ts";
import { driverLapsLed, LAPS_FROM } from "../f1/laps.ts";
import { constructorCareers, driverCareers } from "../f1/stats.ts";
import type { HigherLowerFile, PackedEntity } from "./higher-lower.ts";

export function higherLowerFile(db: Db): HigherLowerFile {
	const entities: PackedEntity[] = [];
	const indy = (raceId: number) => {
		const race = db.raceById.get(raceId);
		return !!race && race.circuitId === "indianapolis" && race.year <= 1960;
	};
	for (const [id, c] of driverCareers(db)) {
		const d = db.drivers.get(id);
		const results = db.resultsByDriver.get(id) ?? [];
		if (!d || !(c.starts >= 30 || (c.wins > 0 && !results.every((r) => indy(r.raceId))))) continue;
		const byTeam = new Map<string, number>();
		for (const r of results) byTeam.set(r.constructorId, (byTeam.get(r.constructorId) ?? 0) + 1);
		const team = [...byTeam].sort((a, b) => b[1] - a[1])[0]?.[0];
		const lapsLed = c.firstYear >= LAPS_FROM ? driverLapsLed(db, id).laps : null;
		const flag = db.countries.get(d.nationality)?.alpha2 ?? null;
		entities.push([id, 0, d.name, flag, c.firstYear, c.lastYear, team ? (db.constructors.get(team)?.name ?? team) : "", c.starts, c.wins, c.podiums, c.poles, lapsLed, c.titles]);
	}
	for (const [id, c] of constructorCareers(db)) {
		const t = db.constructors.get(id);
		if (!t || c.starts < 50) continue;
		const flag = db.countries.get(t.country)?.alpha2 ?? null;
		entities.push([id, 1, t.name, flag, c.firstYear, c.lastYear, "", c.starts, c.wins, c.podiums, c.poles, null, c.titles]);
	}
	entities.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
	return { lapsFrom: LAPS_FROM, entities };
}
