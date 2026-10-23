// Side-by-side comparison of 2–4 drivers (or constructors): career totals,
// snapshots at the same age / after the same number of starts, cumulative
// progressions and head-to-heads in shared races. Works on any Db.

import { isStart, type Db, type Result } from "./dataset.ts";
import { ageDays, constructorCareers, constructorPointsByRace, driverCareers, type Career } from "./stats.ts";
import { finishedAhead, sharedRaces } from "./teammates.ts";
import { driverRef, raceRef, teamRef, type DriverRef, type RaceRef, type TeamRef } from "./views.ts";

export const COMPARE_MAX = 4;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** `?d=a,b` / `?t=x,y` into ids (deduped, at most COMPARE_MAX). */
export function parseCompareIds(value: string | string[] | null | undefined): string[] {
	const raw = (Array.isArray(value) ? value.join(",") : (value ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
	return [...new Set(raw)].slice(0, COMPARE_MAX);
}

type Params = { [key: string]: string | string[] | undefined } | { get(key: string): string | null };

/** Drivers (`?d=a,b`) unless only constructors (`?t=x,y`) are given. Takes page searchParams or URLSearchParams. */
export function compareQuery(sp: Params): { kind: "driver" | "team"; ids: string[] } {
	const get = (k: string) => ("get" in sp && typeof sp.get === "function" ? sp.get(k) : (sp as Record<string, string | string[] | undefined>)[k]);
	const d = get("d");
	const t = get("t");
	const kind = t != null && !d ? "team" : "driver";
	return { kind, ids: parseCompareIds(kind === "team" ? t : d) };
}

export type CompareTotals = {
	entries: number;
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	fastestLaps: number;
	points: number;
	titles: number;
	seasons: number;
	firstYear: number;
	lastYear: number;
	winRate: number;
	podiumRate: number;
	bestChampionship: number | null;
};

/** Cumulative totals after each start (drivers) or race entered (teams). `age` in years, drivers only. */
export type ProgressPoint = { n: number; age: number | null; wins: number; podiums: number; points: number };

export type Snapshot = { starts: number; wins: number; podiums: number; poles: number; points: number; titles: number };

export type CompareEntity = {
	kind: "driver" | "team";
	id: string;
	driver: DriverRef | null;
	team: TeamRef | null;
	dateOfBirth: string | null;
	totals: CompareTotals;
	titleYears: number[];
	bestSeasons: { year: number; position: number | null; points: number; wins: number; teams: TeamRef[] }[];
	firstRace: RaceRef | null;
	lastRace: RaceRef | null;
	progress: ProgressPoint[];
};

export type CompareH2H = {
	a: string;
	b: string;
	/** Races both started (drivers) or entered (teams). */
	races: number;
	aAhead: number;
	bAhead: number;
	/** Races as team-mates (drivers only). */
	teammateRaces: number;
};

export type CompareView = {
	kind: "driver" | "team";
	entities: CompareEntity[];
	/** Ids that were asked for but don't exist in this Db. */
	unknown: string[];
	/** Everyone at the youngest age any of them reached at their last start (drivers with known birth dates). */
	sameAge: { ageDays: number; label: string; rows: Snapshot[] } | null;
	/** Everyone after the smallest career's number of starts / entries. */
	afterStarts: { n: number; rows: Snapshot[] } | null;
	h2h: CompareH2H[];
};

const totalsOf = (c: Career, bestChampionship: number | null): CompareTotals => ({
	entries: c.entries,
	starts: c.starts,
	wins: c.wins,
	podiums: c.podiums,
	poles: c.poles,
	fastestLaps: c.fastestLaps,
	points: c.points,
	titles: c.titles,
	seasons: c.seasons,
	firstYear: c.firstYear,
	lastYear: c.lastYear,
	winRate: c.starts ? c.wins / c.starts : 0,
	podiumRate: c.starts ? c.podiums / c.starts : 0,
	bestChampionship,
});

/** Results grouped by race (in order), keeping only the given filter. */
function byRace(rows: Result[], keep: (r: Result) => boolean) {
	const m = new Map<number, Result[]>();
	for (const r of rows) if (keep(r)) (m.get(r.raceId) ?? m.set(r.raceId, []).get(r.raceId)!).push(r);
	return m;
}

/** Season (year) → date of its last completed race, for "titles by date". */
function seasonEnds(db: Db) {
	const m = new Map<number, string>();
	for (const r of db.races) if (db.resultsByRace.has(r.id) && (m.get(r.year) ?? "") < r.date) m.set(r.year, r.date);
	return m;
}

const fmtAge = (days: number) => {
	const years = Math.floor(days / 365.25);
	const rest = Math.round(days - years * 365.25);
	return `${years} years, ${rest} day${rest === 1 ? "" : "s"}`;
};

/** Per start (drivers) or race entered (teams); a team's 1-2 counts two podiums. */
type Internal = { e: CompareEntity; races: { raceId: number; date: string; wins: number; podiums: number; pole: boolean; points: number }[] };

function driverEntity(db: Db, id: string): Internal | null {
	const d = db.drivers.get(id);
	const c = driverCareers(db).get(id);
	if (!d || !c) return null;
	const standings = [...db.driverStandings].map(([year, rows]) => ({ year, row: rows.find((r) => r.id === id) })).filter((s) => s.row);
	const titleYears = standings.filter((s) => s.row!.champion).map((s) => s.year);
	const byYear = new Map<number, Result[]>();
	for (const r of db.resultsByDriver.get(id) ?? []) {
		const y = db.raceById.get(r.raceId)!.year;
		(byYear.get(y) ?? byYear.set(y, []).get(y)!).push(r);
	}
	const sprintPts = new Map<number, number>();
	for (const s of db.sprintByDriver.get(id) ?? []) sprintPts.set(s.raceId, (sprintPts.get(s.raceId) ?? 0) + s.points);
	const bestSeasons = [...byYear]
		.map(([year, rs]) => {
			const row = standings.find((s) => s.year === year)?.row;
			return {
				year,
				position: row?.position ?? null,
				points: r2(row?.points ?? rs.reduce((a, r) => a + r.points + (sprintPts.get(r.raceId) ?? 0), 0)),
				wins: rs.filter((r) => r.position === 1).length,
				teams: [...new Set(rs.map((r) => r.constructorId))].map((t) => teamRef(db, t)),
			};
		})
		.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || b.wins - a.wins || b.points - a.points)
		.slice(0, 3);
	const races = [...byRace(db.resultsByDriver.get(id) ?? [], () => true)].map(([raceId, rs]) => ({
		raceId,
		date: db.raceById.get(raceId)!.date,
		started: rs.some(isStart),
		wins: rs.some((r) => r.position === 1) ? 1 : 0,
		podiums: rs.some((r) => r.position != null && r.position <= 3) ? 1 : 0,
		pole: rs.some((r) => r.pole),
		points: rs.reduce((a, r) => a + r.points, 0) + (sprintPts.get(raceId) ?? 0),
	}));
	const dob = d.dateOfBirth;
	const progress: ProgressPoint[] = [];
	let acc = { n: 0, wins: 0, podiums: 0, points: 0 };
	for (const r of races) {
		acc = { n: acc.n + (r.started ? 1 : 0), wins: acc.wins + r.wins, podiums: acc.podiums + r.podiums, points: acc.points + r.points };
		if (r.started) progress.push({ n: acc.n, age: dob ? r2(ageDays(dob, r.date) / 365.25) : null, wins: acc.wins, podiums: acc.podiums, points: r2(acc.points) });
	}
	return {
		e: {
			kind: "driver",
			id,
			driver: driverRef(db, id),
			team: null,
			dateOfBirth: dob,
			totals: totalsOf(c, standings.reduce<number | null>((m, s) => (s.row!.position != null && (m == null || s.row!.position < m) ? s.row!.position : m), null)),
			titleYears,
			bestSeasons,
			firstRace: raceRef(db, db.raceById.get(c.firstRaceId)!),
			lastRace: raceRef(db, db.raceById.get(c.lastRaceId)!),
			progress,
		},
		races: races.filter((r) => r.started),
	};
}

function teamEntity(db: Db, id: string): Internal | null {
	const t = db.constructors.get(id);
	const c = constructorCareers(db).get(id);
	if (!t || !c) return null;
	const standings = [...db.constructorStandings].map(([year, rows]) => ({ year, row: rows.find((r) => r.id === id) })).filter((s) => s.row);
	const pts = constructorPointsByRace(db);
	const groups = byRace(db.resultsByConstructor.get(id) ?? [], () => true);
	const races = [...groups].map(([raceId, rs]) => {
		const s = pts.get(raceId);
		return {
			raceId,
			date: db.raceById.get(raceId)!.date,
			wins: rs.some((r) => r.position === 1) ? 1 : 0,
			pole: rs.some((r) => r.pole),
			points: (s?.race.get(id) ?? 0) + (s?.sprint.get(id) ?? 0),
			podiums: rs.filter((r) => r.position != null && r.position <= 3).length,
		};
	});
	const byYear = new Map<number, typeof races>();
	for (const r of races) {
		const y = db.raceById.get(r.raceId)!.year;
		(byYear.get(y) ?? byYear.set(y, []).get(y)!).push(r);
	}
	const progress: ProgressPoint[] = [];
	let acc = { wins: 0, podiums: 0, points: 0 };
	races.forEach((r, i) => {
		acc = { wins: acc.wins + r.wins, podiums: acc.podiums + r.podiums, points: acc.points + r.points };
		progress.push({ n: i + 1, age: null, wins: acc.wins, podiums: acc.podiums, points: r2(acc.points) });
	});
	return {
		e: {
			kind: "team",
			id,
			driver: null,
			team: teamRef(db, id),
			dateOfBirth: null,
			totals: { ...totalsOf(c, standings.reduce<number | null>((m, s) => (s.row!.position != null && (m == null || s.row!.position < m) ? s.row!.position : m), null)), starts: c.entries, winRate: c.entries ? c.wins / c.entries : 0 },
			titleYears: standings.filter((s) => s.row!.champion).map((s) => s.year),
			bestSeasons: [...byYear]
				.map(([year, rs]) => {
					const row = standings.find((s) => s.year === year)?.row;
					return { year, position: row?.position ?? null, points: r2(row?.points ?? rs.reduce((a, r) => a + r.points, 0)), wins: rs.reduce((a, r) => a + r.wins, 0), teams: [] };
				})
				.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || b.wins - a.wins || b.points - a.points)
				.slice(0, 3),
			firstRace: raceRef(db, db.raceById.get(c.firstRaceId)!),
			lastRace: raceRef(db, db.raceById.get(c.lastRaceId)!),
			progress,
		},
		races,
	};
}

