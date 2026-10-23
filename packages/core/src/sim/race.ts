// Re-running a real race: the real entry list (and real grid, unless the
// universe changed who's in which car or how fast they are), with each car's
// and driver's pace from the performance model and the season's real
// reliability, plus seeded randomness. Deterministic for a given seed.

import { isStart, type Db, type Race, type Result } from "../f1/dataset.ts";
import { simulateEvent, type EventResult, type SimEntry } from "./engine.ts";
import { ageAt, MAX_AGE, MIN_AGE } from "./invariants.ts";
import { NO_MODIFIERS, type Modifiers } from "./modifiers.ts";
import { stream } from "./random.ts";
import { carFor, deriveRatings, dnfAt, skillAt } from "./ratings.ts";

export { rng, randomSeed } from "./random.ts";

export type SimOptions = {
	seed: number;
	/** 0 = form book, 1 = normal race day, 2 = chaos. */
	chaos: number;
	/** Scale mechanical/accident retirements (0 = bulletproof, 1 = era-realistic). */
	reliability: number;
};

export const DEFAULT_SIM: Omit<SimOptions, "seed"> = { chaos: 1, reliability: 1 };

/** Can this driver take part in a race on `date`? Alive, and 17–45. */
export function canRace(base: Pick<Db, "drivers">, driverId: string, date: string): boolean {
	const d = base.drivers.get(driverId);
	if (!d) return false;
	if (d.dateOfDeath && d.dateOfDeath < date) return false;
	const age = ageAt(d.dateOfBirth, date);
	return age != null && age >= MIN_AGE && age <= MAX_AGE;
}

/** One entry per driver: shared drives (1950s) keep only the driver's own car. */
function dedupe(list: Result[]): Result[] {
	const byDriver = new Map<string, Result>();
	for (const r of list) {
		const prev = byDriver.get(r.driverId);
		if (!prev || (prev.sharedCar && !r.sharedCar)) byDriver.set(r.driverId, r);
	}
	return list.filter((r) => byDriver.get(r.driverId) === r);
}

export type RealRaceSim = EventResult & { nonStarters: Result[]; modified: boolean };

export function simulateRealRace(base: Db, race: Race, opts: SimOptions, mods: Modifiers = NO_MODIFIERS): RealRaceSim {
	const ratings = deriveRatings(base);
	const y = race.year;
	const real = dedupe(base.resultsByRace.get(race.id) ?? []);
	let modified = false;

	// seat swaps for the season, applied as a permutation of drivers
	// seat (original driver) -> who drives it now
	const swap = new Map(real.map((r) => [r.driverId, r.driverId]));
	const seatOf = (d: string) => [...swap.entries()].find(([, v]) => v === d)?.[0];
	for (const s of mods.swaps.get(y) ?? []) {
		const sa = seatOf(s.driverA);
		const sb = seatOf(s.driverB);
		if (sa && sb) {
			swap.set(sa, s.driverB);
			swap.set(sb, s.driverA);
		} else if (sa && canRace(base, s.driverB, race.date)) swap.set(sa, s.driverB);
		else if (sb && canRace(base, s.driverA, race.date)) swap.set(sb, s.driverA);
	}
	const seated = real
		.map((r) => (swap.has(r.driverId) && swap.get(r.driverId) !== r.driverId ? ((modified = true), { ...r, driverId: swap.get(r.driverId)!, number: null }) : r))
		.filter((r) => !mods.removed(r.driverId, y) || ((modified = true), false));

	const starters = seated.filter(isStart);
	const nonStarters = seated.filter((r) => !isStart(r)).map((r) => ({ ...r, points: 0, fastestLap: false }));
	const entries: SimEntry[] = starters.map((r) => {
		const dd = mods.driverDelta(r.driverId, y);
		const td = mods.teamDelta(r.constructorId, y);
		if (dd || td) modified = true;
		return {
			driverId: r.driverId,
			constructorId: r.constructorId,
			engineId: r.engineId,
			tyreId: r.tyreId,
			number: r.number,
			pace: carFor(ratings, r.constructorId, r.driverId, y) + td + skillAt(ratings, base, r.driverId, y) + dd,
			dnf: dnfAt(ratings, r.constructorId, y),
			grid: r.grid,
			qualifying: r.qualifying,
		};
	});
	const season = ratings.seasons.get(y);
	const ev = simulateEvent(stream(opts.seed, race.id), race, entries, {
		chaos: opts.chaos,
		reliability: opts.reliability,
		// a different line-up or a faster car needs a new grid
		qualify: modified,
		reasons: season?.reasons ?? ["Engine"],
		sprint: race.hasSprint,
		winnerTime: (base.resultsByRace.get(race.id) ?? []).find((r) => r.position === 1)?.time ?? null,
	});
	return { ...ev, results: [...ev.results, ...nonStarters], nonStarters, modified };
}

/**
 * Simulate one real race. Returns a full classification (same entrants as
 * reality; non-starters stay as they were). Points are left at 0 for the caller to score.
 */
export function simulateRace(base: Db, race: Race, opts: SimOptions, mods: Modifiers = NO_MODIFIERS): Result[] {
	return simulateRealRace(base, race, opts, mods).results;
}
