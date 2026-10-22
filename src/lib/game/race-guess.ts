// "Guess the race" (/play/race) and the race catalogue it shares with "Lap chart mystery"
// (/play/lap-chart, see lap-chart.ts): every championship race with what the clues and the
// comparison tiles need, the race search (year tokens like "05" or "1988" plus folded words),
// the guess-vs-answer comparison, share text and stats. Pure, so the pages and node tests
// share it; the file is public/data/race-guess.json (see race-guess-data.ts).

import {
	compareNumber,
	dailyPick,
	emptyStats as emptyGameStats,
	fold,
	randomPick,
	recordResult as recordGameResult,
	VERDICT_SQUARE,
	type Direction,
	type GameStats,
	type Verdict,
} from "./daily.ts";

export { puzzleNumber } from "./daily.ts";

/* ----------------------------------------------------------------- file --- */

/** [id, name, lastName, flag (alpha-2), career wins, career podiums] */
export type PackedRgDriver = [string, string, string, string | null, number, number];
/** [driverIndex, teamIndex] */
type PackedEntry = [number, number];
/**
 * [id, year, round, date, grandPrixId, circuitId, laps, finishers, starters,
 *  top six as flat [driver, team, driver, team, …], pole entry | 0, [driver, team, lap time | null] | 0, notes]
 */
export type PackedRace = [number, number, number, string, string, string, number, number, number, number[], PackedEntry | 0, [number, number, string | null] | 0, string[]];
export type RaceGuessFile = {
	countries: Record<string, [string, string | null]>;
	/** id → [full name, country id] */
	grandsPrix: Record<string, [string, string]>;
	/** id → [name, place, country id] */
	circuits: Record<string, [string, string, string]>;
	drivers: PackedRgDriver[];
	/** [id, name] */
	teams: [string, string][];
	races: PackedRace[];
};

export type RgDriver = { id: string; name: string; lastName: string; flag: string | null; wins: number; podiums: number };
export type RgTeam = { id: string; name: string };
export type RgEntry = { driver: RgDriver; team: RgTeam };
export type RgPlace = { id: string; name: string; country: string; countryName: string; flag: string | null };

export type RgRace = {
	id: number;
	year: number;
	round: number;
	date: string;
	/** "2005 Japanese Grand Prix" */
	label: string;
	grandPrix: RgPlace;
	circuit: RgPlace & { place: string };
	laps: number;
	finishers: number;
	starters: number;
	/** The classified top six (fewer when fewer finished). */
	top: RgEntry[];
	pole: RgEntry | null;
	fastest: (RgEntry & { time: string | null }) | null;
	/** Notable facts about the race, e.g. "The winner's first Grand Prix win". */
	notes: string[];
};

export type RaceCatalog = { races: RgRace[]; byId: Map<number, RgRace> };

export function unpackRaces(f: RaceGuessFile): RaceCatalog {
	const country = (id: string) => f.countries[id] ?? [id, null];
	const drivers: RgDriver[] = f.drivers.map(([id, name, lastName, flag, wins, podiums]) => ({ id, name, lastName, flag, wins, podiums }));
	const teams: RgTeam[] = f.teams.map(([id, name]) => ({ id, name }));
	const entry = ([d, t]: PackedEntry): RgEntry => ({ driver: drivers[d], team: teams[t] });
	const races = f.races.map(([id, year, round, date, gpId, circuitId, laps, finishers, starters, top, pole, fl, notes]): RgRace => {
		const [cName, place, cCountry] = f.circuits[circuitId] ?? [circuitId, "", ""];
		const [gpName, ownCountry] = f.grandsPrix[gpId] ?? [gpId, ""];
		// the European and Pacific Grands Prix have no country of their own: use the circuit's
		const gpCountry = ownCountry || cCountry;
		const entries: RgEntry[] = [];
		for (let i = 0; i + 1 < top.length; i += 2) entries.push(entry([top[i], top[i + 1]]));
		return {
			id,
			year,
			round,
			date,
			label: `${year} ${gpName}`,
			grandPrix: { id: gpId, name: gpName, country: gpCountry, countryName: country(gpCountry)[0], flag: country(gpCountry)[1] },
			circuit: { id: circuitId, name: cName, place, country: cCountry, countryName: country(cCountry)[0], flag: country(cCountry)[1] },
			laps,
			finishers,
			starters,
			top: entries,
			pole: pole ? entry(pole) : null,
			fastest: fl ? { ...entry([fl[0], fl[1]]), time: fl[2] } : null,
			notes,
		};
	});
	return { races, byId: new Map(races.map((r) => [r.id, r])) };
}

/* --------------------------------------------------------------- search --- */

/** Other names people search countries by. */
const COUNTRY_ALIASES: Record<string, string> = {
	"united-states-of-america": "usa us america",
	"united-kingdom": "uk britain england",
	"united-arab-emirates": "uae",
	netherlands: "holland",
	"south-korea": "korea",
};
/** The words a race is found by: Grand Prix, circuit (and its id, e.g. "interlagos"), place and country names. */
const raceWords = (r: RgRace) =>
	fold(
		`${r.grandPrix.name} ${r.circuit.name} ${r.circuit.id} ${r.circuit.place} ${r.circuit.countryName} ${r.grandPrix.countryName} ${COUNTRY_ALIASES[r.circuit.country] ?? ""}`,
	);
