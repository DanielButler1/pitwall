// "Guess the season" (/play/season): a mystery championship season, one clue card at the
// start and another after every wrong guess (the calendar, the champion's flags, the
// champion's numbers, comings and goings, constructors' champion and runner-up, the champion).
// Every guess is a year, compared with the answer on year, champion, rounds and constructors'
// champion. Pure, so the page and the node tests share it; the file is
// public/data/season-guess.json (see season-guess-data.ts).

import {
	compareNumber,
	dailyPick,
	emptyStats as emptyGameStats,
	randomPick,
	recordResult as recordGameResult,
	VERDICT_SQUARE,
	type Direction,
	type GameStats,
	type Verdict,
} from "./daily.ts";

export { puzzleNumber } from "./daily.ts";

/* ----------------------------------------------------------------- file --- */

/** [id, name, country id] for drivers, teams and circuits. */
export type PackedRef = [string, string, string];
/** [driver, team, points, wins, poles, podiums, nth title] */
type PackedChampion = [number, number, number, number, number, number, number];
/** [driver, team, points, wins] */
type PackedStanding = [number, number, number, number];
/** [driver, career wins, career titles] */
type PackedNotable = [number, number, number];
/**
 * [year, rounds, sprints, different winners, round the champion took the lead for good,
 *  rounds the champion led after, champion, runner-up, constructors' champion team | -1,
 *  new circuits, notable debutant | 0, notable farewell | 0, top of the drivers' standings]
 */
export type PackedSeason = [
	number, number, number, number, number, number,
	PackedChampion, PackedStanding, number, number[], PackedNotable | 0, PackedNotable | 0, PackedStanding[],
];
export type SeasonFile = {
	/** id → [name, alpha-2] */
	countries: Record<string, [string, string | null]>;
	drivers: PackedRef[];
	teams: PackedRef[];
	circuits: PackedRef[];
	seasons: PackedSeason[];
};

export type SgRef = { id: string; name: string; country: string; countryName: string; flag: string | null };
export type SgStanding = { driver: SgRef; team: SgRef; points: number; wins: number };
export type SgNotable = { driver: SgRef; wins: number; titles: number };

export type SgSeason = {
	/** The year as a string, for picks and storage. */
	id: string;
	year: number;
	rounds: number;
	sprints: number;
	/** Different Grand Prix winners. */
	winners: number;
	/** The round after which the champion led the standings for good. */
	leadFrom: number;
	/** How many rounds the champion led the standings after. */
	ledRounds: number;
	champion: SgStanding & { poles: number; podiums: number; title: number };
	runnerUp: SgStanding;
	/** null before the constructors' championship began (1958). */
	constructors: SgRef | null;
	newCircuits: SgRef[];
	debut: SgNotable | null;
	farewell: SgNotable | null;
	/** The top of the drivers' standings. */
	top: SgStanding[];
};

export type SeasonCatalog = { seasons: SgSeason[]; byId: Map<string, SgSeason> };

export function unpackSeasons(f: SeasonFile): SeasonCatalog {
	const ref = ([id, name, country]: PackedRef): SgRef => ({ id, name, country, countryName: f.countries[country]?.[0] ?? country, flag: f.countries[country]?.[1] ?? null });
	const drivers = f.drivers.map(ref);
	const teams = f.teams.map(ref);
	const circuits = f.circuits.map(ref);
	const standing = ([d, t, points, wins]: PackedStanding): SgStanding => ({ driver: drivers[d], team: teams[t], points, wins });
	const notable = (n: PackedNotable | 0): SgNotable | null => (n ? { driver: drivers[n[0]], wins: n[1], titles: n[2] } : null);
	const seasons = f.seasons.map(
		([year, rounds, sprints, winners, leadFrom, ledRounds, [cd, ct, cp, cw, cpo, cpod, title], runnerUp, cons, newCircuits, debut, farewell, top]): SgSeason => ({
			id: String(year),
			year,
			rounds,
			sprints,
			winners,
			leadFrom,
			ledRounds,
			champion: { driver: drivers[cd], team: teams[ct], points: cp, wins: cw, poles: cpo, podiums: cpod, title },
			runnerUp: standing(runnerUp),
			constructors: cons >= 0 ? teams[cons] : null,
			newCircuits: newCircuits.map((i) => circuits[i]),
			debut: notable(debut),
			farewell: notable(farewell),
			top: top.map(standing),
		}),
	);
	return { seasons, byId: new Map(seasons.map((s) => [s.id, s])) };
}

/* ---------------------------------------------------------------- pools --- */

export type SeasonPool = "modern" | "all";
export const SEASON_POOLS: { id: SeasonPool; label: string; description: string }[] = [
	{ id: "modern", label: "Modern", description: "Seasons since 1980" },
	{ id: "all", label: "All time", description: "Any season since 1950" },
];

export const inPool = (s: SgSeason, pool: SeasonPool) => pool === "all" || s.year >= 1980;
/** The seasons of a pool, oldest first (a stable order for the daily pick). */
export const poolSeasons = (seasons: readonly SgSeason[], pool: SeasonPool) => seasons.filter((s) => inPool(s, pool)).sort((a, b) => a.year - b.year);

export const dailySeason = (seasons: readonly SgSeason[], pool: SeasonPool, day: number): SgSeason => dailyPick(poolSeasons(seasons, pool), `season:${pool}`, day);

export const randomSeason = (seasons: readonly SgSeason[], pool: SeasonPool, random = Math.random, exclude?: string): SgSeason =>
	randomPick(poolSeasons(seasons, pool), random, exclude);

/* --------------------------------------------------------------- search --- */

