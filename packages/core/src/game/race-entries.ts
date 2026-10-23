// One race's entry list, shared by the race games under /play ("Name the grid" and "Race
// prediction"): every Grand Prix since 1980 with its starting grid, finishing positions,
// fastest lap and the championship top three going in, plus a few themed driver lists for
// practice. Built from F1DB by race-entries-data.ts into public/data/race-entries.json; pure,
// so pages and node tests share it.

/** [id, name, firstName, lastName, flag, career starts] */
export type PackedDriver = [string, string, string, string, string | null, number];
/** [id, name] */
export type PackedTeam = [string, string];
/** [id, name ("Pacific Grand Prix"), short name ("Pacific GP"), flag] */
export type PackedGrandPrix = [string, string, string, string | null];
/** [id, name, place, flag] */
export type PackedCircuit = [string, string, string, string | null];
/**
 * [year, round, rounds in the season, date, grand prix index, circuit index,
 *  entries: flat [driver index, team index, finish (0 = not classified)] per starter, in grid order,
 *  fastest lap driver index (-1 = unknown), leaders before the race: flat [driver index, points] (top three, empty at round 1),
 *  grid positions that aren't simply the entry's place in the list: flat [entry index, grid (0 = pit lane)]]
 */
export type PackedRace = [number, number, number, string, number, number, number[], number, number[], number[]];
/** [id, title, description, [driver index, clue][]] */
export type PackedTheme = [string, string, string, [number, string][]];

export type RaceEntriesFile = {
	drivers: PackedDriver[];
	teams: PackedTeam[];
	grandsPrix: PackedGrandPrix[];
	circuits: PackedCircuit[];
	races: PackedRace[];
	themes: PackedTheme[];
};

export type RaceDriver = { id: string; name: string; first: string; last: string; flag: string | null; starts: number };
export type RaceTeam = { id: string; name: string };
export type Entry = {
	driver: RaceDriver;
	team: RaceTeam;
	/** Grid position; null for a pit-lane start. */
	grid: number | null;
	/** Finishing position; null if not classified. */
	finish: number | null;
};
export type RaceEntry = {
	/** "1994-2": stable and sortable via `order`. */
	id: string;
	/** year * 100 + round, for a stable pool order. */
	order: number;
	year: number;
	round: number;
	rounds: number;
	date: string;
	gp: { id: string; name: string; short: string; flag: string | null };
	circuit: { id: string; name: string; place: string; flag: string | null };
	/** Starters in grid order (pit-lane starters last). */
	entries: Entry[];
	fastestLap: RaceDriver | null;
	/** Championship top three before the race (empty at the first round). */
	leaders: { driver: RaceDriver; points: number }[];
};
export type Theme = { id: string; title: string; description: string; items: { driver: RaceDriver; clue: string }[] };
export type RaceData = { races: RaceEntry[]; byId: Map<string, RaceEntry>; themes: Theme[] };

export const raceId = (year: number, round: number) => `${year}-${round}`;

export function unpackRaceEntries(f: RaceEntriesFile): RaceData {
	const drivers = f.drivers.map(([id, name, first, last, flag, starts]): RaceDriver => ({ id, name, first, last, flag, starts }));
	const teams = f.teams.map(([id, name]): RaceTeam => ({ id, name }));
	const gps = f.grandsPrix.map(([id, name, short, flag]) => ({ id, name, short, flag }));
	const circuits = f.circuits.map(([id, name, place, flag]) => ({ id, name, place, flag }));
	const races = f.races.map(([year, round, rounds, date, gp, circuit, flat, fl, leaders, grids]): RaceEntry => {
		const entries: Entry[] = [];
		for (let i = 0; i < flat.length; i += 3) entries.push({ driver: drivers[flat[i]], team: teams[flat[i + 1]], grid: i / 3 + 1, finish: flat[i + 2] || null });
		for (let i = 0; i < grids.length; i += 2) entries[grids[i]].grid = grids[i + 1] || null;
		const top: RaceEntry["leaders"] = [];
		for (let i = 0; i < leaders.length; i += 2) top.push({ driver: drivers[leaders[i]], points: leaders[i + 1] });
		return {
			id: raceId(year, round),
			order: year * 100 + round,
			year,
			round,
			rounds,
			date,
			gp: gps[gp],
			circuit: circuits[circuit],
			entries,
			fastestLap: fl >= 0 ? drivers[fl] : null,
			leaders: top,
		};
	});
	const themes = f.themes.map(([id, title, description, items]): Theme => ({ id, title, description, items: items.map(([d, clue]) => ({ driver: drivers[d], clue })) }));
	return { races, byId: new Map(races.map((r) => [r.id, r])), themes };
}

/** "1994 Pacific GP" */
export const raceLabel = (r: RaceEntry) => `${r.year} ${r.gp.short}`;

/* ---------------------------------------------------------------- stats --- */

/** Score distributions are in 10% steps: 0–9%, 10–19%, … 90–99%, and a bucket of its own for 100%. */
export const PERCENT_BUCKETS = 11;
export const percentBucket = (score: number, max: number) => (max > 0 ? Math.min(10, Math.max(0, Math.floor((score * 10) / max + 1e-9))) : 0);
export const percentBucketLabel = (i: number) => `${i * 10}%`;
export const percentBucketSrLabel = (i: number) => (i === 10 ? "with a perfect score" : `scoring ${i * 10} to ${i * 10 + 9}%`);

/** Short names for a race's drivers: the surname, with the initial when two of them share it ("M. Schumacher"). */
export function shortNames(entries: readonly Entry[]): Map<string, string> {
	const count = new Map<string, number>();
	for (const e of entries) count.set(e.driver.last, (count.get(e.driver.last) ?? 0) + 1);
	return new Map(entries.map((e) => [e.driver.id, count.get(e.driver.last)! > 1 && e.driver.first ? `${e.driver.first[0]}. ${e.driver.last}` : e.driver.last || e.driver.name]));
}