const wordCache = new WeakMap<RgRace, { text: string; words: string[]; title: string[] }>();
function wordsOf(r: RgRace) {
	let w = wordCache.get(r);
	if (!w) {
		const text = raceWords(r);
		w = { text, words: text.split(/[\s\-.'’()]+/).filter(Boolean), title: fold(r.grandPrix.name).split(/[\s\-.'’()]+/) };
		wordCache.set(r, w);
	}
	return w;
}

/** Does a numeric token pick out the year? "1988", "88" / "'88", "198" (a decade prefix). */
function yearToken(t: string): ((year: number) => boolean) | null {
	const m = /^'?(\d+)s?$/.exec(t);
	if (!m) return null;
	const d = m[1];
	if (d.length === 4) return (y) => y === +d;
	if (d.length === 2) return (y) => y % 100 === +d;
	if (d.length === 3) return (y) => String(y).startsWith(d);
	return null;
}

/**
 * Races matching every query token, best first. Numeric tokens match the year ("2005", "05",
 * "'88", "199" for the 1990s); other tokens match the start of a word of the Grand Prix,
 * circuit, place or country (or, a little worse, anywhere in them). Among equal matches the
 * Grand Prix name beats the circuit's, then the most recent race comes first.
 */
export function searchRaces(races: readonly RgRace[], query: string, exclude: ReadonlySet<number> = new Set(), limit = 8): RgRace[] {
	const tokens = fold(query.trim())
		.split(/[\s,]+/)
		.filter(Boolean);
	if (!tokens.length) return [];
	const years = tokens.map(yearToken);
	const hits: { r: RgRace; s: number }[] = [];
	for (const r of races) {
		if (exclude.has(r.id)) continue;
		const w = wordsOf(r);
		let s = 0;
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			const year = years[i];
			if (year) {
				if (year(r.year)) continue;
				s = -1;
				break;
			}
			if (w.title.some((x) => x.startsWith(t))) continue;
			if (w.words.some((x) => x.startsWith(t))) s += 1;
			else if (t.length >= 4 && w.text.includes(t)) s += 3;
			else {
				s = -1;
				break;
			}
		}
		if (s >= 0) hits.push({ r, s });
	}
	return hits
		.sort((a, b) => a.s - b.s || b.r.year - a.r.year || a.r.round - b.r.round)
		.slice(0, limit)
		.map((h) => h.r);
}

/* ------------------------------------------------------------ comparing --- */

export const MAX_GUESSES = 6;

export type RaceTileKey = "year" | "grandPrix" | "circuit" | "round" | "winner";
/** `far`: the answer is a long way off (a double arrow). */
export type RaceTile = { key: RaceTileKey; verdict: Verdict; direction: Direction; far: boolean };
export type RaceComparison = { guess: RgRace; correct: boolean; tiles: RaceTile[] };
/** A board column; `close` says what turns its tile amber ("" when it is only ever a match or a miss). */
export type RaceColumn = { key: RaceTileKey; label: string; short: string; close: string };

export const RACE_TILES: RaceColumn[] = [
	{ key: "year", label: "Year", short: "Year", close: "within 3 years" },
	{ key: "grandPrix", label: "Grand Prix", short: "GP", close: "same continent" },
	{ key: "circuit", label: "Circuit", short: "Circuit", close: "same country" },
	{ key: "round", label: "Round", short: "Rd", close: "within 2 rounds" },
	{ key: "winner", label: "Winner", short: "Winner", close: "won for the same team" },
];

const CONTINENTS: Record<string, string[]> = {
	europe: [
		"austria", "belgium", "czechia", "denmark", "finland", "france", "germany", "hungary", "ireland", "italy", "luxembourg", "monaco", "netherlands",
		"poland", "portugal", "russia", "san-marino", "spain", "sweden", "switzerland", "turkey", "united-kingdom",
	],
	"north-america": ["canada", "mexico", "united-states-of-america"],
	"south-america": ["argentina", "brazil"],
	asia: ["azerbaijan", "bahrain", "china", "india", "japan", "malaysia", "qatar", "saudi-arabia", "singapore", "south-korea", "united-arab-emirates", "vietnam"],
	africa: ["morocco", "south-africa"],
	oceania: ["australia", "new-zealand"],
};
const CONTINENT_OF = new Map(Object.entries(CONTINENTS).flatMap(([c, ids]) => ids.map((id) => [id, c] as const)));
export const continentOf = (countryId: string) => CONTINENT_OF.get(countryId) ?? null;
export const CONTINENT_NAME: Record<string, string> = {
	europe: "Europe",
	"north-america": "North America",
	"south-america": "South America",
	asia: "Asia",
	africa: "Africa",
	oceania: "Oceania",
};

const winnerOf = (r: RgRace) => r.top[0] ?? null;

