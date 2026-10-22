// "Guess the circuit": one mystery circuit a day, the same for everyone, compared clue by clue
// with each guess: country (plus the distance and compass direction from the guess), layout
// type, length, turns and its Grand Prix history. Pure, so the page and the tests share it;
// the circuit list comes from public/data/circuit-guess.json (see circuit-guess-data.ts).

import { compareNumber, dailyPick, randomPick, type Direction, type Verdict } from "./daily.ts";
import { bearing, clueShareText, compareCountry, distanceKm, type Difficulty } from "./clue.ts";

export { MAX_GUESSES, emptyStats, recordResult, type Difficulty } from "./clue.ts";

export type CircuitType = "RACE" | "ROAD" | "STREET";

/**
 * [id, name, alias (better-known name, or null), fullName, place, flag, countryId, country, lat, lng, type,
 *  direction, length km, turns, first year, last year, races held, [grandPrixId, first, last, count][], [driverId, wins][]]
 */
export type PackedCircuit = [
	string, string, string | null, string, string, string | null, string, string, number, number, CircuitType, string, number, number, number, number, number,
	[string, number, number, number][], [string, number][],
];
export type CircuitFile = { grandsPrix: Record<string, string>; drivers: Record<string, string>; circuits: PackedCircuit[] };

export type GuessCircuit = {
	id: string;
	name: string;
	/** A better-known name to search by (e.g. Interlagos for José Carlos Pace), or null. */
	alias: string | null;
	fullName: string;
	place: string;
	flag: string | null;
	countryId: string;
	country: string;
	lat: number;
	lng: number;
	type: CircuitType;
	clockwise: boolean;
	/** Current layout, km. */
	length: number;
	turns: number;
	first: number;
	last: number;
	/** World championship races held. */
	races: number;
	/** The Grands Prix held here, most races first. */
	grandsPrix: { id: string; first: number; last: number; count: number }[];
	/** Drivers with the most wins here (up to three). */
	winners: { id: string; wins: number }[];
};

export const unpack = ([id, name, alias, fullName, place, flag, countryId, country, lat, lng, type, direction, length, turns, first, last, races, gps, winners]: PackedCircuit): GuessCircuit => ({
	id,
	name,
	alias,
	fullName,
	place,
	flag,
	countryId,
	country,
	lat,
	lng,
	type,
	clockwise: direction !== "ANTI_CLOCKWISE",
	length,
	turns,
	first,
	last,
	races,
	grandsPrix: gps.map(([id, first, last, count]) => ({ id, first, last, count })),
	winners: winners.map(([id, wins]) => ({ id, wins })),
});

export const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
	{ id: "modern", label: "Modern era", description: "Circuits used since 1990 with 3+ Grands Prix" },
	{ id: "all", label: "All time", description: "Any circuit since 1950 with 3+ Grands Prix" },
];

export function eligible(c: GuessCircuit, difficulty: Difficulty): boolean {
	return c.races >= 3 && (difficulty === "all" || c.last >= 1990);
}

/** The day's mystery circuit: each cycle through the pool (sorted by id) is a fresh shuffle, so nothing repeats within it. */
export function dailyTarget(circuits: GuessCircuit[], difficulty: Difficulty, day: number): GuessCircuit {
	const pool = circuits.filter((c) => eligible(c, difficulty)).sort((a, b) => a.id.localeCompare(b.id));
	return dailyPick(pool, `circuit:${difficulty}`, day);
}

export function randomTarget(circuits: GuessCircuit[], difficulty: Difficulty, random = Math.random, exclude?: string): GuessCircuit {
	return randomPick(
		circuits.filter((c) => eligible(c, difficulty)),
		random,
		exclude,
	);
}

// --- comparing ---

export type AttributeKey = "country" | "type" | "length" | "turns" | "first" | "races" | "last";
export type Tile = { key: AttributeKey; verdict: Verdict; direction: Direction };
/** The country tile also carries how far the mystery circuit is from the guess, and which way. */
export type CountryTile = Tile & { key: "country"; km: number; bearing: number };

export const ATTRIBUTES: { key: AttributeKey; label: string; short: string; close?: string }[] = [
	{ key: "country", label: "Country", short: "Ctry", close: "same continent" },
	{ key: "type", label: "Type", short: "Type" },
	{ key: "length", label: "Length", short: "Km", close: "within 0.5 km" },
	{ key: "turns", label: "Turns", short: "Turns", close: "within 2" },
	{ key: "first", label: "First GP", short: "First", close: "within 5 years" },
	{ key: "races", label: "Grands Prix", short: "GPs", close: "within 5" },
	{ key: "last", label: "Last GP", short: "Last", close: "within 5 years" },
];

export const TYPE_LABEL: Record<CircuitType, { label: string; description: string }> = {
	RACE: { label: "Track", description: "a permanent racing circuit" },
	ROAD: { label: "Road", description: "closed public roads" },
	STREET: { label: "Street", description: "a street circuit" },
};

const CLOSE: Partial<Record<AttributeKey, number>> = { length: 0.5, turns: 2, first: 5, races: 5, last: 5 };
const numeric = (key: AttributeKey, guess: number, target: number): Tile => ({ key, ...compareNumber(guess, target, CLOSE[key]) });

export type Comparison = { guess: GuessCircuit; correct: boolean; tiles: [CountryTile, Tile, Tile, Tile, Tile, Tile, Tile] };

export function compare(guess: GuessCircuit, target: GuessCircuit): Comparison {
	const correct = guess.id === target.id;
	return {
		guess,
		correct,
		tiles: [
			{
				key: "country",
				verdict: compareCountry(guess.countryId, target.countryId),
				direction: null,
				km: correct ? 0 : Math.round(distanceKm(guess, target)),
				bearing: correct ? 0 : Math.round(bearing(guess, target)),
			},
			{ key: "type", verdict: guess.type === target.type ? "match" : "miss", direction: null },
			numeric("length", guess.length, target.length),
			numeric("turns", guess.turns, target.turns),
			numeric("first", guess.first, target.first),
			numeric("races", guess.races, target.races),
			numeric("last", guess.last, target.last),
		],
	};
}

export const shareText = (o: { rows: Comparison[]; won: boolean; label: string; url?: string }) => clueShareText({ title: "Guess the circuit", ...o });

/** How well known a circuit is, for ranking search results. */
export const circuitWeight = (c: GuessCircuit) => c.races * 10 + (c.last >= 1990 ? 200 : 0);
