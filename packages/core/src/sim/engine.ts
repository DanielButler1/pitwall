// One race weekend: optional qualifying, the race, and a sprint if the event has
// one. Pace is in rating points (car + driver, see ratings.ts); everything
// random comes from the stream passed in, so a weekend is a pure function of
// its inputs.

import type { QualifyingRow, Race, Result } from "../f1/dataset.ts";
import { gaussian, type Rand } from "./random.ts";

export type SimEntry = {
	driverId: string;
	constructorId: string;
	engineId: string;
	tyreId: string | null;
	number: string | null;
	/** car + driver (+ any universe offsets), rating points. */
	pace: number;
	/** Chance of retiring from the race, before scaling by the reliability setting. */
	dnf: number;
	/** Real grid slot, used when qualifying isn't simulated. */
	grid?: number | null;
	/** Real qualifying position, kept alongside a real grid. */
	qualifying?: number | null;
};

export type EventOptions = {
	chaos: number;
	reliability: number;
	/** Simulate qualifying (otherwise use each entry's real grid). */
	qualify: boolean;
	/** Cars beyond this many fail to qualify. */
	maxStarters?: number;
	reasons: string[];
	sprint: boolean;
	/** Keep this winner's time (when re-running a real race). */
	winnerTime?: string | null;
};

export type EventResult = { results: Result[]; qualifying: QualifyingRow[] | null; sprint: Result[] | null };

/** Race-day spread and the weight of track position. Calibrated so pole converts ~40% and the best car wins most, not all. */
const RACE_NOISE = 10;
const QUALI_NOISE = 4.5;
const GRID_WEIGHT = 0.22;

