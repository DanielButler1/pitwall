// "Grid of nine": a 3×3 board where every cell asks for a driver who fits both its row and its
// column category (a team, a nationality, a decade or a feat). Pure, so the page and the tests
// share it. The data file (public/data/grid.json, built by grid-data.ts) carries the category
// list and each driver's memberships; the board itself is generated here, deterministically
// from the day for the daily grid and from a random seed in practice.

import { emptyStats as emptyGameStats, hash, recordResult as recordGameResult, rng, VERDICT_SQUARE, type GameStats } from "./daily.ts";

export { dayIndex, puzzleNumber, rng } from "./daily.ts";

/* ----------------------------------------------------------------- file --- */

/** [id, label, flag]: id is `${kind}:${key}`; flag is an ISO alpha-2 code for nations and teams (the team's country). */
export type PackedCategory = [string, string, string | null];
/** [id, name, lastName, flag, firstYear, lastYear, starts, wins, categoryIndexes] */
export type PackedGridDriver = [string, string, string, string | null, number, number, number, number, number[]];
export type GridFile = { categories: PackedCategory[]; drivers: PackedGridDriver[] };

export type CategoryKind = "team" | "nation" | "decade" | "feat" | "mate";

export type Category = { index: number; id: string; kind: CategoryKind; key: string; label: string; flag: string | null };

export type GridDriver = {
	index: number;
	id: string;
	name: string;
	/** For cells on small screens. */
	lastName: string;
	flag: string | null;
	first: number;
	last: number;
	starts: number;
	wins: number;
	/** How well known: starts plus 5 per win. Rarity ranks answers by it. */
	fame: number;
	categories: number[];
};

/** Feats: the achievements a driver can have, with the header text and a one-line explanation. */
export const FEATS: Record<string, { label: string; hint: string }> = {
	winner: { label: "Won a race", hint: "Won at least one World Championship Grand Prix" },
	pole: { label: "Took a pole", hint: "Started at least one Grand Prix from pole position" },
	"fastest-lap": { label: "Set a fastest lap", hint: "Set the fastest lap of at least one Grand Prix" },
	podium: { label: "Podium finish", hint: "Finished in the top three of at least one Grand Prix" },
	champion: { label: "World Champion", hint: "Won the Drivers' Championship at least once" },
	"starts-100": { label: "100+ starts", hint: "Started 100 or more Grands Prix" },
	"starts-200": { label: "200+ starts", hint: "Started 200 or more Grands Prix" },
	pointless: { label: "Never scored a point", hint: "Started at least one Grand Prix but never scored a championship point" },
	monaco: { label: "Won at Monaco", hint: "Won the Monaco Grand Prix" },
	"home-win": { label: "Won a home Grand Prix", hint: "Won a Grand Prix held in their own country" },
	"teams-5": { label: "Raced for 5+ teams", hint: "Started races for five or more different constructors" },
};

/** Drivers whose team-mates make a category ("Team-mate of …"). */
export const MATES = ["michael-schumacher", "ayrton-senna", "fernando-alonso", "lewis-hamilton"];

export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export function categoryHint(c: Category): string {
	switch (c.kind) {
		case "team":
			return `Started at least one Grand Prix for ${c.label}`;
		case "nation":
			return `Nationality: ${c.label}`;
		case "decade":
			return `Started at least one Grand Prix between ${c.key} and ${+c.key + 9}`;
		case "mate":
			return `Started a Grand Prix in the same team as ${c.label.replace(/^Team-mate of /, "")}`;
		default:
			return FEATS[c.key]?.hint ?? c.label;
	}
}

/* ---------------------------------------------------------------- index --- */

export type GridData = {
	categories: Category[];
	byCategoryId: Map<string, Category>;
	drivers: GridDriver[];
	byId: Map<string, GridDriver>;
	/** One bitset of driver indexes per category. */
	bits: Uint32Array[];
	/** counts[a][b]: drivers in both a and b. counts[a][a] is the size of a. */
	counts: number[][];
	/** knownCounts[a][b]: of those, drivers with at least KNOWN_STARTS starts. */
	knownCounts: number[][];
};

/** A driver with this many starts counts as "known" when checking a cell is fair. */
export const KNOWN_STARTS = 30;

