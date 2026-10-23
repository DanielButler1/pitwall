// "Guess the driver": one mystery driver a day, the same for everyone (picked from the UTC
// date), compared attribute by attribute with each guess. Pure, so the page and the tests
// share it; the driver list comes from public/data/guess.json (see guess-data.ts). The
// calendar, stats and search plumbing is shared with the other daily games (daily.ts).

import {
	compareNumber,
	dailyPick,
	emptyStats as emptyGameStats,
	randomPick,
	recordResult as recordGameResult,
	searchByName,
	VERDICT_SQUARE,
	type Direction,
	type GameStats,
	type Verdict,
} from "./daily.ts";

export { currentStreak, dayIndex, fold, msToNextPuzzle, puzzleNumber, rng, shuffle, type Direction, type Verdict } from "./daily.ts";

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

/**
 * The day's mystery driver: the pool (sorted by id) is shuffled once per cycle through it, so
 * nobody repeats until everyone has had a turn, and the order differs between cycles.
 */
export function dailyTarget(drivers: GuessDriver[], difficulty: Difficulty, day: number): GuessDriver {
	const pool = drivers.filter((d) => eligible(d, difficulty)).sort((a, b) => a.id.localeCompare(b.id));
	if (!pool.length) throw new Error("No eligible drivers");
	return dailyPick(pool, `guess:${difficulty}`, day);
}

export function randomTarget(drivers: GuessDriver[], difficulty: Difficulty, random = Math.random, exclude?: string): GuessDriver {
	return randomPick(drivers.filter((d) => eligible(d, difficulty)), random, exclude);
}

// --- comparing ---

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

const numeric = (key: AttributeKey, guess: number, target: number): Tile => ({ key, ...compareNumber(guess, target, CLOSE[key]) });

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

export function shareText({ rows, won, label, url }: { rows: Comparison[]; won: boolean; label: string; url?: string }): string {
	const score = won ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	const grid = rows.map((r) => r.tiles.map((t) => VERDICT_SQUARE[t.verdict]).join(""));
	return [`Pitwall: Guess the driver ${label} ${score}`, ...grid, ...(url ? [url] : [])].join("\n");
}

// --- stats ---

/** Daily stats; the distribution counts wins by number of guesses (index 0 = solved with the first guess). */
export type GuessStats = GameStats;

export const emptyStats = (): GuessStats => emptyGameStats(MAX_GUESSES);

/** Records a finished daily puzzle (once per day: repeats are ignored). */
export const recordResult = (stats: GuessStats, day: number, won: boolean, guesses: number): GuessStats => recordGameResult(stats, day, won, won ? guesses - 1 : null);

// --- search ---

/** Drivers whose name matches every query token (prefix of a word, or anywhere), best first. */
export const searchDrivers = (drivers: GuessDriver[], query: string, exclude: ReadonlySet<string> = new Set(), limit = 8): GuessDriver[] =>
	// better-known drivers first among equal matches
	searchByName(drivers, query, (d) => d.name, driverWeight, exclude, limit);

/** How well known a driver is, for ranking search results. */
export const driverWeight = (d: GuessDriver) => d.starts + d.wins * 5;
