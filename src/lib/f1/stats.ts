// Career aggregates and season tables, computed from race results so they stay
// correct for any universe.

import { completedRaces, isStart, type Db, type Race, type Result, type StandingRow } from "./dataset.ts";
import { computeStandings, constructorAdjustment, constructorRaceScore, eraRules, type EraRules } from "./points.ts";

export type Career = {
	id: string;
	entries: number;
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	fastestLaps: number;
	points: number;
	titles: number;
	sprintWins: number;
	oneTwos: number;
	bestFinish: number | null;
	firstYear: number;
	lastYear: number;
	seasons: number;
	firstRaceId: number;
	lastRaceId: number;
};

const memo = new WeakMap<Db, Map<string, unknown>>();
function cached<T>(db: Db, key: string, compute: () => T): T {
	let m = memo.get(db);
	if (!m) memo.set(db, (m = new Map()));
	if (!m.has(key)) m.set(key, compute());
	return m.get(key) as T;
}

export function rulesFor(db: Db, year: number): EraRules {
	return db.rulesOverride?.get(year) ?? eraRules(year);
}

/** Season standings: official tables unless the universe recomputed the season. */
export function seasonStandings(db: Db, year: number): { drivers: StandingRow[]; constructors: StandingRow[] } {
	return {
		drivers: db.driverStandings.get(year) ?? [],
		constructors: db.constructorStandings.get(year) ?? [],
	};
}

/** Championship table after a given round (always computed from results). */
export function standingsAfter(db: Db, race: Race) {
	return cached(db, `after:${race.id}`, () => {
		const races = completedRaces(db, race.year).filter((r) => r.round <= race.round);
		// Real-world penalties (e.g. 1997 exclusion) don't apply to simulated seasons.
		const simulated = (db as Db & { sim?: { years: number[] } }).sim?.years.includes(race.year);
		return computeStandings(db, races, rulesFor(db, race.year), simulated ? 0 : race.year);
	});
}

function aggregate(db: Db, id: string, results: Result[], sprints: Result[], titles: number, isTeam: boolean): Career {
	const raceIds = new Set<number>();
	const startIds = new Set<number>();
	const winIds = new Set<number>();
	const poleIds = new Set<number>();
	const flIds = new Set<number>();
	const years = new Set<number>();
	let points = 0;
	let best: number | null = null;
	const finishesByRace = new Map<number, number[]>();
	for (const r of results) {
		raceIds.add(r.raceId);
		years.add(db.raceById.get(r.raceId)!.year);
		points += r.points;
		if (isStart(r)) startIds.add(r.raceId);
		if (r.position === 1) winIds.add(r.raceId);
		if (r.pole) poleIds.add(r.raceId);
		if (r.fastestLap) flIds.add(r.raceId);
		if (r.position != null) {
			best = best == null ? r.position : Math.min(best, r.position);
			if (isTeam) {
				const list = finishesByRace.get(r.raceId) ?? [];
				list.push(r.position);
				finishesByRace.set(r.raceId, list);
			}
		}
	}
	let sprintWins = 0;
	for (const s of sprints) {
		points += s.points;
		if (s.position === 1) sprintWins++;
	}
	let oneTwos = 0;
	for (const list of finishesByRace.values()) if (list.includes(1) && list.includes(2)) oneTwos++;
	const ordered = [...raceIds].sort((a, b) => {
		const ra = db.raceById.get(a)!;
		const rb = db.raceById.get(b)!;
		return ra.year - rb.year || ra.round - rb.round;
	});
	const yearList = [...years].sort((a, b) => a - b);
	return {
		id,
		entries: raceIds.size,
		starts: startIds.size,
		wins: winIds.size,
		podiums: results.filter((r) => r.position != null && r.position <= 3).length,
		poles: poleIds.size,
		fastestLaps: flIds.size,
		points: Math.round(points * 100) / 100,
		titles,
		sprintWins,
		oneTwos,
		bestFinish: best,
		firstYear: yearList[0],
		lastYear: yearList[yearList.length - 1],
		seasons: yearList.length,
		firstRaceId: ordered[0],
		lastRaceId: ordered[ordered.length - 1],
	};
}

