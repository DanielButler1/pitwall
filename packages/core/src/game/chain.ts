// "Teammate chain": link Driver A to Driver B through team-mates in as few links as possible.
// Team-mates are drivers entered for the same constructor in the same race (the definition the
// head-to-head pages use, lib/f1/teammates.ts). The graph comes from public/data/chain.json
// (see chain-data.ts); par is the shortest path, found by breadth-first search. Pure, so the
// page and the tests share it. Calendar, stats and storage plumbing: daily.ts.

import { dailyPick, emptyStats as emptyGameStats, randomPick, recordResult as recordGameResult, searchByName, type GameStats } from "./daily.ts";

export { currentStreak, dayIndex, puzzleNumber, rng } from "./daily.ts";

/* ----------------------------------------------------------------- file --- */

/** Years in the file are stored as offsets from this one. */
export const YEAR0 = 1950;
/** [id, name, lastName, flag, firstYear, lastYear, starts, wins, titles] */
export type PackedChainDriver = [string, string, string, string | null, number, number, number, number, number];
/** [driverA, driverB, team, from - YEAR0, to - YEAR0, team, from, to, …]: indexes into `drivers` (a < b) and `teams`. */
export type PackedEdge = number[];
export type ChainFile = { teams: [string, string][]; drivers: PackedChainDriver[]; edges: PackedEdge[] };

export type ChainDriver = {
	/** Position in the file's (id-sorted) driver list. */
	i: number;
	id: string;
	name: string;
	lastName: string;
	flag: string | null;
	first: number;
	last: number;
	starts: number;
	wins: number;
	titles: number;
};
/** A run of consecutive seasons two drivers were team-mates at one constructor. */
export type Stint = { team: number; from: number; to: number };
export type Team = { id: string; name: string };

export type Graph = {
	drivers: ChainDriver[];
	byId: Map<string, ChainDriver>;
	teams: Team[];
	/** For each driver index: team-mate index → the stints they shared, earliest first. */
	adj: Map<number, Stint[]>[];
};

export function unpack(file: ChainFile): Graph {
	const drivers = file.drivers.map(([id, name, lastName, flag, first, last, starts, wins, titles], i): ChainDriver => ({ i, id, name, lastName, flag, first, last, starts, wins, titles }));
	const adj = drivers.map(() => new Map<number, Stint[]>());
	for (const [a, b, ...rest] of file.edges) {
		const stints: Stint[] = [];
		for (let k = 0; k + 2 < rest.length; k += 3) stints.push({ team: rest[k], from: rest[k + 1] + YEAR0, to: rest[k + 2] + YEAR0 });
		adj[a].set(b, stints);
		adj[b].set(a, stints);
	}
	return { drivers, byId: new Map(drivers.map((d) => [d.id, d])), teams: file.teams.map(([id, name]) => ({ id, name })), adj };
}

/** The stints `a` and `b` shared, or null if they were never team-mates. */
export const linkOf = (g: Graph, a: number, b: number): Stint[] | null => g.adj[a]?.get(b) ?? null;

/** "McLaren, 1988–1989" (several teams joined with " · ", gaps as "1985–1987, 1990"). */
export function linkLabel(g: Graph, stints: Stint[]): string {
	return groupStints(stints)
		.map(({ team, ranges }) => `${g.teams[team]?.name ?? "?"}, ${ranges.join(", ")}`)
		.join(" · ");
}

/** Stints grouped by team (in order of first appearance), with each run as "1988" or "1988–1989". */
export function groupStints(stints: Stint[]): { team: number; ranges: string[] }[] {
	const out: { team: number; ranges: string[] }[] = [];
	for (const s of stints) {
		let g = out.find((x) => x.team === s.team);
		if (!g) out.push((g = { team: s.team, ranges: [] }));
		g.ranges.push(s.from === s.to ? String(s.from) : `${s.from}–${s.to}`);
	}
	return out;
}

/* ---------------------------------------------------------------- paths --- */

/** Links from `from` to every driver (-1 where there's no chain at all). */
export function distances(g: Graph, from: number): Int16Array {
	const d = new Int16Array(g.drivers.length).fill(-1);
	d[from] = 0;
	const queue = [from];
	for (let q = 0; q < queue.length; q++) {
		const x = queue[q];
		for (const n of g.adj[x].keys()) {
			if (d[n] < 0) {
				d[n] = d[x] + 1;
				queue.push(n);
			}
		}
	}
	return d;
}

/** How well known a driver is: ranks search results and picks the drivers shown in model chains and hints. */
export const driverWeight = (d: Pick<ChainDriver, "starts" | "wins" | "titles">) => d.starts + d.wins * 5 + d.titles * 50;

/**
 * One shortest chain from `a` to `b` (driver indexes, both included), or null if none: at each
 * step the best-known team-mate that's still on a shortest route.
 */
