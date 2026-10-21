// Simulating whole eras.
//
// "real-grids": every season in range re-raced with its real entry lists.
// "dynamic": real history up to fromYear-1, then a living world: a driver
// market every winter, contracts, retirements, prospects (real drivers around
// their real debut, plus generated rookies), team form that develops, regresses
// and resets with regulation changes, and seasons that run past the real data.
//
// Every random draw comes from a stream keyed by (seed, purpose, year, ...), so
// a run is a pure function of its inputs. Invariants are checked on every race.

import { completedRaces, isStart, type Constructor, type Db, type Driver, type QualifyingRow, type Race, type Result } from "../f1/dataset.ts";
import { computeStandings, eraRules, scoreRace } from "../f1/points.ts";
import { simulateEvent, type SimEntry } from "./engine.ts";
import { ageAt, checkRace, MAX_AGE, MIN_AGE } from "./invariants.ts";
import type { HistorySim, Modifiers } from "./modifiers.ts";
import { makeDriver, makeTeam } from "./names.ts";
import { gaussian, randInt, stream } from "./random.ts";
import { simulateRealRace } from "./race.ts";
import { ageEffect, carAt, deriveRatings, dnfAt, seasonAge, skillAt, type Ratings } from "./ratings.ts";

export type SeasonReport = {
	year: number;
	grid: number;
	teams: number;
	/** Raw (un-normalised) driver skill of the seated field. */
	skillMean: number;
	skillSd: number;
	carSd: number;
	champion: string | null;
	championTeam: string | null;
	constructorChampion: string | null;
	rookies: number;
	generated: number;
};

export type HistoryOutput = {
	/** Generated races for seasons beyond the real data. */
	races: Race[];
	results: Map<number, Result[]>;
	sprints: Map<number, Result[]>;
	qualifying: Map<number, QualifyingRow[]>;
	drivers: Driver[];
	constructors: Constructor[];
	years: number[];
	violations: string[];
	seasons: SeasonReport[];
};

const INDY = "indianapolis";
/** Dynamic mode: how much team form follows reality while real seasons last. */
export const DEFAULT_ANCHOR = 0.35;
// Market and development tuning (rating points unless noted). Chosen so long
// runs keep titles spread out (see history.test.ts).
/** Title-winning teams find the next step harder (rules aimed at them, staff poached): in car SDs. */
const BALLAST = 0.6;
/** Bonus for staying with last season's team. */
const LOYALTY = 3;
/** Teams misjudge drivers by this much (SD). */
const SCOUTING = 6;
/** Pick order follows car strength, give or take this many car SDs. */
const ORDER_NOISE = 0.8;
/** Lasting driver–team affinity, ± this much. */
const AFFINITY = 7;
/** Reigning champions are worth this much more to a team. */
const CHAMP_BONUS = 3;
const REAL_REG_YEARS = [1961, 1966, 1983, 1989, 1994, 1998, 2009, 2014, 2017, 2022, 2026];

/** Regulation resets: the real ones, then every 6–8 years (seeded) after the real data. */
export function regulationYears(seed: number, lastReal: number, toYear: number): Set<number> {
	const out = new Set(REAL_REG_YEARS.filter((y) => y <= lastReal));
	let y = Math.max(lastReal, ...REAL_REG_YEARS.filter((r) => r <= lastReal));
	const rand = stream(seed, "regs");
	while (y <= toYear) {
		y += randInt(rand, 6, 8);
		if (y > lastReal) out.add(y);
	}
	return out;
}

/* ----------------------------------------------------------- real-grids --- */

function simulateRealGrids(base: Db, p: HistorySim, mods: Modifiers, onYear?: Progress): HistoryOutput {
	const out = emptyOutput();
	const to = Math.min(p.toYear, base.meta.lastCompletedYear);
	for (let y = p.fromYear; y <= to; y++) {
		onYear?.(y, p.fromYear, to);
		const races = completedRaces(base, y);
		if (!races.length) continue;
		out.years.push(y);
		for (const race of races) {
			const sim = simulateRealRace(base, race, p, mods);
			out.results.set(race.id, sim.results);
			if (sim.qualifying) out.qualifying.set(race.id, sim.qualifying);
			if (sim.sprint) out.sprints.set(race.id, sim.sprint);
			out.violations.push(...checkRace(race, sim.results, (id) => base.drivers.get(id), { ages: false }));
		}
	}
	return out;
}

