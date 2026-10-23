// Team-mate head-to-heads: every race two drivers drove for the same constructor.
// Works on any Db, so universes get their own comparisons.
//
// Definitions (shown on the pages too):
// - Races together: both entered the race for the same constructor (non-starters included).
// - Qualifying: the better qualifying classification (F1DB); when either driver has none,
//   the better grid slot. Races decided on the grid are counted in `gridDecided`.
// - Race: both took the start; the better classified finish wins, a classified finisher beats
//   one who wasn't classified, and races where neither was classified don't count.
// - Points: race plus sprint points scored at those weekends.

import { isStart, type Db, type Race, type Result } from "./dataset.ts";
import { driverRef, raceRef, teamRef, type DriverRef, type RaceRef, type TeamRef } from "./views.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Side = {
	/** Best classification of the driver's cars in the race (shared drives can give several). */
	position: number | null;
	positionText: string;
	grid: number | null;
	qualifying: number | null;
	points: number;
	started: boolean;
	pole: boolean;
};

export type SharedRace = { race: Race; team: string; a: Side; b: Side; quali: "a" | "b" | null; qualiBasis: "qualifying" | "grid" | null; finish: "a" | "b" | null };

function side(db: Db, raceId: number, rows: Result[], driverId: string): Side {
	const best = rows[0];
	const sprint = (db.sprintByRace.get(raceId) ?? []).filter((s) => s.driverId === driverId).reduce((a, s) => a + s.points, 0);
	const quals = rows.map((r) => r.qualifying).filter((q): q is number => q != null);
	const grids = rows.map((r) => r.grid).filter((g): g is number => g != null && g > 0);
	return {
		position: best.position,
		positionText: best.positionText,
		grid: grids.length ? Math.min(...grids) : null,
		qualifying: quals.length ? Math.min(...quals) : null,
		points: r2(rows.reduce((a, r) => a + r.points, 0) + sprint),
		started: rows.some(isStart),
		pole: rows.some((r) => r.pole),
	};
}

function compareQuali(a: Side, b: Side): Pick<SharedRace, "quali" | "qualiBasis"> {
	if (a.qualifying != null && b.qualifying != null && a.qualifying !== b.qualifying) return { quali: a.qualifying < b.qualifying ? "a" : "b", qualiBasis: "qualifying" };
	if (a.grid != null && b.grid != null && a.grid !== b.grid) return { quali: a.grid < b.grid ? "a" : "b", qualiBasis: "grid" };
	return { quali: null, qualiBasis: null };
}

/** Who finished ahead (see the definition at the top), or null when it doesn't count. */
export function finishedAhead(a: Pick<Side, "position" | "started">, b: Pick<Side, "position" | "started">): "a" | "b" | null {
	if (!a.started || !b.started) return null;
	if (a.position != null && b.position != null) return a.position === b.position ? null : a.position < b.position ? "a" : "b";
	if (a.position != null) return "a";
	if (b.position != null) return "b";
	return null;
}

/** Rows of one driver in one race, best classification first (resultsByRace is display-sorted). */
const rowsOf = (db: Db, raceId: number, driverId: string) => (db.resultsByRace.get(raceId) ?? []).filter((r) => r.driverId === driverId);

/** Every race in which `a` and `b` drove for the same constructor, in order. */
export function sharedRaces(db: Db, a: string, b: string): SharedRace[] {
	const out: SharedRace[] = [];
	const seen = new Set<number>();
	for (const r of db.resultsByDriver.get(a) ?? []) {
		if (seen.has(r.raceId)) continue;
		seen.add(r.raceId);
		const rowsA = rowsOf(db, r.raceId, a);
		const teamsA = new Set(rowsA.map((x) => x.constructorId));
		const rowsB = rowsOf(db, r.raceId, b).filter((x) => teamsA.has(x.constructorId));
		if (!rowsB.length) continue;
		const team = rowsB[0].constructorId;
		const sa = side(db, r.raceId, rowsA.filter((x) => x.constructorId === team), a);
		const sb = side(db, r.raceId, rowsB, b);
		out.push({ race: db.raceById.get(r.raceId)!, team, a: sa, b: sb, ...compareQuali(sa, sb), finish: finishedAhead(sa, sb) });
	}
	return out;
}

export type Duel = { a: number; b: number };
export type PairTotals = {
	races: number;
	quali: Duel;
	/** Qualifying duels settled on grid position because a qualifying classification was missing. */
	gridDecided: number;
	race: Duel;
	points: Duel;
	wins: Duel;
	podiums: Duel;
	poles: Duel;
};

