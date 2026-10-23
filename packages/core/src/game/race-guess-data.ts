// Builds the race catalogue for "Guess the race" and "Lap chart mystery"
// (public/data/race-guess.json, written by scripts/build-client-data.ts): every championship
// race with results, its top six, pole, fastest lap and a few notable facts for the clues.

import { isStart, type Db, type Result } from "../f1/dataset.ts";
import { driverCareers, poleOf } from "../f1/stats.ts";
import type { PackedRace, PackedRgDriver, RaceGuessFile } from "./race-guess.ts";

export function raceGuessFile(db: Db): RaceGuessFile {
	const careers = driverCareers(db);
	const drivers: PackedRgDriver[] = [];
	const driverIndex = new Map<string, number>();
	const teams: [string, string][] = [];
	const teamIndex = new Map<string, number>();
	const countries: RaceGuessFile["countries"] = {};
	const grandsPrix: RaceGuessFile["grandsPrix"] = {};
	const circuits: RaceGuessFile["circuits"] = {};
	const addCountry = (id: string) => {
		const c = db.countries.get(id);
		countries[id] ??= [c?.name ?? id, c?.alpha2 ?? null];
	};
	const d = (id: string) => {
		let i = driverIndex.get(id);
		if (i == null) {
			const dr = db.drivers.get(id);
			const c = careers.get(id);
			i = drivers.push([id, dr?.name ?? id, dr?.lastName ?? id, (dr && db.countries.get(dr.nationality)?.alpha2) ?? null, c?.wins ?? 0, c?.podiums ?? 0]) - 1;
			driverIndex.set(id, i);
		}
		return i;
	};
	const t = (id: string) => {
		let i = teamIndex.get(id);
		if (i == null) {
			i = teams.push([id, db.constructors.get(id)?.name ?? id]) - 1;
			teamIndex.set(id, i);
		}
		return i;
	};

	// first and last wins per driver and team, first/last race per circuit
	const firstWin = new Map<string, number>();
	const lastWin = new Map<string, number>();
	const teamFirstWin = new Map<string, number>();
	for (const race of db.races) {
		const w = db.resultsByRace.get(race.id)?.find((r) => r.position === 1);
		if (!w) continue;
		if (!firstWin.has(w.driverId)) firstWin.set(w.driverId, race.id);
		lastWin.set(w.driverId, race.id);
		if (!teamFirstWin.has(w.constructorId)) teamFirstWin.set(w.constructorId, race.id);
	}
	const lastYear = db.years[db.years.length - 1];

	const races: PackedRace[] = [];
	for (const race of db.races) {
		const results = db.resultsByRace.get(race.id);
		if (!results?.length) continue;
		const gp = db.grandsPrix.get(race.grandPrixId);
		const circuit = db.circuits.get(race.circuitId);
		grandsPrix[race.grandPrixId] ??= [gp?.fullName ?? race.grandPrixId, gp?.country ?? ""];
		circuits[race.circuitId] ??= [circuit?.name ?? race.circuitId, circuit?.place ?? "", circuit?.country ?? ""];
		if (gp?.country) addCountry(gp.country);
		if (circuit?.country) addCountry(circuit.country);

		const classified = results.filter((r) => r.position != null);
		const top: number[] = [];
		// shared drives: the first car per position
		const seen = new Set<number>();
		for (const r of classified) {
			if (seen.has(r.position!) || top.length >= 12) continue;
			seen.add(r.position!);
			top.push(d(r.driverId), t(r.constructorId));
		}
		const pole = poleOf(db, race.id);
		const fl = db.fastestLapByRace.get(race.id);
		const flTeam = fl && results.find((r) => r.driverId === fl.driverId)?.constructorId;
		const winner = classified.find((r) => r.position === 1);
		races.push([
			race.id,
			race.year,
			race.round,
			race.date,
			race.grandPrixId,
			race.circuitId,
			race.laps,
			classified.length,
			new Set(results.filter(isStart).map((r) => r.driverId)).size,
			top,
			pole ? [d(pole.driverId), t(pole.constructorId)] : 0,
			fl && flTeam ? [d(fl.driverId), t(flTeam), fl.time] : 0,
			winner ? notes(db, race.id, winner, { firstWin, lastWin, teamFirstWin, lastYear }) : [],
		]);
	}
	return { countries, grandsPrix, circuits, drivers, teams, races };
}

/** Up to two notable facts about a race that don't give its year or place away. */
function notes(
	db: Db,
	raceId: number,
	winner: Result,
	{ firstWin, lastWin, teamFirstWin, lastYear }: { firstWin: Map<string, number>; lastWin: Map<string, number>; teamFirstWin: Map<string, number>; lastYear: number },
): string[] {
	const race = db.raceById.get(raceId)!;
	const out: string[] = [];
	const careerEnd = db.resultsByDriver.get(winner.driverId)?.at(-1);
	const retired = careerEnd ? db.raceById.get(careerEnd.raceId)!.year < lastYear : false;
	if (winner.grandSlam) out.push("A grand slam: the winner took pole, fastest lap and led every lap");
	if (firstWin.get(winner.driverId) === raceId) out.push("The winner's first Grand Prix win");
	else if (retired && lastWin.get(winner.driverId) === raceId) out.push("The winner's last Grand Prix win");
	if (teamFirstWin.get(winner.constructorId) === raceId && out.length < 2) out.push("The winning team's first Grand Prix win");
	if (winner.grid === 0 || winner.grid == null) {
		if (race.year >= 1970 && winner.grid === 0) out.push("Won from the pit lane");
	} else if (winner.grid >= 6) out.push(`The winner started from P${winner.grid}`);
	const atCircuit = db.racesByCircuit.get(race.circuitId) ?? [];
	if (atCircuit.length === 1) out.push("The only championship race held at this circuit");
	else if (atCircuit[0]?.id === raceId) out.push("The first championship race held at this circuit");
	else if (atCircuit.at(-1)?.id === raceId && race.year < lastYear) out.push("The last championship race held at this circuit");
	if (race.hasSprint) out.push("A sprint weekend");
	return out.slice(0, 2);
}
