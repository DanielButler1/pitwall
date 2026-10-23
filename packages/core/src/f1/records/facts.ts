// Per-Db precomputation shared by every record category: the chronological list
// of completed races, entity keys per result, event series per metric and
// participation lists. Everything is memoised per Db with a WeakMap so a
// universe gets its own copy and reality is computed once per process.

import { isStart, type Db, type Race, type Result } from "../dataset.ts";
import { ageOn, constructorPointsByRace } from "../stats.ts";
import { LAPS_FROM, lapLeaders, lapsLedIn, sprintFastestLap, sprintLapLeaders, type LeadSpan } from "../laps.ts";

const memo = new WeakMap<Db, Map<string, unknown>>();
export function cached<T>(db: Db, key: string, compute: () => T): T {
	let m = memo.get(db);
	if (!m) memo.set(db, (m = new Map()));
	if (!m.has(key)) m.set(key, compute());
	return m.get(key) as T;
}

/** Entity types that results can be grouped by. */
export type Kind = "driver" | "constructor" | "engine" | "nation" | "number";

export type RaceFacts = {
	race: Race;
	idx: number;
	results: Result[];
	sprint: Result[];
	winner: Result | undefined;
	/** Laps completed by the winner. */
	winnerLaps: number;
};

export type Facts = {
	races: RaceFacts[];
	byId: Map<number, RaceFacts>;
	/** Race indexes per season, in round order. */
	seasons: Map<number, number[]>;
};

export function facts(db: Db): Facts {
	return cached(db, "facts", () => {
		const races: RaceFacts[] = [];
		for (const race of db.races) {
			const results = db.resultsByRace.get(race.id);
			if (!results?.length) continue;
			const winner = results.find((r) => r.position === 1);
			races.push({
				race,
				idx: races.length,
				results,
				sprint: db.sprintByRace.get(race.id) ?? [],
				winner,
				winnerLaps: winner?.laps ?? Math.max(0, ...results.map((r) => r.laps ?? 0)),
			});
		}
		const seasons = new Map<number, number[]>();
		for (const f of races) {
			const list = seasons.get(f.race.year) ?? [];
			list.push(f.idx);
			seasons.set(f.race.year, list);
		}
		return { races, byId: new Map(races.map((f) => [f.race.id, f])), seasons };
	});
}

export function keyOf(db: Db, kind: Kind, r: Result): string | null {
	switch (kind) {
		case "driver":
			return r.driverId;
		case "constructor":
			return r.constructorId;
		case "engine":
			return r.engineId;
		case "nation":
			return db.drivers.get(r.driverId)?.nationality ?? null;
		case "number":
			return r.number;
	}
}

/** Country of an entity (for "home Grand Prix" records). */
export function homeCountry(db: Db, kind: Kind, id: string): string | null {
	switch (kind) {
		case "driver":
			return db.drivers.get(id)?.nationality ?? null;
		case "constructor":
			return db.constructors.get(id)?.country ?? null;
		case "engine":
			return db.engines.get(id)?.country ?? null;
		case "nation":
			return id;
		default:
			return null;
	}
}

/* --------------------------------------------------------------- metrics --- */

export type MetricCtx = { db: Db; f: RaceFacts };

export type Metric = {
	id: string;
	/** Singular / plural nouns for display, e.g. ["win", "wins"]. */
	noun: [string, string];
	/** Value a single result contributes (0 = no event). */
	value: (r: Result, ctx: MetricCtx) => number;
	/** Also count the weekend's sprint results with `sprintValue`. */
	sprintValue?: (r: Result, ctx: MetricCtx) => number;
	/** Use sprint results only. */
	sprintOnly?: boolean;
	/** Sum several cars' values in one race (podiums, points) rather than counting the race once. Drivers always count once, except `sumDriver`. */
	sum?: boolean;
	sumDriver?: boolean;
	/** Decimal values (points). */
	decimal?: boolean;
	/** Race-level events (e.g. one-twos): entity -> representative result. Replaces `value`. */
	race?: (ctx: MetricCtx, kind: Kind) => Map<string, Result>;
};

/** Entities with results in all the given positions of a race (one-two, one-two-three, front-row lockouts). */
function together(pick: (r: Result) => number | null, places: number[]) {
	return ({ db, f }: MetricCtx, kind: Kind) => {
		const out = new Map<string, Result>();
		const at = places.map((p) => f.results.filter((r) => pick(r) === p));
		for (const first of at[0]) {
			const k = keyOf(db, kind, first);
			if (k == null) continue;
			if (at.slice(1).every((list) => list.some((r) => keyOf(db, kind, r) === k && r !== first))) out.set(k, first);
		}
		return out;
	};
}

