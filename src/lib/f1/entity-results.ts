// Every race result of one driver or constructor, for the "All results" list on their pages.
// The real site serves these as static files (public/data/results/<kind>/<id>.json, written by
// scripts/build-client-data.ts) so the pages themselves stay small; universes build them in
// the browser from their own Db.

import type { Db } from "./dataset.ts";
import { driverRef, raceRef, teamRef, type DriverRef, type RaceRef, type TeamRef } from "./views.ts";

export type ResultsKind = "driver" | "team";

/** Packed: the races and the other side (teams for a driver, drivers for a team) are listed once. */
export type ResultsFile = {
	races: [year: number, round: number, name: string, date: string, country: string | null][];
	others: [id: string, name: string, country: string | null][];
	/** [race index, other index, grid, positionText, points, flags: 1 pole, 2 fastest lap] */
	rows: [number, number, number | null, string, number, number][];
};

export type EntityResult = { race: RaceRef; other: DriverRef | TeamRef; grid: number | null; position: string; points: number; pole: boolean; fastestLap: boolean };

export function entityResults(db: Db, kind: ResultsKind, id: string): ResultsFile {
	const results = (kind === "driver" ? db.resultsByDriver : db.resultsByConstructor).get(id) ?? [];
	const file: ResultsFile = { races: [], others: [], rows: [] };
	const raceIdx = new Map<number, number>();
	const otherIdx = new Map<string, number>();
	const sorted = [...results].sort((a, b) => {
		const ra = db.raceById.get(a.raceId)!;
		const rb = db.raceById.get(b.raceId)!;
		return ra.date.localeCompare(rb.date) || ra.round - rb.round;
	});
	for (const r of sorted) {
		const race = db.raceById.get(r.raceId)!;
		let ri = raceIdx.get(race.id);
		if (ri == null) {
			const ref = raceRef(db, race);
			ri = file.races.push([ref.year, ref.round, ref.name, ref.date, ref.country]) - 1;
			raceIdx.set(race.id, ri);
		}
		const otherId = kind === "driver" ? r.constructorId : r.driverId;
		let oi = otherIdx.get(otherId);
		if (oi == null) {
			const ref = kind === "driver" ? teamRef(db, otherId) : driverRef(db, otherId);
			oi = file.others.push([ref.id, ref.name, ref.country]) - 1;
			otherIdx.set(otherId, oi);
		}
		file.rows.push([ri, oi, r.grid, r.positionText, Math.round(r.points * 100) / 100, (r.pole ? 1 : 0) | (r.fastestLap ? 2 : 0)]);
	}
	return file;
}

export function unpackResults(f: ResultsFile): EntityResult[] {
	const races = f.races.map(([year, round, name, date, country]): RaceRef => ({ year, round, name, date, country }));
	const others = f.others.map(([id, name, country]) => ({ id, name, country, countryName: null }));
	return f.rows.map(([ri, oi, grid, position, points, flags]) => ({
		race: races[ri],
		other: others[oi],
		grid,
		position,
		points,
		pole: (flags & 1) > 0,
		fastestLap: (flags & 2) > 0,
	}));
}
