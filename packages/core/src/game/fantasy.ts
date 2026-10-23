// Fantasy: Through the Eras. Draft driver-seasons and a constructor-season from any
// era under a budget; each pick is scored by replaying its real season with one
// fantasy points table for every era, averaged per race so 7-race and 24-race
// seasons compare. Prices come from how a season ranked (title position, points
// share, wins, podiums), not from fantasy points, so finding underpriced seasons is
// the game. `buildFantasyData` runs once in scripts/build-client-data.ts and writes
// public/data/fantasy.json; everything else here runs in the browser on that file.

import type { Db, Race, Result } from "../f1/dataset.ts";
import { simulateEvent, type SimEntry } from "../sim/engine.ts";
import { hash, rng, stream, type Rand } from "../sim/random.ts";

/* ------------------------------------------------------------------ data --- */

/** Finish code: 1+ classified position, 0 retired, -1 disqualified, -2 did not start, -3 running but not classified. */
export type Finish = number;
export const DNF = 0;
export const DSQ = -1;
export const DNS = -2;
export const NC = -3;

/** Race flags. */
export const POLE = 1;
export const FASTEST = 2;
/** Best-placed car of its team (only meaningful with TEAMMATE). */
export const TOP_CAR = 4;
export const TEAMMATE = 8;

/** One race of a driver-season: [round, finish, grid (0 = unknown / pit lane), flags]. */
export type DriverRace = [number, Finish, number, number];
/** One race of a constructor-season: its two best cars [round, finish A, finish B (DNS = no second car), flags]. */
export type TeamRace = [number, Finish, Finish, number];

/** Short keys keep public/data/fantasy.json small: ~3,000 driver-seasons. */
export type DriverSeason = {
	/** `${driverId}@${year}` */
	id: string;
	d: string;
	y: number;
	/** Constructors, most starts first. */
	t: string[];
	/** Price, millions. */
	p: number;
	/** Championship position. */
	cp: number | null;
	/** Official championship points. */
	pts: number;
	w: number;
	pod: number;
	pl: number;
	/** Starts (Indianapolis 500 excluded). */
	st: number;
	/** Performance model: driver skill and car pace (rating points, relative to the season's field), retirement chance. */
	sk: number;
	car: number;
	dnf: number;
	r: DriverRace[];
};

export type TeamSeason = {
	/** `${constructorId}@${year}` */
	id: string;
	t: string;
	y: number;
	p: number;
	/** Position among constructors (official from 1958, by drivers' points earned in its cars before). */
	cp: number | null;
	pts: number;
	w: number;
	pod: number;
	/** Races with at least one starter. */
	st: number;
	/** Its main drivers, most starts first. */
	ds: string[];
	/** Performance model car pace (works car). */
	car: number;
	r: TeamRace[];
};

export type FantasyData = {
	v: 1;
	/** Completed seasons covered. */
	from: number;
	to: number;
	nations: Record<string, [name: string, alpha2: string]>;
	drivers: Record<string, [name: string, nation: string]>;
	teams: Record<string, [name: string, nation: string]>;
	/** Season rounds scored (Indianapolis 500 excluded): [round, short name, alpha2]. */
	races: Record<number, [number, string, string][]>;
	ds: DriverSeason[];
	cs: TeamSeason[];
};

/** The Indianapolis 500 counted for the 1950–60 championship, but with its own field: it isn't scored. */
const SKIP_GP = new Set(["indianapolis"]);

export type PaceFn = (driverId: string, teamId: string, year: number) => { skill: number; car: number; dnf: number };

const r1 = (n: number) => Math.round(n * 10) / 10 || 0;
const half = (n: number) => Math.round(n * 2) / 2;

function finishCode(r: Result): Finish {
	if (r.position != null) return r.position;
	if (r.positionText === "DSQ" || r.positionText === "EX") return DSQ;
	if (r.positionText === "NC") return NC;
	if (r.positionText === "DNF") return DNF;
	return DNS;
}

const started = (f: Finish) => f !== DNS;
/** Lower is better: classified by position, then the rest by laps covered. */
const orderKey = (r: Result) => (r.position != null ? r.position : 1000 - (r.laps ?? 0));

/** Price curve for a season's standing: 0 (backmarker) .. 1 (dominant champion). */
export function seasonValue(o: { share: number; pos: number | null; winRate: number; podRate: number; part: number }): number {
	const pos = o.pos ? 1 / (1 + (o.pos - 1) * 0.35) : 0;
	const v = 0.35 * Math.min(1, o.share) + 0.3 * pos + 0.2 * Math.min(1, o.winRate * 2) + 0.15 * Math.min(1, o.podRate * 1.5);
	return v * (0.35 + 0.65 * Math.min(1, o.part));
}

