// A universe is real history plus an ordered list of changes. Applying it
// produces a new F1Data; every page then renders from that exactly as it does
// for reality. Changes are small (a few KB) so universes are cheap to store and share.
//
// Two families of change:
//   - events, applied in list order: points systems, race/season/history
//     simulations, result edits, removals.
//   - tinkering (performance offsets, seat swaps and moves, career overrides),
//     which are order-independent and shape every simulation in the universe.

import { indexData, seasonInProgress, type Constructor, type Db, type Driver, type F1Data, type QualifyingRow, type Race, type Result } from "../f1/dataset.ts";
import { computeStandings, describeSystem, eraRules, halfPoints, resolvePointsSystem, scoreRace, systemRules, type EraRules, type PointsSystem } from "../f1/points.ts";
import { simulateHistory, type Progress, type SeasonReport } from "../sim/history.ts";
import {
	buildModifiers,
	type CareerOverride,
	type DriverMove,
	type DriverPerformance,
	type DriverSwap,
	type HistorySim,
	type TeamPerformance,
} from "../sim/modifiers.ts";
import { hash } from "../sim/random.ts";
import { simulateRealRace } from "../sim/race.ts";

export type Change =
	/** `system` is a preset id, or "custom" with the system itself in `custom`. */
	| { id: string; kind: "points"; fromYear: number; toYear: number; system: string; custom?: PointsSystem }
	| { id: string; kind: "race-sim"; raceId: number; seed: number; chaos: number; reliability: number }
	| { id: string; kind: "season-sim"; year: number; fromRound: number; seed: number; chaos: number; reliability: number }
	| { id: string; kind: "race-edit"; raceId: number; order: string[]; retired: string[] }
	| { id: string; kind: "remove-driver"; driverId: string; fromYear: number; toYear: number }
	| ({ id: string; kind: "history-sim" } & HistorySim)
	| ({ id: string; kind: "driver-performance" } & DriverPerformance)
	| ({ id: string; kind: "team-performance" } & TeamPerformance)
	| ({ id: string; kind: "driver-swap" } & DriverSwap)
	| ({ id: string; kind: "driver-move" } & DriverMove)
	| ({ id: string; kind: "career" } & CareerOverride);

export type ChangeKind = Change["kind"];

export type Universe = {
	id: string;
	name: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
	changes: Change[];
};

/** What the simulators did, for the Lab's previews and checks. */
export type SimSummary = {
	/** Seasons produced by a simulator (not just re-scored or edited). */
	years: number[];
	/** Invariant violations (should always be empty). */
	violations: string[];
	/** Per-season stats from dynamic history runs. */
	seasons: SeasonReport[];
	/** Drivers and teams the simulation invented. */
	generatedDrivers: number;
	generatedTeams: number;
};

export type UniverseDb = Db & { sim?: SimSummary };

/** Apply a (possibly partial) finishing order: unlisted finishers follow in their original order. */
const classify = (results: Result[], listedOrder: string[], retired: Set<string>): Result[] => {
	const listed = new Set(listedOrder);
	const order = [...listedOrder, ...results.filter((r) => r.position != null && !listed.has(r.driverId)).map((r) => r.driverId)];
	const byDriver = new Map(results.map((r) => [r.driverId, r]));
	const realWinnerTime = results.find((r) => r.position === 1)?.time ?? null;
	const classified: Result[] = [];
	for (const id of order) {
		const r = byDriver.get(id);
		if (!r || retired.has(id)) continue;
		const pos = classified.length + 1;
		const moved = r.position !== pos;
		classified.push({
			...r,
			position: pos,
			positionText: String(pos),
			time: pos === 1 ? (r.position === 1 ? r.time : realWinnerTime) : moved ? null : r.time,
			gap: pos === 1 ? null : moved ? null : r.gap,
			reasonRetired: null,
		});
	}
	const others = results
		.filter((r) => !classified.some((c) => c.driverId === r.driverId))
		.map((r) =>
			retired.has(r.driverId) && r.position != null
				? { ...r, position: null, positionText: "DNF", time: null, gap: null, reasonRetired: r.reasonRetired ?? "Retired" }
				: r,
		);
	return [...classified, ...others];
};