const emptyOutput = (): HistoryOutput => ({
	races: [],
	results: new Map(),
	sprints: new Map(),
	qualifying: new Map(),
	drivers: [],
	constructors: [],
	years: [],
	violations: [],
	seasons: [],
});

/* ------------------------------------------------------- real structure --- */

type TeamPlan = { id: string; seats: number; engineId: string; tyreId: string | null };
type SeasonPlan = { teams: TeamPlan[]; starters: number; races: Race[]; indy: Race[] };
type RealCareer = { first: number; last: number; teamByYear: Map<number, string> };

const planCache = new WeakMap<Db, { plans: Map<number, SeasonPlan>; careers: Map<string, RealCareer> }>();

const mostCommon = <T>(xs: T[]): T => {
	const m = new Map<T, number>();
	for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
	return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/** Who really entered each season (full-time teams and their seat counts), and every real driver's career span. */
function realStructure(base: Db) {
	const hit = planCache.get(base);
	if (hit) return hit;
	const plans = new Map<number, SeasonPlan>();
	const careers = new Map<string, RealCareer>();
	for (const year of base.years) {
		const all = base.racesByYear.get(year) ?? [];
		const races = all.filter((r) => r.grandPrixId !== INDY);
		const done = races.filter((r) => base.resultsByRace.has(r.id));
		const counts = new Map<string, number[]>();
		const engines = new Map<string, string[]>();
		const tyres = new Map<string, (string | null)[]>();
		const starters: number[] = [];
		const driverTeams = new Map<string, string[]>();
		for (const race of done) {
			const rs = base.resultsByRace.get(race.id)!;
			starters.push(rs.filter(isStart).length);
			const perTeam = new Map<string, Set<string>>();
			for (const r of rs) {
				(perTeam.get(r.constructorId) ?? perTeam.set(r.constructorId, new Set()).get(r.constructorId)!).add(r.driverId);
				(engines.get(r.constructorId) ?? engines.set(r.constructorId, []).get(r.constructorId)!).push(r.engineId);
				(tyres.get(r.constructorId) ?? tyres.set(r.constructorId, []).get(r.constructorId)!).push(r.tyreId);
				(driverTeams.get(r.driverId) ?? driverTeams.set(r.driverId, []).get(r.driverId)!).push(r.constructorId);
			}
			for (const [t, ds] of perTeam) (counts.get(t) ?? counts.set(t, []).get(t)!).push(ds.size);
		}
		for (const [d, ts] of driverTeams) {
			const c = careers.get(d) ?? { first: year, last: year, teamByYear: new Map() };
			c.last = year;
			c.teamByYear.set(year, mostCommon(ts));
			careers.set(d, c);
		}
		if (!done.length) continue;
		const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
		const startersMedian = median(starters);
		const cands = [...counts.entries()]
			.map(([id, cs]) => ({ id, share: cs.length / done.length, mean: cs.reduce((a, b) => a + b, 0) / done.length, seats: Math.min(3, Math.max(1, Math.round(median(cs)))) }))
			.sort((a, b) => b.mean - a.mean || (a.id < b.id ? -1 : 1));
		const teams = cands.filter((c) => c.share >= 0.3);
		// part-time-heavy eras: top up seats (then teams) until the grid is close to real size
		const total = () => teams.reduce((a, t) => a + t.seats, 0);
		const target = Math.round(startersMedian * 0.9);
		for (let guard = 0; total() < target && guard < 50; guard++) {
			const t = teams.filter((t) => t.seats < 3).sort((a, b) => b.mean - b.seats - (a.mean - a.seats))[0];
			if (t && t.mean - t.seats > 0.3) t.seats++;
			else {
				const extra = cands.find((c) => !teams.includes(c) && c.share >= 0.15);
				if (!extra) break;
				teams.push(extra);
			}
		}
		plans.set(year, {
			teams: teams.map((t) => ({ id: t.id, seats: t.seats, engineId: mostCommon(engines.get(t.id)!), tyreId: mostCommon(tyres.get(t.id)!) })),
			starters: startersMedian,
			races,
			indy: all.filter((r) => r.grandPrixId === INDY),
		});
	}
	const out = { plans, careers };
	planCache.set(base, out);
	return out;
}

/* -------------------------------------------------------------- dynamic --- */

type SimDriver = {
	id: string;
	real: boolean;
	dob: string;
	birthYear: number;
	death: string | null;
	pot: number;
	walk: number;
	team: string | null;
	until: number;
	lastTeam: string | null;
	retired: boolean;
	unseated: number;
	/** Prospects: seasons in which a team may sign them, else they never make it. */
	window: [number, number] | null;
	hired: boolean;
	lastRank: number;
	titles: number[];
	forced: boolean;
	debut: number | null;
};

type SimTeam = { id: string; car: number; prev: number; engineId: string; tyreId: string | null; seats: number; since: number; history: number[]; rel: number };

function hazard(age: number) {
	if (age < 30) return 0.03;
	if (age < 33) return 0.06;
	if (age < 35) return 0.1;
	if (age < 37) return 0.17;
	if (age < 39) return 0.27;
	if (age < 41) return 0.4;
	if (age < 43) return 0.55;
	return 0.75;
}

function standardise(values: number[], sd: number): number[] {
	if (values.length < 3) return values.map((v) => v);
	const m = values.reduce((a, b) => a + b, 0) / values.length;
	const s = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length) || 1;
	return values.map((v) => ((v - m) / s) * sd);
}