function snapshot(x: Internal, upto: (r: Internal["races"][number], i: number) => boolean, titles: number): Snapshot {
	const s: Snapshot = { starts: 0, wins: 0, podiums: 0, poles: 0, points: 0, titles };
	x.races.forEach((r, i) => {
		if (!upto(r, i)) return;
		s.starts++;
		s.wins += r.wins;
		s.poles += r.pole ? 1 : 0;
		s.points += r.points;
		s.podiums += r.podiums;
	});
	s.points = r2(s.points);
	return s;
}

function h2hDrivers(db: Db, a: string, b: string): CompareH2H {
	const ra = byRace(db.resultsByDriver.get(a) ?? [], isStart);
	const rb = byRace(db.resultsByDriver.get(b) ?? [], isStart);
	const out: CompareH2H = { a, b, races: 0, aAhead: 0, bAhead: 0, teammateRaces: sharedRaces(db, a, b).length };
	for (const [raceId, xs] of ra) {
		const ys = rb.get(raceId);
		if (!ys) continue;
		out.races++;
		const w = finishedAhead({ position: xs[0].position, started: true }, { position: ys[0].position, started: true });
		if (w === "a") out.aAhead++;
		if (w === "b") out.bAhead++;
	}
	return out;
}

const bestPos = (rows: Result[] | undefined) => {
	const ps = (rows ?? []).filter(isStart).map((r) => r.position).filter((p): p is number => p != null);
	return ps.length ? Math.min(...ps) : null;
};