const simulatedYear = (db: Db, year: number) => Boolean((db as Db & { sim?: { years: number[] } }).sim?.years.includes(year));

/**
 * Official constructors' points per race (see constructorRaceScore), with each
 * season's penalties applied at the constructor's last race of that season:
 * exclusions zero the season, deductions are subtracted. Summed, they give the
 * championship points scored before dropped scores.
 */
export function constructorPointsByRace(db: Db): Map<number, { race: Map<string, number>; sprint: Map<string, number> }> {
	return cached(db, "constructorPointsByRace", () => {
		const out = new Map<number, { race: Map<string, number>; sprint: Map<string, number> }>();
		for (const year of db.years) {
			const races = completedRaces(db, year);
			const lastRace = new Map<string, number>();
			const excluded = new Set<string>();
			for (const race of races) {
				const score = constructorRaceScore(race, db.resultsByRace.get(race.id) ?? [], db.sprintByRace.get(race.id) ?? [], rulesFor(db, year));
				out.set(race.id, score);
				for (const id of [...score.race.keys(), ...score.sprint.keys()]) lastRace.set(id, race.id);
			}
			if (simulatedYear(db, year)) continue;
			for (const [id, raceId] of lastRace) {
				const adj = constructorAdjustment(year, id);
				if (adj.excluded) excluded.add(id);
				else if (adj.deduction) {
					const s = out.get(raceId)!;
					s.race.set(id, (s.race.get(id) ?? 0) - adj.deduction);
				}
			}
			for (const race of races) for (const id of excluded) {
				const s = out.get(race.id)!;
				if (s.race.has(id)) s.race.set(id, 0);
				if (s.sprint.has(id)) s.sprint.set(id, 0);
			}
		}
		return out;
	});
}

function titleCounts(map: Map<number, StandingRow[]>) {
	const counts = new Map<string, number>();
	for (const rows of map.values()) for (const r of rows) if (r.champion) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
	return counts;
}

export function driverCareers(db: Db): Map<string, Career> {
	return cached(db, "driverCareers", () => {
		const titles = titleCounts(db.driverStandings);
		const out = new Map<string, Career>();
		for (const [id, results] of db.resultsByDriver) {
			out.set(id, aggregate(db, id, results, db.sprintByDriver.get(id) ?? [], titles.get(id) ?? 0, false));
		}
		return out;
	});
}

export function constructorCareers(db: Db): Map<string, Career> {
	return cached(db, "constructorCareers", () => {
		const titles = titleCounts(db.constructorStandings);
		const byRace = constructorPointsByRace(db);
		const out = new Map<string, Career>();
		for (const [id, results] of db.resultsByConstructor) {
			const c = aggregate(db, id, results, db.sprintByConstructor.get(id) ?? [], titles.get(id) ?? 0, true);
			// official constructors' points, not the sum of every car's driver points
			let points = 0;
			for (const raceId of new Set(results.map((r) => r.raceId))) {
				const s = byRace.get(raceId);
				points += (s?.race.get(id) ?? 0) + (s?.sprint.get(id) ?? 0);
			}
			c.points = Math.round(points * 100) / 100;
			out.set(id, c);
		}
		return out;
	});
}

export const winnerOf = (db: Db, raceId: number) => db.resultsByRace.get(raceId)?.find((r) => r.position === 1);
export const poleOf = (db: Db, raceId: number) =>
	db.resultsByRace.get(raceId)?.find((r) => r.pole) ??
	db.qualifyingByRace.get(raceId)?.find((q) => q.position === 1);

/** Driver's age in years on a given ISO date. */
export function ageOn(dob: string | null, date: string): number | null {
	if (!dob) return null;
	const b = new Date(dob);
	const d = new Date(date);
	let age = d.getUTCFullYear() - b.getUTCFullYear();
	if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
	return age;
}

export function ageDays(dob: string, date: string): number {
	return Math.round((Date.parse(date) - Date.parse(dob)) / 86400000);
}
