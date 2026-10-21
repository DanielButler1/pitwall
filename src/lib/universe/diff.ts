// "What changed": a universe compared with real history. Titles that changed
// hands, career totals that moved, races with a different winner and records
// with a new holder. Pure, so it works for any (db, base) pair; the cheap parts
// are memoised per pair and the records part is computed one category at a time
// so the page can spread it over several frames.

import type { Db } from "../f1/dataset.ts";
import { constructorCareers, driverCareers, winnerOf, type Career } from "../f1/stats.ts";
import { driverRef, raceRef, teamRef, type DriverRef, type RaceRef, type TeamRef } from "../f1/views.ts";
import { recordIndex, recordRows, type Cell, type RecordMeta, type RecordRow } from "../f1/records/index.ts";

export type TitleSwap<R> = {
	year: number;
	real: R | null;
	now: R | null;
	/** The season doesn't exist in reality (simulated future) or isn't finished there. */
	newSeason: boolean;
};

export const MOVER_METRICS = ["titles", "wins", "podiums", "poles", "points"] as const;
export type MoverMetric = (typeof MOVER_METRICS)[number];
export const MOVER_LABELS: Record<MoverMetric, string> = { titles: "Titles", wins: "Wins", podiums: "Podiums", poles: "Poles", points: "Points" };

export type Mover<R> = { ref: R; real: number; now: number; delta: number; realRank: number | null; nowRank: number | null };
export type Movers<R> = Record<MoverMetric, { gains: Mover<R>[]; losses: Mover<R>[]; changed: number }>;

export type WinnerChange = { race: RaceRef; real: DriverRef | null; now: DriverRef | null; realTeam: TeamRef | null; nowTeam: TeamRef | null };

export type UniverseDiff = {
	seasonsAffected: number;
	driverTitles: TitleSwap<DriverRef>[];
	constructorTitles: TitleSwap<TeamRef>[];
	drivers: Movers<DriverRef>;
	constructors: Movers<TeamRef>;
	/** Real races whose winner changed (list capped at `raceLimit`). */
	winners: { total: number; races: WinnerChange[] };
	/** Races that only exist in the universe, and real ones it no longer has. */
	newRaces: number;
	removedRaces: number;
	newDrivers: number;
};

const memo = new WeakMap<Db, WeakMap<Db, UniverseDiff>>();

export function universeDiff(db: Db, base: Db, opts: { moverLimit?: number; raceLimit?: number } = {}): UniverseDiff {
	const hit = !opts.moverLimit && !opts.raceLimit ? memo.get(db)?.get(base) : undefined;
	if (hit) return hit;
	const moverLimit = opts.moverLimit ?? 10;
	const raceLimit = opts.raceLimit ?? 200;
	const diff: UniverseDiff = {
		seasonsAffected: db.modifiedYears?.size ?? 0,
		driverTitles: titleSwaps(db, base, "driverStandings", driverRef),
		constructorTitles: titleSwaps(db, base, "constructorStandings", teamRef),
		drivers: movers(driverCareers(db), driverCareers(base), (id) => driverRef(db.drivers.has(id) ? db : base, id), moverLimit),
		constructors: movers(constructorCareers(db), constructorCareers(base), (id) => teamRef(db.constructors.has(id) ? db : base, id), moverLimit),
		...winnerChanges(db, base, raceLimit),
		newDrivers: [...db.drivers.keys()].filter((id) => !base.drivers.has(id)).length,
	};
	if (!opts.moverLimit && !opts.raceLimit) {
		let m = memo.get(db);
		if (!m) memo.set(db, (m = new WeakMap()));
		m.set(base, diff);
	}
	return diff;
}

/* ---------------------------------------------------------------- titles --- */

function titleSwaps<R>(db: Db, base: Db, key: "driverStandings" | "constructorStandings", ref: (db: Db, id: string) => R): TitleSwap<R>[] {
	const years = [...new Set([...db[key].keys(), ...base[key].keys()])].sort((a, b) => a - b);
	const out: TitleSwap<R>[] = [];
	for (const year of years) {
		if (db.modifiedYears && !db.modifiedYears.has(year) && db[key].get(year) === base[key].get(year)) continue;
		const real = base[key].get(year)?.find((r) => r.champion)?.id ?? null;
		const now = db[key].get(year)?.find((r) => r.champion)?.id ?? null;
		if (real === now) continue;
		out.push({ year, real: real ? ref(base, real) : null, now: now ? ref(db, now) : null, newSeason: !real && year > base.meta.lastCompletedYear });
	}
	return out;
}

/* ---------------------------------------------------------------- movers --- */

function ranks(careers: Map<string, Career>, metric: MoverMetric): Map<string, number> {
	const list = [...careers.values()].filter((c) => c[metric] > 0).sort((a, b) => b[metric] - a[metric]);
	const out = new Map<string, number>();
	list.forEach((c, i) => out.set(c.id, i > 0 && list[i - 1][metric] === c[metric] ? out.get(list[i - 1].id)! : i + 1));
	return out;
}

