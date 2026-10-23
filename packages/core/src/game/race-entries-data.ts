// Builds public/data/race-entries.json (see race-entries.ts) for the race games under /play:
// every Grand Prix since 1980 with its starters in grid order, finishing positions, fastest
// lap and the championship top three before the race, plus themed practice lists.

import { isStart, type Db, type Result } from "../f1/dataset.ts";
import { driverCareers } from "../f1/stats.ts";
import type { PackedCircuit, PackedDriver, PackedGrandPrix, PackedRace, PackedTeam, PackedTheme, RaceEntriesFile } from "./race-entries.ts";

export const FIRST_YEAR = 1980;

/** An index into a packed table, adding the row the first time an id is seen. */
function table<T>() {
	const index = new Map<string, number>();
	const rows: T[] = [];
	return {
		rows,
		at(id: string, row: () => T) {
			let i = index.get(id);
			if (i == null) {
				i = rows.length;
				index.set(id, i);
				rows.push(row());
			}
			return i;
		},
	};
}

const gridOrder = (a: Result, b: Result) =>
	(a.grid || 999) - (b.grid || 999) || (a.qualifying ?? 999) - (b.qualifying ?? 999) || (a.position ?? 999) - (b.position ?? 999) || a.driverId.localeCompare(b.driverId);

export function raceEntriesFile(db: Db): RaceEntriesFile {
	const careers = driverCareers(db);
	const drivers = table<PackedDriver>();
	const teams = table<PackedTeam>();
	const gps = table<PackedGrandPrix>();
	const circuits = table<PackedCircuit>();
	const flagOf = (country: string | null | undefined) => (country ? (db.countries.get(country)?.alpha2 ?? null) : null);
	const driver = (id: string) =>
		drivers.at(id, () => {
			const d = db.drivers.get(id);
			return [id, d?.name ?? id, d?.firstName ?? "", d?.lastName ?? d?.name ?? id, flagOf(d?.nationality), careers.get(id)?.starts ?? 0];
		});
	const team = (id: string) => teams.at(id, () => [id, db.constructors.get(id)?.name ?? id]);

	const races: PackedRace[] = [];
	for (const year of db.years) {
		if (year < FIRST_YEAR) continue;
		const season = db.racesByYear.get(year) ?? [];
		const points = new Map<string, number>();
		for (const race of season) {
			const results = db.resultsByRace.get(race.id);
			if (!results?.length) continue;
			const starters = results.filter(isStart).sort(gridOrder);
			const circuit = db.circuits.get(race.circuitId);
			const gp = db.grandsPrix.get(race.grandPrixId);
			const flag = flagOf(gp?.country) ?? flagOf(circuit?.country);
			const leaders = [...points]
				.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
				.slice(0, 3)
				.flatMap(([id, p]) => [driver(id), Math.round(p * 100) / 100]);
			const fl = db.fastestLapByRace.get(race.id);
			races.push([
				year,
				race.round,
				season.length,
				race.date,
				gps.at(race.grandPrixId, () => [race.grandPrixId, gp?.fullName ?? race.officialName, gp?.shortName ?? race.officialName, flag]),
				circuits.at(race.circuitId, () => [race.circuitId, circuit?.name ?? race.circuitId, circuit?.place ?? "", flagOf(circuit?.country)]),
				starters.flatMap((r) => [driver(r.driverId), team(r.constructorId), r.position ?? 0]),
				fl ? driver(fl.driverId) : -1,
				leaders,
				starters.flatMap((r, i) => ((r.grid ?? 0) === i + 1 ? [] : [i, r.grid ?? 0])),
			]);
			// the standings after this race, for the next one
			for (const r of [...results, ...(db.sprintByRace.get(race.id) ?? [])]) if (r.points) points.set(r.driverId, (points.get(r.driverId) ?? 0) + r.points);
		}
	}

	return { drivers: drivers.rows, teams: teams.rows, grandsPrix: gps.rows, circuits: circuits.rows, races, themes: themes(db, driver) };
}

const span = (years: number[]) => (years[0] === years[years.length - 1] ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Practice lists of drivers to name, each with a clue, in chronological order. */
function themes(db: Db, driver: (id: string) => number): PackedTheme[] {
	const champions = new Map<string, number[]>();
	for (const [year, rows] of [...db.driverStandings].sort((a, b) => a[0] - b[0])) for (const r of rows) if (r.champion) champions.set(r.id, [...(champions.get(r.id) ?? []), year]);
	const winners = (teamId: string) => {
		const years = new Map<string, number[]>();
		for (const r of db.resultsByConstructor.get(teamId) ?? []) {
			if (r.position !== 1) continue;
			const year = db.raceById.get(r.raceId)!.year;
			years.set(r.driverId, [...(years.get(r.driverId) ?? []), year]);
		}
		return years;
	};
	const list = (by: Map<string, number[]>, word: string) =>
		[...by]
			.sort((a, b) => a[1][0] - b[1][0] || a[1].length - b[1].length || a[0].localeCompare(b[0]))
			.map(([id, years]): [number, string] => [driver(id), `${span(years)} · ${plural(years.length, word)}`]);
	const team = (id: string) => db.constructors.get(id)?.name ?? id;
	return [
		["champions", "Every World Champion", "Every Drivers' Champion since 1950, by their first title", list(champions, "title")],
		...["ferrari", "mclaren", "williams"].map(
			(id): PackedTheme => [`${id}-winners`, `Every ${team(id)} race winner`, `Every driver who won a Grand Prix for ${team(id)}, by their first win`, list(winners(id), "win")],
		),
	];
}