function h2hTeams(db: Db, a: string, b: string): CompareH2H {
	const ra = byRace(db.resultsByConstructor.get(a) ?? [], () => true);
	const rb = byRace(db.resultsByConstructor.get(b) ?? [], () => true);
	const out: CompareH2H = { a, b, races: 0, aAhead: 0, bAhead: 0, teammateRaces: 0 };
	for (const [raceId, xs] of ra) {
		const ys = rb.get(raceId);
		if (!ys || !xs.some(isStart) || !ys.some(isStart)) continue;
		out.races++;
		const w = finishedAhead({ position: bestPos(xs), started: true }, { position: bestPos(ys), started: true });
		if (w === "a") out.aAhead++;
		if (w === "b") out.bAhead++;
	}
	return out;
}

/**
 * Compare drivers (`kind: "driver"`) or constructors. Unknown ids are dropped and reported.
 * `base` is accepted for parity with other builders; comparisons always describe `db`.
 */
export function compareView(db: Db, kind: "driver" | "team", ids: string[], base?: Db): CompareView {
	void base;
	const ends = seasonEnds(db);
	const list: Internal[] = [];
	const unknown: string[] = [];
	for (const id of ids.slice(0, COMPARE_MAX)) {
		const x = kind === "driver" ? driverEntity(db, id) : teamEntity(db, id);
		if (x) list.push(x);
		else unknown.push(id);
	}
	const titlesBy = (x: Internal, date: string) => x.e.titleYears.filter((y) => (ends.get(y) ?? "9999") <= date).length;

	let sameAge: CompareView["sameAge"] = null;
	if (kind === "driver" && list.length >= 2 && list.every((x) => x.e.dateOfBirth && x.races.length)) {
		const limit = Math.min(...list.map((x) => ageDays(x.e.dateOfBirth!, x.races[x.races.length - 1].date)));
		sameAge = {
			ageDays: limit,
			label: fmtAge(limit),
			rows: list.map((x) => {
				const cutoff = new Date(Date.parse(x.e.dateOfBirth!) + limit * 86400000).toISOString().slice(0, 10);
				return snapshot(x, (r) => r.date <= cutoff, titlesBy(x, cutoff));
			}),
		};
	}
	let afterStarts: CompareView["afterStarts"] = null;
	if (list.length >= 2) {
		const n = Math.min(...list.map((x) => x.races.length));
		if (n > 0)
			afterStarts = {
				n,
				rows: list.map((x) => snapshot(x, (_, i) => i < n, titlesBy(x, x.races[n - 1].date))),
			};
	}
	const h2h: CompareH2H[] = [];
	for (let i = 0; i < list.length; i++)
		for (let j = i + 1; j < list.length; j++) {
			const h = kind === "driver" ? h2hDrivers(db, list[i].e.id, list[j].e.id) : h2hTeams(db, list[i].e.id, list[j].e.id);
			if (h.races) h2h.push(h);
		}
	return { kind, entities: list.map((x) => x.e), unknown, sameAge, afterStarts, h2h };
}