const pos = (r: Result) => r.position;

/* Lap-leader helpers (Jolpica, since 1996; null when a race has no usable lap data). */
export function spansOf(db: Db, raceId: number, sprint = false): LeadSpan[] | null {
	return sprint ? sprintLapLeaders(db, raceId) : lapLeaders(db, raceId);
}
export function ledLaps(db: Db, raceId: number, sprint = false): Map<string, number> | null {
	return cached(db, `led:${sprint ? "s" : "r"}:${raceId}`, () => {
		const s = spansOf(db, raceId, sprint);
		return s ? lapsLedIn(s) : null;
	});
}
/** Season of a driver's first Grand Prix start. */
function debutYear(db: Db, driverId: string): number | null {
	return cached(db, `debut:${driverId}`, () => {
		const first = (db.resultsByDriver.get(driverId) ?? []).find(isStart);
		return first ? db.raceById.get(first.raceId)!.year : null;
	});
}
const led = (r: Result, { db, f }: MetricCtx, sprint = false) => (isStart(r) ? (ledLaps(db, f.race.id, sprint)?.get(r.driverId) ?? 0) : 0);
/** Led every lap of the race. */
const ledAll = (r: Result, { db, f }: MetricCtx) => {
	const s = spansOf(db, f.race.id);
	return !!s && s.length === 1 && s[0][0] === r.driverId && s[0][1] === 1 && s[0][2] >= f.winnerLaps;
};
/** Took the lead on the final lap: led the last lap but not the one before. */
const leadOnLastLap = (r: Result, { db, f }: MetricCtx) => {
	const s = spansOf(db, f.race.id);
	if (!s || s.length < 2) return false;
	const [d, a, b] = s[s.length - 1];
	return d === r.driverId && a === b;
};
/** Led the final lap (first across the line). */
const ledFinalLap = (r: Result, { db, f }: MetricCtx) => {
	const s = spansOf(db, f.race.id);
	return !!s && s.length > 0 && s[s.length - 1][0] === r.driverId;
};
export const isWin = (r: Result) => r.position === 1;
export const isPodium = (r: Result) => r.position != null && r.position <= 3;
export const isFinish = (r: Result) => r.position != null && /^\d+$/.test(r.positionText) && !r.reasonRetired;
export const isClassified = (r: Result) => r.position != null && /^\d+$/.test(r.positionText);
export const isRetirement = (r: Result) => r.positionText === "DNF" || (isClassified(r) && !!r.reasonRetired);