export const DRIVER_PRICE = { min: 4, max: 35 };
export const TEAM_PRICE = { min: 3, max: 30 };
const priceOf = (v: number, range: { min: number; max: number }) => half(range.min + (range.max - range.min) * Math.max(0, v) ** 1.25);

export function buildFantasyData(db: Db, pace?: PaceFn): FantasyData {
	const nations: FantasyData["nations"] = {};
	const drivers: FantasyData["drivers"] = {};
	const teams: FantasyData["teams"] = {};
	const races: FantasyData["races"] = {};
	const ds: DriverSeason[] = [];
	const cs: TeamSeason[] = [];
	const nation = (id: string) => {
		const c = db.countries.get(id);
		if (c && !nations[id]) nations[id] = [c.name, c.alpha2.toLowerCase()];
		return id;
	};
	const years = db.years.filter((y) => {
		const all = db.racesByYear.get(y) ?? [];
		return all.length > 0 && all.every((r) => db.resultsByRace.has(r.id));
	});

	for (const y of years) {
		const season: Race[] = (db.racesByYear.get(y) ?? []).filter((r) => !SKIP_GP.has(r.grandPrixId));
		const rounds = season.length;
		if (!rounds) continue;
		races[y] = season.map((r) => {
			const gp = db.grandsPrix.get(r.grandPrixId);
			return [r.round, gp?.shortName ?? r.officialName, db.countries.get(gp?.country ?? "")?.alpha2.toLowerCase() ?? ""];
		});

		const perDriver = new Map<string, { race: DriverRace; team: string }[]>();
		const perTeam = new Map<string, TeamRace[]>();
		const teamStats = new Map<string, { pts: number; w: number; pod: number; drivers: Map<string, number> }>();
		for (const race of season) {
			// one result per driver (shared drives: the better one)
			const best = new Map<string, Result>();
			for (const r of db.resultsByRace.get(race.id) ?? []) {
				const prev = best.get(r.driverId);
				const rs = started(finishCode(r));
				const ps = prev && started(finishCode(prev));
				if (!prev || (rs && !ps) || (rs === ps && orderKey(r) < orderKey(prev))) best.set(r.driverId, r);
			}
			const list = [...best.values()];
			const byTeam = new Map<string, Result[]>();
			for (const r of list) if (started(finishCode(r))) (byTeam.get(r.constructorId) ?? byTeam.set(r.constructorId, []).get(r.constructorId)!).push(r);
			for (const cars of byTeam.values()) cars.sort((a, b) => orderKey(a) - orderKey(b));
			for (const r of list) {
				const f = finishCode(r);
				let flags = (r.pole ? POLE : 0) | (r.fastestLap ? FASTEST : 0);
				const cars = byTeam.get(r.constructorId);
				if (started(f) && cars && cars.length > 1) flags |= TEAMMATE | (cars[0] === r ? TOP_CAR : 0);
				const entry = { race: [race.round, f, started(f) ? (r.grid ?? 0) : 0, flags] as DriverRace, team: r.constructorId };
				(perDriver.get(r.driverId) ?? perDriver.set(r.driverId, []).get(r.driverId)!).push(entry);
			}
			for (const [team, cars] of byTeam) {
				const a = cars[0];
				const b = cars[1];
				const flags = (cars.some((c) => c.pole) ? POLE : 0) | (cars.some((c) => c.fastestLap) ? FASTEST : 0);
				(perTeam.get(team) ?? perTeam.set(team, []).get(team)!).push([race.round, finishCode(a), b ? finishCode(b) : DNS, flags]);
				const s = teamStats.get(team) ?? teamStats.set(team, { pts: 0, w: 0, pod: 0, drivers: new Map() }).get(team)!;
				for (const c of cars) {
					s.pts += c.points;
					if (c.position === 1) s.w++;
					if (c.position != null && c.position <= 3) s.pod++;
					s.drivers.set(c.driverId, (s.drivers.get(c.driverId) ?? 0) + 1);
				}
			}
		}

		// drivers
		const standings = db.driverStandings.get(y) ?? [];
		const leader = Math.max(1, ...standings.map((s) => s.points));
		const minStarts = Math.max(2, Math.ceil(rounds * 0.25));
		for (const [driverId, entries] of perDriver) {
			const st = entries.filter((e) => started(e.race[1])).length;
			if (st < minStarts) continue;
			const teamStarts = new Map<string, number>();
			for (const e of entries) if (started(e.race[1])) teamStarts.set(e.team, (teamStarts.get(e.team) ?? 0) + 1);
			const t = [...teamStarts].sort((a, b) => b[1] - a[1]).map(([id]) => id);
			const row = standings.find((s) => s.id === driverId);
			const w = entries.filter((e) => e.race[1] === 1).length;
			const pod = entries.filter((e) => e.race[1] >= 1 && e.race[1] <= 3).length;
			const pl = entries.filter((e) => e.race[3] & POLE).length;
			const cp = row?.position ?? null;
			const v = seasonValue({ share: (row?.points ?? 0) / leader, pos: cp, winRate: w / rounds, podRate: pod / rounds, part: st / rounds });
			const pr = pace?.(driverId, t[0], y);
			const d = db.drivers.get(driverId)!;
			drivers[driverId] ??= [d.name, nation(d.nationality)];
			for (const id of t) {
				const c = db.constructors.get(id)!;
				teams[id] ??= [c.name, nation(c.country)];
			}
			ds.push({
				id: `${driverId}@${y}`,
				d: driverId,
				y,
				t,
				p: priceOf(v, DRIVER_PRICE),
				cp,
				pts: row?.points ?? 0,
				w,
				pod,
				pl,
				st,
				sk: r1(pr?.skill ?? 0),
				car: r1(pr?.car ?? 0),
				dnf: Math.round((pr?.dnf ?? 0.15) * 100) / 100,
				r: entries.map((e) => e.race),
			});
		}

		// constructors
		const official = db.constructorStandings.get(y);
		const ranked = official?.length
			? official.map((s) => ({ id: s.id, pos: s.position, pts: s.points }))
			: [...teamStats].sort((a, b) => b[1].pts - a[1].pts).map(([id, s], i) => ({ id, pos: s.pts > 0 ? i + 1 : null, pts: s.pts }));
		const top = Math.max(1, ...ranked.map((s) => s.pts));
		const minRaces = Math.max(2, Math.ceil(rounds * 0.4));
		for (const [teamId, list] of perTeam) {
			if (list.length < minRaces) continue;
			const s = teamStats.get(teamId)!;
			const row = ranked.find((r) => r.id === teamId);
			const v = seasonValue({ share: (row?.pts ?? 0) / top, pos: row?.pos ?? null, winRate: s.w / rounds, podRate: s.pod / 2 / rounds, part: list.length / rounds });
			const c = db.constructors.get(teamId)!;
			teams[teamId] ??= [c.name, nation(c.country)];
			const main = [...s.drivers].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
			for (const id of main) {
				const d = db.drivers.get(id)!;
				drivers[id] ??= [d.name, nation(d.nationality)];
			}
			cs.push({ id: `${teamId}@${y}`, t: teamId, y, p: priceOf(v, TEAM_PRICE), cp: row?.pos ?? null, pts: row?.pts ?? s.pts, w: s.w, pod: s.pod, st: list.length, ds: main, car: r1(main[0] ? (pace?.(main[0], teamId, y).car ?? 0) : 0), r: list });
		}
	}
	return { v: 1, from: years[0], to: years[years.length - 1], nations, drivers, teams, races, ds, cs };
}

