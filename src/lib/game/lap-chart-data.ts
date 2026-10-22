// Builds the pool for "Lap chart mystery" (public/data/lap-chart.json, written by
// scripts/build-client-data.ts): every race with a Jolpica lap chart whose movement score
// (lap-chart.ts) clears the bar, with each charted driver's team and grid slot. The charts
// themselves stay in the per-race lap files.

import type { Db } from "../f1/dataset.ts";
import { hasLapData, type RaceLapFile } from "../f1/laps.ts";
import { MIN_MOVEMENT, movement, type LapChartFile, type PackedLapDriver, type PackedLapRace } from "./lap-chart.ts";

export function lapChartFile(db: Db, readLaps: (raceId: number) => RaceLapFile | null): LapChartFile {
	const drivers: PackedLapDriver[] = [];
	const driverIndex = new Map<string, number>();
	const teams: [string, string][] = [];
	const teamIndex = new Map<string, number>();
	const index = <T>(map: Map<string, number>, list: T[], id: string, make: () => T) => {
		let i = map.get(id);
		if (i == null) map.set(id, (i = list.push(make()) - 1));
		return i;
	};
	const races: PackedLapRace[] = [];
	for (const race of db.races) {
		if (!hasLapData(db, race.id)) continue;
		const laps = readLaps(race.id);
		if (!laps?.drivers?.length || !laps.positions?.length) continue;
		const score = movement(laps.positions).score;
		if (score < MIN_MOVEMENT) continue;
		const results = db.resultsByRace.get(race.id) ?? [];
		const flat: number[] = [];
		let ok = true;
		for (const id of laps.drivers) {
			const r = results.find((x) => x.driverId === id);
			if (!r) {
				ok = false;
				break;
			}
			const d = db.drivers.get(id);
			flat.push(
				index(driverIndex, drivers, id, () => [id, d?.name ?? id, d?.lastName ?? id, (d && db.countries.get(d.nationality)?.alpha2) ?? null]),
				index(teamIndex, teams, r.constructorId, () => [r.constructorId, db.constructors.get(r.constructorId)?.name ?? r.constructorId]),
				r.grid ?? 0,
			);
		}
		if (ok) races.push([race.id, score, flat]);
	}
	return { drivers, teams, races };
}