export const METRICS = {
	wins: { id: "wins", noun: ["win", "wins"], value: (r) => (isWin(r) ? 1 : 0) },
	poles: { id: "poles", noun: ["pole", "poles"], value: (r) => (r.pole ? 1 : 0) },
	fastestLaps: { id: "fastest-laps", noun: ["fastest lap", "fastest laps"], value: (r) => (r.fastestLap ? 1 : 0) },
	podiums: { id: "podiums", noun: ["podium", "podiums"], value: (r) => (isPodium(r) ? 1 : 0), sum: true },
	seconds: { id: "seconds", noun: ["2nd place", "2nd places"], value: (r) => (pos(r) === 2 ? 1 : 0), sum: true },
	thirds: { id: "thirds", noun: ["3rd place", "3rd places"], value: (r) => (pos(r) === 3 ? 1 : 0), sum: true },
	secondsThirds: { id: "seconds-thirds", noun: ["2nd or 3rd place", "2nd or 3rd places"], value: (r) => (pos(r) === 2 || pos(r) === 3 ? 1 : 0), sum: true },
	points: {
		id: "points",
		noun: ["point", "points"],
		value: (r) => r.points,
		sprintValue: (r) => r.points,
		sum: true,
		sumDriver: true,
		decimal: true,
	},
	racePoints: { id: "race-points", noun: ["point", "points"], value: (r) => r.points, sum: true, sumDriver: true, decimal: true },
	starts: { id: "starts", noun: ["Grand Prix", "Grands Prix"], value: (r) => (isStart(r) ? 1 : 0) },
	entries: { id: "entries", noun: ["entry", "entries"], value: () => 1 },
	hatTricks: { id: "hat-tricks", noun: ["hat trick", "hat tricks"], value: (r) => (r.pole && isWin(r) && r.fastestLap ? 1 : 0) },
	grandSlams: { id: "grand-slams", noun: ["grand slam", "grand slams"], value: (r) => (r.grandSlam ? 1 : 0) },
	poleWin: { id: "pole-win", noun: ["pole and win", "poles and wins"], value: (r) => (r.pole && isWin(r) ? 1 : 0) },
	poleNoWin: { id: "pole-no-win", noun: ["pole without win", "poles without win"], value: (r) => (r.pole && !isWin(r) ? 1 : 0) },
	poleNoStart: { id: "pole-no-start", noun: ["pole not started", "poles not started"], value: (r) => (r.pole && !isStart(r) ? 1 : 0) },
	winNoPole: { id: "win-no-pole", noun: ["win", "wins"], value: (r) => (isWin(r) && !r.pole ? 1 : 0) },
	winFastestLap: { id: "win-fastest-lap", noun: ["win", "wins"], value: (r) => (isWin(r) && r.fastestLap ? 1 : 0) },
	frontRow: { id: "front-row", noun: ["front row", "front rows"], value: (r) => (r.grid != null && r.grid <= 2 && isStart(r) ? 1 : 0), sum: true },
	qualiFastest: { id: "quali-fastest", noun: ["fastest qualifying", "fastest qualifyings"], value: (r) => (r.qualifying === 1 ? 1 : 0) },
	finishes: { id: "finishes", noun: ["finish", "finishes"], value: (r) => (isFinish(r) ? 1 : 0), sum: true },
	classified: { id: "classified", noun: ["classification", "classifications"], value: (r) => (isClassified(r) ? 1 : 0), sum: true },
	retirements: { id: "retirements", noun: ["retirement", "retirements"], value: (r) => (isRetirement(r) ? 1 : 0), sum: true },
	lap1Retirements: {
		id: "lap1-retirements",
		noun: ["1st lap retirement", "1st lap retirements"],
		value: (r) => (r.positionText === "DNF" && (r.laps ?? 0) === 0 ? 1 : 0),
		sum: true,
	},
	leadLap: {
		id: "lead-lap",
		noun: ["lead-lap finish", "lead-lap finishes"],
		value: (r, { f }) => (isClassified(r) && r.laps != null && r.laps >= f.winnerLaps ? 1 : 0),
		sum: true,
	},
	disqualified: { id: "dsq", noun: ["disqualification", "disqualifications"], value: (r) => (r.positionText === "DSQ" || r.positionText === "EX" ? 1 : 0) },
	dnq: { id: "dnq", noun: ["non-qualification", "non-qualifications"], value: (r) => (r.positionText === "DNQ" || r.positionText === "DNPQ" ? 1 : 0) },
	laps: { id: "laps", noun: ["lap", "laps"], value: (r) => (isStart(r) ? (r.laps ?? 0) : 0), sum: true, sumDriver: true },
	km: {
		id: "km",
		noun: ["km", "km"],
		value: (r, { f }) => (isStart(r) ? (r.laps ?? 0) * f.race.courseLength : 0),
		sum: true,
		sumDriver: true,
		decimal: true,
	},
	oneTwos: { id: "one-twos", noun: ["one-two", "one-twos"], value: () => 0, race: together((r) => r.position, [1, 2]) },
	oneTwoThrees: { id: "one-two-threes", noun: ["one-two-three", "one-two-threes"], value: () => 0, race: together((r) => r.position, [1, 2, 3]) },
	poleOneTwos: { id: "pole-one-twos", noun: ["qualifying one-two", "qualifying one-twos"], value: () => 0, race: together((r) => r.qualifying ?? r.grid, [1, 2]) },
	frontRowLockouts: { id: "front-row-lockouts", noun: ["front row lockout", "front row lockouts"], value: () => 0, race: together((r) => (isStart(r) ? r.grid : null), [1, 2]) },
	lapsLed: { id: "laps-led", noun: ["lap led", "laps led"], value: (r, c) => led(r, c), sum: true, sumDriver: true },
	kmLed: {
		id: "km-led",
		noun: ["km led", "km led"],
		value: (r, c) => led(r, c) * c.f.race.courseLength,
		sum: true,
		sumDriver: true,
		decimal: true,
	},
	gpsLed: { id: "gps-led", noun: ["Grand Prix led", "Grands Prix led"], value: (r, c) => (led(r, c) > 0 ? 1 : 0) },
	ledStartToFinish: { id: "start-to-finish", noun: ["race led from start to finish", "races led from start to finish"], value: (r, c) => (ledAll(r, c) ? 1 : 0) },
	winLeadOnLastLap: { id: "win-last-lap", noun: ["win", "wins"], value: (r, c) => (isWin(r) && leadOnLastLap(r, c) ? 1 : 0) },
	winWithoutLeading: {
		id: "win-without-leading",
		noun: ["win", "wins"],
		value: (r, c) => (isWin(r) && ledLaps(c.db, c.f.race.id) != null && led(r, c) === 0 ? 1 : 0),
	},
	firstAcrossNotWinner: { id: "first-across", noun: ["time", "times"], value: (r, c) => (!isWin(r) && ledFinalLap(r, c) ? 1 : 0) },
	sprintLapsLed: { id: "sprint-laps-led", noun: ["sprint lap led", "sprint laps led"], value: () => 0, sprintOnly: true, sprintValue: (r, c) => led(r, c, true), sum: true, sumDriver: true },
	sprintKmLed: {
		id: "sprint-km-led",
		noun: ["sprint km led", "sprint km led"],
		value: () => 0,
		sprintOnly: true,
		sprintValue: (r, c) => led(r, c, true) * c.f.race.courseLength,
		sum: true,
		sumDriver: true,
		decimal: true,
	},
	sprintFastestLaps: {
		id: "sprint-fastest-laps",
		noun: ["sprint fastest lap", "sprint fastest laps"],
		value: () => 0,
		sprintOnly: true,
		sprintValue: (r, { db, f }) => (sprintFastestLap(db, f.race.id)?.driverId === r.driverId ? 1 : 0),
	},
	/** Like gpsLed, but only for drivers whose first start was in the lap-data era (for "first lap led" records). */
	gpsLedDebut: {
		id: "gps-led-debut",
		noun: ["Grand Prix led", "Grands Prix led"],
		value: (r, c) => (led(r, c) > 0 && (debutYear(c.db, r.driverId) ?? 0) >= LAPS_FROM ? 1 : 0),
	},
	sprintWins: { id: "sprint-wins", noun: ["sprint win", "sprint wins"], value: () => 0, sprintOnly: true, sprintValue: (r) => (isWin(r) ? 1 : 0) },
	sprintPoles: { id: "sprint-poles", noun: ["sprint pole", "sprint poles"], value: () => 0, sprintOnly: true, sprintValue: (r) => (r.grid === 1 ? 1 : 0) },
	sprintPodiums: {
		id: "sprint-podiums",
		noun: ["sprint podium", "sprint podiums"],
		value: () => 0,
		sprintOnly: true,
		sprintValue: (r) => (isPodium(r) ? 1 : 0),
		sum: true,
	},
	sprintPoints: {
		id: "sprint-points",
		noun: ["sprint point", "sprint points"],
		value: () => 0,
		sprintOnly: true,
		sprintValue: (r) => r.points,
		sum: true,
		sumDriver: true,
		decimal: true,
	},
} satisfies Record<string, Metric>;