/* ------------------------------------------------------------ file format --- */

// In the file each race is 4 characters (round, finish + 3, grid, flags in base 64),
// which keeps fantasy.json about a third of its plain-array size.
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const DRIVER_OFFSET = [0, 3, 0, 0];
const TEAM_OFFSET = [0, 3, 3, 0];

function packRaces(list: [number, number, number, number][], offset: number[]): string {
	return list
		.map((t) =>
			t
				.map((v, i) => {
					const c = B64[v + offset[i]];
					if (c == null) throw new Error(`fantasy: value ${v} out of range`);
					return c;
				})
				.join(""),
		)
		.join("");
}

function unpackRaces<T extends [number, number, number, number]>(s: string, offset: number[]): T[] {
	const out: T[] = [];
	for (let i = 0; i + 3 < s.length; i += 4) out.push([0, 1, 2, 3].map((k) => B64.indexOf(s[i + k]) - offset[k]) as T);
	return out;
}

// Seasons are positional rows in the file (no repeated keys; ids rebuilt on load).
type DriverRow = [d: string, y: number, t: string[], p: number, cp: number | null, pts: number, w: number, pod: number, pl: number, st: number, sk: number, car: number, dnf: number, r: string];
type TeamRow = [t: string, y: number, p: number, cp: number | null, pts: number, w: number, pod: number, st: number, ds: string[], car: number, r: string];
export type FantasyFile = Omit<FantasyData, "ds" | "cs"> & { ds: DriverRow[]; cs: TeamRow[] };

export const packFantasy = (data: FantasyData): FantasyFile => ({
	...data,
	ds: data.ds.map((s) => [s.d, s.y, s.t, s.p, s.cp, s.pts, s.w, s.pod, s.pl, s.st, s.sk, s.car, s.dnf, packRaces(s.r, DRIVER_OFFSET)]),
	cs: data.cs.map((s) => [s.t, s.y, s.p, s.cp, s.pts, s.w, s.pod, s.st, s.ds, s.car, packRaces(s.r, TEAM_OFFSET)]),
});