function futureRace(tpl: Race, year: number, base: Db): Race {
	let md = tpl.date.slice(5);
	if (md === "02-29") md = "02-28";
	const gp = base.grandsPrix.get(tpl.grandPrixId);
	return { ...tpl, id: year * 1000 + tpl.round, year, date: `${year}-${md}`, officialName: `Formula 1 ${gp?.fullName ?? tpl.officialName} ${year}` };
}

function simulateDynamic(base: Db, p: HistorySim, mods: Modifiers, onYear?: Progress): HistoryOutput {
	const out = emptyOutput();
	const R: Ratings = deriveRatings(base);
	const { plans, careers } = realStructure(base);
	const lastReal = base.meta.lastCompletedYear;
	const from = Math.max(base.meta.firstYear, Math.min(p.fromYear, lastReal + 1));
	const to = Math.max(from, p.toYear);
	const anchor = Math.min(1, Math.max(0, p.anchor ?? DEFAULT_ANCHOR));
	const seed = p.seed;
	const regs = regulationYears(seed, lastReal, to);

	const realYears = [...R.seasons.keys()].filter((y) => y <= lastReal).sort((a, b) => a - b);
	const recent = realYears.slice(-10).map((y) => R.seasons.get(y)!);
	const futureCarSd = recent.reduce((a, s) => a + s.carSd, 0) / recent.length;
	const futureDnf = recent.slice(-5).reduce((a, s) => a + s.dnf, 0) / 5;
	const futureReasons = R.seasons.get(lastReal)?.reasons ?? ["Engine"];
	const lastPlan = plans.get(lastReal)!;
	const template = [...(base.racesByYear.get(lastReal) ?? [])].sort((a, b) => a.round - b.round);
	// generated rookies: drawn like modern established drivers, slightly below (most never make it)
	const rookieMean = R.rookiePrior.mean - 6;
	const rookieSd = Math.min(R.rookiePrior.sd, 14);

	const people = new Map<string, Driver>(base.drivers);
	const takenNames = new Set([...base.drivers.values()].map((d) => d.name));
	const takenTeams = new Set([...base.constructors.values()].map((c) => c.name));
	let nDriver = 0;
	let nTeam = 0;

	const pool = new Map<string, SimDriver>();
	const prospects: SimDriver[] = [];
	let teams = new Map<string, SimTeam>();

	const realDriver = (id: string, extra: Partial<SimDriver> = {}): SimDriver | null => {
		const d = base.drivers.get(id);
		if (!d?.dateOfBirth) return null;
		return {
			id,
			real: true,
			dob: d.dateOfBirth,
			birthYear: Number(d.dateOfBirth.slice(0, 4)),
			death: d.dateOfDeath,
			pot: R.potential.get(id) ?? rookieMean,
			walk: 0,
			team: null,
			until: 0,
			lastTeam: null,
			retired: false,
			unseated: 0,
			window: null,
			hired: false,
			lastRank: 99,
			titles: [],
			forced: false,
			debut: null,
			...extra,
		};
	};

	// --- the world at the end of fromYear-1 -----------------------------------
	const y0 = from - 1;
	const realTitles = new Map<string, number[]>();
	for (const [y, rows] of base.driverStandings) if (y <= y0) for (const r of rows) if (r.champion) (realTitles.get(r.id) ?? realTitles.set(r.id, []).get(r.id)!).push(y);
	const plan0 = plans.get(y0);
	for (const t of plan0?.teams ?? []) {
		teams.set(t.id, { id: t.id, car: carAt(R, t.id, y0), prev: carAt(R, t.id, y0 - 1), engineId: t.engineId, tyreId: t.tyreId, seats: t.seats, since: y0, history: [carAt(R, t.id, y0)], rel: 1 });
	}
	const rank0 = new Map((base.driverStandings.get(y0) ?? []).map((r) => [r.id, r.position ?? 99]));
	for (const [id, c] of careers) {
		if (c.last >= from - 3 && c.first <= y0) {
			const team = c.teamByYear.get(y0) ?? null;
			const d = realDriver(id, {
				team: team && teams.has(team) ? team : null,
				lastTeam: team,
				until: y0 + randInt(stream(seed, "contract", id), 0, 2),
				hired: true,
				lastRank: rank0.get(id) ?? 99,
				titles: realTitles.get(id) ?? [],
			});
			if (d) pool.set(id, d);
		} else if (c.first >= from) {
			const early = stream(seed, "prospect", id)() < 0.4 ? 1 : 0;
			const d = realDriver(id, { window: [c.first - early, c.first + 2] });
			if (d) prospects.push(d);
		}
	}
	// career overrides: a set debut makes the driver a prospect for exactly that season
	for (const [id, o] of mods.careers) {
		if (o.debutYear == null || o.debutYear < from) continue;
		const existing = pool.get(id) ?? prospects.find((x) => x.id === id);
		if (existing) existing.window = [o.debutYear, o.debutYear + 2];
		else {
			const d = realDriver(id, { window: [o.debutYear, o.debutYear + 2] });
			if (d) prospects.push(d);
		}
	}
	prospects.sort((a, b) => a.window![0] - b.window![0] || (a.id < b.id ? -1 : 1));

	const ageIn = (d: SimDriver, y: number) => y - d.birthYear;
	const eligible = (d: SimDriver, y: number, first: Race, last: Race) => {
		if (d.retired || mods.removed(d.id, y)) return false;
		if (d.death && d.death <= last.date) return false;
		const a = ageAt(d.dob, first.date);
		return a != null && a >= MIN_AGE && ageIn(d, y) <= MAX_AGE;
	};
	const skill = (d: SimDriver, y: number) =>
		(d.real ? skillAt(R, base, d.id, y) : d.pot + ageEffect(seasonAge(d.dob, y))) + d.walk + mods.driverDelta(d.id, y);

	// last season's title-winning teams
	const champions = new Set<string>();
	for (const rows of [base.driverStandings.get(y0), base.constructorStandings.get(y0)]) {
		const c = rows?.find((r) => r.champion)?.id;
		if (c) champions.add(rows === base.constructorStandings.get(y0) ? c : (careers.get(c)?.teamByYear.get(y0) ?? c));
	}

	// --- season by season ------------------------------------------------------
	for (let Y = from; Y <= to; Y++) {
		onYear?.(Y, from, to);
		const real = Y <= lastReal;
		const plan = real ? plans.get(Y) : undefined;
		if (real && !plan) continue;
		const calendar = real ? plan!.races : template.map((t) => futureRace(t, Y, base));
		if (!calendar.length) continue;
		const first = calendar[0];
		const last = calendar[calendar.length - 1];
		const rand = stream(seed, "winter", Y);
		const reg = regs.has(Y);
		const carSd = real ? (R.seasons.get(Y)?.carSd ?? futureCarSd) : futureCarSd;

		// 1. who's on the grid
		const next = new Map<string, SimTeam>();
		if (plan) {
			for (const t of plan.teams) {
				const prev = teams.get(t.id);
				const realCar = R.teams.get(t.id)?.get(Y)?.car ?? -0.6 * carSd;
				next.set(t.id, prev ? { ...prev, seats: t.seats, engineId: t.engineId, tyreId: t.tyreId } : { id: t.id, car: realCar, prev: realCar, engineId: t.engineId, tyreId: t.tyreId, seats: t.seats, since: Y, history: [], rel: 1 });
			}
		} else {
			for (const [id, t] of teams) next.set(id, t);
			const target = lastPlan.teams.length;
			const veterans = [...next.values()].filter((t) => t.since <= Y - 6);
			if (veterans.length && rand() < 0.05) {
				const avg = (t: SimTeam) => t.history.slice(-3).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(3, t.history.length));
				const weakest = veterans.sort((a, b) => avg(a) - avg(b) || (a.id < b.id ? -1 : 1))[0];
				next.delete(weakest.id);
			}
			while (next.size < target) {
				const id = `sim-${seed}-t${++nTeam}`;
				const c = makeTeam(rand, id, takenTeams);
				out.constructors.push(c);
				const donor = [...next.values()][Math.floor(rand() * next.size)] ?? { engineId: lastPlan.teams[0].engineId, tyreId: lastPlan.teams[0].tyreId };
				const car = -0.8 * carSd;
				next.set(id, { id, car, prev: car, engineId: donor.engineId, tyreId: donor.tyreId, seats: 2, since: Y, history: [], rel: 1 });
			}
		}
		teams = next;

		// 2. car development: momentum + regression to the mean, bigger shake-ups on new rules
		const list = [...teams.values()];
		const rho = reg ? 0.3 : 0.6;
		const noise = (reg ? 0.85 : 0.5) * carSd;
		const evolved = standardise(
			list.map((t) => (t.since === Y ? t.car : rho * t.car + 0.15 * (t.car - t.prev) + gaussian(rand) * noise)),
			carSd,
		);
		const blended = standardise(
			list.map((t, i) => {
				const realCar = real ? R.teams.get(t.id)?.get(Y)?.car : undefined;
				const v = realCar != null ? anchor * realCar + (1 - anchor) * evolved[i] : evolved[i];
				return v - (champions.has(t.id) && t.since !== Y ? BALLAST * carSd : 0);
			}),
			carSd,
		);
		list.forEach((t, i) => {
			t.prev = t.car;
			t.car = blended[i];
			t.history.push(t.car);
			t.rel = Math.min(1.5, Math.max(0.6, 0.6 * t.rel + 0.4 * (1 + gaussian(rand) * 0.25)));
		});

		// 3. winter: retirements, prospects, contracts, forced seats, the market
		for (const d of pool.values()) {
			if (d.retired) continue;
			const age = ageIn(d, Y);
			const o = mods.careers.get(d.id);
			if (age > MAX_AGE || (d.death && d.death <= last.date)) d.retired = true;
			else if (o?.retireAfter != null && Y > o.retireAfter) d.retired = true;
			else if (d.hired && !d.forced && !(o?.retireAfter != null && Y <= o.retireAfter) && Y > from) {
				const poor = d.lastRank > 15 && age > 28 ? 0.06 : 0;
				// multiple champions tend to call it a day sooner (Stewart, Prost, Rosberg)
				const sated = age >= 30 ? 0.03 * Math.max(0, d.titles.length - 2) : 0;
				if (rand() < hazard(age) + poor + sated + (d.team ? 0 : 0.3)) d.retired = true;
			}
			if (d.retired) d.team = null;
		}
		while (prospects.length && prospects[0].window![0] <= Y) {
			const d = prospects.shift()!;
			if (!pool.has(d.id)) pool.set(d.id, d);
		}
		for (const d of pool.values()) {
			if (d.window && !d.hired && Y > d.window[1]) d.retired = true;
			d.forced = false;
			if (d.team && (!teams.has(d.team) || d.until < Y || !eligible(d, Y, first, last))) d.team = null;
		}
		const value = (d: SimDriver) => {
			const champ = d.titles.includes(Y - 1) ? CHAMP_BONUS : d.titles.some((t) => t >= Y - 3) ? CHAMP_BONUS / 2 : 0;
			return skill(d, Y) + champ + (d.lastRank <= 3 ? 2 : 0);
		};
		const seated = (team: string) => [...pool.values()].filter((d) => d.team === team);
		const release = (team: string) => {
			const ds = seated(team).filter((d) => !d.forced);
			while (seated(team).length > teams.get(team)!.seats && ds.length) {
				ds.sort((a, b) => value(a) - value(b) || (a.id < b.id ? -1 : 1));
				ds.shift()!.team = null;
			}
		};
		for (const t of teams.values()) release(t.id);
		const sign = (d: SimDriver, team: string, years: number) => {
			if (!d.hired) d.debut = Y;
			d.team = team;
			d.until = Y + years - 1;
			d.hired = true;
		};
		const lookup = (id: string) => {
			let d = pool.get(id);
			if (!d) {
				d = realDriver(id, { hired: true }) ?? undefined;
				if (d) pool.set(id, d);
			}
			return d;
		};

		for (const m of mods.moves) {
			if (Y < m.fromYear || Y > m.toYear || !teams.has(m.constructorId)) continue;
			const d = lookup(m.driverId);
			if (!d) continue;
			if (d.retired && ageIn(d, Y) <= MAX_AGE && !(d.death && d.death <= last.date)) d.retired = false;
			if (!eligible(d, Y, first, last)) continue;
			d.forced = true;
			sign(d, m.constructorId, 1);
			release(m.constructorId);
		}
		for (const [id, o] of mods.careers) {
			if (o.debutYear !== Y) continue;
			const d = lookup(id);
			if (!d || d.team || !eligible(d, Y, first, last)) continue;
			const open = [...teams.values()].filter((t) => seated(t.id).length < t.seats).sort((a, b) => a.car - b.car);
			const t = open[0] ?? [...teams.values()].sort((a, b) => a.car - b.car)[0];
			d.forced = true;
			sign(d, t.id, 2);
			release(t.id);
		}

		const freeSeats = () => [...teams.values()].reduce((a, t) => a + Math.max(0, t.seats - seated(t.id).length), 0);
		const available = () => [...pool.values()].filter((d) => !d.team && eligible(d, Y, first, last));
		const need = freeSeats();
		const minRookies = real ? 0 : 3;
		let generated = 0;
		while (available().length < need + Math.max(3, Math.ceil(need * 0.6)) || generated < minRookies) {
			const id = `sim-${seed}-${++nDriver}`;
			const person = makeDriver(rand, id, Y, randInt(rand, 18, 22), takenNames);
			people.set(id, person);
			out.drivers.push(person);
			pool.set(id, {
				id,
				real: false,
				dob: person.dateOfBirth!,
				birthYear: Number(person.dateOfBirth!.slice(0, 4)),
				death: null,
				// generational talents happen, but not 14-title ones every few decades
				pot: rookieMean + Math.max(-2.5, Math.min(1.8, gaussian(rand))) * rookieSd,
				walk: 0,
				team: null,
				until: 0,
				lastTeam: null,
				retired: false,
				unseated: 0,
				window: [Y, Y + 3],
				hired: false,
				lastRank: 99,
				titles: [],
				forced: false,
				debut: null,
			});
			generated++;
		}

		// Stronger teams tend to pick first, but not strictly (budgets, timing, politics).
		// Scouting is imperfect, loyalty counts, and every driver–team pairing has a
		// lasting affinity (nationality, management, personalities), so the best
		// driver doesn't automatically end up in the best car.
		const order = [...teams.values()]
			.map((t) => ({ t, k: t.car + gaussian(rand) * ORDER_NOISE * carSd }))
			.sort((a, b) => b.k - a.k || (a.t.id < b.t.id ? -1 : 1))
			.map((x) => x.t);
		const affinity = (d: SimDriver, t: SimTeam) => {
			const c = people.get(d.id)?.nationality === (base.constructors.get(t.id)?.country ?? out.constructors.find((x) => x.id === t.id)?.country) ? 2 : 0;
			return c + (stream(seed, "affinity", d.id, t.id)() - 0.5) * 2 * AFFINITY;
		};
		for (const t of order) {
			while (seated(t.id).length < t.seats) {
				const cands = available();
				if (!cands.length) break;
				let best: SimDriver | null = null;
				let bestV = -Infinity;
				for (const d of cands) {
					const v = value(d) + affinity(d, t) + (d.lastTeam === t.id ? LOYALTY : 0) + gaussian(rand) * SCOUTING;
					if (v > bestV) (best = d), (bestV = v);
				}
				const age = ageIn(best!, Y);
				// stars sign longer deals, so they can be stuck in a car that falls back
				sign(best!, t.id, age >= 33 ? randInt(rand, 1, 2) : bestV > 15 ? randInt(rand, 2, 4) : randInt(rand, 1, 3));
			}
		}

		// seat swaps for this season
		for (const s of mods.swaps.get(Y) ?? []) {
			const a = lookup(s.driverA);
			const b = lookup(s.driverB);
			if (!a || !b) continue;
			if (a.team && b.team) [a.team, b.team] = [b.team, a.team];
			else if (a.team && eligible(b, Y, first, last)) (b.team = a.team), (b.until = a.until), (b.hired = true), (a.team = null);
			else if (b.team && eligible(a, Y, first, last)) (a.team = b.team), (a.until = b.until), (a.hired = true), (b.team = null);
		}

		// 4. the season
		const grid = [...pool.values()].filter((d) => d.team && teams.has(d.team));
		for (const d of pool.values()) {
			if (d.team) (d.unseated = 0), (d.lastTeam = d.team);
			else if (d.hired && !d.retired) {
				d.unseated++;
				if (d.unseated >= 2) d.retired = true;
			}
			if (!d.real && !d.retired) d.walk = 0.8 * d.walk + gaussian(rand) * 1.8;
		}
		const seatMap = new Map([...teams.values()].map((t) => [t.id, t.seats]));
		const eraDnf = real ? (R.seasons.get(Y)?.dnf ?? futureDnf) : futureDnf;
		const reasons = real ? (R.seasons.get(Y)?.reasons ?? futureReasons) : futureReasons;
		const skills = new Map(grid.map((d) => [d.id, skill(d, Y)]));
		const entries: SimEntry[] = grid.map((d) => {
			const t = teams.get(d.team!)!;
			const realDnf = real && R.teams.get(t.id)?.get(Y) ? dnfAt(R, t.id, Y) : null;
			return {
				driverId: d.id,
				constructorId: t.id,
				engineId: t.engineId,
				tyreId: t.tyreId,
				number: null,
				pace: t.car + mods.teamDelta(t.id, Y) + skills.get(d.id)!,
				dnf: realDnf ?? Math.min(0.6, eraDnf * t.rel),
			};
		});
		const seasonResults = new Map<number, Result[]>();
		const seasonSprints = new Map<number, Result[]>();
		const rules = eraRules(Y);
		const allRaces = [...calendar, ...(plan?.indy ?? [])].sort((a, b) => a.round - b.round);
		for (const race of calendar) {
			const ev = simulateEvent(stream(seed, "race", Y, race.round), race, entries, {
				chaos: p.chaos,
				reliability: p.reliability,
				qualify: true,
				maxStarters: real ? Math.max(plan!.starters, Math.min(entries.length, 20)) : undefined,
				reasons,
				sprint: race.hasSprint,
			});
			out.violations.push(...checkRace(race, ev.results, (id) => people.get(id), { seats: seatMap, ages: true }));
			out.results.set(race.id, ev.results);
			if (ev.qualifying) out.qualifying.set(race.id, ev.qualifying);
			if (ev.sprint) out.sprints.set(race.id, ev.sprint);
			if (!real) out.races.push(race);
			const double = rules.doublePointsFinalRace && race.id === last.id;
			seasonResults.set(race.id, scoreRace(ev.results, rules.system, { double }));
			if (ev.sprint) seasonSprints.set(race.id, scoreRace(ev.sprint, rules.system, { sprint: true }));
		}
		for (const race of plan?.indy ?? []) if (base.resultsByRace.has(race.id)) seasonResults.set(race.id, base.resultsByRace.get(race.id)!);
		out.years.push(Y);

		// 5. standings feed next winter's market
		const standings = computeStandings(
			{ resultsByRace: seasonResults, sprintByRace: seasonSprints, grandsPrix: base.grandsPrix },
			allRaces.filter((r) => seasonResults.has(r.id)),
			rules,
			0,
		);
		const champ = standings.drivers.find((r) => r.champion)?.id ?? null;
		for (const d of pool.values()) d.lastRank = 99;
		for (const r of standings.drivers) {
			const d = pool.get(r.id);
			if (d) d.lastRank = r.position ?? 99;
		}
		if (champ) pool.get(champ)?.titles.push(Y);
		champions.clear();
		const champTeam = champ ? pool.get(champ)?.team : null;
		if (champTeam) champions.add(champTeam);
		const cc = standings.constructors.find((r) => r.champion)?.id;
		if (cc) champions.add(cc);
		const sk = [...skills.values()];
		const mean = sk.reduce((a, b) => a + b, 0) / (sk.length || 1);
		const cars = list.map((t) => t.car);
		const cm = cars.reduce((a, b) => a + b, 0) / (cars.length || 1);
		out.seasons.push({
			year: Y,
			grid: grid.length,
			teams: teams.size,
			skillMean: mean,
			skillSd: Math.sqrt(sk.reduce((a, b) => a + (b - mean) ** 2, 0) / (sk.length || 1)),
			carSd: Math.sqrt(cars.reduce((a, b) => a + (b - cm) ** 2, 0) / (cars.length || 1)),
			champion: champ,
			championTeam: champ ? (pool.get(champ)?.team ?? null) : null,
			constructorChampion: standings.constructors.find((r) => r.champion)?.id ?? null,
			rookies: grid.filter((d) => d.debut === Y).length,
			generated,
		});
	}
	return out;
}

const simCache = new Map<string, HistoryOutput>();

/** Simulate a span of seasons. Memoised by inputs (the universe re-applies often while editing). */
/** Called as each season starts, for progress bars. */
export type Progress = (year: number, from: number, to: number) => void;

export function simulateHistory(base: Db, p: HistorySim, mods: Modifiers, onYear?: Progress): HistoryOutput {
	const key = JSON.stringify([base.meta.generatedAt, p.fromYear, p.toYear, p.seed, p.chaos, p.reliability, p.mode, p.anchor ?? null, mods.key]);
	const hit = simCache.get(key);
	if (hit) return hit;
	const out = p.mode === "dynamic" ? simulateDynamic(base, p, mods, onYear) : simulateRealGrids(base, p, mods, onYear);
	simCache.set(key, out);
	if (simCache.size > 6) simCache.delete(simCache.keys().next().value!);
	return out;
}
