// Performance model: separates driver from car using real results.
//
// Every start gives a performance score: where the car qualified and, if it
// finished, where it finished (weighted equally), as a rank score within that
// race's field, in "rating points" (about 1 point = 1% of the field; 0 = middle
// of the grid). Rank scores are stretched at the ends (see `rankScore`): a
// plain percentile can't go above "first", so a car that wins every race
// looked barely better than one that was regularly second, and the gap went
// into its lead driver's skill. Each score is modelled as
// car(team, season) + skill(driver, season).
//
//   - Teammates share a car, so their score gap is pure driver skill.
//   - Drivers carry their skill across seasons and teams (smoothed year to
//     year, adjusted by an ageing curve), which ties every car to every other.
//   - Each season is normalised (mean driver skill = 0), so ratings can't drift
//     or inflate over 75 years: they're always relative to that season's field.
//
// Solved by alternating weighted least squares with shrinkage. Always measured
// from real results, never from a simulated universe.

import { isStart, type Db } from "../f1/dataset.ts";

/** Skill change with age, in rating points (0 at the peak, 27–31). */
export function ageEffect(age: number | null): number {
	if (age == null) return 0;
	if (age < 27) return -0.15 * (27 - age) ** 2;
	if (age <= 31) return 0;
	if (age <= 34) return -0.3 * (age - 31);
	return -0.9 - 0.3 * (age - 34) ** 2;
}

/** Age on 1 July of a season, from an ISO date of birth. */
export function seasonAge(dob: string | null | undefined, year: number): number | null {
	if (!dob) return null;
	const [y, m, d] = dob.split("-").map(Number);
	return year + 0.5 - (y + (m - 1) / 12 + ((d || 1) - 1) / 365);
}

export type DriverSeason = { year: number; skill: number; starts: number; age: number | null; team: string };
export type TeamSeason = { year: number; car: number; entries: number; dnf: number };
export type SeasonStats = {
	year: number;
	driverSd: number;
	carSd: number;
	/** Share of starts that ended in retirement. */
	dnf: number;
	/** Median number of starters per race. */
	starters: number;
	reasons: string[];
};

export type Ratings = {
	drivers: Map<string, Map<number, DriverSeason>>;
	teams: Map<string, Map<number, TeamSeason>>;
	/** Age-free ability: a driver's skill at their peak age. */
	potential: Map<string, number>;
	seasons: Map<number, SeasonStats>;
	/** Distribution of potentials of established drivers (20+ starts), for generated rookies. */
	rookiePrior: { mean: number; sd: number };
	/** `team|year` -> drivers who ran that team's cars as customers. */
	privateers: Map<string, Set<string>>;
};

/** Suffix for a constructor's customer cars in `teams`. */
export const CUSTOMER = "~customer";

type Entry = { ds: number; ts: number; score: number; w: number };

const cache = new WeakMap<Db, Ratings>();

/**
 * How far rank scores lean towards normal scores (0 = plain percentiles,
 * 1 = normal scores, above 1 stretches the front and back of the field further).
 * Tuned so the cars of clearly dominant seasons rate as the best (ratings.test.ts)
 * while simulated history stays as varied as before (history.test.ts).
 */
const TAIL = 1.5;
const rankTables = new Map<number, Float64Array>();

/**
 * Score of finishing `pos` of `n` (1 = first), in 0..1 units: a blend of the
 * percentile and the normal score, rescaled to the percentiles' mean and spread
 * so the overall scale of ratings is unchanged.
 */
function rankScore(pos: number, n: number): number {
	let t = rankTables.get(n);
	if (!t) {
		t = new Float64Array(n);
		const lin = (i: number) => 1 - i / (n - 1);
		for (let i = 0; i < n; i++) t[i] = (1 - TAIL) * lin(i) + TAIL * 0.29 * invNorm((n - i - 0.5) / n);
		let m = 0;
		let v = 0;
		let vl = 0;
		for (let i = 0; i < n; i++) m += t[i] / n;
		for (let i = 0; i < n; i++) (v += (t[i] - m) ** 2), (vl += (lin(i) - 0.5) ** 2);
		const k = Math.sqrt(vl / v);
		for (let i = 0; i < n; i++) t[i] = 0.5 + (t[i] - m) * k;
		rankTables.set(n, t);
	}
	return t[Math.min(Math.max(pos, 1), n) - 1];
}