function removeDriver(results: Result[], driverId: string): Result[] {
	let pos = 0;
	return results
		.filter((r) => r.driverId !== driverId)
		.map((r) => {
			if (r.position == null) return r;
			pos++;
			return pos === r.position ? r : { ...r, position: pos, positionText: String(pos) };
		});
}

const applyCache = new Map<string, UniverseDb>();

/** Apply a universe to the real-history data. Memoised per universe revision. */
export function applyUniverse(base: Db, universe: Pick<Universe, "id" | "updatedAt" | "changes">): UniverseDb {
	const key = `${universe.id}@${universe.updatedAt}`;
	const hit = applyCache.get(key);
	if (hit) return hit;
	const db = buildUniverse(base, universe.changes);
	applyCache.set(key, db);
	if (applyCache.size > 8) applyCache.delete(applyCache.keys().next().value!);
	return db;
}

/** Run every change against real history. */
export function universeDiff(base: Db, changes: Change[], onYear?: Progress): UniverseDiff {
	const mods = buildModifiers(changes);
	const raceById = new Map<number, Race>(base.raceById);
	const results = new Map<number, Result[]>(base.resultsByRace);
	const sprints = new Map<number, Result[]>(base.sprintByRace);
	const qualifying = new Map<number, QualifyingRow[]>(base.qualifyingByRace);
	const fastestLaps = new Map(base.fastestLapByRace);
	const extraDrivers = new Map<string, Driver>();
	const extraTeams = new Map<string, Constructor>();
	const touchedRaces = new Set<number>();
	const touchedSprints = new Set<number>();
	const touchedYears = new Set<number>();
	const simYears = new Set<number>();
	const pointsChanges: { fromYear: number; toYear: number; system: string; custom?: PointsSystem }[] = [];
	const sim: SimSummary = { years: [], violations: [], seasons: [], generatedDrivers: 0, generatedTeams: 0 };

	const yearOf = (raceId: number) => raceById.get(raceId)!.year;
	const setRace = (raceId: number, list: Result[]) => {
		results.set(raceId, list);
		touchedRaces.add(raceId);
		touchedYears.add(yearOf(raceId));
		const fl = list.find((r) => r.fastestLap);
		const prev = fastestLaps.get(raceId);
		if (fl && prev?.driverId !== fl.driverId) fastestLaps.set(raceId, { raceId, driverId: fl.driverId, lap: null, time: null });
		if (!fl) fastestLaps.delete(raceId);
	};
	const setSimulated = (raceId: number, ev: { results: Result[]; qualifying: QualifyingRow[] | null; sprint: Result[] | null }) => {
		setRace(raceId, ev.results);
		simYears.add(yearOf(raceId));
		if (ev.qualifying) qualifying.set(raceId, ev.qualifying);
		if (ev.sprint) {
			sprints.set(raceId, ev.sprint);
			touchedSprints.add(raceId);
		}
	};
	const completed = (year: number) =>
		[...raceById.values()].filter((r) => r.year === year && results.has(r.id)).sort((a, b) => a.round - b.round);

	// seasons a season-level simulation re-runs anyway (a seat swap there needs no extra run)
	const seasonSimmed = (year: number) =>
		changes.some((c) => (c.kind === "season-sim" && c.year === year && c.fromRound <= 1) || (c.kind === "history-sim" && year >= c.fromYear && year <= c.toYear));

	for (const change of changes) {
		switch (change.kind) {
			case "points":
				pointsChanges.push(change);
				break;
			case "race-sim": {
				const race = raceById.get(change.raceId);
				if (race && base.resultsByRace.has(race.id)) setSimulated(race.id, simulateRealRace(base, race, change, mods));
				break;
			}
			case "season-sim": {
				for (const race of completed(change.year).filter((r) => r.round >= change.fromRound && base.resultsByRace.has(r.id))) {
					setSimulated(race.id, simulateRealRace(base, race, change, mods));
				}
				break;
			}
			case "history-sim": {
				const out = simulateHistory(base, change, mods, onYear);
				for (const r of out.races) raceById.set(r.id, r);
				for (const d of out.drivers) extraDrivers.set(d.id, d);
				for (const t of out.constructors) extraTeams.set(t.id, t);
				for (const [id, list] of out.results) {
					setSimulated(id, { results: list, qualifying: out.qualifying.get(id) ?? null, sprint: out.sprints.get(id) ?? null });
				}
				for (const y of out.years) simYears.add(y);
				sim.violations.push(...out.violations);
				sim.seasons = [...sim.seasons.filter((s) => !out.seasons.some((o) => o.year === s.year)), ...out.seasons];
				sim.generatedDrivers += out.drivers.length;
				sim.generatedTeams += out.constructors.length;
				break;
			}
			case "driver-swap": {
				if (seasonSimmed(change.year)) break;
				const seed = change.seed ?? hash("swap", change.year, change.driverA, change.driverB);
				for (const race of completed(change.year).filter((r) => base.resultsByRace.has(r.id))) {
					setSimulated(race.id, simulateRealRace(base, race, { seed, chaos: 1, reliability: 1 }, mods));
				}
				break;
			}
			case "race-edit": {
				const list = results.get(change.raceId);
				if (list) setRace(change.raceId, classify(list, change.order, new Set(change.retired)));
				break;
			}
			case "remove-driver": {
				for (let y = change.fromYear; y <= change.toYear; y++) {
					for (const race of completed(y)) {
						const list = results.get(race.id)!;
						if (list.some((r) => r.driverId === change.driverId)) setRace(race.id, removeDriver(list, change.driverId));
						const sp = sprints.get(race.id);
						if (sp?.some((r) => r.driverId === change.driverId)) {
							sprints.set(race.id, removeDriver(sp, change.driverId));
							touchedSprints.add(race.id);
						}
					}
				}
				break;
			}
			// tinkering changes act through `mods`
			case "driver-performance":
			case "team-performance":
			case "driver-move":
			case "career":
				break;
		}
	}

	const races = [...raceById.values()].sort((a, b) => a.year - b.year || a.round - b.round);
	const years = [...new Set(races.map((r) => r.year))];

	// scoring rules: later points changes win where they overlap
	const rulesOverride = new Map<number, EraRules>();
	for (const c of pointsChanges) {
		const system = resolvePointsSystem(c.system, c.custom);
		if (!system) continue;
		for (const y of years) {
			if (y < c.fromYear || y > c.toYear) continue;
			rulesOverride.set(y, systemRules(y, system));
			touchedYears.add(y);
		}
	}

	// re-score: edited races under their era's system; whole seasons under an overridden system
	for (const year of touchedYears) {
		const rules = rulesOverride.get(year) ?? eraRules(year);
		const done = completed(year);
		const last = done[done.length - 1];
		const rescoreAll = rulesOverride.has(year);
		for (const race of done) {
			if (rescoreAll || touchedRaces.has(race.id)) {
				const double = rules.doublePointsFinalRace && race.id === last?.id;
				results.set(race.id, scoreRace(results.get(race.id)!, rules.system, { double, half: halfPoints(race) }));
			}
			if ((rescoreAll || touchedSprints.has(race.id)) && sprints.has(race.id)) {
				sprints.set(race.id, scoreRace(sprints.get(race.id)!, rules.system, { sprint: true }));
			}
		}
	}

	const withResults = years.filter((y) => races.some((r) => r.year === y && results.has(r.id)));
	sim.years = [...simYears].sort((a, b) => a - b);
	const changed = <T>(map: Map<number, T>, real: Map<number, T>) => [...map].filter(([id, v]) => real.get(id) !== v);
	return {
		meta: {
			...base.meta,
			firstYear: Math.min(base.meta.firstYear, withResults[0] ?? base.meta.firstYear),
			lastCompletedYear: Math.max(base.meta.lastCompletedYear, withResults[withResults.length - 1] ?? 0),
		},
		races: races.filter((r) => !base.raceById.has(r.id)),
		results: changed(results, base.resultsByRace),
		sprints: changed(sprints, base.sprintByRace),
		qualifying: changed(qualifying, base.qualifyingByRace),
		fastestLaps: [...fastestLaps.values()],
		drivers: [...extraDrivers.values()],
		constructors: [...extraTeams.values()],
		simulatedYears: [...simYears],
		rulesOverride: [...rulesOverride],
		modifiedYears: [...touchedYears],
		sim,
	};
}

