// "What if the points were different?": every season's champions re-scored under
// each points system. Scoring matches the Lab's `points` universe change exactly
// (every result counts, no dropped scores, no double points, every car scores for
// its constructor), so a system's champions here are the ones its universe shows.
// One extra column, "own points, every result counts", keeps each season's real
// scale but drops the dropped-scores rule. Works on any Db, so universes get it too.
// A user-built system is added as one more column in the browser (`withCustomSystem`).

import { completedRaces, seasonInProgress, type Db, type Result, type StandingRow } from "./dataset.ts";
import { CUSTOM_SYSTEM, ERA_SYSTEM, POINTS_SYSTEMS, computeStandings, eraRules, halfPoints, scoreRace, systemRules, type EraRules, type PointsSystem } from "./points.ts";
import { driverRef, teamRef, type DriverRef, type TeamRef } from "./views.ts";

export { CUSTOM_SYSTEM, ERA_SYSTEM };

export type CompareSystem = {
	id: string;
	name: string;
	description: string;
	/** Real systems can be opened as a universe; the era pseudo-system has no single universe change. */
	explorable: boolean;
};

export type Champion = { id: string; points: number; /** Over second place; 0 means decided on count-back. */ margin: number };

export type CompareSeason = {
	year: number;
	driver: Champion | null;
	team: Champion | null;
	/** In a universe: reality's champions when they differ from the universe's. */
	realityDriver?: string;
	realityTeam?: string;
	bySystem: Record<string, { driver: Champion | null; team: Champion | null }>;
};

export type TitleFlip = { year: number; from: string; to: Champion };
export type TitleTotal = { id: string; titles: number; actual: number };

export type SystemSummary = {
	id: string;
	driverFlips: TitleFlip[];
	teamFlips: TitleFlip[];
	drivers: TitleTotal[];
	teams: TitleTotal[];
};

export type CompareDriver = DriverRef & { short: string };

export type PointsCompareView = {
	systems: CompareSystem[];
	seasons: CompareSeason[];
	summaries: Record<string, SystemSummary>;
	drivers: Record<string, CompareDriver>;
	teams: Record<string, TeamRef>;
	firstYear: number;
	lastYear: number;
	/** Last season with any results (may be in progress): where an "explore as a universe" points change ends. */
	universeToYear: number;
};

export const COMPARE_SYSTEMS: CompareSystem[] = [
	{ id: ERA_SYSTEM, name: "Own points, all count", description: "Each season's own points, but with no dropped scores", explorable: false },
	...POINTS_SYSTEMS.map((s) => ({ id: s.id, name: s.name, description: s.description, explorable: true })),
];

/** Scoring rules for a season under a system: the same override the universe `points` change applies (the era column only lifts dropped scores). */
export function compareRules(db: Db, year: number, systemId: string): EraRules | null {
	const own = db.rulesOverride?.get(year) ?? eraRules(year);
	if (systemId === ERA_SYSTEM) return { ...own, driverDrop: { type: "all" }, constructorDrop: { type: "all" } };
	const system = POINTS_SYSTEMS.find((s) => s.id === systemId);
	return system ? systemRules(year, system) : null;
}

/** Driver and constructor standings for a completed season re-scored under the given rules. */
export function rescoreSeason(db: Db, year: number, rules: EraRules) {
	const races = completedRaces(db, year);
	const last = races[races.length - 1];
	const resultsByRace = new Map<number, Result[]>();
	const sprintByRace = new Map<number, Result[]>();
	for (const race of races) {
		resultsByRace.set(race.id, scoreRace(db.resultsByRace.get(race.id) ?? [], rules.system, { double: rules.doublePointsFinalRace && race.id === last?.id, half: halfPoints(race) }));
		const sprint = db.sprintByRace.get(race.id);
		if (sprint) sprintByRace.set(race.id, scoreRace(sprint, rules.system, { sprint: true }));
	}
	return computeStandings({ resultsByRace, sprintByRace, grandsPrix: db.grandsPrix }, races, rules, year);
}

