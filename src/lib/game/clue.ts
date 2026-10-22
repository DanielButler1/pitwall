// Shared pure helpers for the "Guess the constructor" and "Guess the circuit" games: the board
// rules (8 guesses, Modern / All time), continents for the nationality / country tile, map
// maths for the circuit compass, the share grid and the stats. The calendar, picks and storage
// are the games' common kit (daily.ts).

import { emptyStats as emptyGameStats, recordResult as recordGameResult, VERDICT_SQUARE, type GameStats, type Verdict } from "./daily.ts";

export const MAX_GUESSES = 8;
export type Difficulty = "modern" | "all";

/* ----------------------------------------------------------- continents --- */

// Turkey counts as Europe and Azerbaijan as Asia (where F1 has raced in each).
const CONTINENTS: Record<string, string[]> = {
	europe: [
		"austria", "belgium", "czechia", "denmark", "east-germany", "estonia", "finland", "france", "germany", "hungary", "ireland", "italy", "liechtenstein",
		"monaco", "netherlands", "poland", "portugal", "russia", "spain", "sweden", "switzerland", "turkey", "united-kingdom",
	],
	"north-america": ["canada", "mexico", "united-states-of-america"],
	"south-america": ["argentina", "brazil", "chile", "colombia", "uruguay", "venezuela"],
	asia: [
		"azerbaijan", "bahrain", "china", "hong-kong", "india", "indonesia", "israel", "japan", "malaysia", "qatar", "saudi-arabia", "singapore", "south-korea",
		"taiwan", "thailand", "united-arab-emirates",
	],
	africa: ["morocco", "rhodesia", "south-africa", "zimbabwe"],
	oceania: ["australia", "new-zealand"],
};
const CONTINENT_OF = new Map(Object.entries(CONTINENTS).flatMap(([c, ids]) => ids.map((id) => [id, c] as const)));
export const continentOf = (countryId: string) => CONTINENT_OF.get(countryId) ?? null;

/** Same country is a match, same continent is close. */
export function compareCountry(guess: string, target: string): Verdict {
	if (guess === target) return "match";
	const c = continentOf(guess);
	return c && c === continentOf(target) ? "close" : "miss";
}

/* ------------------------------------------------------------------ map --- */

export type LatLng = { lat: number; lng: number };
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
	const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from `a` towards `b`, in degrees clockwise from north (0–360). */
export function bearing(a: LatLng, b: LatLng): number {
	const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
	const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
	return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** The nearest of the eight compass points, e.g. "north-east". */
export const compassPoint = (deg: number) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/* -------------------------------------------------------------- sharing --- */

/** "Pitwall: Guess the constructor #3 4/8", one emoji row per guess, then the link. */
export function clueShareText({ title, rows, won, label, url }: { title: string; rows: { tiles: { verdict: Verdict }[] }[]; won: boolean; label: string; url?: string }): string {
	const score = won ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	const grid = rows.map((r) => r.tiles.map((t) => VERDICT_SQUARE[t.verdict]).join(""));
	return [`Pitwall: ${title} ${label} ${score}`, ...grid, ...(url ? [url] : [])].join("\n");
}

/* ---------------------------------------------------------------- stats --- */

/** Daily stats; the distribution counts wins by number of guesses (index 0 = solved with the first guess). */
export const emptyStats = (): GameStats => emptyGameStats(MAX_GUESSES);
/** Records a finished daily puzzle (once per day: repeats are ignored). */
export const recordResult = (stats: GameStats, day: number, won: boolean, guesses: number): GameStats => recordGameResult(stats, day, won, won ? guesses - 1 : null);