function movers<R>(now: Map<string, Career>, real: Map<string, Career>, ref: (id: string) => R, limit: number): Movers<R> {
	const ids = new Set([...now.keys(), ...real.keys()]);
	const out = {} as Movers<R>;
	for (const metric of MOVER_METRICS) {
		const rows: { id: string; real: number; now: number; delta: number }[] = [];
		for (const id of ids) {
			const r = real.get(id)?.[metric] ?? 0;
			const n = now.get(id)?.[metric] ?? 0;
			const delta = Math.round((n - r) * 100) / 100;
			if (delta) rows.push({ id, real: r, now: n, delta });
		}
		if (!rows.length) {
			out[metric] = { changed: 0, gains: [], losses: [] };
			continue;
		}
		const nowRanks = ranks(now, metric);
		const realRanks = ranks(real, metric);
		const full = ({ id, ...x }: (typeof rows)[number]): Mover<R> => ({ ref: ref(id), ...x, realRank: realRanks.get(id) ?? null, nowRank: nowRanks.get(id) ?? null });
		const tie = (a: (typeof rows)[number], b: (typeof rows)[number]) => b.now - a.now || a.id.localeCompare(b.id);
		out[metric] = {
			changed: rows.length,
			gains: rows
				.filter((x) => x.delta > 0)
				.sort((a, b) => b.delta - a.delta || tie(a, b))
				.slice(0, limit)
				.map(full),
			losses: rows
				.filter((x) => x.delta < 0)
				.sort((a, b) => a.delta - b.delta || tie(a, b))
				.slice(0, limit)
				.map(full),
		};
	}
	return out;
}

/* --------------------------------------------------------------- winners --- */

function winnerChanges(db: Db, base: Db, limit: number): Pick<UniverseDiff, "winners" | "newRaces" | "removedRaces"> {
	const races: WinnerChange[] = [];
	let total = 0;
	let newRaces = 0;
	for (const race of db.races) {
		if (!db.resultsByRace.has(race.id)) continue;
		if (!base.resultsByRace.has(race.id)) {
			newRaces++;
			continue;
		}
		if (db.resultsByRace.get(race.id) === base.resultsByRace.get(race.id)) continue;
		const now = winnerOf(db, race.id);
		const real = winnerOf(base, race.id);
		if (now?.driverId === real?.driverId) continue;
		total++;
		if (races.length < limit)
			races.push({
				race: raceRef(db, race),
				real: real ? driverRef(base, real.driverId) : null,
				now: now ? driverRef(db, now.driverId) : null,
				realTeam: real ? teamRef(base, real.constructorId) : null,
				nowTeam: now ? teamRef(db, now.constructorId) : null,
			});
	}
	let removedRaces = 0;
	for (const id of base.resultsByRace.keys()) if (!db.resultsByRace.has(id)) removedRaces++;
	return { winners: { total, races }, newRaces, removedRaces };
}

/* --------------------------------------------------------------- records --- */

// Every category costs a full pass over the results, for the universe and for
// reality, so by default only the headline ones are compared: totals, and the
// youngest / oldest / consecutive / single-season lists of the main stats.
const HEADLINE = /^(drivers|constructors)\/(titles|wins|poles|podiums|points|fastest-laps|grands-prix)\/(by-number|youngest|oldest|consecutive|in-a-year)$|^(engines|nations)\/(titles|wins|poles|points)\/by-number$/;

/** Record categories the "What changed" page compares: the headline set, or every one. */
export function recordDiffIds(all = false): string[] {
	return recordIndex()
		.filter((m) => all || HEADLINE.test(m.id))
		.map((m) => m.id);
}

export type RecordHolder = { subject: Cell[]; display: string };
export type RecordChange = {
	meta: RecordMeta;
	/** "holder": someone else now holds it; "value": same holder, different figure. */
	kind: "holder" | "value";
	real: RecordHolder[];
	now: RecordHolder[];
};

const leaders = (rows: RecordRow[] | null) => (rows ?? []).filter((r) => r.rank === 1);
const holder = (r: RecordRow): RecordHolder => ({ subject: r.subject, display: r.display });

/** How the top of one record category differs (null if it doesn't). Rows are memoised per Db by the records engine. */
export function recordChange(db: Db, base: Db, id: string): RecordChange | null {
	const meta = recordIndex().find((m) => m.id === id);
	if (!meta || db === base) return null;
	const now = leaders(recordRows(db, id));
	const real = leaders(recordRows(base, id));
	const keys = (l: RecordRow[]) => l.map((r) => r.key).sort().join("|");
	const kind = keys(now) !== keys(real) ? "holder" : now.map((r) => r.display).join() !== real.map((r) => r.display).join() ? "value" : null;
	if (!kind) return null;
	return { meta, kind, real: real.slice(0, 3).map(holder), now: now.slice(0, 3).map(holder) };
}

export function recordChanges(db: Db, base: Db, ids = recordDiffIds()): RecordChange[] {
	return ids.map((id) => recordChange(db, base, id)).filter((c): c is RecordChange => !!c);
}