export const unpackFantasy = (file: FantasyFile): FantasyData => ({
	...file,
	ds: file.ds.map(([d, y, t, p, cp, pts, w, pod, pl, st, sk, car, dnf, r]) => ({ id: `${d}@${y}`, d, y, t, p, cp, pts, w, pod, pl, st, sk, car, dnf, r: unpackRaces<DriverRace>(r, DRIVER_OFFSET) })),
	cs: file.cs.map(([t, y, p, cp, pts, w, pod, st, ds, car, r]) => ({ id: `${t}@${y}`, t, y, p, cp, pts, w, pod, st, ds, car, r: unpackRaces<TeamRace>(r, TEAM_OFFSET) })),
});

/* --------------------------------------------------------------- scoring --- */

export const FINISH_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const FANTASY = { pole: 5, fastestLap: 3, topCar: 3, gainCap: 10, lossCap: 5, dnf: -10, dsq: -15, perSeason: 20 } as const;

export type RaceScore = { round: number; finish: number; pole: number; fastestLap: number; teammate: number; gained: number; penalty: number; total: number };

const finishPoints = (f: Finish) => (f >= 1 ? (FINISH_POINTS[f - 1] ?? 0) : 0);
const penaltyFor = (f: Finish) => (f === DNF ? FANTASY.dnf : f === DSQ ? FANTASY.dsq : 0);

export function scoreDriverRace([round, f, grid, flags]: DriverRace): RaceScore {
	const finish = finishPoints(f);
	const pole = flags & POLE ? FANTASY.pole : 0;
	const fastestLap = flags & FASTEST ? FANTASY.fastestLap : 0;
	const teammate = flags & TEAMMATE && flags & TOP_CAR ? FANTASY.topCar : 0;
	const gained = f >= 1 && grid > 0 ? Math.max(-FANTASY.lossCap, Math.min(FANTASY.gainCap, grid - f)) : 0;
	const penalty = penaltyFor(f);
	return { round, finish, pole, fastestLap, teammate, gained, penalty, total: finish + pole + fastestLap + teammate + gained + penalty };
}

/** Constructor: both of its best two cars' finishing points and retirements, plus pole and fastest lap. */
export function scoreTeamRace([round, a, b, flags]: TeamRace): RaceScore {
	const finish = finishPoints(a) + finishPoints(b);
	const pole = flags & POLE ? FANTASY.pole : 0;
	const fastestLap = flags & FASTEST ? FANTASY.fastestLap : 0;
	const penalty = penaltyFor(a) + penaltyFor(b);
	return { round, finish, pole, fastestLap, teammate: 0, gained: 0, penalty, total: finish + pole + fastestLap + penalty };
}

export type SeasonScore = { races: RaceScore[]; raw: number; rounds: number; /** Per-race average × 20, so every era is on one scale. */ total: number };

function seasonScore(data: FantasyData, year: number, races: RaceScore[]): SeasonScore {
	const rounds = data.races[year]?.length || races.length || 1;
	const raw = races.reduce((a, r) => a + r.total, 0);
	return { races, raw, rounds, total: Math.round((raw / rounds) * FANTASY.perSeason) };
}

const scoreCache = new WeakMap<object, number>();
export function driverScore(data: FantasyData, s: DriverSeason): SeasonScore {
	return seasonScore(data, s.y, s.r.map(scoreDriverRace));
}
export function teamScore(data: FantasyData, s: TeamSeason): SeasonScore {
	return seasonScore(data, s.y, s.r.map(scoreTeamRace));
}
/** Season total only, memoised (used for thousands of random teams). */
export function quickScore(data: FantasyData, s: DriverSeason | TeamSeason): number {
	let v = scoreCache.get(s);
	if (v == null) scoreCache.set(s, (v = "d" in s ? driverScore(data, s).total : teamScore(data, s).total));
	return v;
}

/* ----------------------------------------------------------------- rules --- */

export type Constraint =
	| { kind: "years"; from: number; to: number }
	| { kind: "noChampions" }
	| { kind: "noWinners" }
	| { kind: "decades" }
	| { kind: "nation"; nation: string; min: number }
	| { kind: "maxPrice"; max: number };

export type Rules = { budget: number; drivers: number; constraints: Constraint[] };
export const FREE_PLAY: Rules = { budget: 100, drivers: 5, constraints: [] };

export type Team = { drivers: string[]; constructor: string | null; captain: string | null };
export const EMPTY_TEAM: Team = { drivers: [], constructor: null, captain: null };

export type Pool = { data: FantasyData; ds: Map<string, DriverSeason>; cs: Map<string, TeamSeason> };
export const makePool = (data: FantasyData): Pool => ({ data, ds: new Map(data.ds.map((s) => [s.id, s])), cs: new Map(data.cs.map((s) => [s.id, s])) });

const decade = (y: number) => Math.floor(y / 10) * 10;