/**
 * The difference a universe makes to real history, as plain structured-clone
 * friendly data: small for small universes, and cheap to post from a worker.
 */
export type UniverseDiff = {
	meta: F1Data["meta"];
	/** Races that don't exist in reality (seasons beyond the real data). */
	races: Race[];
	results: [number, Result[]][];
	sprints: [number, Result[]][];
	qualifying: [number, QualifyingRow[]][];
	fastestLaps: F1Data["fastestLaps"];
	drivers: Driver[];
	constructors: Constructor[];
	simulatedYears: number[];
	rulesOverride: [number, EraRules][];
	modifiedYears: number[];
	sim: SimSummary;
};

/** Real history plus a diff, as the plain data `indexData` takes. */
export function mergeDiff(base: Db, diff: UniverseDiff): F1Data & { sim: SimSummary } {
	const merge = <T>(real: Map<number, T>, changed: [number, T][]) => {
		const m = new Map(real);
		for (const [id, v] of changed) m.set(id, v);
		return [...m.values()].flat() as T extends (infer U)[] ? U[] : never;
	};
	const simYears = new Set(diff.simulatedYears);
	return {
		...base,
		meta: diff.meta,
		drivers: diff.drivers.length ? new Map([...base.drivers, ...diff.drivers.map((d) => [d.id, d] as const)]) : base.drivers,
		constructors: diff.constructors.length ? new Map([...base.constructors, ...diff.constructors.map((c) => [c.id, c] as const)]) : base.constructors,
		races: diff.races.length ? [...base.races, ...diff.races].sort((a, b) => a.year - b.year || a.round - b.round) : base.races,
		results: merge(base.resultsByRace, diff.results),
		sprintResults: merge(base.sprintByRace, diff.sprints),
		qualifying: merge(base.qualifyingByRace, diff.qualifying),
		fastestLaps: diff.fastestLaps,
		driverStandings: new Map(base.driverStandings),
		constructorStandings: new Map(base.constructorStandings),
		upcomingEntrants: base.upcomingEntrants.filter((e) => !simYears.has(e.year)),
		rulesOverride: new Map(diff.rulesOverride),
		modifiedYears: new Set(diff.modifiedYears),
		sim: diff.sim,
	};
}