const popcount = (x: number) => {
	x -= (x >>> 1) & 0x55555555;
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

function andCount(a: Uint32Array, b: Uint32Array): number {
	let n = 0;
	for (let i = 0; i < a.length; i++) n += popcount(a[i] & b[i]);
	return n;
}

export function indexGrid(file: GridFile): GridData {
	const categories: Category[] = file.categories.map(([id, label, flag], index) => {
		const at = id.indexOf(":");
		return { index, id, kind: id.slice(0, at) as CategoryKind, key: id.slice(at + 1), label, flag };
	});
	const drivers: GridDriver[] = file.drivers.map(([id, name, lastName, flag, first, last, starts, wins, cats], index) => ({
		index,
		id,
		name,
		lastName,
		flag,
		first,
		last,
		starts,
		wins,
		fame: starts + wins * 5,
		categories: cats,
	}));
	const words = Math.ceil(drivers.length / 32);
	const bits = categories.map(() => new Uint32Array(words));
	const known = new Uint32Array(words);
	for (const d of drivers) {
		for (const c of d.categories) bits[c][d.index >>> 5] |= 1 << (d.index & 31);
		if (d.starts >= KNOWN_STARTS) known[d.index >>> 5] |= 1 << (d.index & 31);
	}
	const counts = categories.map(() => Array<number>(categories.length).fill(0));
	const knownCounts = categories.map(() => Array<number>(categories.length).fill(0));
	const tmp = new Uint32Array(words);
	for (let a = 0; a < categories.length; a++)
		for (let b = a; b < categories.length; b++) {
			for (let i = 0; i < words; i++) tmp[i] = bits[a][i] & bits[b][i];
			counts[a][b] = counts[b][a] = andCount(bits[a], bits[b]);
			knownCounts[a][b] = knownCounts[b][a] = andCount(tmp, known);
		}
	return {
		categories,
		byCategoryId: new Map(categories.map((c) => [c.id, c])),
		drivers,
		byId: new Map(drivers.map((d) => [d.id, d])),
		bits,
		counts,
		knownCounts,
	};
}

/* ------------------------------------------------------------ generator --- */

/** Category indexes: three rows (top to bottom) and three columns (left to right). */
export type Grid = { rows: number[]; cols: number[] };

/** Cell `i` (0..8, row-major) is rows[floor(i / 3)] × cols[i % 3]. */
export const cellCategories = (grid: Grid, cell: number): [number, number] => [grid.rows[Math.floor(cell / 3)], grid.cols[cell % 3]];

export const CELL_MIN = 3;
export const CELL_MAX = 45;
/** Per cell, at least this many answers need KNOWN_STARTS starts, so no cell is all trivia. */
export const CELL_MIN_KNOWN = 2;
const POINTLESS = "feat:pointless";
const POINTLESS_MIN = 5;
/** A pair where nearly everyone in the smaller category is also in the other is no puzzle (e.g. champions who won a race). */
const IMPLIED = 0.85;

/** At most this many categories of a kind per grid ("mate" counts as a feat). */
const KIND_LIMIT: Record<"team" | "nation" | "decade" | "feat", number> = { team: 4, nation: 2, decade: 2, feat: 3 };
const kindGroup = (k: CategoryKind) => (k === "mate" ? "feat" : k);

/** How often a category is drawn: the big, well-known teams and the feats come up more. */
function weight(c: Category, size: number): number {
	if (c.kind === "team") return size >= 40 ? 3 : size >= 20 ? 2 : 1;
	if (c.kind === "nation") return size >= 30 ? 2 : 1;
	if (c.kind === "decade" || c.id === "feat:teams-5") return 1;
	return 2;
}

export function cellFair(data: GridData, a: number, b: number): boolean {
	if (a === b) return false;
	const n = data.counts[a][b];
	if (n < CELL_MIN || n > CELL_MAX) return false;
	// nearly everyone who never scored is obscure, so those cells need more answers instead of known ones
	if (data.categories[a].id === POINTLESS || data.categories[b].id === POINTLESS) {
		if (n < POINTLESS_MIN) return false;
	} else if (data.knownCounts[a][b] < CELL_MIN_KNOWN) return false;
	return n < IMPLIED * Math.min(data.counts[a][a], data.counts[b][b]);
}

/** Weighted sampling without replacement: `count` of `pool`, or fewer if `allow` rejects the rest. */
function sample(pool: number[], count: number, w: (i: number) => number, random: () => number, allow: (i: number, chosen: number[]) => boolean): number[] {
	const keyed = pool.map((i) => ({ i, k: Math.pow(random(), 1 / w(i)) })).sort((a, b) => b.k - a.k);
	const out: number[] = [];
	for (const { i } of keyed) {
		if (out.length >= count) break;
		if (allow(i, out)) out.push(i);
	}
	return out;
}

/**
 * A grid where every cell is fair (CELL_MIN..CELL_MAX answers, enough known ones, not implied),
 * with a mix of kinds. Deterministic for a given `random`.
 */
export function generateGrid(data: GridData, random: () => number): Grid {
	const all = data.categories.map((c) => c.index);
	const w = (i: number) => weight(data.categories[i], data.counts[i][i]);
	const group = (i: number) => kindGroup(data.categories[i].kind);
	const tally = (list: number[]) => {
		const t: Record<string, number> = {};
		for (const i of list) t[group(i)] = (t[group(i)] ?? 0) + 1;
		return t;
	};
	const underLimit = (i: number, chosen: number[], axisMax: number) => {
		const t = tally(chosen);
		const g = group(i);
		return (t[g] ?? 0) < Math.min(axisMax, KIND_LIMIT[g]);
	};
	for (let attempt = 0; attempt < 5000; attempt++) {
		// rows: up to two of a kind
		const rows = sample(all, 3, w, random, (i, chosen) => underLimit(i, chosen, 2));
		if (rows.length < 3) continue;
		const candidates = all.filter((c) => !rows.includes(c) && rows.every((r) => cellFair(data, r, c)));
		if (candidates.length < 3) continue;
		const cols = sample(candidates, 3, w, random, (i, chosen) => {
			if (!underLimit(i, chosen, 2)) return false;
			const t = tally([...rows, ...chosen]);
			return (t[group(i)] ?? 0) < KIND_LIMIT[group(i)];
		});
		if (cols.length < 3) continue;
		// columns read better with the "harder" kinds (nations, feats) across the top half the time
		return random() < 0.5 ? { rows, cols } : { rows: cols, cols: rows };
	}
	throw new Error("No grid found");
}

/** The day's grid, the same for everyone. */
export const dailyGrid = (data: GridData, day: number): Grid => generateGrid(data, rng(hash(`pitwall-grid:${day}`)));

export const gridIds = (data: GridData, grid: Grid): string[] => [...grid.rows, ...grid.cols].map((i) => data.categories[i].id);

/** A grid back from its six category ids (rows then columns), or null if any no longer exists. */
export function gridFromIds(data: GridData, ids: string[] | undefined): Grid | null {
	if (!ids || ids.length !== 6) return null;
	const idx = ids.map((id) => data.byCategoryId.get(id)?.index);
	if (idx.some((i) => i == null)) return null;
	return { rows: idx.slice(0, 3) as number[], cols: idx.slice(3) as number[] };
}

/* -------------------------------------------------------------- answers --- */

const has = (data: GridData, cat: number, d: GridDriver) => (data.bits[cat][d.index >>> 5] & (1 << (d.index & 31))) !== 0;

export const fits = (data: GridData, grid: Grid, cell: number, d: GridDriver) => cellCategories(grid, cell).every((c) => has(data, c, d));

/** Every valid answer for a cell, most famous first. */
export function cellAnswers(data: GridData, grid: Grid, cell: number): GridDriver[] {
	const [a, b] = cellCategories(grid, cell);
	return data.drivers.filter((d) => has(data, a, d) && has(data, b, d)).sort((x, y) => y.fame - x.fame || x.name.localeCompare(y.name));
}

/**
 * How obscure an answer is among the cell's valid answers, 0–100: the share of the other
 * answers that are better known. The most famous answer scores 0, the least known 100.
 */
export function rarity(answers: GridDriver[], d: GridDriver): number {
	if (answers.length <= 1) return 0;
	const better = answers.filter((a) => a.fame > d.fame).length;
	return Math.round((100 * better) / (answers.length - 1));
}

/* ----------------------------------------------------------------- play --- */

export const MAX_GUESSES = 9;
export const CELLS = 9;

/** One guess: [cell, driverId]. */
export type Attempt = [number, string];

export type CellState = { driver: GridDriver; rarity: number } | null;

export type Board = {
	cells: CellState[];
	/** Wrong guesses, in order. */
	misses: { cell: number; driver: GridDriver }[];
	used: number;
	left: number;
	filled: number;
	rarity: number;
	over: boolean;
};

/** Replays a game's guesses: correct ones fill their cell (once per cell and per driver), everything else is a miss. */
export function playBoard(data: GridData, grid: Grid, attempts: Attempt[], answers: GridDriver[][] = Array.from({ length: CELLS }, (_, i) => cellAnswers(data, grid, i))): Board {
	const cells: CellState[] = Array(CELLS).fill(null);
	const misses: Board["misses"] = [];
	const usedDrivers = new Set<string>();
	let used = 0;
	for (const [cell, id] of attempts.slice(0, MAX_GUESSES)) {
		const d = data.byId.get(id);
		if (!d || cell < 0 || cell >= CELLS) continue;
		used++;
		if (!cells[cell] && !usedDrivers.has(id) && fits(data, grid, cell, d)) {
			cells[cell] = { driver: d, rarity: rarity(answers[cell], d) };
			usedDrivers.add(id);
		} else misses.push({ cell, driver: d });
	}
	const filled = cells.filter(Boolean).length;
	return {
		cells,
		misses,
		used,
		left: MAX_GUESSES - used,
		filled,
		rarity: cells.reduce((s, c) => s + (c?.rarity ?? 0), 0),
		over: used >= MAX_GUESSES || filled === CELLS,
	};
}

/* -------------------------------------------------------------- sharing --- */

export function shareText({ board, label, url }: { board: Board; label: string; url?: string }): string {
	const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => VERDICT_SQUARE[board.cells[r * 3 + c] ? "match" : "miss"]).join(""));
	return [`Pitwall: Grid of nine ${label}`, ...rows, `${board.filled}/${CELLS} · rarity ${board.rarity}`, ...(url ? [url] : [])].join("\n");
}

/* ---------------------------------------------------------------- stats --- */

/** Daily stats; the distribution counts games by cells filled (index 0..9). A "win" is a full grid. */
export type GridStats = GameStats;

export const emptyStats = (): GridStats => emptyGameStats(CELLS + 1);

/** Records a finished daily grid (once per day: repeats are ignored). */
export const recordResult = (stats: GridStats, day: number, filled: number): GridStats => recordGameResult(stats, day, filled === CELLS, filled);

/** Search ranking: better-known drivers first among equal matches. */
export const driverWeight = (d: GridDriver) => d.fame;