/** Why a driver-season can't be in this team under these rules on its own merits (null = eligible). */
export function driverIneligible(s: DriverSeason, rules: Rules): string | null {
	for (const c of rules.constraints) {
		if (c.kind === "years" && (s.y < c.from || s.y > c.to)) return `Only ${yearsLabel(c.from, c.to)}`;
		if (c.kind === "noChampions" && s.cp === 1) return "No champions";
		if (c.kind === "noWinners" && s.w > 0) return "No race winners";
		if (c.kind === "maxPrice" && s.p > c.max) return `Nobody over ${c.max}M`;
	}
	return null;
}

export function teamIneligible(s: TeamSeason, rules: Rules): string | null {
	for (const c of rules.constraints) {
		if (c.kind === "years" && (s.y < c.from || s.y > c.to)) return `Only ${yearsLabel(c.from, c.to)}`;
		if (c.kind === "noChampions" && s.cp === 1) return "No champions";
		if (c.kind === "noWinners" && s.w > 0) return "No race winners";
	}
	return null;
}

export const teamCost = (pool: Pool, team: Team) =>
	team.drivers.reduce((a, id) => a + (pool.ds.get(id)?.p ?? 0), 0) + (team.constructor ? (pool.cs.get(team.constructor)?.p ?? 0) : 0);

/** Can `s` join the team right now? Returns the reason it can't. Keeps budget for the slots still open. */
export function addBlocker(pool: Pool, team: Team, rules: Rules, s: DriverSeason): string | null {
	if (team.drivers.includes(s.id)) return null;
	const why = driverIneligible(s, rules);
	if (why) return why;
	if (team.drivers.length >= rules.drivers) return "Team is full";
	const picks = team.drivers.map((id) => pool.ds.get(id)!).filter(Boolean);
	if (picks.some((p) => p.d === s.d)) return "Already in your team (another season)";
	if (rules.constraints.some((c) => c.kind === "decades") && picks.some((p) => decade(p.y) === decade(s.y))) return `Already have a driver from the ${decade(s.y)}s`;
	const nat = rules.constraints.find((c) => c.kind === "nation");
	if (nat?.kind === "nation") {
		const have = picks.filter((p) => pool.data.drivers[p.d]?.[1] === nat.nation).length + (pool.data.drivers[s.d]?.[1] === nat.nation ? 1 : 0);
		const left = rules.drivers - picks.length - 1;
		if (have + left < nat.min) return `Need ${nat.min} ${demonym(pool.data, nat.nation)} drivers`;
	}
	const left = rules.budget - teamCost(pool, team) - s.p;
	if (left < 0) return `Over budget by ${num1(-left)}M`;
	if (left < reserve(rules.drivers - picks.length - 1, !team.constructor)) return "Leaves too little for the rest of the team";
	return null;
}

/** The least the open slots can cost. */
const reserve = (drivers: number, constructor: boolean) => drivers * DRIVER_PRICE.min + (constructor ? TEAM_PRICE.min : 0);

export function teamAddBlocker(pool: Pool, team: Team, rules: Rules, s: TeamSeason): string | null {
	const why = teamIneligible(s, rules);
	if (why) return why;
	const current = team.constructor ? (pool.cs.get(team.constructor)?.p ?? 0) : 0;
	const left = rules.budget - teamCost(pool, team) + current - s.p;
	if (left < 0) return `Over budget by ${num1(-left)}M`;
	if (left < reserve(rules.drivers - team.drivers.length, false)) return "Leaves too little for the rest of the team";
	return null;
}

/** Everything wrong with a team as a whole (empty = ready to lock in). */
export function teamIssues(pool: Pool, team: Team, rules: Rules): string[] {
	const out: string[] = [];
	const picks = team.drivers.map((id) => pool.ds.get(id)).filter((s): s is DriverSeason => !!s);
	if (picks.length < rules.drivers) out.push(`Pick ${rules.drivers - picks.length} more driver${rules.drivers - picks.length === 1 ? "" : "s"}`);
	if (!team.constructor || !pool.cs.has(team.constructor)) out.push("Pick a constructor");
	const cost = teamCost(pool, team);
	if (cost > rules.budget) out.push(`Over budget by ${num1(cost - rules.budget)}M`);
	for (const p of picks) {
		const why = driverIneligible(p, rules);
		if (why) out.push(`${pool.data.drivers[p.d]?.[0]} ${p.y}: ${why.toLowerCase()}`);
	}
	if (new Set(picks.map((p) => p.d)).size < picks.length) out.push("A driver can only be picked once");
	if (rules.constraints.some((c) => c.kind === "decades") && new Set(picks.map((p) => decade(p.y))).size < picks.length) out.push("One driver per decade");
	const nat = rules.constraints.find((c) => c.kind === "nation");
	if (nat?.kind === "nation" && picks.length === rules.drivers && picks.filter((p) => pool.data.drivers[p.d]?.[1] === nat.nation).length < nat.min)
		out.push(`Need ${nat.min} ${demonym(pool.data, nat.nation)} drivers`);
	const c = team.constructor ? pool.cs.get(team.constructor) : null;
	if (c) {
		const why = teamIneligible(c, rules);
		if (why) out.push(`${pool.data.teams[c.t]?.[0]} ${c.y}: ${why.toLowerCase()}`);
	}
	return out;
}