/** Index universe data and compute the standings of every season it changed. */
export function finishUniverse(data: F1Data & { sim?: SimSummary }): UniverseDb {
	const db: UniverseDb = indexData(data);
	const simYears = new Set(data.sim?.years ?? []);
	for (const year of data.modifiedYears ?? []) {
		const races = (db.racesByYear.get(year) ?? []).filter((r) => db.resultsByRace.has(r.id));
		if (!races.length) continue;
		const rules = data.rulesOverride?.get(year) ?? eraRules(year);
		// simulated seasons don't inherit real-world penalties (e.g. 1997 exclusion): pass no year
		const standings = computeStandings(db, races, rules, simYears.has(year) ? 0 : year);
		// Nobody is champion until the last round has been run.
		const crown = (rows: typeof standings.drivers) => (seasonInProgress(db, year) ? rows.map((r) => ({ ...r, champion: false })) : rows);
		db.driverStandings.set(year, crown(standings.drivers));
		db.constructorStandings.set(year, eraRules(year).hasConstructorsChampionship ? crown(standings.constructors) : []);
	}
	db.sim = data.sim;
	return db;
}

function buildUniverse(base: Db, changes: Change[]): UniverseDb {
	return finishUniverse(mergeDiff(base, universeDiff(base, changes)));
}