function champion(rows: StandingRow[] | undefined): Champion | null {
	const ranked = (rows ?? []).filter((r) => r.position != null).sort((a, b) => a.position! - b.position!);
	const [first, second] = ranked;
	if (!first || !(first.champion || first.position === 1) || first.points <= 0) return null;
	return { id: first.id, points: first.points, margin: Math.round((first.points - (second?.points ?? 0)) * 100) / 100 };
}

/** Constructor tables can list a team once per engine; collapse to the best row per team. */
function teamChampion(rows: StandingRow[] | undefined): Champion | null {
	if (!rows?.length) return null;
	const seen = new Set<string>();
	const unique = [...rows]
		.filter((r) => r.position != null)
		.sort((a, b) => a.position! - b.position!)
		.filter((r) => !seen.has(r.id) && !!seen.add(r.id))
		.map((r, i) => ({ ...r, position: i + 1 }));
	return champion(unique);
}

/** The official (or universe) champion, as flagged in the season's standings. */
function officialChampion(rows: StandingRow[] | undefined, team: boolean): Champion | null {
	const flagged = rows?.find((r) => r.champion);
	if (!flagged) return null;
	const c = team ? teamChampion(rows) : champion(rows);
	return c?.id === flagged.id ? c : { id: flagged.id, points: flagged.points, margin: 0 };
}

type Matrix = { seasons: CompareSeason[] };
const cache = new WeakMap<Db, Matrix>();

function matrix(db: Db): Matrix {
	const hit = cache.get(db);
	if (hit) return hit;
	const seasons: CompareSeason[] = [];
	for (const year of db.years) {
		if (!completedRaces(db, year).length || seasonInProgress(db, year)) continue;
		const rules0 = eraRules(year);
		const bySystem: CompareSeason["bySystem"] = {};
		for (const s of COMPARE_SYSTEMS) {
			const rules = compareRules(db, year, s.id)!;
			// the era column keeps every result's real points (half points, shared drives) and only stops dropping scores
			const st = s.id === ERA_SYSTEM ? computeStandings(db, completedRaces(db, year), rules, year) : rescoreSeason(db, year, rules);
			bySystem[s.id] = { driver: champion(st.drivers), team: rules0.hasConstructorsChampionship ? teamChampion(st.constructors) : null };
		}
		seasons.push({
			year,
			driver: officialChampion(db.driverStandings.get(year), false),
			team: rules0.hasConstructorsChampionship ? officialChampion(db.constructorStandings.get(year), true) : null,
			bySystem,
		});
	}
	const out = { seasons };
	cache.set(db, out);
	return out;
}

function totals(seasons: CompareSeason[], systemId: string, pick: (c: { driver: Champion | null; team: Champion | null }) => Champion | null): TitleTotal[] {
	const map = new Map<string, TitleTotal>();
	const get = (id: string) => map.get(id) ?? map.set(id, { id, titles: 0, actual: 0 }).get(id)!;
	for (const s of seasons) {
		const actual = pick(s);
		const alt = pick(s.bySystem[systemId]);
		if (actual) get(actual.id).actual++;
		if (alt) get(alt.id).titles++;
	}
	return [...map.values()].sort((a, b) => b.titles - a.titles || b.actual - a.actual || a.id.localeCompare(b.id));
}

function flips(seasons: CompareSeason[], systemId: string, pick: (c: { driver: Champion | null; team: Champion | null }) => Champion | null): TitleFlip[] {
	const out: TitleFlip[] = [];
	for (const s of seasons) {
		const actual = pick(s);
		const alt = pick(s.bySystem[systemId]);
		if (actual && alt && actual.id !== alt.id) out.push({ year: s.year, from: actual.id, to: alt });
	}
	return out;
}

const pickDriver = (c: { driver: Champion | null; team: Champion | null }) => c.driver;
const pickTeam = (c: { driver: Champion | null; team: Champion | null }) => c.team;