export function shortestChain(g: Graph, a: number, b: number): number[] | null {
	const toB = distances(g, b);
	if (toB[a] < 0) return null;
	const path = [a];
	let x = a;
	while (x !== b) {
		let best = -1;
		for (const n of g.adj[x].keys()) if (toB[n] === toB[x] - 1 && (best < 0 || driverWeight(g.drivers[n]) > driverWeight(g.drivers[best]))) best = n;
		path.push((x = best));
	}
	return path;
}

/* --------------------------------------------------------------- puzzles --- */

export type Difficulty = "classic" | "hard";
export const DIFFICULTIES: { id: Difficulty; label: string; description: string; par: [number, number] }[] = [
	{ id: "classic", label: "Classic", description: "Par is 3 or 4 links", par: [3, 4] },
	{ id: "hard", label: "Hard", description: "Par is 5 or 6 links", par: [5, 6] },
];

/** Drivers recognisable enough to be an end of the chain. */
export const recognisable = (d: ChainDriver) => d.starts >= 50 || d.wins > 0;

export type Pair = { id: string; a: number; b: number; par: number };

const pools = new WeakMap<Graph, Map<Difficulty, Pair[]>>();

/**
 * Every possible puzzle for a difficulty, sorted by id: a champion and another recognisable
 * driver whose shortest chain is within the difficulty's par range. A is the driver whose
 * career started first.
 */
