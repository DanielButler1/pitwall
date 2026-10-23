// Milestone watch: round-number milestones coming up for the drivers and teams
// on the current grid, how far they are from the next name on each all-time
// list, and notable anniversaries. Built from any Db, so universes get their own.

import { completedRaces, isStart, type Db, type Race } from "./dataset.ts";
import { constructorCareers, constructorPointsByRace, driverCareers, type Career } from "./stats.ts";
import { deciders } from "./records/titles.ts";
import { facts } from "./records/facts.ts";
import { driverRef, raceRef, teamRef, type DriverRef, type RaceRef, type TeamRef } from "./views.ts";
import type { AnniversaryEvent } from "./anniversaries.ts";

export type MilestoneStat = "starts" | "wins" | "podiums" | "poles" | "fastestLaps" | "points" | "titles";
export const MILESTONE_STATS: MilestoneStat[] = ["wins", "podiums", "poles", "titles", "starts", "points", "fastestLaps"];

export type Subject = { kind: "driver"; driver: DriverRef } | { kind: "team"; team: TeamRef };

export type Milestone = {
	subject: Subject;
	stat: MilestoneStat;
	current: number;
	/** The round number they are heading for (e.g. 300 starts). */
	target: number;
	needed: number;
	/** Expected races to get there at their recent rate (null when they aren't scoring it). */
	eta: number | null;
	/** Reachable within the rounds left this season at that rate. */
	thisSeason: boolean;
};

export type RecordChase = {
	subject: Subject;
	stat: MilestoneStat;
	current: number;
	/** All-time rank now (1 + everyone strictly ahead) and once they pass the target. */
	rank: number;
	newRank: number;
	/** Integer stats: how many more to pass. Points: the gap to make up (they need more than this). */
	needed: number;
	/** Everyone on the next value up (ties are passed together). */
	target: { value: number; subjects: (Subject & { active: boolean })[] };
	eta: number | null;
	thisSeason: boolean;
};

export type MilestonesView = {
	year: number;
	inProgress: boolean;
	remainingRounds: number;
	nextRace: RaceRef | null;
	milestones: Milestone[];
	chases: RecordChase[];
	anniversaries: AnniversaryEvent[];
};

/* ------------------------------------------------------------- the grid --- */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The latest season with results. */
export function latestSeason(db: Db): number | null {
	for (let i = db.years.length - 1; i >= 0; i--) if (completedRaces(db, db.years[i]).length) return db.years[i];
	return null;
}

/**
 * Drivers and teams on the current grid: next season's entry list once the
 * latest season is over and one is published, otherwise everyone who took part
 * in the latest season's last three rounds.
 */
export function activeGrid(db: Db): { year: number; drivers: Set<string>; teams: Set<string> } | null {
	const year = latestSeason(db);
	if (year == null) return null;
	const races = completedRaces(db, year);
	const finished = races.length === (db.racesByYear.get(year)?.length ?? 0);
	const next = finished ? db.upcomingEntrants.filter((e) => e.year === year + 1) : [];
	const careers = driverCareers(db);
	if (next.length) {
		return {
			year,
			drivers: new Set(next.map((e) => e.driverId).filter((id) => careers.has(id))),
			teams: new Set(next.map((e) => e.constructorId).filter((id) => db.resultsByConstructor.has(id))),
		};
	}
	const drivers = new Set<string>();
	const teams = new Set<string>();
	for (const race of races.slice(-3))
		for (const r of db.resultsByRace.get(race.id) ?? []) {
			drivers.add(r.driverId);
			teams.add(r.constructorId);
		}
	return { year, drivers, teams };
}

/* ---------------------------------------------------------- milestones --- */

/** The next round number above `v`: a few early marks, then a regular step. */
export function nextMark(stat: MilestoneStat, team: boolean, v: number): number | null {
	const plan: Record<Exclude<MilestoneStat, "titles">, [number[], number]> = team
		? { starts: [[100], 100], wins: [[10, 25, 50], 50], poles: [[10, 25, 50], 50], fastestLaps: [[10, 25, 50], 50], podiums: [[10, 25, 50, 100], 100], points: [[500, 1000], 1000] }
		: { starts: [[50], 50], wins: [[10, 25, 50], 25], poles: [[10, 25, 50], 25], fastestLaps: [[10, 25, 50], 25], podiums: [[10, 25, 50, 100], 50], points: [[100, 250, 500, 1000], 500] };
	if (stat === "titles") return null;
	const [early, step] = plan[stat];
	for (const m of early) if (m > v) return m;
	return (Math.floor(v / step) + 1) * step;
}

type Rates = Record<Exclude<MilestoneStat, "titles">, number>;
const RECENT = 22;

