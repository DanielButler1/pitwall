// "Lap chart mystery" (/play/lap-chart): name the race from its lap-by-lap position chart,
// drawn with the drivers' names hidden; the player may spend guesses on hints. Pure, so the page and
// node tests share it. The pool is public/data/lap-chart.json (see lap-chart-data.ts): races
// with Jolpica lap data (1996 on) whose charts have some movement in them; the chart itself is
// the race's /data/laps/<raceId>.json, fetched on demand. Guesses are compared with the shared
// race catalogue (race-guess.ts).

import { dailyPick, hash, randomPick, VERDICT_SQUARE } from "./daily.ts";
import { MAX_GUESSES, type RaceColumn, type RaceComparison, type RgRace } from "./race-guess.ts";

export { MAX_GUESSES };

/** First season with lap-by-lap positions. */
export const LAP_CHART_FROM = 1996;

/* ----------------------------------------------------------------- file --- */

/** [id, name, lastName, flag (alpha-2)] */
export type PackedLapDriver = [string, string, string, string | null];
/** [raceId, movement score, flat [driverIndex, teamIndex, grid (0: pit lane / unknown)] per driver in the lap file's order] */
export type PackedLapRace = [number, number, number[]];
export type LapChartFile = { drivers: PackedLapDriver[]; teams: [string, string][]; races: PackedLapRace[] };

export type LapDriver = { id: string; name: string; lastName: string; flag: string | null };
export type LapEntry = { driver: LapDriver; team: { id: string; name: string }; grid: number | null };
export type LapRace = { id: number; score: number; entries: LapEntry[] };

/**
 * The game's copy of a race's chart (public/data/lap-chart/<name>.json): positions only, in the
 * pool's driver order, under a name that isn't the race id. The race's own lap file is named
 * by id and lists the drivers, so fetching it would show the answer in the network panel.
 */
export type MysteryLaps = { positions: (number | null)[][] };
export const mysteryLapsName = (raceId: number) => hash(`lap-chart:${raceId}`).toString(36);

export function unpackLapChart(f: LapChartFile): { races: LapRace[]; byId: Map<number, LapRace> } {
	const drivers = f.drivers.map(([id, name, lastName, flag]): LapDriver => ({ id, name, lastName, flag }));
	const teams = f.teams.map(([id, name]) => ({ id, name }));
	const races = f.races.map(([id, score, flat]): LapRace => {
		const entries: LapEntry[] = [];
		for (let i = 0; i + 2 < flat.length; i += 3) entries.push({ driver: drivers[flat[i]], team: teams[flat[i + 1]], grid: flat[i + 2] || null });
		return { id, score, entries };
	});
	return { races, byId: new Map(races.map((r) => [r.id, r])) };
}

/* ------------------------------------------------------------- movement --- */

/**
 * How much happens in a lap chart: lead changes (on-track or through the stops) and the
 * average number of places gained or lost per lap among the drivers running in the top ten.
 * `score` blends the two; dull processions score low.
 */
export function movement(positions: readonly (readonly (number | null)[])[]): { leadChanges: number; movesPerLap: number; score: number } {
	const laps = Math.max(0, ...positions.map((p) => p.length));
	let leadChanges = 0;
	let prevLeader = -1;
	let moves = 0;
	for (let lap = 0; lap < laps; lap++) {
		const leader = positions.findIndex((p) => p[lap] === 1);
		if (leader >= 0) {
			if (prevLeader >= 0 && leader !== prevLeader) leadChanges++;
			prevLeader = leader;
		}
		if (lap === 0) continue;
		for (const p of positions) {
			const a = p[lap - 1];
			const b = p[lap];
			if (a != null && b != null && (a <= 10 || b <= 10)) moves += Math.abs(a - b);
		}
	}
	const movesPerLap = laps > 1 ? moves / (laps - 1) : 0;
	return { leadChanges, movesPerLap, score: Math.round((Math.min(leadChanges, 12) * 2 + movesPerLap * 4) * 10) / 10 };
}

/** Charts below this movement score are left out of the pool (about the dullest third). */
export const MIN_MOVEMENT = 13;

/* ----------------------------------------------------------------- picks --- */

const sortById = (races: readonly LapRace[]) => [...races].sort((a, b) => a.id - b.id);

export const dailyLapRace = (races: readonly LapRace[], day: number): LapRace => dailyPick(sortById(races), "lap-chart", day);

export function randomLapRace(races: readonly LapRace[], random = Math.random, exclude?: number): LapRace {
	return randomPick(
		races.map((r) => ({ id: String(r.id), r })),
		random,
		exclude == null ? undefined : String(exclude),
	).r;
}