function raceTime(race: Race): string {
	// era-typical average speeds, enough to make a plausible winning time
	const kmh = Math.min(215, 145 + (race.year - 1950) * 1.0);
	const secs = ((race.distance || 300) / kmh) * 3600;
	const h = Math.floor(secs / 3600);
	const m = Math.floor((secs % 3600) / 60);
	const s = secs % 60;
	return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

type Runner = { e: SimEntry; grid: number; perf: number; retires: boolean; lapsDone: number };

function runRace(rand: Rand, race: Race, entries: (SimEntry & { gridPos: number })[], opts: EventOptions, laps: number, sprint: boolean): Result[] {
	const n = entries.length;
	const dnfScale = opts.reliability * (0.6 + 0.4 * opts.chaos) * (sprint ? 0.3 : 1);
	const runners: Runner[] = entries.map((e) => {
		const gridAdv = n > 1 ? 50 - (100 * (e.gridPos - 1)) / (n - 1) : 0;
		const perf = e.pace + GRID_WEIGHT * gridAdv + gaussian(rand) * RACE_NOISE * opts.chaos * (sprint ? 0.8 : 1);
		const retires = rand() < Math.min(0.9, e.dnf * dnfScale);
		return { e, grid: e.gridPos, perf, retires, lapsDone: retires ? Math.floor(rand() * laps) : laps };
	});
	const finishers = runners.filter((s) => !s.retires).sort((a, b) => b.perf - a.perf || a.grid - b.grid);
	const retirees = runners.filter((s) => s.retires).sort((a, b) => b.lapsDone - a.lapsDone || a.grid - b.grid);

	const flPool = finishers.slice(0, Math.min(6, finishers.length));
	const flDriver = !sprint && flPool.length ? flPool[Math.floor(rand() * rand() * flPool.length)].e.driverId : null;

	let lapsBehind = 0;
	let gap = 0;
	const base = (s: Runner): Result => ({
		raceId: race.id,
		position: null,
		positionText: "",
		driverId: s.e.driverId,
		constructorId: s.e.constructorId,
		engineId: s.e.engineId,
		number: s.e.number,
		grid: s.grid,
		laps: s.lapsDone,
		time: null,
		gap: null,
		reasonRetired: null,
		points: 0,
		fastestLap: false,
		pole: !sprint && s.grid === 1,
		sharedCar: false,
		qualifying: s.e.qualifying ?? s.grid,
		tyreId: s.e.tyreId,
		grandSlam: false,
	});
	const out: Result[] = finishers.map((s, i) => {
		if (i > 0) {
			gap += (1 + rand() * 9 * (1 + Math.max(0, finishers[i - 1].perf - s.perf) / 10)) * (sprint ? 0.4 : 1);
			if (race.year < 1990 && gap > 90 && rand() < 0.5) lapsBehind = Math.floor(gap / 90);
		}
		const lapped = lapsBehind > 0;
		const fastestLap = s.e.driverId === flDriver;
		return {
			...base(s),
			position: i + 1,
			positionText: String(i + 1),
			laps: lapped ? laps - lapsBehind : laps,
			time: i === 0 ? (sprint ? null : (opts.winnerTime ?? raceTime(race))) : null,
			gap: i === 0 ? null : lapped ? `+${lapsBehind} lap${lapsBehind > 1 ? "s" : ""}` : `+${gap.toFixed(3)}`,
			fastestLap,
			grandSlam: i === 0 && s.grid === 1 && fastestLap && !sprint && rand() < 0.5,
		};
	});
	for (const s of retirees) {
		out.push({ ...base(s), positionText: "DNF", reasonRetired: opts.reasons[Math.floor(rand() * opts.reasons.length)] ?? "Retired" });
	}
	return out;
}

/** Simulate a weekend. Points are left at 0: the universe re-scores with the season's rules. */
export function simulateEvent(rand: Rand, race: Race, entries: SimEntry[], opts: EventOptions): EventResult {
	let qualifying: QualifyingRow[] | null = null;
	let order: SimEntry[];
	let dnq: SimEntry[] = [];
	if (opts.qualify) {
		const q = entries
			.map((e) => ({ e, score: e.pace + gaussian(rand) * QUALI_NOISE * (0.5 + 0.5 * opts.chaos) }))
			.sort((a, b) => b.score - a.score || (a.e.driverId < b.e.driverId ? -1 : 1));
		order = q.map((x) => x.e);
		qualifying = order.map((e, i) => ({
			raceId: race.id,
			position: i + 1,
			positionText: String(i + 1),
			driverId: e.driverId,
			constructorId: e.constructorId,
			time: null,
			q1: null,
			q2: null,
			q3: null,
		}));
		if (opts.maxStarters && order.length > opts.maxStarters) {
			dnq = order.slice(opts.maxStarters);
			order = order.slice(0, opts.maxStarters);
		}
		order = order.map((e, i) => ({ ...e, qualifying: i + 1 }));
	} else {
		order = [...entries].sort((a, b) => (a.grid ?? 999) - (b.grid ?? 999));
	}
	const gridded = order.map((e, i) => ({ ...e, gridPos: opts.qualify ? i + 1 : (e.grid ?? i + 1) }));
	// real grids can have gaps (pit-lane starts): rank them densely for track position
	const dense = gridded.map((e, i) => ({ ...e, gridPos: opts.qualify ? e.gridPos : i + 1, realGrid: e.gridPos }));

	let sprint: Result[] | null = null;
	if (opts.sprint) sprint = runRace(rand, race, dense, opts, Math.max(1, Math.round(race.laps / 3)), true);

	const results = runRace(rand, race, dense, opts, race.laps, false).map((r) => {
		const real = dense.find((d) => d.driverId === r.driverId)!;
		return opts.qualify ? r : { ...r, grid: real.realGrid, pole: real.realGrid === 1 };
	});
	for (const e of dnq) {
		results.push({
			raceId: race.id,
			position: null,
			positionText: "DNQ",
			driverId: e.driverId,
			constructorId: e.constructorId,
			engineId: e.engineId,
			number: e.number,
			grid: null,
			laps: null,
			time: null,
			gap: null,
			reasonRetired: null,
			points: 0,
			fastestLap: false,
			pole: false,
			sharedCar: false,
			qualifying: qualifying!.find((q) => q.driverId === e.driverId)!.position,
			tyreId: e.tyreId,
			grandSlam: false,
		});
	}
	return { results, qualifying, sprint };
}