/**
 * Seasons matching a typed year, best first: "1988" exactly, "198" the 1980s, "88" or "'88"
 * 1988 (and any year starting "88"). With no digits, every season, newest first.
 */
export function searchSeasons(seasons: readonly SgSeason[], query: string, exclude: ReadonlySet<string> = new Set()): SgSeason[] {
	const q = query.replace(/[^\d]/g, "");
	const list = seasons.filter((s) => !exclude.has(s.id)).sort((a, b) => b.year - a.year);
	if (!q) return list;
	const score = (s: SgSeason) => {
		const y = String(s.year);
		if (y === q) return 0;
		if (q.length === 2 && y.endsWith(q)) return 1;
		if (y.startsWith(q)) return 2;
		return -1;
	};
	return list
		.map((s) => ({ s, k: score(s) }))
		.filter((h) => h.k >= 0)
		.sort((a, b) => a.k - b.k || b.s.year - a.s.year)
		.map((h) => h.s);
}

/* ------------------------------------------------------------ comparing --- */

export const MAX_GUESSES = 6;

export type SeasonTileKey = "year" | "champion" | "rounds" | "constructors";
/** `far`: the answer is a long way off (a double arrow). */
export type SeasonTile = { key: SeasonTileKey; verdict: Verdict; direction: Direction; far: boolean };
export type SeasonComparison = { guess: SgSeason; correct: boolean; tiles: [SeasonTile, SeasonTile, SeasonTile, SeasonTile] };

export const SEASON_TILES: { key: SeasonTileKey; label: string; short: string; close: string }[] = [
	{ key: "year", label: "Year", short: "Year", close: "within 2 years" },
	{ key: "champion", label: "Champion", short: "Champ", close: "same champion's team" },
	{ key: "rounds", label: "Rounds", short: "Rounds", close: "within 2 rounds" },
	{ key: "constructors", label: "Constructors' champion", short: "Constr.", close: "" },
];

/**
 * Year: exact, within 2 (↑/↓ amber), else ↑/↓ grey, ⇈/⇊ when 10 or more off. Champion: the
 * same driver, else close for the same champion's team. Rounds: within 2 is close.
 * Constructors' champion: the same team (or neither season had one).
 */
export function compareSeasons(guess: SgSeason, target: SgSeason): SeasonComparison {
	const year = compareNumber(guess.year, target.year, 2);
	const rounds = compareNumber(guess.rounds, target.rounds, 2);
	const champion: Verdict = guess.champion.driver.id === target.champion.driver.id ? "match" : guess.champion.team.id === target.champion.team.id ? "close" : "miss";
	return {
		guess,
		correct: guess.year === target.year,
		tiles: [
			{ key: "year", ...year, far: Math.abs(guess.year - target.year) >= 10 },
			{ key: "champion", verdict: champion, direction: null, far: false },
			{ key: "rounds", ...rounds, far: false },
			{ key: "constructors", verdict: (guess.constructors?.id ?? null) === (target.constructors?.id ?? null) ? "match" : "miss", direction: null, far: false },
		],
	};
}

/* ---------------------------------------------------------------- clues --- */

export type SeasonClue =
	| { kind: "calendar"; rounds: number; sprints: number; winners: number; leadFrom: number; ledRounds: number }
	| { kind: "flags"; driver: SgRef; team: SgRef }
	| { kind: "numbers"; points: number; wins: number; poles: number; podiums: number; rounds: number; margin: number }
	| { kind: "changes"; circuits: SgRef[]; debut: SgNotable | null; farewell: SgNotable | null }
	| { kind: "rivals"; constructors: SgRef | null; championTeam: SgRef; runnerUp: SgStanding }
	| { kind: "champion"; driver: SgRef; team: SgRef; title: number };

/**
 * The six clue cards, vague to specific: the first shows from the start, each wrong guess
 * reveals the next. No card names the year; names only appear from the fourth card on.
 */
export function seasonClues(s: SgSeason): SeasonClue[] {
	const c = s.champion;
	return [
		{ kind: "calendar", rounds: s.rounds, sprints: s.sprints, winners: s.winners, leadFrom: s.leadFrom, ledRounds: s.ledRounds },
		{ kind: "flags", driver: c.driver, team: c.team },
		{ kind: "numbers", points: c.points, wins: c.wins, poles: c.poles, podiums: c.podiums, rounds: s.rounds, margin: round2(c.points - s.runnerUp.points) },
		{ kind: "changes", circuits: s.newCircuits, debut: s.debut, farewell: s.farewell },
		{ kind: "rivals", constructors: s.constructors, championTeam: c.team, runnerUp: s.runnerUp },
		{ kind: "champion", driver: c.driver, team: c.team, title: c.title },
	];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1st", "2nd", "3rd", "4th", … */
export const ordinal = (n: number) => {
	const t = n % 100;
	return `${n}${t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/* -------------------------------------------------------------- sharing --- */

/** The share text: title with score, then a row of four tiles per guess, then the link. */
export function seasonShareText({ rows, won, label, url }: { rows: SeasonComparison[]; won: boolean; label: string; url?: string }): string {
	const score = won ? `${rows.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	const grid = rows.map((r) => r.tiles.map((t) => VERDICT_SQUARE[t.verdict]).join(""));
	return [`Pitwall: Guess the season ${label} ${score}`, ...grid, ...(url ? [url] : [])].join("\n");
}

/* ---------------------------------------------------------------- stats --- */

export const emptyStats = (): GameStats => emptyGameStats(MAX_GUESSES);
/** Records a finished daily puzzle; wins count in the distribution by guesses used. */
export const recordResult = (stats: GameStats, day: number, won: boolean, guesses: number): GameStats => recordGameResult(stats, day, won, won ? guesses - 1 : null);