export type TeamResult = {
	drivers: { season: DriverSeason; score: SeasonScore; captain: boolean; points: number }[];
	constructor: { season: TeamSeason; score: SeasonScore } | null;
	total: number;
};

/** The captain scores double. */
export function scoreTeam(pool: Pool, team: Team): TeamResult {
	const drivers = team.drivers
		.map((id) => pool.ds.get(id))
		.filter((s): s is DriverSeason => !!s)
		.map((season) => {
			const score = driverScore(pool.data, season);
			const captain = season.id === team.captain;
			return { season, score, captain, points: score.total * (captain ? 2 : 1) };
		});
	const c = team.constructor ? pool.cs.get(team.constructor) : null;
	const constructor = c ? { season: c, score: teamScore(pool.data, c) } : null;
	return { drivers, constructor, total: drivers.reduce((a, d) => a + d.points, 0) + (constructor?.score.total ?? 0) };
}

/* ------------------------------------------------------ random benchmark --- */

/**
 * Scores of `n` random valid teams under `rules` (sorted ascending), the benchmark a
 * score's percentile is measured against. Random teams captain their priciest driver.
 */
export function randomTeamScores(pool: Pool, rules: Rules, seed: number, n = 2000): number[] {
	const rand = rng(seed);
	const ds = pool.data.ds.filter((s) => !driverIneligible(s, rules));
	const cs = pool.data.cs.filter((s) => !teamIneligible(s, rules));
	if (!ds.length || !cs.length) return [];
	const minD = Math.min(...ds.map((s) => s.p));
	const out: number[] = [];
	for (let guard = 0; out.length < n && guard < n * 20; guard++) {
		const team = randomTeam(pool, rules, rand, ds, cs, minD);
		if (!team) continue;
		const cap = team.drivers.map((id) => pool.ds.get(id)!).sort((a, b) => b.p - a.p)[0];
		let total = quickScore(pool.data, pool.cs.get(team.constructor!)!);
		for (const id of team.drivers) total += quickScore(pool.data, pool.ds.get(id)!) * (id === cap.id ? 2 : 1);
		out.push(total);
	}
	return out.sort((a, b) => a - b);
}

function randomTeam(pool: Pool, rules: Rules, rand: Rand, ds: DriverSeason[], cs: TeamSeason[], minD: number): Team | null {
	const affordable = cs.filter((c) => c.p + minD * rules.drivers <= rules.budget);
	if (!affordable.length) return null;
	const team: Team = { drivers: [], constructor: affordable[Math.floor(rand() * affordable.length)].id, captain: null };
	for (let tries = 0; team.drivers.length < rules.drivers && tries < 400; tries++) {
		const s = ds[Math.floor(rand() * ds.length)];
		if (addBlocker(pool, team, rules, s)) continue;
		// keep enough budget for the cheapest picks in the open slots
		const open = rules.drivers - team.drivers.length - 1;
		if (rules.budget - teamCost(pool, team) - s.p < open * minD) continue;
		team.drivers.push(s.id);
	}
	return team.drivers.length === rules.drivers && !teamIssues(pool, team, rules).length ? team : null;
}

/** Share of the benchmark a score beats, 0..100. */
export function percentile(sorted: number[], score: number): number {
	if (!sorted.length) return 0;
	let lo = 0;
	let hi = sorted.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (sorted[mid] < score) lo = mid + 1;
		else hi = mid;
	}
	return Math.round((lo / sorted.length) * 1000) / 10;
}

export function rating(pct: number): { label: string; tier: number } {
	if (pct >= 99) return { label: "Legend", tier: 5 };
	if (pct >= 95) return { label: "Champion", tier: 4 };
	if (pct >= 85) return { label: "Race winner", tier: 3 };
	if (pct >= 65) return { label: "Podium", tier: 2 };
	if (pct >= 40) return { label: "Points", tier: 1 };
	return { label: "Backmarker", tier: 0 };
}

/* ------------------------------------------------------------- challenges --- */

export type Challenge = { id: string; title: string; description: string; rules: Rules };