/** Year: exact, within 3 (↑/↓), within 10 (↑/↓, grey), else ⇈/⇊. Round: within 2 is close. */
export function compareRaces(guess: RgRace, target: RgRace): RaceComparison {
	const year = compareNumber(guess.year, target.year, 3);
	const round = compareNumber(guess.round, target.round, 2);
	const gc = continentOf(guess.grandPrix.country);
	const gw = winnerOf(guess);
	const tw = winnerOf(target);
	const winner: Verdict = gw && tw ? (gw.driver.id === tw.driver.id ? "match" : gw.team.id === tw.team.id ? "close" : "miss") : "miss";
	return {
		guess,
		correct: guess.id === target.id,
		tiles: [
			{ key: "year", ...year, far: Math.abs(guess.year - target.year) > 10 },
			{ key: "grandPrix", verdict: guess.grandPrix.id === target.grandPrix.id ? "match" : gc && gc === continentOf(target.grandPrix.country) ? "close" : "miss", direction: null, far: false },
			{ key: "circuit", verdict: guess.circuit.id === target.circuit.id ? "match" : guess.circuit.country === target.circuit.country ? "close" : "miss", direction: null, far: false },
			{ key: "round", ...round, far: Math.abs(guess.round - target.round) > 5 },
			{ key: "winner", verdict: winner, direction: null, far: false },
		],
	};
}

/* -------------------------------------------------------------- sharing --- */

/** The share text: title with score, then a row per guess of its year, Grand Prix and circuit tiles. */
export function raceShareText({ title, rows, won, label, url }: { title: string; rows: RaceComparison[]; won: boolean; label: string; url?: string }): string {
	const score = won ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	const grid = rows.map((r) => r.tiles.slice(0, 3).map((t) => VERDICT_SQUARE[t.verdict]).join(""));
	return [`Pitwall: ${title} ${label} ${score}`, ...grid, ...(url ? [url] : [])].join("\n");
}

/* ---------------------------------------------------------------- stats --- */

export const emptyStats = (): GameStats => emptyGameStats(MAX_GUESSES);
/** Records a finished daily puzzle; wins count in the distribution by guesses used. */
export const recordResult = (stats: GameStats, day: number, won: boolean, guesses: number): GameStats => recordGameResult(stats, day, won, won ? guesses - 1 : null);

/* ---------------------------------------------------- guess the race pool --- */

export type RacePool = "modern" | "all";
export const RACE_POOLS: { id: RacePool; label: string; description: string }[] = [
	{ id: "modern", label: "Modern", description: "Races since 1990 with a well-known podium" },
	{ id: "all", label: "All time", description: "Any race since 1950 with a well-known podium" },
];

/** A podium driver people will know: a race winner with a few podiums. */
const known = (d: RgDriver) => d.wins >= 1 && d.podiums >= 5;
/** Races that can be the answer: three recognisable podium finishers (the winner a repeat winner). */
export function raceEligible(r: RgRace, pool: RacePool): boolean {
	if (pool === "modern" && r.year < 1990) return false;
	if (r.top.length < 3) return false;
	const [p1, p2, p3] = r.top;
	return p1.driver.wins >= 3 && known(p2.driver) && known(p3.driver);
}

const sortById = (races: readonly RgRace[]) => [...races].sort((a, b) => a.id - b.id);

export function dailyRace(races: readonly RgRace[], pool: RacePool, day: number): RgRace {
	return dailyPick(sortById(races.filter((r) => raceEligible(r, pool))), `race:${pool}`, day);
}

export function randomRace(races: readonly RgRace[], pool: RacePool, random = Math.random, exclude?: number): RgRace {
	const list = races.filter((r) => raceEligible(r, pool)).map((r) => ({ id: String(r.id), r }));
	return randomPick(list, random, exclude == null ? undefined : String(exclude)).r;
}

/* ----------------------------------------------------------------- clues --- */

export type RaceClue =
	| { kind: "pole"; entry: RgEntry }
	| { kind: "fastest"; entry: RgEntry; time: string | null }
	| { kind: "laps"; laps: number; finishers: number; starters: number }
	| { kind: "top6"; entries: RgEntry[] }
	| { kind: "notes"; notes: string[] }
	| { kind: "country"; name: string; flag: string | null };

/**
 * The clues after the podium, in the order wrong guesses reveal them: pole, fastest lap, laps
 * and finishers, P4–P6, notable facts, the circuit's country. Clues without data are skipped.
 */
export function raceClues(r: RgRace): RaceClue[] {
	const out: RaceClue[] = [];
	if (r.pole) out.push({ kind: "pole", entry: r.pole });
	if (r.fastest) out.push({ kind: "fastest", entry: r.fastest, time: r.fastest.time });
	out.push({ kind: "laps", laps: r.laps, finishers: r.finishers, starters: r.starters });
	if (r.top.length > 3) out.push({ kind: "top6", entries: r.top.slice(3) });
	if (r.notes.length) out.push({ kind: "notes", notes: r.notes });
	out.push({ kind: "country", name: r.circuit.countryName, flag: r.circuit.flag });
	return out;
}