export type MetricId = keyof typeof METRICS;

/** One race's contribution for one entity. */
export type Ev = { idx: number; n: number; r: Result };

/**
 * Chronological events per entity for a metric. `n` is the race's value for the
 * entity; `r` is a representative result (the best-placed one).
 */
export function series(db: Db, kind: Kind, metricId: MetricId): Map<string, Ev[]> {
	return cached(db, `series:${kind}:${metricId}`, () => {
		const m: Metric = METRICS[metricId];
		const sum = kind === "driver" ? !!m.sumDriver : !!m.sum;
		const out = new Map<string, Ev[]>();
		if (kind === "constructor" && (metricId === "points" || metricId === "racePoints" || metricId === "sprintPoints")) return constructorPointSeries(db, metricId);
		for (const f of facts(db).races) {
			const ctx = { db, f };
			const per = new Map<string, Ev>();
			const add = (r: Result, v: number) => {
				if (!v) return;
				const k = keyOf(db, kind, r);
				if (k == null) return;
				const e = per.get(k);
				if (!e) per.set(k, { idx: f.idx, n: v, r });
				else e.n = sum ? e.n + v : Math.max(e.n, v);
			};
			if (m.race) for (const [k, r] of m.race(ctx, kind)) per.set(k, { idx: f.idx, n: 1, r });
			else if (!m.sprintOnly) for (const r of f.results) add(r, m.value(r, ctx));
			if (m.sprintValue) for (const r of f.sprint) add(r, m.sprintValue(r, ctx));
			for (const [k, e] of per) {
				if (m.decimal) e.n = Math.round(e.n * 1000) / 1000;
				const list = out.get(k);
				if (list) list.push(e);
				else out.set(k, [e]);
			}
		}
		return out;
	});
}

/**
 * Constructors' points follow the official constructors' scoring (from 1958,
 * best car only in 1958-1978, penalties applied) rather than adding up every
 * car's driver points, so totals match the official championship.
 */