/** Per-race rates over a driver's or team's last RECENT races. */
export function recentRates(db: Db, id: string, team: boolean): Rates {
	const results = (team ? db.resultsByConstructor : db.resultsByDriver).get(id) ?? [];
	const raceIds = [...new Set(results.map((r) => r.raceId))].slice(-RECENT);
	const recent = new Set(raceIds);
	const rows = results.filter((r) => recent.has(r.raceId));
	const n = raceIds.length || 1;
	const per = (count: number) => count / n;
	let points = 0;
	if (team) {
		const byRace = constructorPointsByRace(db);
		for (const raceId of raceIds) {
			const s = byRace.get(raceId);
			points += (s?.race.get(id) ?? 0) + (s?.sprint.get(id) ?? 0);
		}
	} else {
		points = rows.reduce((p, r) => p + r.points, 0);
		for (const s of db.sprintByDriver.get(id) ?? []) if (recent.has(s.raceId)) points += s.points;
	}
	return {
		starts: per(new Set(rows.filter(isStart).map((r) => r.raceId)).size),
		wins: per(new Set(rows.filter((r) => r.position === 1).map((r) => r.raceId)).size),
		podiums: per(rows.filter((r) => r.position != null && r.position <= 3).length),
		poles: per(new Set(rows.filter((r) => r.pole).map((r) => r.raceId)).size),
		fastestLaps: per(new Set(rows.filter((r) => r.fastestLap).map((r) => r.raceId)).size),
		points: per(points),
	};
}

const etaOf = (needed: number, rate: number) => (rate > 0 ? Math.max(1, Math.ceil(needed / rate - 1e-9)) : null);

/* --------------------------------------------------------------- build --- */

export type MilestoneOptions = {
	/** Only milestones and chases expected within this many races. */
	horizon?: number;
	/** Only chases that lift them to this all-time rank or better. */
	maxRank?: number;
};

const memo = new WeakMap<Db, Map<string, MilestonesView | null>>();

export function milestonesView(db: Db, opts: MilestoneOptions = {}): MilestonesView | null {
	let m = memo.get(db);
	if (!m) memo.set(db, (m = new Map()));
	const k = JSON.stringify(opts);
	if (!m.has(k)) m.set(k, build(db, opts));
	return m.get(k)!;
}

function build(db: Db, { horizon = 24, maxRank = 30 }: MilestoneOptions): MilestonesView | null {
	const grid = activeGrid(db);
	if (!grid) return null;
	const { year } = grid;
	const all = db.racesByYear.get(year) ?? [];
	const done = completedRaces(db, year);
	const remainingRounds = all.length - done.length;
	const next = db.races.find((r: Race) => r.year >= year && !db.resultsByRace.has(r.id));

	const milestones: Milestone[] = [];
	const chases: RecordChase[] = [];
	const careerSets: [boolean, Map<string, Career>, Set<string>][] = [
		[false, driverCareers(db), grid.drivers],
		[true, constructorCareers(db), grid.teams],
	];
	for (const [team, careers, active] of careerSets) {
		const subjectOf = (id: string): Subject => (team ? { kind: "team", team: teamRef(db, id) } : { kind: "driver", driver: driverRef(db, id) });
		const list = [...careers.values()];
		const rateCache = new Map<string, Rates>();
		const ratesOf = (id: string) => rateCache.get(id) ?? rateCache.set(id, recentRates(db, id, team)).get(id)!;
		for (const id of active) {
			const c = careers.get(id);
			if (!c) continue;
			const rates = ratesOf(id);
			for (const stat of MILESTONE_STATS) {
				const current = c[stat];
				const rate = stat === "titles" ? 0 : rates[stat];

				const mark = nextMark(stat, team, current);
				if (mark != null) {
					const needed = r2(mark - current);
					const eta = etaOf(needed, rate);
					if (eta != null && eta <= horizon) milestones.push({ subject: subjectOf(id), stat, current, target: mark, needed, eta, thisSeason: eta <= remainingRounds });
				}

				if (current <= 0) continue;
				const above = list.filter((o) => o.id !== id && o[stat] > current);
				if (!above.length) continue;
				const value = Math.min(...above.map((o) => o[stat]));
				const needed = stat === "points" ? r2(value - current) : value - current + 1;
				const targets = above.filter((o) => o[stat] === value);
				// a target still racing keeps scoring too, so only the rate they are being caught at counts
				const targetRate = stat === "titles" ? 0 : Math.max(0, ...targets.filter((o) => active.has(o.id)).map((o) => ratesOf(o.id)[stat]));
				const eta = stat === "titles" ? null : etaOf(needed, rate - targetRate);
				if (stat === "titles" ? needed > 2 : eta == null || eta > horizon) continue;
				const passed = stat === "points" ? value + 0.01 : value + 1;
				const newRank = list.filter((o) => o.id !== id && o[stat] > passed).length + 1;
				if (newRank > maxRank) continue;
				chases.push({
					subject: subjectOf(id),
					stat,
					current,
					rank: above.length + 1,
					newRank,
					needed,
					target: {
						value,
						subjects: targets
							.sort((a, b) => a.firstYear - b.firstYear)
							.map((o) => ({ ...subjectOf(o.id), active: active.has(o.id) })),
					},
					eta,
					thisSeason: eta != null && eta <= remainingRounds,
				});
			}
		}
	}
	const order = (s: MilestoneStat) => MILESTONE_STATS.indexOf(s);
	milestones.sort((a, b) => (a.eta ?? 99) - (b.eta ?? 99) || order(a.stat) - order(b.stat) || b.target - a.target);
	chases.sort((a, b) => order(a.stat) - order(b.stat) || a.newRank - b.newRank || (a.eta ?? 99) - (b.eta ?? 99));

	return {
		year,
		inProgress: remainingRounds > 0 && done.length > 0,
		remainingRounds,
		nextRace: next ? raceRef(db, next) : null,
		milestones,
		chases,
		anniversaries: anniversaryEvents(db),
	};
}