export function pairPool(g: Graph, difficulty: Difficulty): Pair[] {
	let byDifficulty = pools.get(g);
	if (!byDifficulty) pools.set(g, (byDifficulty = new Map()));
	const cached = byDifficulty.get(difficulty);
	if (cached) return cached;
	const [lo, hi] = DIFFICULTIES.find((d) => d.id === difficulty)!.par;
	const ends = g.drivers.filter(recognisable);
	const seen = new Map<string, Pair>();
	for (const c of ends) {
		if (!c.titles) continue;
		const d = distances(g, c.i);
		for (const o of ends) {
			const par = d[o.i];
			if (o.i === c.i || par < lo || par > hi) continue;
			const [a, b] = c.first < o.first || (c.first === o.first && c.id < o.id) ? [c, o] : [o, c];
			const id = `${a.id}|${b.id}`;
			if (!seen.has(id)) seen.set(id, { id, a: a.i, b: b.i, par });
		}
	}
	const pool = [...seen.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
	byDifficulty.set(difficulty, pool);
	return pool;
}

export const dailyPair = (g: Graph, difficulty: Difficulty, day: number): Pair => dailyPick(pairPool(g, difficulty), `chain:${difficulty}`, day);
export const randomPair = (g: Graph, difficulty: Difficulty, random = Math.random, exclude?: string): Pair => randomPick(pairPool(g, difficulty), random, exclude);

/** A puzzle by its driver ids (e.g. from a save), with par from the current graph; null if unknown or unconnected. */
export function pairOf(g: Graph, aId: string, bId: string): Pair | null {
	const a = g.byId.get(aId);
	const b = g.byId.get(bId);
	if (!a || !b || a === b) return null;
	const par = distances(g, a.i)[b.i];
	return par > 0 ? { id: `${aId}|${bId}`, a: a.i, b: b.i, par } : null;
}

/* ----------------------------------------------------------------- play --- */

export const MAX_STRIKES = 3;
/** Actions in a save, replayed to rebuild the game: a driver id, or one of these. */
export const UNDO = "!undo";
export const HINT = "!hint";
export const GIVE_UP = "!give-up";

export type End = "top" | "bottom";
export type Strike = { driver: number; top: number; bottom: number };
export type HintInfo = { end: End; from: number; to: number; stints: Stint[] };

export type ChainState = {
	pair: Pair;
	/** The chain growing from A: A first. */
	top: number[];
	/** The chain growing from B: B first. */
	bottom: number[];
	/** Placements in order, for undo. */
	placed: End[];
	strikes: Strike[];
	hints: HintInfo[];
	/** The hint for the current ends, if one was taken since the last placement. */
	hint: HintInfo | null;
	solved: boolean;
	gaveUp: boolean;
	over: boolean;
};

export const topEnd = (s: Pick<ChainState, "top">) => s.top[s.top.length - 1];
export const bottomEnd = (s: Pick<ChainState, "bottom">) => s.bottom[s.bottom.length - 1];
/** Strikes used: wrong picks plus hints. */
export const strikesUsed = (s: ChainState) => s.strikes.length + s.hints.length;
/** Links in the chain so far (when solved: the whole chain). */
export const linkCount = (s: ChainState) => s.top.length - 1 + s.bottom.length - 1 + (s.solved ? 1 : 0);
/** The finished chain from A to B (or what's built so far, top then bottom reversed). */
export const fullChain = (s: ChainState) => [...s.top, ...[...s.bottom].reverse()];
export const inChain = (s: ChainState, i: number) => s.top.includes(i) || s.bottom.includes(i);
export const canHint = (s: ChainState) => !s.over && !s.hint && strikesUsed(s) < MAX_STRIKES - 1;

export const newGame = (pair: Pair): ChainState => ({
	pair,
	top: [pair.a],
	bottom: [pair.b],
	placed: [],
	strikes: [],
	hints: [],
	hint: null,
	solved: false,
	gaveUp: false,
	over: false,
});

/** What picking driver `i` would do: extend an end, strike, or nothing (in the chain already, or already ruled out here). */
export function classify(g: Graph, s: ChainState, i: number): End | "strike" | "repeat" {
	if (inChain(s, i)) return "repeat";
	const t = topEnd(s);
	const b = bottomEnd(s);
	if (linkOf(g, t, i)) return "top";
	if (linkOf(g, b, i)) return "bottom";
	return s.strikes.some((x) => x.driver === i && x.top === t && x.bottom === b) ? "repeat" : "strike";
}

/** The best next step from the current ends: a team-mate one link closer to the other end, top end preferred. */
export function nextHint(g: Graph, s: ChainState): HintInfo | null {
	const t = topEnd(s);
	const b = bottomEnd(s);
	const fromT = distances(g, t);
	const fromB = distances(g, b);
	if (fromT[b] < 0) return null;
	for (const [end, from, toOther] of [
		["top", t, fromB],
		["bottom", b, fromT],
	] as const) {
		let best: number | null = null;
		for (const n of g.adj[from].keys()) {
			if (inChain(s, n) || toOther[n] !== fromT[b] - 1) continue;
			if (best == null || driverWeight(g.drivers[n]) > driverWeight(g.drivers[best])) best = n;
		}
		if (best != null) return { end, from, to: best, stints: linkOf(g, from, best)! };
	}
	return null;
}

/** Applies one action; finished games and no-op picks come back unchanged. */
export function step(g: Graph, s: ChainState, action: string): ChainState {
	if (s.over) return s;
	if (action === GIVE_UP) return { ...s, gaveUp: true, over: true };
	if (action === UNDO) {
		const last = s.placed[s.placed.length - 1];
		if (!last) return s;
		return { ...s, [last]: s[last].slice(0, -1), placed: s.placed.slice(0, -1), hint: null };
	}
	if (action === HINT) {
		if (!canHint(s)) return s;
		const hint = nextHint(g, s);
		return hint ? { ...s, hints: [...s.hints, hint], hint } : s;
	}
	const d = g.byId.get(action);
	if (!d) return s;
	const kind = classify(g, s, d.i);
	if (kind === "repeat") return s;
	if (kind === "strike") {
		const strikes = [...s.strikes, { driver: d.i, top: topEnd(s), bottom: bottomEnd(s) }];
		return { ...s, strikes, over: strikes.length + s.hints.length >= MAX_STRIKES };
	}
	const next = { ...s, [kind]: [...s[kind], d.i], placed: [...s.placed, kind], hint: null };
	const solved = !!linkOf(g, topEnd(next), bottomEnd(next));
	return { ...next, solved, over: solved };
}

export const replay = (g: Graph, pair: Pair, actions: readonly string[]): ChainState => actions.reduce((s, a) => step(g, s, a), newGame(pair));

/** True if the action would change the game (so it's worth saving). */
export const changes = (g: Graph, s: ChainState, action: string) => step(g, s, action) !== s;

/* ---------------------------------------------------------------- score --- */

/** Distribution buckets: wins at par, +1, +2, +3 or more. */
export const BUCKETS = 4;
export const overPar = (s: ChainState) => linkCount(s) - s.pair.par;
export const scoreBucket = (s: ChainState) => Math.min(BUCKETS - 1, Math.max(0, overPar(s)));
export const bucketLabel = (i: number) => (i === 0 ? "Par" : i === BUCKETS - 1 ? `+${i}+` : `+${i}`);

export type ChainStats = GameStats;
export const emptyStats = (): ChainStats => emptyGameStats(BUCKETS);
/** Records a finished daily puzzle (once per day): wins by links over par. */
export const recordResult = (stats: ChainStats, day: number, s: ChainState): ChainStats => recordGameResult(stats, day, s.solved, s.solved ? scoreBucket(s) : null);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The share text: ends and the score only, never the drivers in between. */
export function shareText(g: Graph, s: ChainState, { label, url }: { label: string; url?: string }): string {
	const a = g.drivers[s.pair.a].lastName;
	const b = g.drivers[s.pair.b].lastName;
	const extras = [s.strikes.length ? plural(s.strikes.length, "strike") : "", s.hints.length ? plural(s.hints.length, "hint") : ""].filter(Boolean);
	const tail = extras.length ? ` (${extras.join(", ")})` : "";
	const line = s.solved
		? `${"🔗".repeat(linkCount(s))} par ${s.pair.par} ✓${tail}`
		: `${"🔗".repeat(linkCount(s))}❌ par ${s.pair.par}, not connected${tail}`;
	return [`Pitwall Teammate chain ${label}`, `${a} → … → ${b}`, line, ...(url ? [url] : [])].join("\n");
}

/* --------------------------------------------------------------- search --- */

export const searchDrivers = (g: Graph, query: string, exclude: ReadonlySet<string> = new Set(), limit = 8): ChainDriver[] =>
	searchByName(g.drivers, query, (d) => d.name, driverWeight, exclude, limit);
