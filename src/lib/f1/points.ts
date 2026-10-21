// Championship scoring: historic rules per era, alternative points systems for
// universes, and the standings calculation used whenever a season is modified.
// Unmodified seasons display the official F1DB tables; `scripts/validate-standings`
// checks these rules reproduce the official tables from the raw results.

import type { Db, Race, Result, StandingRow } from "./dataset.ts";

/** Count only the best `best` results; `split` applies separately to each half of a season. */
export type DropRule =
	| { type: "all" }
	| { type: "best"; best: number }
	| { type: "split"; firstHalf: number; firstBest: number; secondBest: number };

export type PointsSystem = {
	id: string;
	name: string;
	description: string;
	race: number[];
	sprint?: number[];
	fastestLap?: { points: number; withinTop?: number };
	/** Bonus for the polesitter. */
	pole?: number;
	/** Bonus for every classified finisher, on top of position points. */
	finishing?: number;
	/** Count only each driver's and constructor's best N race weekends. */
	bestResults?: number;
	/** Double points for the season's final race. */
	doubleFinal?: boolean;
};

/** Id of a user-built system; the system itself travels with the change or URL that uses it. */
export const CUSTOM_SYSTEM = "custom";
/** The points-comparison pseudo-system: each season's own points, but every result counts. */
export const ERA_SYSTEM = "era";

export const POINTS_SYSTEMS: PointsSystem[] = [
	{ id: "1950", name: "1950–1959", description: "8-6-4-3-2, +1 fastest lap", race: [8, 6, 4, 3, 2], fastestLap: { points: 1 } },
	{ id: "1961", name: "1961–1990", description: "9-6-4-3-2-1", race: [9, 6, 4, 3, 2, 1] },
	{ id: "1991", name: "1991–2002", description: "10-6-4-3-2-1", race: [10, 6, 4, 3, 2, 1] },
	{ id: "2003", name: "2003–2009", description: "10-8-6-5-4-3-2-1", race: [10, 8, 6, 5, 4, 3, 2, 1] },
	{ id: "2010", name: "2010–2018", description: "25-18-15-12-10-8-6-4-2-1", race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
	{
		id: "2022",
		name: "2022–2024",
		description: "25-18-15…, +1 fastest lap in top 10, sprint 8-1",
		race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
		sprint: [8, 7, 6, 5, 4, 3, 2, 1],
		fastestLap: { points: 1, withinTop: 10 },
	},
	{
		id: "2025",
		name: "2025 onwards",
		description: "25-18-15…, sprint 8-1, no fastest lap point",
		race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
		sprint: [8, 7, 6, 5, 4, 3, 2, 1],
	},
	{ id: "winner", name: "Winner takes all", description: "Only race wins score", race: [1] },
	{ id: "indycar", name: "IndyCar-style", description: "50-40-35-32-30… down to 5 for 20th", race: [50, 40, 35, 32, 30, 28, 26, 24, 22, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10] },
	{ id: "deep", name: "Points to 15th", description: "Everyone in the top 15 scores", race: [30, 25, 21, 18, 16, 14, 12, 10, 8, 7, 5, 4, 3, 2, 1] },
];

export const pointsSystem = (id: string) => POINTS_SYSTEMS.find((s) => s.id === id);

/* --------------------------------------------------------- custom systems --- */

export const MAX_POSITIONS = 30;
const MAX_POINTS = 1000;

const amount = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(MAX_POINTS, Math.round(x * 100) / 100) : null);
const bonus = (x: unknown) => amount(x) || undefined;
const places = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 1 ? Math.min(MAX_POSITIONS, Math.round(x)) : undefined);
const table = (x: unknown) => (Array.isArray(x) ? x.slice(0, MAX_POSITIONS).map((v) => amount(v) ?? 0) : []);

