// "Guess the driver": one mystery driver a day, the same for everyone (picked from the UTC
// date), compared attribute by attribute with each guess. Pure, so the page and the tests
// share it; the driver list comes from public/data/guess.json (see guess-data.ts).

/** [id, name, flag, nationId, nation, firstYear, lastYear, starts, wins, podiums, poles, titles, teamIds] */
export type PackedGuessDriver = [string, string, string | null, string, string, number, number, number, number, number, number, number, string[]];
export type GuessFile = { teams: Record<string, string>; drivers: PackedGuessDriver[] };

export type GuessDriver = {
	id: string;
	name: string;
	flag: string | null;
	nationId: string;
	nation: string;
	first: number;
	last: number;
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	titles: number;
	/** Every team raced for, in order. */
	teams: string[];
};

export const unpack = ([id, name, flag, nationId, nation, first, last, starts, wins, podiums, poles, titles, teams]: PackedGuessDriver): GuessDriver => ({
	id,
	name,
	flag,
	nationId,
	nation,
	first,
	last,
	starts,
	wins,
	podiums,
	poles,
	titles,
	teams,
});

export const MAX_GUESSES = 8;
export type Difficulty = "modern" | "all";
export const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
	{ id: "modern", label: "Modern era", description: "Drivers who raced since 1980 with 50+ starts or a win" },
	{ id: "all", label: "All time", description: "Anyone since 1950 with 30+ starts or a win" },
];

/** Drivers the mystery driver can be: recognisable enough to be guessable. */
export function eligible(d: GuessDriver, difficulty: Difficulty): boolean {
	return difficulty === "modern" ? d.last >= 1980 && (d.starts >= 50 || d.wins > 0) : d.starts >= 30 || d.wins > 0;
}

/** Puzzle #1 is 21 October 2026 (UTC). */
const EPOCH = Date.UTC(2026, 9, 21);
const DAY = 86_400_000;
/** Days since the first puzzle, by UTC date (0 on launch day). */
export const dayIndex = (now: Date | number = Date.now()) => Math.floor((+now - EPOCH) / DAY);
export const puzzleNumber = (day: number) => day + 1;
/** Milliseconds until the next UTC midnight, when the next puzzle starts. */
export const msToNextPuzzle = (now: Date | number = Date.now()) => DAY - ((((+now - EPOCH) % DAY) + DAY) % DAY);

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const hash = (s: string) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
};