const yearsLabel = (from: number, to: number) => (to - from === 9 && from % 10 === 0 ? `the ${from}s` : to >= 9999 ? `${from} onwards` : from <= 1950 ? `before ${to + 1}` : `${from}–${to}`);
const num1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const demonym = (data: FantasyData, nation: string) => DEMONYMS[nation] ?? data.nations[nation]?.[0] ?? nation;
const DEMONYMS: Record<string, string> = {
	"united-kingdom": "British",
	italy: "Italian",
	france: "French",
	germany: "German",
	"united-states-of-america": "American",
	brazil: "Brazilian",
	argentina: "Argentine",
	australia: "Australian",
	finland: "Finnish",
	belgium: "Belgian",
	switzerland: "Swiss",
	"south-africa": "South African",
	austria: "Austrian",
	netherlands: "Dutch",
	sweden: "Swedish",
	spain: "Spanish",
	"new-zealand": "New Zealand",
	japan: "Japanese",
	canada: "Canadian",
	mexico: "Mexican",
};

/** The pool of daily challenges, in a fixed shuffled order; day N plays entry N mod length. */
export function challengeCatalogue(data: FantasyData): Challenge[] {
	const list: Challenge[] = [];
	const rules = (c: Constraint[], budget = 100): Rules => ({ budget, drivers: 5, constraints: c });
	for (let d = decade(data.from); d <= decade(data.to); d += 10) {
		const to = Math.min(d + 9, data.to);
		list.push({ id: `decade-${d}`, title: `The ${d}s`, description: `Every pick from ${d}–${to}.`, rules: rules([{ kind: "years", from: d, to }]) });
	}
	list.push(
		{ id: "no-champions", title: "No champions", description: "No world champion driver-seasons and no champion constructors.", rules: rules([{ kind: "noChampions" }]) },
		{ id: "no-winners", title: "Winless wonders", description: "Only seasons without a race win (Indianapolis 500 aside).", rules: rules([{ kind: "noWinners" }], 60) },
		{ id: "budget-70", title: "Tight budget", description: "The usual team on 70M.", rules: rules([], 70) },
		{ id: "decades", title: "Time travellers", description: "Five drivers from five different decades.", rules: rules([{ kind: "decades" }]) },
		{ id: "bargain", title: "Bargain bin", description: "No driver priced over 12M.", rules: rules([{ kind: "maxPrice", max: 12 }], 70) },
		{ id: "pre-1980", title: "Old school", description: "Every pick from before 1980.", rules: rules([{ kind: "years", from: data.from, to: 1979 }]) },
		{ id: "since-2000", title: "New millennium", description: "Every pick from 2000 onwards.", rules: rules([{ kind: "years", from: 2000, to: data.to }]) },
	);
	const counts = new Map<string, number>();
	for (const s of data.ds) counts.set(data.drivers[s.d][1], (counts.get(data.drivers[s.d][1]) ?? 0) + 1);
	for (const [n] of [...counts].filter(([, c]) => c >= 150).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
		const dem = demonym(data, n);
		list.push({ id: `nation-${n}`, title: `${dem} flair`, description: `At least three ${dem} drivers.`, rules: rules([{ kind: "nation", nation: n, min: 3 }]) });
	}
	const rand = rng(hash("fantasy-catalogue"));
	for (let i = list.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[list[i], list[j]] = [list[j], list[i]];
	}
	return list;
}

/** Days since 1 Jan 2026 of a YYYY-MM-DD date (UTC). */
const dayNumber = (date: string) => Math.floor((Date.parse(date + "T00:00:00Z") - Date.UTC(2026, 0, 1)) / 86_400_000);

export function dailyChallenge(data: FantasyData, date: string): Challenge & { date: string; number: number } {
	const list = challengeCatalogue(data);
	const n = dayNumber(date);
	const c = list[((n % list.length) + list.length) % list.length];
	return { ...c, id: `daily-${date}`, date, number: n + 1 };
}

export const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);

export function rulesSummary(data: FantasyData, rules: Rules): string[] {
	const out = [`${rules.drivers} drivers + 1 constructor`, `${rules.budget}M budget`];
	for (const c of rules.constraints) {
		if (c.kind === "years") out.push(`Only ${yearsLabel(c.from, c.to)}`);
		if (c.kind === "noChampions") out.push("No champions");
		if (c.kind === "noWinners") out.push("No race winners");
		if (c.kind === "decades") out.push("One driver per decade");
		if (c.kind === "maxPrice") out.push(`Drivers up to ${c.max}M`);
		if (c.kind === "nation") out.push(`${c.min}+ ${demonym(data, c.nation)} drivers`);
	}
	return out;
}

export function shareText(pool: Pool, team: Team, result: TeamResult, pct: number, title: string): string {
	const lines = [`Pitwall Fantasy: ${title}`, `${result.total.toLocaleString("en-GB")} pts, ${rating(pct).label} (beats ${Math.round(pct)}% of random teams)`];
	for (const d of result.drivers) lines.push(`${d.captain ? "(C) " : ""}${pool.data.drivers[d.season.d]?.[0]} ${d.season.y}: ${d.points}`);
	if (result.constructor) lines.push(`${pool.data.teams[result.constructor.season.t]?.[0]} ${result.constructor.season.y}: ${result.constructor.score.total}`);
	lines.push(`Spent ${num1(teamCost(pool, team))}M`);
	return lines.join("\n");
}