/** Every season's champions under every points system, with the titles that change hands. */
export function pointsCompareView(db: Db, base?: Db): PointsCompareView {
	const real = matrix(db).seasons;
	const reality = base && base !== db ? new Map(matrix(base).seasons.map((s) => [s.year, s])) : null;
	const seasons = real.map((s) => {
		const r = reality?.get(s.year);
		if (!r) return s;
		return {
			...s,
			realityDriver: r.driver && r.driver.id !== s.driver?.id ? r.driver.id : undefined,
			realityTeam: r.team && r.team.id !== s.team?.id ? r.team.id : undefined,
		};
	});

	const summaries: Record<string, SystemSummary> = {};
	for (const sys of COMPARE_SYSTEMS) summaries[sys.id] = summarize(seasons, sys.id);
	return {
		systems: COMPARE_SYSTEMS,
		seasons,
		summaries,
		...entityRefs(db, seasons),
		firstYear: seasons[0]?.year ?? 0,
		lastYear: seasons[seasons.length - 1]?.year ?? 0,
		universeToYear: Math.max(seasons[seasons.length - 1]?.year ?? 0, ...db.years.filter((y) => completedRaces(db, y).length)),
	};
}

/**
 * The view with one more column: a user-built system, scored against `db` (the same Db the view was built from).
 * Cheap enough for the browser: one re-score per season.
 */
export function withCustomSystem(view: PointsCompareView, db: Db, system: PointsSystem): PointsCompareView {
	const seasons = view.seasons.map((s) => {
		const st = rescoreSeason(db, s.year, systemRules(s.year, system));
		const custom = { driver: champion(st.drivers), team: eraRules(s.year).hasConstructorsChampionship ? teamChampion(st.constructors) : null };
		return { ...s, bySystem: { ...s.bySystem, [CUSTOM_SYSTEM]: custom } };
	});
	return {
		...view,
		systems: [...view.systems.filter((s) => s.id !== CUSTOM_SYSTEM), { id: CUSTOM_SYSTEM, name: system.name, description: system.description, explorable: true }],
		seasons,
		summaries: { ...view.summaries, [CUSTOM_SYSTEM]: summarize(seasons, CUSTOM_SYSTEM) },
		...entityRefs(db, seasons),
	};
}

function summarize(seasons: CompareSeason[], id: string): SystemSummary {
	return {
		id,
		driverFlips: flips(seasons, id, pickDriver),
		teamFlips: flips(seasons, id, pickTeam),
		drivers: totals(seasons, id, pickDriver),
		teams: totals(seasons, id, pickTeam),
	};
}

/** Links for every driver and team the seasons mention; drivers sharing a surname get an initial. */
function entityRefs(db: Db, seasons: CompareSeason[]): Pick<PointsCompareView, "drivers" | "teams"> {
	const driverIds = new Set<string>();
	const teamIds = new Set<string>();
	for (const s of seasons) {
		for (const c of [s, ...Object.values(s.bySystem)]) {
			if (c.driver) driverIds.add(c.driver.id);
			if (c.team) teamIds.add(c.team.id);
		}
		if (s.realityDriver) driverIds.add(s.realityDriver);
		if (s.realityTeam) teamIds.add(s.realityTeam);
	}
	const surnames = new Map<string, number>();
	const lastName = (id: string) => db.drivers.get(id)?.lastName ?? id;
	for (const id of driverIds) surnames.set(lastName(id), (surnames.get(lastName(id)) ?? 0) + 1);
	const drivers: Record<string, CompareDriver> = {};
	for (const id of driverIds) {
		const d = db.drivers.get(id);
		const last = lastName(id);
		const short = (surnames.get(last) ?? 0) > 1 && d?.firstName ? `${d.firstName[0]}. ${last}` : last;
		drivers[id] = { ...driverRef(db, id), short };
	}
	const teams: Record<string, TeamRef> = {};
	for (const id of teamIds) teams[id] = teamRef(db, id);
	return { drivers, teams };
}