/** A points system from untrusted input (stored changes, share links, URLs): clamped and cleaned, or null if it has no race points table. */
export function sanitizePointsSystem(x: unknown): PointsSystem | null {
	if (!x || typeof x !== "object") return null;
	const o = x as Record<string, unknown>;
	const race = table(o.race);
	if (!race.length) return null;
	const s: PointsSystem = { id: CUSTOM_SYSTEM, name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : "Custom", description: "", race };
	const sprint = table(o.sprint);
	if (sprint.some((p) => p > 0)) s.sprint = sprint;
	const fl = o.fastestLap as { points?: unknown; withinTop?: unknown } | undefined;
	const flPoints = bonus(fl?.points);
	if (flPoints) s.fastestLap = places(fl?.withinTop) ? { points: flPoints, withinTop: places(fl?.withinTop) } : { points: flPoints };
	if (bonus(o.pole)) s.pole = bonus(o.pole);
	if (bonus(o.finishing)) s.finishing = bonus(o.finishing);
	if (places(o.bestResults)) s.bestResults = places(o.bestResults);
	if (o.doubleFinal === true) s.doubleFinal = true;
	s.description = describeSystem(s);
	return s;
}

/** Why a system can't be used yet, in words (null when it's fine). */
export function pointsSystemProblem(s: Pick<PointsSystem, "race" | "pole" | "finishing" | "fastestLap">): string | null {
	if (!s.race.length) return "Give at least one finishing position points.";
	if (!s.race.some((p) => p > 0) && !s.pole && !s.finishing && !s.fastestLap) return "Nobody scores anything under this system.";
	return null;
}

const compactTable = (xs: number[]) => {
	const t = xs.slice(0, xs.findLastIndex((p) => p > 0) + 1);
	if (!t.length) return "0";
	return t.length <= 10 ? t.join("-") : `${t.slice(0, 5).join("-")}-…-${t[t.length - 1]}`;
};

/** A compact one-line summary, e.g. "25-18-15-12-10-8-6-4-2-1, sprint 8-7-6-5-4-3-2-1, +1 FL in top 10". */
export function describeSystem(s: PointsSystem): string {
	return [
		compactTable(s.race),
		s.sprint?.length ? `sprint ${compactTable(s.sprint)}` : null,
		s.fastestLap ? `+${s.fastestLap.points} FL${s.fastestLap.withinTop ? ` in top ${s.fastestLap.withinTop}` : ""}` : null,
		s.pole ? `+${s.pole} pole` : null,
		s.finishing ? `+${s.finishing} per finish` : null,
		s.bestResults ? `best ${s.bestResults} results count` : null,
		s.doubleFinal ? "double points finale" : null,
	]
		.filter(Boolean)
		.join(", ");
}

/** A preset by id, or the custom system a change or URL carries. */
export const resolvePointsSystem = (id: string, custom?: unknown): PointsSystem | null => (custom ? sanitizePointsSystem(custom) : (pointsSystem(id) ?? null));