export function pairTotals(rows: SharedRace[]): PairTotals {
	const t: PairTotals = {
		races: rows.length,
		quali: { a: 0, b: 0 },
		gridDecided: 0,
		race: { a: 0, b: 0 },
		points: { a: 0, b: 0 },
		wins: { a: 0, b: 0 },
		podiums: { a: 0, b: 0 },
		poles: { a: 0, b: 0 },
	};
	for (const r of rows) {
		if (r.quali) t.quali[r.quali]++;
		if (r.qualiBasis === "grid") t.gridDecided++;
		if (r.finish) t.race[r.finish]++;
		for (const k of ["a", "b"] as const) {
			const s = r[k];
			t.points[k] += s.points;
			if (s.position === 1) t.wins[k]++;
			if (s.position != null && s.position <= 3) t.podiums[k]++;
			if (s.pole) t.poles[k]++;
		}
	}
	t.points = { a: r2(t.points.a), b: r2(t.points.b) };
	return t;
}

/* -------------------------------------------------- a driver's team-mates --- */

export type TeammateRow = PairTotals & { driver: DriverRef; teams: TeamRef[]; firstYear: number; lastYear: number };
export type DriverTeammatesView = { driver: DriverRef; rows: TeammateRow[]; totals: PairTotals };

/** All of a driver's team-mates, most races together first; `a` is always the driver. */
export function driverTeammatesView(db: Db, id: string): DriverTeammatesView | null {
	if (!db.drivers.has(id)) return null;
	const mates = new Set<string>();
	for (const r of db.resultsByDriver.get(id) ?? [])
		for (const o of db.resultsByRace.get(r.raceId) ?? []) if (o.constructorId === r.constructorId && o.driverId !== id) mates.add(o.driverId);
	const all: SharedRace[] = [];
	const rows: TeammateRow[] = [];
	for (const m of mates) {
		const shared = sharedRaces(db, id, m);
		if (!shared.length) continue;
		all.push(...shared);
		rows.push({
			driver: driverRef(db, m),
			teams: [...new Set(shared.map((s) => s.team))].map((t) => teamRef(db, t)),
			firstYear: shared[0].race.year,
			lastYear: shared[shared.length - 1].race.year,
			...pairTotals(shared),
		});
	}
	rows.sort((a, b) => b.races - a.races || b.lastYear - a.lastYear || a.driver.name.localeCompare(b.driver.name));
	return { driver: driverRef(db, id), rows, totals: pairTotals(all) };
}

/* ------------------------------------------------------------- a pairing --- */

export type PairSide = Pick<Side, "position" | "grid" | "qualifying" | "points" | "pole"> & { text: string };
export type TeammatePairView = {
	a: DriverRef;
	b: DriverRef;
	teams: TeamRef[];
	firstYear: number;
	lastYear: number;
	totals: PairTotals;
	/** Totals in real history, when a universe changed them. */
	realTotals: PairTotals | null;
	seasons: (PairTotals & { year: number; teams: TeamRef[] })[];
	races: { race: RaceRef; team: TeamRef; a: PairSide; b: PairSide; quali: "a" | "b" | null; qualiBasis: "qualifying" | "grid" | null; finish: "a" | "b" | null }[];
};

const pairSide = (s: Side): PairSide => ({ position: s.position, grid: s.grid, qualifying: s.qualifying, points: s.points, pole: s.pole, text: s.positionText });

export function teammatePairView(db: Db, a: string, b: string, base?: Db): TeammatePairView | null {
	if (a === b || !db.drivers.has(a) || !db.drivers.has(b)) return null;
	const shared = sharedRaces(db, a, b);
	if (!shared.length) return null;
	const totals = pairTotals(shared);
	const real = base && base.drivers.has(a) && base.drivers.has(b) ? pairTotals(sharedRaces(base, a, b)) : null;
	const byYear = new Map<number, SharedRace[]>();
	for (const s of shared) (byYear.get(s.race.year) ?? byYear.set(s.race.year, []).get(s.race.year)!).push(s);
	return {
		a: driverRef(db, a),
		b: driverRef(db, b),
		teams: [...new Set(shared.map((s) => s.team))].map((t) => teamRef(db, t)),
		firstYear: shared[0].race.year,
		lastYear: shared[shared.length - 1].race.year,
		totals,
		realTotals: real && JSON.stringify(real) !== JSON.stringify(totals) ? real : null,
		seasons: [...byYear].map(([year, rows]) => ({ year, teams: [...new Set(rows.map((s) => s.team))].map((t) => teamRef(db, t)), ...pairTotals(rows) })),
		races: shared.map((s) => ({
			race: raceRef(db, s.race),
			team: teamRef(db, s.team),
			a: pairSide(s.a),
			b: pairSide(s.b),
			quali: s.quali,
			qualiBasis: s.qualiBasis,
			finish: s.finish,
		})),
	};
}

/** Races two drivers spent as team-mates (cheap check for "were they team-mates?"). */
export function racesAsTeammates(db: Db, a: string, b: string): number {
	return sharedRaces(db, a, b).length;
}