function constructorPointSeries(db: Db, metricId: "points" | "racePoints" | "sprintPoints"): Map<string, Ev[]> {
	const byRace = constructorPointsByRace(db);
	const out = new Map<string, Ev[]>();
	for (const f of facts(db).races) {
		const s = byRace.get(f.race.id);
		if (!s) continue;
		const ids = new Set([...(metricId !== "sprintPoints" ? s.race.keys() : []), ...(metricId !== "racePoints" ? s.sprint.keys() : [])]);
		for (const id of ids) {
			const n = Math.round(((metricId !== "sprintPoints" ? (s.race.get(id) ?? 0) : 0) + (metricId !== "racePoints" ? (s.sprint.get(id) ?? 0) : 0)) * 1000) / 1000;
			if (!n) continue;
			const r = (metricId === "sprintPoints" ? f.sprint : f.results).find((x) => x.constructorId === id) ?? f.results.find((x) => x.constructorId === id) ?? f.sprint.find((x) => x.constructorId === id);
			if (!r) continue;
			const list = out.get(id);
			const e = { idx: f.idx, n, r };
			if (list) list.push(e);
			else out.set(id, [e]);
		}
	}
	return out;
}

/** Races (by index) each entity started, chronological. Sprint metrics use sprint starts. */
export function participation(db: Db, kind: Kind, sprint = false): Map<string, number[]> {
	return cached(db, `part:${kind}:${sprint}`, () => {
		const out = new Map<string, number[]>();
		for (const f of facts(db).races) {
			const seen = new Set<string>();
			for (const r of sprint ? f.sprint : f.results) {
				if (!isStart(r)) continue;
				const k = keyOf(db, kind, r);
				if (k == null || seen.has(k)) continue;
				seen.add(k);
				const list = out.get(k);
				if (list) list.push(f.idx);
				else out.set(k, [f.idx]);
			}
		}
		return out;
	});
}

/** Race index -> set of entities that started it. */
export function startersAt(db: Db, kind: Kind): Set<string>[] {
	return cached(db, `starters:${kind}`, () => {
		const p = participation(db, kind);
		const out: Set<string>[] = facts(db).races.map(() => new Set());
		for (const [id, list] of p) for (const i of list) out[i].add(id);
		return out;
	});
}

export function ageDaysAt(db: Db, driverId: string, date: string): number | null {
	const dob = db.drivers.get(driverId)?.dateOfBirth;
	if (!dob) return null;
	return Math.round((Date.parse(date) - Date.parse(dob)) / 86400000);
}

/** "18y 228d" */
export function ageText(db: Db, driverId: string, date: string): string {
	const dob = db.drivers.get(driverId)?.dateOfBirth;
	if (!dob) return "";
	const years = ageOn(dob, date)!;
	const b = new Date(dob);
	const anniv = Date.UTC(b.getUTCFullYear() + years, b.getUTCMonth(), b.getUTCDate());
	const days = Math.round((Date.parse(date) - anniv) / 86400000);
	return `${years}y ${days}d`;
}

/** The engine a driver mostly used in a season. */
export function seasonEngine(db: Db, driverId: string, year: number): string | null {
	return seasonMain(db, driverId, year, (r) => r.engineId);
}
export function seasonConstructor(db: Db, driverId: string, year: number): string | null {
	return seasonMain(db, driverId, year, (r) => r.constructorId);
}
function seasonMain(db: Db, driverId: string, year: number, pick: (r: Result) => string): string | null {
	const counts = new Map<string, number>();
	for (const r of db.resultsByDriver.get(driverId) ?? []) {
		if (db.raceById.get(r.raceId)!.year !== year) continue;
		counts.set(pick(r), (counts.get(pick(r)) ?? 0) + 1 + (r.points > 0 ? 0.5 : 0));
	}
	let best: string | null = null;
	let n = -1;
	for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
	return best;
}

/** Champions per season. Seasons still in progress have no champion. */
export function champions(db: Db, type: "driver" | "constructor"): { year: number; id: string; engineId?: string; points: number }[] {
	return cached(db, `champions:${type}`, () => {
		const out: { year: number; id: string; engineId?: string; points: number }[] = [];
		const map = type === "driver" ? db.driverStandings : db.constructorStandings;
		for (const year of [...map.keys()].sort((a, b) => a - b)) {
			const done = facts(db).seasons.get(year)?.length ?? 0;
			if (done < (db.racesByYear.get(year)?.length ?? 0)) continue;
			for (const r of map.get(year)!) if (r.champion) out.push({ year, id: r.id, engineId: r.engineId, points: r.points });
		}
		return out;
	});
}