const toBase64Url = (s: string) => {
	const bytes = new TextEncoder().encode(s);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (s: string) => {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
	return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** A custom system as a short URL-safe string (for `?custom=`). */
export function encodePointsSystem(s: PointsSystem): string {
	const o: Record<string, unknown> = { n: s.name, r: s.race };
	if (s.sprint?.length) o.s = s.sprint;
	if (s.fastestLap) o.l = s.fastestLap.withinTop ? [s.fastestLap.points, s.fastestLap.withinTop] : [s.fastestLap.points];
	if (s.pole) o.p = s.pole;
	if (s.finishing) o.f = s.finishing;
	if (s.bestResults) o.b = s.bestResults;
	if (s.doubleFinal) o.d = 1;
	return toBase64Url(JSON.stringify(o));
}

export function decodePointsSystem(param: string): PointsSystem | null {
	try {
		const o = JSON.parse(fromBase64Url(param));
		const l = Array.isArray(o?.l) ? o.l : null;
		return sanitizePointsSystem({
			name: o.n,
			race: o.r,
			sprint: o.s,
			fastestLap: l ? { points: l[0], withinTop: l[1] } : undefined,
			pole: o.p,
			finishing: o.f,
			bestResults: o.b,
			doubleFinal: o.d === 1,
		});
	} catch {
		return null;
	}
}

export type EraRules = {
	system: PointsSystem;
	driverDrop: DropRule;
	constructorDrop: DropRule;
	/** 1958–1978: only the best-placed car of each constructor scored. */
	constructorBestCarOnly: boolean;
	constructorFastestLap: boolean;
	/** The Indianapolis 500 counted for drivers (1950–1960) but never for constructors. */
	constructorExcludesIndy: boolean;
	hasConstructorsChampionship: boolean;
	doublePointsFinalRace: boolean;
};

const best = (n: number): DropRule => ({ type: "best", best: n });
const split = (firstHalf: number, firstBest: number, secondBest: number): DropRule => ({
	type: "split",
	firstHalf,
	firstBest,
	secondBest,
});
const ALL: DropRule = { type: "all" };

const DRIVER_DROPS: Record<number, DropRule> = {
	1950: best(4), 1951: best(4), 1952: best(4), 1953: best(4),
	1954: best(5), 1955: best(5), 1956: best(5), 1957: best(5),
	1958: best(6), 1959: best(5), 1960: best(6),
	1961: best(5), 1962: best(5), 1963: best(6), 1964: best(6), 1965: best(6), 1966: best(5),
	1967: split(6, 5, 4), 1968: split(6, 5, 5), 1969: split(6, 5, 4), 1970: split(7, 6, 5),
	1971: split(6, 5, 4), 1972: split(6, 5, 5), 1973: split(8, 7, 6), 1974: split(8, 7, 6),
	1975: split(7, 6, 6), 1976: split(8, 7, 7), 1977: split(9, 8, 7), 1978: split(8, 7, 7),
	1979: split(7, 4, 4), 1980: split(7, 5, 5),
	1981: best(11), 1982: best(11), 1983: best(11), 1984: best(11), 1985: best(11),
	1986: best(11), 1987: best(11), 1988: best(11), 1989: best(11), 1990: best(11),
};

const CONSTRUCTOR_DROPS: Record<number, DropRule> = {
	1958: best(6), 1959: best(5), 1960: best(6),
	1961: best(5), 1962: best(5), 1963: best(6), 1964: best(6), 1965: best(6), 1966: best(5),
	1967: split(6, 5, 4), 1968: split(6, 5, 5), 1969: split(6, 5, 4), 1970: split(7, 6, 5),
	1971: split(6, 5, 4), 1972: split(6, 5, 5), 1973: split(8, 7, 6), 1974: split(8, 7, 6),
	1975: split(7, 6, 6), 1976: split(8, 7, 7), 1977: split(9, 8, 7), 1978: split(8, 7, 7),
};

function eraSystem(year: number): PointsSystem {
	const get = (id: string) => pointsSystem(id)!;
	if (year <= 1959) return get("1950");
	if (year === 1960) return { id: "1960", name: "1960", description: "8-6-4-3-2-1", race: [8, 6, 4, 3, 2, 1] };
	if (year <= 1990) return get("1961");
	if (year <= 2002) return get("1991");
	if (year <= 2009) return get("2003");
	if (year <= 2018) return get("2010");
	if (year <= 2020) return { ...get("2010"), id: "2019", name: "2019–2020", fastestLap: { points: 1, withinTop: 10 } };
	if (year === 2021) return { ...get("2022"), id: "2021", name: "2021", sprint: [3, 2, 1] };
	if (year <= 2024) return get("2022");
	return get("2025");
}

export function eraRules(year: number): EraRules {
	return {
		system: eraSystem(year),
		driverDrop: DRIVER_DROPS[year] ?? ALL,
		constructorDrop: CONSTRUCTOR_DROPS[year] ?? ALL,
		constructorBestCarOnly: year >= 1958 && year <= 1978,
		constructorFastestLap: year >= 2019,
		constructorExcludesIndy: true,
		hasConstructorsChampionship: year >= 1958,
		doublePointsFinalRace: year === 2014,
	};
}

/**
 * A season's rules when a points system replaces its own (a universe `points` change, the /points comparison):
 * every car scores for its constructor and every result counts, unless the system says otherwise.
 */
export function systemRules(year: number, system: PointsSystem): EraRules {
	const drop: DropRule = system.bestResults ? best(system.bestResults) : ALL;
	return {
		...eraRules(year),
		system,
		driverDrop: drop,
		constructorDrop: drop,
		doublePointsFinalRace: !!system.doubleFinal,
		constructorFastestLap: true,
		constructorBestCarOnly: false,
	};
}

/** The most `n` cars can take from a points table (custom tables needn't be sorted). */
export const topPoints = (table: number[], n: number) => [...table].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0);

/** Points a classified position earns under a system, before fastest-lap bonus. */
export function positionPoints(system: PointsSystem, position: number | null, sprint = false): number {
	if (position == null) return 0;
	const table = sprint ? system.sprint : system.race;
	return table?.[position - 1] ?? 0;
}

/** Races stopped short of the distance needed for full points, so half points were paid. */
const HALF_POINTS = new Set(["1975-4", "1975-12", "1984-6", "1991-16", "2009-2", "2021-12"]);
export const halfPoints = (race: Pick<Race, "year" | "round">) => HALF_POINTS.has(`${race.year}-${race.round}`);

/** Re-score a race classification with a points system (used for re-scored or edited races). */
export function scoreRace(results: Result[], system: PointsSystem, opts: { sprint?: boolean; double?: boolean; half?: boolean } = {}): Result[] {
	return results.map((r) => {
		let points = positionPoints(system, r.position, opts.sprint);
		if (!opts.sprint && r.fastestLap && system.fastestLap) {
			const within = system.fastestLap.withinTop;
			if (within == null || (r.position != null && r.position <= within)) points += system.fastestLap.points;
		}
		if (!opts.sprint && r.pole && system.pole) points += system.pole;
		if (!opts.sprint && r.position != null && system.finishing) points += system.finishing;
		if (opts.double) points *= 2;
		if (opts.half && !opts.sprint) points /= 2;
		return { ...r, points };
	});
}

type Scored = { key: string; id: string; engineId?: string; perRace: number[]; finishes: number[] };

function countedPoints(perRace: number[], drop: DropRule): number {
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const top = (xs: number[], n: number) => sum([...xs].sort((a, b) => b - a).slice(0, n));
	switch (drop.type) {
		case "all":
			return sum(perRace);
		case "best":
			return top(perRace, drop.best);
		case "split":
			return top(perRace.slice(0, drop.firstHalf), drop.firstBest) + top(perRace.slice(drop.firstHalf), drop.secondBest);
	}
}

/** Higher points first, then count-back on finishing positions. */
function compareScored(a: Scored & { total: number }, b: Scored & { total: number }) {
	if (b.total !== a.total) return b.total - a.total;
	const fa = [...a.finishes].sort((x, y) => x - y);
	const fb = [...b.finishes].sort((x, y) => x - y);
	for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
		const x = fa[i] ?? 999;
		const y = fb[i] ?? 999;
		if (x !== y) return x - y;
	}
	return 0;
}