/* ----------------------------------------------------------------- clues --- */

/*
 * Hints are the player's call: any of them, in any order, at any time. Each one uses up one of
 * the MAX_GUESSES slots (a hint plus five guesses is still six), and the last slot is always
 * kept for a guess. Listed roughly softest first; none names the race on its own.
 */
export type LapHintKey = "round" | "continent" | "decade" | "team" | "winner" | "drivers";

export const LAP_HINTS: { key: LapHintKey; label: string; about: string }[] = [
	{ key: "round", label: "Round", about: "Which round of the season" },
	{ key: "continent", label: "Continent", about: "Where in the world" },
	{ key: "decade", label: "Decade", about: "From the 1990s to the 2020s" },
	{ key: "team", label: "Winner's team", about: "Who built the winning car" },
	{ key: "winner", label: "Winner's name", about: "Named on the red line" },
	{ key: "drivers", label: "Every driver", about: "All names and teams" },
];

/** What the chart shows: the hints taken (everything once the game is over). */
export type LapReveal = Record<LapHintKey, boolean>;

export function lapReveal(hints: readonly LapHintKey[], over: boolean): LapReveal {
	return Object.fromEntries(LAP_HINTS.map((h) => [h.key, over || hints.includes(h.key)])) as LapReveal;
}

/** Guess slots used so far: guesses plus hints. */
export const slotsUsed = (guesses: number, hints: number) => guesses + hints;

/** A hint is only on offer while it would still leave at least one guess. */
export const canTakeHint = (guesses: number, hints: number) => slotsUsed(guesses, hints) + 1 < MAX_GUESSES;

/** Out of slots, or solved. */
export const lapOver = (guesses: number, hints: number, won: boolean) => won || slotsUsed(guesses, hints) >= MAX_GUESSES;

/* ------------------------------------------------------------ comparing --- */

/**
 * The board's columns. Coarser than "Guess the race" (which starts from the podium): the year
 * only says earlier or later, and the Grand Prix and winner are a match or a miss. Nothing
 * narrows the place or the winner's team for free; those are hints.
 */
export const LAP_TILES: RaceColumn[] = [
	{ key: "year", label: "Year", short: "Year", close: "" },
	{ key: "grandPrix", label: "Grand Prix", short: "GP", close: "" },
	{ key: "winner", label: "Winner", short: "Winner", close: "" },
];

export function compareLapGuess(guess: RgRace, target: RgRace): RaceComparison {
	const gw = guess.top[0]?.driver.id;
	return {
		guess,
		correct: guess.id === target.id,
		tiles: [
			{ key: "year", verdict: guess.year === target.year ? "match" : "miss", direction: guess.year === target.year ? null : target.year > guess.year ? "higher" : "lower", far: false },
			{ key: "grandPrix", verdict: guess.grandPrix.id === target.grandPrix.id ? "match" : "miss", direction: null, far: false },
			{ key: "winner", verdict: gw && gw === target.top[0]?.driver.id ? "match" : "miss", direction: null, far: false },
		],
	};
}

/* -------------------------------------------------------------- sharing --- */

/** Title with the slots used and hints taken, a 💡 line naming the hints, then one row per guess. */
export function lapShareText({ rows, hints, won, label, url }: { rows: RaceComparison[]; hints: readonly LapHintKey[]; won: boolean; label: string; url?: string }): string {
	const used = slotsUsed(rows.length, hints.length);
	const score = won ? `${used}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
	const tag = hints.length ? ` (${hints.length} ${hints.length === 1 ? "hint" : "hints"})` : " (no hints)";
	const hintLine = hints.length ? [`💡 ${hints.map((k) => LAP_HINTS.find((h) => h.key === k)!.label).join(", ")}`] : [];
	const grid = rows.map((r) => r.tiles.map((t) => VERDICT_SQUARE[t.verdict]).join(""));
	return [`Pitwall: Lap chart mystery ${label} ${score}${tag}`, ...hintLine, ...grid, ...(url ? [url] : [])].join("\n");
}

/** Number of rounds in each season, for the "Round 7 of 19" hint. */
export function roundsPerYear(races: readonly RgRace[]): Map<number, number> {
	const m = new Map<number, number>();
	for (const r of races) m.set(r.year, Math.max(m.get(r.year) ?? 0, r.round));
	return m;
}

/** "Driver A", "Driver B", … in finishing order; past Z, "AA", "AB". */
export const driverLetter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : driverLetter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

export const decadeOf = (year: number) => `${Math.floor(year / 10) * 10}s`;
