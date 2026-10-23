// "Career path": one mystery driver a day, shown as their career told team by team. The
// first stint is open; each wrong guess opens the next, and the 3rd, 4th and 5th misses also
// open the nationality, the career wins and podiums, and the initials. Pure, so the page and the
// tests share it; the data is public/data/career.json (see career-data.ts).

import { dailyPick, emptyStats as emptyGameStats, randomPick, recordResult as recordGameResult, searchByName, type GameStats, type Verdict } from "./daily.ts";

export { puzzleNumber } from "./daily.ts";

/** [teamIndex, firstYear, lastYear, starts, wins, podiums] */
export type PackedStint = [number, number, number, number, number, number];
/** [id, name, flag, nation, initials, starts, wins, podiums, titles, stints] */
export type PackedCareerDriver = [string, string, string | null, string, string, number, number, number, number, PackedStint[]];
/** Teams are [id, name], referenced from stints by index. */
export type CareerFile = { teams: [string, string][]; drivers: PackedCareerDriver[] };

export type Stint = { team: string; teamName: string; from: number; to: number; starts: number; wins: number; podiums: number };
export type CareerDriver = {
	id: string;
	name: string;
	flag: string | null;
	nation: string;
	initials: string;
	starts: number;
	wins: number;
	podiums: number;
	titles: number;
	first: number;
	last: number;
	/** Team stints in career order (consecutive seasons with one team collapsed). */
	stints: Stint[];
	/** Every team raced for. */
	teams: Set<string>;
};

export function unpackFile(f: CareerFile): CareerDriver[] {
	return f.drivers.map(([id, name, flag, nation, initials, starts, wins, podiums, titles, packed]) => {
		const stints = packed.map(([t, from, to, s, w, p]) => ({ team: f.teams[t][0], teamName: f.teams[t][1], from, to, starts: s, wins: w, podiums: p }));
		return {
			id,
			name,
			flag,
			nation,
			initials,
			starts,
			wins,
			podiums,
			titles,
			first: stints[0].from,
			last: Math.max(...stints.map((s) => s.to)),
			stints,
			teams: new Set(stints.map((s) => s.team)),
		};
	});
}

export const span = (from: number, to: number) => (from === to ? String(from) : `${from}–${to}`);

/**
 * Six guesses: every mystery driver has at least three stints, all showing by the third
 * guess; the hints open on the 3rd–5th misses whatever the career length, so the last guess
 * always has every hint (the initials included).
 */
export const MAX_GUESSES = 6;
export const MIN_STINTS = 3;

export type Difficulty = "modern" | "all";
export const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
	{ id: "modern", label: "Modern era", description: "Drivers who raced since 1980 with 50+ starts or a win, for three or more teams" },
	{ id: "all", label: "All time", description: "Anyone since 1950 with 30+ starts or a win, for three or more teams" },
];

/** Drivers the mystery driver can be: well known enough, with a career that has a path to follow. */
export function eligible(d: CareerDriver, difficulty: Difficulty): boolean {
	if (d.stints.length < MIN_STINTS) return false;
	return difficulty === "modern" ? d.last >= 1980 && (d.starts >= 50 || d.wins > 0) : d.starts >= 30 || d.wins > 0;
}

const pool = (drivers: CareerDriver[], difficulty: Difficulty) => drivers.filter((d) => eligible(d, difficulty)).sort((a, b) => a.id.localeCompare(b.id));

export const dailyTarget = (drivers: CareerDriver[], difficulty: Difficulty, day: number) => dailyPick(pool(drivers, difficulty), `career:${difficulty}`, day);

export const randomTarget = (drivers: CareerDriver[], difficulty: Difficulty, random = Math.random, exclude?: string) => randomPick(pool(drivers, difficulty), random, exclude);

/* ------------------------------------------------------------- reveals --- */

export type HintKey = "nation" | "results" | "initials";
export const HINTS: { key: HintKey; label: string }[] = [
	{ key: "nation", label: "Nationality" },
	{ key: "results", label: "Wins · podiums" },
	{ key: "initials", label: "Initials" },
];

/** Wrong guesses after which each hint opens (nationality, wins · podiums, initials). */
export const HINT_AFTER = [3, 4, 5] as const;

/**
 * What's showing after `wrong` wrong guesses: the first stint plus one more per miss (until
 * the career is all showing), and, on a fixed schedule however long the career, the
 * nationality after the 3rd miss, wins · podiums after the 4th and the initials after the 5th.
 */
export function revealed(target: CareerDriver, wrong: number, over = false): { stints: number; hints: number } {
	if (over) return { stints: target.stints.length, hints: HINTS.length };
	return { stints: Math.min(target.stints.length, 1 + wrong), hints: HINT_AFTER.filter((n) => wrong >= n).length };
}

/* ------------------------------------------------------------- guesses --- */

export type GuessResult = { guess: CareerDriver; verdict: Verdict; shared: string[] };

/** Right driver (match), a wrong one who drove for one of the same teams (close), or neither (miss). */
export function judge(guess: CareerDriver, target: CareerDriver): GuessResult {
	if (guess.id === target.id) return { guess, verdict: "match", shared: [...target.teams] };
	const shared = [...guess.teams].filter((t) => target.teams.has(t));
	return { guess, verdict: shared.length ? "close" : "miss", shared };
}

const SQUARE: Record<Verdict, string> = { match: "🟩", close: "🟨", miss: "🟥" };

export function shareText({ results, won, label, url }: { results: GuessResult[]; won: boolean; label: string; url?: string }): string {
	const score = won ? `${results.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	return [`Pitwall Career path ${label} ${results.map((r) => SQUARE[r.verdict]).join("")} (${score})`, ...(url ? [url] : [])].join("\n");
}

/* --------------------------------------------------------------- stats --- */

/** Distribution: wins by number of guesses (index 0 = first guess). */
export const emptyStats = (): GameStats => emptyGameStats(MAX_GUESSES);
export const recordResult = (stats: GameStats, day: number, won: boolean, guesses: number): GameStats => recordGameResult(stats, day, won, won ? guesses - 1 : null);

/* -------------------------------------------------------------- search --- */

export const driverWeight = (d: CareerDriver) => d.starts + d.wins * 5;
export const searchDrivers = (drivers: CareerDriver[], query: string, exclude: ReadonlySet<string> = new Set(), limit = 8) =>
	searchByName(drivers, query, (d) => d.name, driverWeight, exclude, limit);