/** Inverse standard normal CDF (Acklam's approximation, |error| < 1.2e-9). */
function invNorm(p: number): number {
	const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
	const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
	const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
	const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
	const lo = 0.02425;
	if (p < lo) {
		const q = Math.sqrt(-2 * Math.log(p));
		return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
	}
	if (p > 1 - lo) return -invNorm(1 - p);
	const q = p - 0.5;
	const r = q * q;
	return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function deriveRatings(base: Db): Ratings {
	const hit = cache.get(base);
	if (hit) return hit;

	// --- collect entries ------------------------------------------------------
	const dsKey: string[] = []; // `${driver}|${year}`
	const dsIndex = new Map<string, number>();
	const tsKey: string[] = [];
	const tsIndex = new Map<string, number>();
	const entries: Entry[] = [];
	const dsTeams: Map<string, number>[] = [];
	const teamStarts = new Map<string, number>();
	const teamOuts = new Map<string, number>();
	const seasonStarts = new Map<number, number>();
	const seasonOuts = new Map<number, number>();
	const seasonReasons = new Map<number, string[]>();
	const seasonFields = new Map<number, number[]>();

	const idx = (map: Map<string, number>, keys: string[], key: string) => {
		let i = map.get(key);
		if (i == null) {
			i = keys.length;
			keys.push(key);
			map.set(key, i);
		}
		return i;
	};

	// Works cars vs customer cars: until the 1980s many privateers ran a
	// constructor's cars. A team's works drivers are its regulars (as many as it
	// typically ran per race); everyone else in its cars gets a separate
	// "customer" car, so privateers don't drag the works rating down (or make
	// their drivers look worse than they were).
	const privateers = new Map<string, Set<string>>();
	{
		const perRace = new Map<string, number[]>();
		const perDriver = new Map<string, Map<string, number>>();
		// races where a driver was in a team's cars alongside more cars than it usually ran
		const crowded = new Map<string, Map<string, number[]>>();
		for (const race of base.races) {
			const all = base.resultsByRace.get(race.id);
			if (!all) continue;
			const byTeam = new Map<string, Set<string>>();
			for (const r of all) (byTeam.get(r.constructorId) ?? byTeam.set(r.constructorId, new Set()).get(r.constructorId)!).add(r.driverId);
			for (const [t, ds] of byTeam) {
				const k = `${t}|${race.year}`;
				(perRace.get(k) ?? perRace.set(k, []).get(k)!).push(ds.size);
				const counts = perDriver.get(k) ?? perDriver.set(k, new Map()).get(k)!;
				const sizes = crowded.get(k) ?? crowded.set(k, new Map()).get(k)!;
				for (const d of ds) {
					counts.set(d, (counts.get(d) ?? 0) + 1);
					(sizes.get(d) ?? sizes.set(d, []).get(d)!).push(ds.size);
				}
			}
		}
		for (const [k, sizes] of perRace) {
			const seats = Math.min(3, Math.max(1, Math.round([...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)])));
			const ranked = [...perDriver.get(k)!.entries()].sort((a, b) => b[1] - a[1]);
			if (ranked.length <= seats) continue;
			// regulars: the top `seats`, plus anyone who did nearly as many races
			const cut = ranked[seats - 1][1];
			const extra = ranked.slice(seats).filter(([, n]) => n >= cut * 0.8 && n >= 3);
			const works = new Set([...ranked.slice(0, seats), ...extra.slice(0, 1)].map(([d]) => d));
			// a stand-in for an injured regular drove the works car; a customer ran an extra car
			const extraCar = (d: string) => {
				const s = crowded.get(k)!.get(d)!;
				return s.filter((n) => n > seats).length * 2 > s.length;
			};
			const list = ranked.filter(([d]) => !works.has(d) && extraCar(d)).map(([d]) => d);
			if (list.length) privateers.set(k, new Set(list));
		}
	}
	const carKey = (team: string, driver: string, year: number) =>
		privateers.get(`${team}|${year}`)?.has(driver) ? `${team}${CUSTOMER}|${year}` : `${team}|${year}`;

	for (const race of base.races) {
		const all = base.resultsByRace.get(race.id);
		if (!all) continue;
		const seen = new Set<string>();
		const starters = all.filter((r) => isStart(r) && !seen.has(r.driverId) && (seen.add(r.driverId), true));
		const field = starters.length;
		if (field < 2) continue;
		(seasonFields.get(race.year) ?? seasonFields.set(race.year, []).get(race.year)!).push(field);
		const qField = starters.filter((r) => (r.qualifying ?? r.grid) != null).length;
		const classified = starters.filter((r) => r.position != null).length;
		for (const r of starters) {
			const q = r.qualifying ?? r.grid;
			// quali and race count equally: race results show who had the car to win
			const pq = q != null && qField > 1 ? rankScore(q, qField) : null;
			const pf = r.position != null && classified > 1 ? rankScore(r.position, Math.max(field, classified)) : null;
			let score: number;
			let w: number;
			if (pq != null && pf != null) (score = 0.5 * pq + 0.5 * pf), (w = 1);
			else if (pq != null) (score = pq), (w = 0.8);
			else if (pf != null) (score = pf), (w = 0.5);
			else continue;
			const ds = idx(dsIndex, dsKey, `${r.driverId}|${race.year}`);
			const ts = idx(tsIndex, tsKey, carKey(r.constructorId, r.driverId, race.year));
			entries.push({ ds, ts, score: score * 100 - 50, w });
			(dsTeams[ds] ??= new Map()).set(r.constructorId, (dsTeams[ds].get(r.constructorId) ?? 0) + 1);
		}
		for (const r of all.filter(isStart)) {
			const k = carKey(r.constructorId, r.driverId, race.year);
			teamStarts.set(k, (teamStarts.get(k) ?? 0) + 1);
			seasonStarts.set(race.year, (seasonStarts.get(race.year) ?? 0) + 1);
			if (r.position == null) {
				teamOuts.set(k, (teamOuts.get(k) ?? 0) + 1);
				seasonOuts.set(race.year, (seasonOuts.get(race.year) ?? 0) + 1);
				if (r.reasonRetired && r.reasonRetired !== "Disqualified")
					(seasonReasons.get(race.year) ?? seasonReasons.set(race.year, []).get(race.year)!).push(r.reasonRetired);
			}
		}
	}

	const nD = dsKey.length;
	const nT = tsKey.length;
	const dsDriver = dsKey.map((k) => k.slice(0, k.lastIndexOf("|")));
	const dsYear = dsKey.map((k) => Number(k.slice(k.lastIndexOf("|") + 1)));
	const tsYear = tsKey.map((k) => Number(k.slice(k.lastIndexOf("|") + 1)));
	const dsAge = dsKey.map((_, i) => seasonAge(base.drivers.get(dsDriver[i])?.dateOfBirth, dsYear[i]));
	const dsAgeFx = dsAge.map(ageEffect);

	// per-driver list of their seasons, for smoothing
	const careers = new Map<string, number[]>();
	for (let i = 0; i < nD; i++) (careers.get(dsDriver[i]) ?? careers.set(dsDriver[i], []).get(dsDriver[i])!).push(i);

	const C = new Float64Array(nT);
	const S = new Float64Array(nD);
	const W = new Float64Array(nD);
	const R = new Float64Array(nD);
	for (const e of entries) W[e.ds] += e.w;

	// initial cars: team mean score
	{
		const sum = new Float64Array(nT);
		const wt = new Float64Array(nT);
		for (const e of entries) (sum[e.ts] += e.w * e.score), (wt[e.ts] += e.w);
		for (let t = 0; t < nT; t++) C[t] = sum[t] / (wt[t] + 1);
	}

	// pseudo-entries pulling a car towards the field average (light: a dominant car is a real thing, not noise to shrink away)
	const K_CAR = 3;
	const K_DRIVER = 6; // pseudo-entries pulling a driver towards their own career level
	const KERNEL = [1, 0.45, 0.15];
	const potentials = new Map<string, number>();
	const seasonsOf = new Map<number, number[]>();
	for (let i = 0; i < nD; i++) (seasonsOf.get(dsYear[i]) ?? seasonsOf.set(dsYear[i], []).get(dsYear[i])!).push(i);
	const teamsOf = new Map<number, number[]>();
	for (let t = 0; t < nT; t++) (teamsOf.get(tsYear[t]) ?? teamsOf.set(tsYear[t], []).get(tsYear[t])!).push(t);

	for (let it = 0; it < 40; it++) {
		// cars given drivers
		const sum = new Float64Array(nT);
		const wt = new Float64Array(nT);
		for (const e of entries) (sum[e.ts] += e.w * (e.score - S[e.ds])), (wt[e.ts] += e.w);
		for (let t = 0; t < nT; t++) C[t] = sum[t] / (wt[t] + K_CAR);

		// drivers given cars: raw residual sums per driver-season
		R.fill(0);
		for (const e of entries) R[e.ds] += e.w * (e.score - C[e.ts]);

		// career level (age-free), shrunk towards a slightly-below-average newcomer
		for (const [d, list] of careers) {
			let num = 0;
			let den = 3;
			let prior = -2;
			for (const i of list) (num += R[i] - W[i] * dsAgeFx[i]), (den += W[i]);
			potentials.set(d, (num + prior * 3) / den);
		}

		// smooth each season with its neighbours, adjusting for age
		const next = new Float64Array(nD);
		for (const [d, list] of careers) {
			const pot = potentials.get(d)!;
			for (const i of list) {
				let num = K_DRIVER * (pot + dsAgeFx[i]);
				let den = K_DRIVER;
				for (const j of list) {
					const k = KERNEL[Math.abs(dsYear[i] - dsYear[j])];
					if (!k) continue;
					num += k * (R[j] + W[j] * (dsAgeFx[i] - dsAgeFx[j]));
					den += k * W[j];
				}
				next[i] = num / den;
			}
		}
		S.set(next);

		// normalise each season: mean driver skill 0, the level moves into the cars
		for (const [y, list] of seasonsOf) {
			let m = 0;
			let w = 0;
			for (const i of list) (m += W[i] * S[i]), (w += W[i]);
			m /= w || 1;
			for (const i of list) S[i] -= m;
			for (const t of teamsOf.get(y) ?? []) C[t] += m;
		}
	}

	// --- package --------------------------------------------------------------
	const drivers: Ratings["drivers"] = new Map();
	for (let i = 0; i < nD; i++) {
		const d = dsDriver[i];
		const team = [...(dsTeams[i] ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
		(drivers.get(d) ?? drivers.set(d, new Map()).get(d)!).set(dsYear[i], {
			year: dsYear[i],
			skill: S[i],
			starts: Math.round(W[i]),
			age: dsAge[i],
			team,
		});
	}
	const teamEntryCount = new Float64Array(nT);
	for (const e of entries) teamEntryCount[e.ts] += 1;
	const teams: Ratings["teams"] = new Map();
	for (let t = 0; t < nT; t++) {
		const key = tsKey[t];
		const id = key.slice(0, key.lastIndexOf("|"));
		const y = tsYear[t];
		const era = (seasonOuts.get(y) ?? 0) / (seasonStarts.get(y) || 1);
		const dnf = ((teamOuts.get(key) ?? 0) + era * 6) / ((teamStarts.get(key) ?? 0) + 6);
		(teams.get(id) ?? teams.set(id, new Map()).get(id)!).set(y, { year: y, car: C[t], entries: teamEntryCount[t], dnf });
	}
	const pot = new Map<string, number>();
	for (const [d, seasons] of drivers) {
		let num = 0;
		let den = 0;
		for (const s of seasons.values()) (num += s.starts * (s.skill - ageEffect(s.age))), (den += s.starts);
		pot.set(d, den ? num / den : -2);
	}
	const seasons: Ratings["seasons"] = new Map();
	const median = (xs: number[]) => {
		const s = [...xs].sort((a, b) => a - b);
		return s.length ? s[Math.floor(s.length / 2)] : 0;
	};
	for (const [y, list] of seasonsOf) {
		const sd = (vals: number[], ws: number[]) => {
			const tw = ws.reduce((a, b) => a + b, 0) || 1;
			const m = vals.reduce((a, v, i) => a + v * ws[i], 0) / tw;
			return Math.sqrt(vals.reduce((a, v, i) => a + ws[i] * (v - m) ** 2, 0) / tw);
		};
		const works = (teamsOf.get(y) ?? []).filter((t) => !tsKey[t].includes(CUSTOMER));
		seasons.set(y, {
			year: y,
			driverSd: sd(list.map((i) => S[i]), list.map((i) => W[i])),
			carSd: sd(works.map((t) => C[t]), works.map((t) => teamEntryCount[t])),
			dnf: (seasonOuts.get(y) ?? 0) / (seasonStarts.get(y) || 1),
			starters: median(seasonFields.get(y) ?? [20]),
			reasons: seasonReasons.get(y) ?? ["Engine", "Gearbox", "Accident", "Hydraulics"],
		});
	}
	const established = [...drivers].filter(([, s]) => [...s.values()].reduce((a, x) => a + x.starts, 0) >= 20).map(([d]) => pot.get(d)!);
	const mean = established.reduce((a, b) => a + b, 0) / (established.length || 1);
	const sdv = Math.sqrt(established.reduce((a, b) => a + (b - mean) ** 2, 0) / (established.length || 1));

	const out: Ratings = { drivers, teams, potential: pot, seasons, rookiePrior: { mean, sd: sdv }, privateers };
	cache.set(base, out);
	return out;
}

/** A driver's skill in a season: fitted if they raced, otherwise projected from their nearest season by age. */
export function skillAt(r: Ratings, base: Db, driverId: string, year: number): number {
	const seasons = r.drivers.get(driverId);
	const fitted = seasons?.get(year);
	if (fitted) return fitted.skill;
	const age = seasonAge(base.drivers.get(driverId)?.dateOfBirth, year);
	if (seasons?.size) {
		let best: DriverSeason | null = null;
		for (const s of seasons.values()) if (!best || Math.abs(s.year - year) < Math.abs(best.year - year)) best = s;
		return best!.skill + ageEffect(age) - ageEffect(best!.age);
	}
	return (r.potential.get(driverId) ?? r.rookiePrior.mean - r.rookiePrior.sd) + ageEffect(age);
}

/** A car's pace in a season; teams with no data sit in the lower midfield. */
export function carAt(r: Ratings, teamId: string, year: number): number {
	const t = r.teams.get(teamId);
	const hit = t?.get(year);
	if (hit) return hit.car;
	return -(r.seasons.get(year)?.carSd ?? 15) * 0.5;
}

/** The car a driver actually had: the works car, or the team's customer car for privateers. */
export function carFor(r: Ratings, teamId: string, driverId: string, year: number): number {
	if (r.privateers.get(`${teamId}|${year}`)?.has(driverId)) {
		const c = r.teams.get(teamId + CUSTOMER)?.get(year);
		if (c) return c.car;
	}
	return carAt(r, teamId, year);
}

export function dnfAt(r: Ratings, teamId: string, year: number): number {
	return r.teams.get(teamId)?.get(year)?.dnf ?? r.seasons.get(year)?.dnf ?? 0.15;
}

/** Rating curve for the Lab: a driver's fitted skill per season. */
export function driverCurve(r: Ratings, driverId: string): DriverSeason[] {
	return [...(r.drivers.get(driverId)?.values() ?? [])].sort((a, b) => a.year - b.year);
}

export function teamCurve(r: Ratings, teamId: string): TeamSeason[] {
	return [...(r.teams.get(teamId)?.values() ?? [])].sort((a, b) => a.year - b.year);
}

/**
 * Every rating curve the Lab charts, as compact plain data (rounded to 0.1,
 * customer cars left out). Built in the Web Worker, so the page never pays for
 * `deriveRatings` itself: ~100 KB to post (~1–3 ms to receive) instead of ~150 ms of main-thread work.
 */
export type RatingCurves = {
	/** driver -> [year, skill, main team][] by year */
	drivers: Record<string, [number, number, string][]>;
	/** constructor -> [year, car][] by year */
	teams: Record<string, [number, number][]>;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function ratingCurves(r: Ratings): RatingCurves {
	const drivers: RatingCurves["drivers"] = {};
	for (const id of r.drivers.keys()) drivers[id] = driverCurve(r, id).map((s) => [s.year, r1(s.skill), s.team]);
	const teams: RatingCurves["teams"] = {};
	for (const id of r.teams.keys()) if (!id.endsWith(CUSTOMER)) teams[id] = teamCurve(r, id).map((s) => [s.year, r1(s.car)]);
	return { drivers, teams };
}