/* -------------------------------------------------------- anniversaries --- */

const annMemo = new WeakMap<Db, AnniversaryEvent[]>();

/**
 * Notable dated events: the first championship race, every title (dated by the
 * race that decided it), and the debuts, maiden wins and births of champions,
 * plus maiden wins of drivers and teams with ten or more wins.
 */
export function anniversaryEvents(db: Db): AnniversaryEvent[] {
	const hit = annMemo.get(db);
	if (hit) return hit;
	const out: AnniversaryEvent[] = [];
	const ev = (e: Partial<AnniversaryEvent> & Pick<AnniversaryEvent, "kind" | "date">): AnniversaryEvent => ({ driver: null, team: null, race: null, ...e });
	const drivers = driverCareers(db);
	const teams = constructorCareers(db);
	const first = db.races.find((r) => db.resultsByRace.has(r.id));
	if (first) out.push(ev({ kind: "first-race", date: first.date, race: raceRef(db, first) }));

	const f = facts(db);
	for (const [kind, standings] of [["title", db.driverStandings], ["team-title", db.constructorStandings]] as const) {
		for (const [y, idx] of deciders(db, kind === "title" ? "driver" : "constructor")) {
			const race = f.races[idx]?.race;
			const id = standings.get(y)?.find((s) => s.champion)?.id;
			if (!race || !id) continue;
			out.push(ev({ kind, date: race.date, race: raceRef(db, race), driver: kind === "title" ? driverRef(db, id) : null, team: kind === "team-title" ? teamRef(db, id) : null }));
		}
	}

	const champion = (id: string) => (drivers.get(id)?.titles ?? 0) > 0;
	const debut = new Map<string, Race>();
	const firstWin = new Map<string, Race>();
	const teamFirstWin = new Map<string, { race: Race; driverId: string }>();
	const races = [...db.races].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
	for (const race of races)
		for (const r of db.resultsByRace.get(race.id) ?? []) {
			if (isStart(r) && !debut.has(r.driverId)) debut.set(r.driverId, race);
			if (r.position !== 1) continue;
			if (!firstWin.has(r.driverId)) firstWin.set(r.driverId, race);
			if (!teamFirstWin.has(r.constructorId)) teamFirstWin.set(r.constructorId, { race, driverId: r.driverId });
		}
	for (const [id, race] of debut) if (champion(id)) out.push(ev({ kind: "debut", date: race.date, race: raceRef(db, race), driver: driverRef(db, id) }));
	for (const [id, race] of firstWin)
		if (champion(id) || (drivers.get(id)?.wins ?? 0) >= 10) out.push(ev({ kind: "first-win", date: race.date, race: raceRef(db, race), driver: driverRef(db, id) }));
	for (const [id, { race, driverId }] of teamFirstWin)
		if ((teams.get(id)?.wins ?? 0) >= 10) out.push(ev({ kind: "team-first-win", date: race.date, race: raceRef(db, race), team: teamRef(db, id), driver: driverRef(db, driverId) }));
	for (const id of drivers.keys()) {
		const d = db.drivers.get(id);
		if (d?.dateOfBirth && champion(id)) out.push(ev({ kind: "birth", date: d.dateOfBirth, driver: driverRef(db, id), died: Boolean(d.dateOfDeath) }));
	}
	out.sort((a, b) => a.date.slice(5).localeCompare(b.date.slice(5)) || a.date.localeCompare(b.date));
	annMemo.set(db, out);
	return out;
}

/* ---------------------------------------------------------- home panel --- */

export type MilestoneWatch = { year: number; nextRace: RaceRef | null; milestones: Milestone[]; chases: RecordChase[] };

/** The few most imminent milestones and the highest-placed record chases, for the home page. */
export function milestoneWatch(db: Db, n = 4): MilestoneWatch | null {
	const v = milestonesView(db);
	if (!v) return null;
	const best = v.chases.filter((c) => c.eta != null).sort((a, b) => a.newRank - b.newRank || a.eta! - b.eta!);
	const drivers = best.filter((c) => c.subject.kind === "driver");
	const teams = best.filter((c) => c.subject.kind === "team");
	const chases = [...drivers.slice(0, n - Math.min(1, teams.length)), ...teams].slice(0, n).sort((a, b) => a.newRank - b.newRank);
	return { year: v.year, nextRace: v.nextRace, milestones: v.milestones.slice(0, n), chases };
}