/** Official sporting penalties that results alone can't reproduce. Keys are driver ids or constructor ids. */
type Adjustments = { excluded?: string[]; deductions?: Record<string, number> };
const DRIVER_ADJUSTMENTS: Record<number, Adjustments> = {
	1997: { excluded: ["michael-schumacher"] },
};
const CONSTRUCTOR_ADJUSTMENTS: Record<number, Adjustments> = {
	1995: { deductions: { benetton: 10, williams: 6 } },
	2000: { deductions: { mclaren: 10 } },
	2007: { excluded: ["mclaren"] },
	2020: { deductions: { "racing-point": 15 } },
};

/** A constructor's official penalty for a season: excluded from the championship, or points deducted. */
export function constructorAdjustment(year: number, id: string): { excluded: boolean; deduction: number } {
	const a = CONSTRUCTOR_ADJUSTMENTS[year];
	return { excluded: !!a?.excluded?.includes(id), deduction: a?.deductions?.[id] ?? 0 };
}

/**
 * Constructors' championship points one race earned, by constructor id: only
 * from 1958, the best-placed car only in 1958-1978, no fastest-lap point
 * before 2019, never the Indianapolis 500. Sprint points are returned apart.
 */
export function constructorRaceScore(race: Race, results: Result[], sprint: Result[], rules: EraRules): { race: Map<string, number>; sprint: Map<string, number> } {
	const out = { race: new Map<string, number>(), sprint: new Map<string, number>() };
	if (!rules.hasConstructorsChampionship || (race.grandPrixId === "indianapolis" && rules.constructorExcludesIndy)) return out;
	const perEntry = new Map<string, { id: string; p: number }>();
	for (const r of results) {
		const key = `${r.constructorId}|${r.engineId}`;
		const p = rules.constructorFastestLap || !r.fastestLap || !rules.system.fastestLap ? r.points : Math.max(0, r.points - rules.system.fastestLap.points);
		const e = perEntry.get(key) ?? { id: r.constructorId, p: 0 };
		e.p = rules.constructorBestCarOnly ? Math.max(e.p, p) : e.p + p;
		perEntry.set(key, e);
	}
	for (const e of perEntry.values()) out.race.set(e.id, (out.race.get(e.id) ?? 0) + e.p);
	for (const r of sprint) out.sprint.set(r.constructorId, (out.sprint.get(r.constructorId) ?? 0) + r.points);
	return out;
}