/* ------------------------------------------------------------- dream race --- */

/**
 * Cross-era race with the simulator. Ratings are measured against each season's own
 * field, so this compares how dominant each driver-season was in its time, not raw speed.
 */
export type DreamCars = "own" | "constructor" | "equal";
export type DreamOptions = { seed: number; races: number; cars: DreamCars; periodReliability: boolean; rivals: number };
export const DREAM_DEFAULTS: Omit<DreamOptions, "seed"> = { races: 8, cars: "own", periodReliability: false, rivals: 15 };

export const DREAM_CIRCUITS: [string, string][] = [
	["Monza", "it"],
	["Silverstone", "gb"],
	["Spa-Francorchamps", "be"],
	["Monaco", "mc"],
	["Suzuka", "jp"],
	["Interlagos", "br"],
	["Nürburgring", "de"],
	["Imola", "it"],
	["Montréal", "ca"],
	["Zandvoort", "nl"],
	["Kyalami", "za"],
	["Watkins Glen", "us"],
];

/** The all-time field: the highest-rated seasons of distinct drivers not already in the team. */
export function dreamRivals(pool: Pool, team: Team, count: number): DriverSeason[] {
	const mine = new Set(team.drivers.map((id) => pool.ds.get(id)?.d));
	const seen = new Set<string>();
	const out: DriverSeason[] = [];
	for (const s of [...pool.data.ds].sort((a, b) => b.sk + b.car - (a.sk + a.car) || a.id.localeCompare(b.id))) {
		if (mine.has(s.d) || seen.has(s.d)) continue;
		seen.add(s.d);
		out.push(s);
		if (out.length >= count) break;
	}
	return out;
}

export type DreamStanding = { id: string; season: DriverSeason; mine: boolean; points: number; wins: number; podiums: number; finishes: number[] };
export type DreamResult = { standings: DreamStanding[]; races: { name: string; country: string; order: string[]; dnf: string[]; pole: string; fastest: string | null }[] };

export function simulateDream(pool: Pool, team: Team, opts: DreamOptions): DreamResult {
	const mine = team.drivers.map((id) => pool.ds.get(id)).filter((s): s is DriverSeason => !!s);
	const field = [...mine, ...dreamRivals(pool, team, opts.rivals)];
	const own = new Set(mine.map((s) => s.id));
	const tc = team.constructor ? pool.cs.get(team.constructor) : null;
	const yourCar = tc?.car ?? 0;
	const entries: SimEntry[] = field.map((s) => {
		const car = opts.cars === "equal" ? 0 : opts.cars === "constructor" && own.has(s.id) ? yourCar : s.car;
		return {
			driverId: s.id,
			constructorId: opts.cars === "constructor" && own.has(s.id) && tc ? tc.t : s.t[0],
			engineId: "",
			tyreId: null,
			number: null,
			pace: s.sk + car,
			dnf: opts.periodReliability ? s.dnf : 0.06,
		};
	});
	const table = new Map<string, DreamStanding>(field.map((s) => [s.id, { id: s.id, season: s, mine: own.has(s.id), points: 0, wins: 0, podiums: 0, finishes: [] }]));
	const races: DreamResult["races"] = [];
	for (let i = 0; i < opts.races; i++) {
		const [name, country] = DREAM_CIRCUITS[i % DREAM_CIRCUITS.length];
		const race: Race = { id: -(i + 1), year: 2000, round: i + 1, date: "2000-01-01", grandPrixId: "dream", circuitId: name, officialName: name, laps: 60, distance: 305, courseLength: 5, hasSprint: false, qualifyingFormat: "" };
		const ev = simulateEvent(stream(opts.seed, "dream", i), race, entries, { chaos: 1, reliability: 1, qualify: true, reasons: ["Retired"], sprint: false });
		const order: string[] = [];
		const dnf: string[] = [];
		for (const r of ev.results) {
			const st = table.get(r.driverId)!;
			if (r.position != null) {
				order.push(r.driverId);
				st.points += FINISH_POINTS[r.position - 1] ?? 0;
				if (r.position === 1) st.wins++;
				if (r.position <= 3) st.podiums++;
				st.finishes.push(r.position);
			} else {
				dnf.push(r.driverId);
				st.finishes.push(0);
			}
		}
		races.push({ name, country, order, dnf, pole: ev.results.find((r) => r.pole)?.driverId ?? order[0], fastest: ev.results.find((r) => r.fastestLap)?.driverId ?? null });
	}
	const standings = [...table.values()].sort(
		(a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.id.localeCompare(b.id),
	);
	return { standings, races };
}