export function shuffle<T>(items: readonly T[], seed: number): T[] {
	const out = [...items];
	const next = rng(seed);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * The day's mystery driver: the pool (sorted by id) is shuffled once per cycle through it, so
 * nobody repeats until everyone has had a turn, and the order differs between cycles.
 */
export function dailyTarget(drivers: GuessDriver[], difficulty: Difficulty, day: number): GuessDriver {
	const pool = drivers.filter((d) => eligible(d, difficulty)).sort((a, b) => a.id.localeCompare(b.id));
	if (!pool.length) throw new Error("No eligible drivers");
	const cycle = Math.floor(day / pool.length);
	const at = ((day % pool.length) + pool.length) % pool.length;
	return shuffle(pool, hash(`pitwall-guess:${difficulty}:${cycle}`))[at];
}

export function randomTarget(drivers: GuessDriver[], difficulty: Difficulty, random = Math.random, exclude?: string): GuessDriver {
	const pool = drivers.filter((d) => eligible(d, difficulty) && d.id !== exclude);
	return pool[Math.floor(random() * pool.length)];
}

// --- comparing ---

export type Verdict = "match" | "close" | "miss";
/** Where the mystery driver's value lies relative to the guess's. */
export type Direction = "higher" | "lower" | null;
export type AttributeKey = "nation" | "first" | "last" | "teams" | "starts" | "wins" | "titles";
export type Tile = { key: AttributeKey; verdict: Verdict; direction: Direction };
export type TeamTile = Tile & { key: "teams"; shared: string[] };

export const ATTRIBUTES: { key: AttributeKey; label: string; short: string; close?: string }[] = [
	{ key: "nation", label: "Nationality", short: "Nat.", close: "same continent" },
	{ key: "first", label: "First season", short: "First", close: "within 5 years" },
	{ key: "last", label: "Last season", short: "Last", close: "within 5 years" },
	{ key: "teams", label: "Teams", short: "Teams", close: "at least one team in common" },
	{ key: "starts", label: "Starts", short: "Starts", close: "within 25" },
	{ key: "wins", label: "Wins", short: "Wins", close: "within 5" },
	{ key: "titles", label: "Titles", short: "Titles" },
];

/** How near a number counts as "close" (inclusive); absent: only exact matches count. */
const CLOSE: Partial<Record<AttributeKey, number>> = { first: 5, last: 5, starts: 25, wins: 5 };

const CONTINENTS: Record<string, string[]> = {
	europe: [
		"austria", "belgium", "czechia", "denmark", "east-germany", "estonia", "finland", "france", "germany", "hungary", "ireland", "italy", "liechtenstein",
		"monaco", "netherlands", "poland", "portugal", "russia", "spain", "sweden", "switzerland", "united-kingdom",
	],
	"north-america": ["canada", "mexico", "united-states-of-america"],
	"south-america": ["argentina", "brazil", "chile", "colombia", "uruguay", "venezuela"],
	asia: ["china", "india", "indonesia", "israel", "japan", "malaysia", "thailand"],
	africa: ["morocco", "rhodesia", "south-africa", "zimbabwe"],
	oceania: ["australia", "new-zealand"],
};
const CONTINENT_OF = new Map(Object.entries(CONTINENTS).flatMap(([c, ids]) => ids.map((id) => [id, c] as const)));
export const continentOf = (nationId: string) => CONTINENT_OF.get(nationId) ?? null;

function numeric(key: AttributeKey, guess: number, target: number): Tile {
	if (guess === target) return { key, verdict: "match", direction: null };
	const near = CLOSE[key];
	return { key, verdict: near != null && Math.abs(guess - target) <= near ? "close" : "miss", direction: target > guess ? "higher" : "lower" };
}

export type Comparison = { guess: GuessDriver; correct: boolean; tiles: [Tile, Tile, Tile, TeamTile, Tile, Tile, Tile] };

export function compare(guess: GuessDriver, target: GuessDriver): Comparison {
	const continent = continentOf(guess.nationId);
	const nation: Verdict = guess.nationId === target.nationId ? "match" : continent && continent === continentOf(target.nationId) ? "close" : "miss";
	const shared = guess.teams.filter((t) => target.teams.includes(t));
	const sameTeams = shared.length === guess.teams.length && shared.length === target.teams.length;
	return {
		guess,
		correct: guess.id === target.id,
		tiles: [
			{ key: "nation", verdict: nation, direction: null },
			numeric("first", guess.first, target.first),
			numeric("last", guess.last, target.last),
			{ key: "teams", verdict: sameTeams ? "match" : shared.length ? "close" : "miss", direction: null, shared },
			numeric("starts", guess.starts, target.starts),
			numeric("wins", guess.wins, target.wins),
			numeric("titles", guess.titles, target.titles),
		],
	};
}

// --- sharing ---

const SQUARE: Record<Verdict, string> = { match: "🟩", close: "🟨", miss: "⬛" };

export function shareText({ rows, won, label, url }: { rows: Comparison[]; won: boolean; label: string; url?: string }): string {
	const score = won ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	const grid = rows.map((r) => r.tiles.map((t) => SQUARE[t.verdict]).join(""));
	return [`Pitwall: Guess the driver ${label} ${score}`, ...grid, ...(url ? [url] : [])].join("\n");
}

// --- stats ---

export type GuessStats = {
	played: number;
	won: number;
	streak: number;
	maxStreak: number;
	/** Wins by number of guesses: index 0 = solved with the first guess. */
	distribution: number[];
	/** Day index of the last finished daily puzzle. */
	lastDay: number | null;
};

export const emptyStats = (): GuessStats => ({ played: 0, won: 0, streak: 0, maxStreak: 0, distribution: Array(MAX_GUESSES).fill(0), lastDay: null });

/** Records a finished daily puzzle (once per day: repeats are ignored). */
export function recordResult(stats: GuessStats, day: number, won: boolean, guesses: number): GuessStats {
	if (stats.lastDay != null && day <= stats.lastDay) return stats;
	const streak = won ? (stats.lastDay === day - 1 ? stats.streak : 0) + 1 : 0;
	const distribution = [...stats.distribution];
	if (won) distribution[guesses - 1] = (distribution[guesses - 1] ?? 0) + 1;
	return { played: stats.played + 1, won: stats.won + (won ? 1 : 0), streak, maxStreak: Math.max(stats.maxStreak, streak), distribution, lastDay: day };
}

/** The streak still alive today: broken once a whole day is missed. */
export const currentStreak = (stats: GuessStats, today: number) => (stats.lastDay != null && stats.lastDay >= today - 1 ? stats.streak : 0);

// --- search ---

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Drivers whose name matches every query token (prefix of a word, or anywhere), best first. */
export function searchDrivers(drivers: GuessDriver[], query: string, exclude: ReadonlySet<string> = new Set(), limit = 8): GuessDriver[] {
	const q = fold(query.trim());
	if (!q) return [];
	const tokens = q.split(/\s+/);
	const hits: { d: GuessDriver; s: number }[] = [];
	for (const d of drivers) {
		if (exclude.has(d.id)) continue;
		const name = fold(d.name);
		const words = name.split(/[\s\-.']+/);
		let s = 0;
		for (const t of tokens) {
			if (words.some((w) => w.startsWith(t))) continue;
			if (name.includes(t)) s += 2;
			else {
				s = -1;
				break;
			}
		}
		if (s < 0) continue;
		if (name.startsWith(q)) s -= 1;
		// better-known drivers first among equal matches
		hits.push({ d, s: s * 10_000 - d.starts - d.wins * 5 });
	}
	return hits
		.sort((a, b) => a.s - b.s)
		.slice(0, limit)
		.map((h) => h.d);
}