function rank(scored: Map<string, Scored>, drop: DropRule, adj: Adjustments = {}): StandingRow[] {
	const excluded = new Set(adj.excluded);
	const rows = [...scored.values()].map((s) => ({
		...s,
		total: countedPoints(s.perRace, drop) - (adj.deductions?.[s.id] ?? 0),
	}));
	const ranked = rows.filter((s) => !excluded.has(s.id)).sort(compareScored);
	const out: StandingRow[] = ranked.map((s, i) => ({
		position: i + 1,
		positionText: String(i + 1),
		id: s.id,
		engineId: s.engineId,
		points: Math.round(s.total * 100) / 100,
		champion: i === 0 && s.total > 0,
	}));
	for (const s of rows.filter((s) => excluded.has(s.id))) {
		out.push({ position: null, positionText: "EX", id: s.id, engineId: s.engineId, points: Math.round(s.total * 100) / 100, champion: false });
	}
	return out;
}

/**
 * Compute driver and constructor standings for a season from its race (and
 * sprint) results. Points are taken from each result as-is, so callers re-score
 * results first when changing the points system.
 */
export function computeStandings(
	db: Pick<Db, "resultsByRace" | "sprintByRace" | "grandsPrix">,
	races: Race[],
	rules: EraRules,
	year = races[0]?.year,
): { drivers: StandingRow[]; constructors: StandingRow[] } {
	const drivers = new Map<string, Scored>();
	const constructors = new Map<string, Scored>();
	const entry = (map: Map<string, Scored>, key: string, id: string, engineId?: string) => {
		let s = map.get(key);
		if (!s) {
			s = { key, id, engineId, perRace: new Array(races.length).fill(0), finishes: [] };
			map.set(key, s);
		}
		return s;
	};

	races.forEach((race, i) => {
		const results = db.resultsByRace.get(race.id) ?? [];
		const sprint = db.sprintByRace.get(race.id) ?? [];
		const isIndy = race.grandPrixId === "indianapolis";

		for (const r of [...results, ...sprint]) {
			const d = entry(drivers, r.driverId, r.driverId);
			d.perRace[i] += r.points;
		}
		for (const r of results) if (r.position != null) entry(drivers, r.driverId, r.driverId).finishes.push(r.position);

		if (!rules.hasConstructorsChampionship || (isIndy && rules.constructorExcludesIndy)) return;
		const constructorPoints = (r: Result) => {
			if (rules.constructorFastestLap || !r.fastestLap || !rules.system.fastestLap) return r.points;
			return Math.max(0, r.points - rules.system.fastestLap.points);
		};
		const raceTotals = new Map<string, number>();
		for (const r of results) {
			const key = `${r.constructorId}|${r.engineId}`;
			const c = entry(constructors, key, r.constructorId, r.engineId);
			if (r.position != null) c.finishes.push(r.position);
			const p = constructorPoints(r);
			raceTotals.set(key, rules.constructorBestCarOnly ? Math.max(raceTotals.get(key) ?? 0, p) : (raceTotals.get(key) ?? 0) + p);
		}
		for (const r of sprint) {
			const key = `${r.constructorId}|${r.engineId}`;
			entry(constructors, key, r.constructorId, r.engineId);
			raceTotals.set(key, (raceTotals.get(key) ?? 0) + r.points);
		}
		for (const [key, p] of raceTotals) constructors.get(key)!.perRace[i] += p;
	});

	return {
		drivers: rank(drivers, rules.driverDrop, DRIVER_ADJUSTMENTS[year]),
		constructors: rank(constructors, rules.constructorDrop, CONSTRUCTOR_ADJUSTMENTS[year]),
	};
}
