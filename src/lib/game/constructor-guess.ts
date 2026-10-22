// "Guess the constructor": one mystery team a day, the same for everyone, compared clue by clue
// with each guess (nationality, career span, engines, races, wins, titles). Pure, so the page
// and the tests share it; the team list comes from public/data/constructor-guess.json (see
// constructor-guess-data.ts). Calendar, stats and search are the shared kit (daily.ts, clue.ts).

import { compareNumber, dailyPick, randomPick, type Direction, type Verdict } from "./daily.ts";
import { clueShareText, compareCountry, type Difficulty } from "./clue.ts";

export { MAX_GUESSES, emptyStats, recordResult, type Difficulty } from "./clue.ts";

/**
 * [id, name, flag, nationId, nation, firstYear, lastYear, entries, starts, wins, podiums, poles, titles,
 *  engineIds (most-used first), notable driverIds (most wins, then starts), indyOnly (1 if mostly Indy 500 entries)]
 */
export type PackedConstructor = [string, string, string | null, string, string, number, number, number, number, number, number, number, number, string[], string[], 0 | 1];
export type ConstructorFile = { engines: Record<string, string>; drivers: Record<string, string>; constructors: PackedConstructor[] };

export type GuessConstructor = {
	id: string;
	name: string;
	flag: string | null;
	nationId: string;
	nation: string;
	first: number;
	last: number;
	entries: number;
	/** Races started. */
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	/** Constructors' championships. */
	titles: number;
	/** Engine makers used in at least two races, most-used first: the first is the main engine. */
	engines: string[];
	/** Up to three drivers who did the most for the team (wins, then starts). */
	drivers: string[];
	/** Raced (almost) only in the Indianapolis 500 of the 1950s championship. */
	indyOnly: boolean;
};

export const unpack = ([id, name, flag, nationId, nation, first, last, entries, starts, wins, podiums, poles, titles, engines, drivers, indy]: PackedConstructor): GuessConstructor => ({
	id,
	name,
	flag,
	nationId,
	nation,
	first,
	last,
	entries,
	starts,
	wins,
	podiums,
	poles,
	titles,
	engines,
	drivers,
	indyOnly: indy === 1,
});

export const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
	{ id: "modern", label: "Modern era", description: "Teams that raced since 1980 with 30+ races or a win" },
	{ id: "all", label: "All time", description: "Any team since 1950 with 30+ races or a win" },
];

/** Teams the mystery constructor can be: recognisable enough to be guessable (not the Indy 500-only cars). */
export function eligible(c: GuessConstructor, difficulty: Difficulty): boolean {
	if (c.indyOnly || !(c.starts >= 30 || c.wins > 0)) return false;
	return difficulty === "all" || c.last >= 1980;
}

/** The day's mystery constructor: each cycle through the pool (sorted by id) is a fresh shuffle, so nobody repeats within it. */
export function dailyTarget(constructors: GuessConstructor[], difficulty: Difficulty, day: number): GuessConstructor {
	const pool = constructors.filter((c) => eligible(c, difficulty)).sort((a, b) => a.id.localeCompare(b.id));
	return dailyPick(pool, `constructor:${difficulty}`, day);
}

export function randomTarget(constructors: GuessConstructor[], difficulty: Difficulty, random = Math.random, exclude?: string): GuessConstructor {
	return randomPick(
		constructors.filter((c) => eligible(c, difficulty)),
		random,
		exclude,
	);
}

// --- comparing ---

export type AttributeKey = "nation" | "first" | "last" | "engines" | "starts" | "wins" | "titles";
export type Tile = { key: AttributeKey; verdict: Verdict; direction: Direction };
export type EngineTile = Tile & { key: "engines"; shared: string[] };

export const ATTRIBUTES: { key: AttributeKey; label: string; short: string; close?: string }[] = [
	{ key: "nation", label: "Nationality", short: "Nat.", close: "same continent" },
	{ key: "first", label: "First season", short: "First", close: "within 5 years" },
	{ key: "last", label: "Last season", short: "Last", close: "within 5 years" },
	{ key: "engines", label: "Engines", short: "Eng.", close: "an engine maker in common" },
	{ key: "starts", label: "Races", short: "Races", close: "within 50" },
	{ key: "wins", label: "Wins", short: "Wins", close: "within 5" },
	{ key: "titles", label: "Titles", short: "Titles" },
];

/** How near a number counts as "close" (inclusive); absent: only exact matches count. */
const CLOSE: Partial<Record<AttributeKey, number>> = { first: 5, last: 5, starts: 50, wins: 5 };
const numeric = (key: AttributeKey, guess: number, target: number): Tile => ({ key, ...compareNumber(guess, target, CLOSE[key]) });

/**
 * Engines: a match when both teams' main engine (the one used in the most races) is the same
 * maker, close when they used any engine maker in common.
 */
export function compareEngines(guess: string[], target: string[]): { verdict: Verdict; shared: string[] } {
	const shared = guess.filter((e) => target.includes(e));
	return { verdict: guess.length && guess[0] === target[0] ? "match" : shared.length ? "close" : "miss", shared };
}

export type Comparison = { guess: GuessConstructor; correct: boolean; tiles: [Tile, Tile, Tile, EngineTile, Tile, Tile, Tile] };

export function compare(guess: GuessConstructor, target: GuessConstructor): Comparison {
	const engines = compareEngines(guess.engines, target.engines);
	return {
		guess,
		correct: guess.id === target.id,
		tiles: [
			{ key: "nation", verdict: compareCountry(guess.nationId, target.nationId), direction: null },
			numeric("first", guess.first, target.first),
			numeric("last", guess.last, target.last),
			{ key: "engines", verdict: engines.verdict, direction: null, shared: engines.shared },
			numeric("starts", guess.starts, target.starts),
			numeric("wins", guess.wins, target.wins),
			numeric("titles", guess.titles, target.titles),
		],
	};
}

export const shareText = (o: { rows: Comparison[]; won: boolean; label: string; url?: string }) => clueShareText({ title: "Guess the constructor", ...o });

/** How well known a team is, for ranking search results. */
export const constructorWeight = (c: GuessConstructor) => c.starts + c.wins * 5;