const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
const signed = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 10) / 10}`;

export function describeChange(base: Pick<Db, "raceById" | "grandsPrix" | "drivers" | "constructors">, c: Change): { title: string; detail: string } {
	const raceName = (id: number) => {
		const r = base.raceById.get(id);
		return r ? `${r.year} ${base.grandsPrix.get(r.grandPrixId)?.name ?? ""} GP` : `Race ${id}`;
	};
	const driver = (id: string) => base.drivers.get(id)?.name ?? id;
	const team = (id: string) => base.constructors.get(id)?.name ?? id;
	const chaos = (x: number) => (x < 0.6 ? "form book" : x > 1.4 ? "chaotic" : "normal");
	switch (c.kind) {
		case "points": {
			const system = resolvePointsSystem(c.system, c.custom);
			if (!c.custom) return { title: `Points: ${system?.name ?? c.system}`, detail: span(c.fromYear, c.toYear) };
			return { title: `Points: ${system?.name ?? "Custom"}`, detail: `${span(c.fromYear, c.toYear)} · ${system ? describeSystem(system) : "not a valid system, ignored"}` };
		}
		case "race-sim":
			return { title: `Re-simulated ${raceName(c.raceId)}`, detail: `${chaos(c.chaos)} race · seed ${c.seed}` };
		case "season-sim":
			return {
				title: `Re-simulated ${c.year}${c.fromRound > 1 ? ` from round ${c.fromRound}` : ""}`,
				detail: `${chaos(c.chaos)} races · seed ${c.seed}`,
			};
		case "race-edit":
			return { title: `Edited ${raceName(c.raceId)}`, detail: `Winner: ${driver(c.order[0])}` };
		case "remove-driver":
			return { title: `Removed ${driver(c.driverId)}`, detail: span(c.fromYear, c.toYear) };
		case "history-sim":
			return {
				title: c.mode === "dynamic" ? `Simulated careers ${span(c.fromYear, c.toYear)}` : `Re-raced ${span(c.fromYear, c.toYear)} with real grids`,
				detail: `${c.mode === "dynamic" ? "Driver market, retirements and team form simulated" : "Real entry lists"} · ${chaos(c.chaos)} races · seed ${c.seed}`,
			};
		case "driver-performance":
			return { title: `${driver(c.driverId)} ${signed(c.delta)} skill`, detail: span(c.fromYear, c.toYear) };
		case "team-performance":
			return { title: `${team(c.constructorId)} ${signed(c.delta)} car pace`, detail: span(c.fromYear, c.toYear) };
		case "driver-swap":
			return { title: `${driver(c.driverA)} and ${driver(c.driverB)} swap seats`, detail: `${c.year}` };
		case "driver-move":
			return { title: `${driver(c.driverId)} drives for ${team(c.constructorId)}`, detail: `${span(c.fromYear, c.toYear)} · simulated careers only` };
		case "career": {
			const parts = [c.debutYear != null && `debuts in ${c.debutYear}`, c.retireAfter != null && `retires after ${c.retireAfter}`].filter(Boolean);
			return { title: `${driver(c.driverId)} ${parts.join(", ") || "career unchanged"}`, detail: "Simulated careers only" };
		}
	}
}

/** Seasons whose champion differs from reality (seasons beyond real history always count). */
export function championChanges(base: Db, db: Db) {
	const out: { year: number; real: string | null; now: string | null; realTeam: string | null; nowTeam: string | null }[] = [];
	for (const year of [...(db.modifiedYears ?? [])].sort((a, b) => a - b)) {
		const real = base.driverStandings.get(year)?.find((r) => r.champion)?.id ?? null;
		const now = db.driverStandings.get(year)?.find((r) => r.champion)?.id ?? null;
		const realTeam = base.constructorStandings.get(year)?.find((r) => r.champion)?.id ?? null;
		const nowTeam = db.constructorStandings.get(year)?.find((r) => r.champion)?.id ?? null;
		if (real !== now || realTeam !== nowTeam) out.push({ year, real, now, realTeam, nowTeam });
	}
	return out;
}
