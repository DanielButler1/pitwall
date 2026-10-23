// Lap-by-lap data from Jolpica (the Ergast successor), supplementing F1DB.
//
// The main dataset carries only who led each lap (run-length encoded). Lap
// charts and pit stops live in one file per race (data/laps/<raceId>.json on
// the server, /data/laps/<raceId>.json in the browser), see RaceLapFile.
//
// Universe safety: lap data describes the real race. A universe that changed
// or simulated a race's classification no longer matches it, so every accessor
// here checks the race's results against the fingerprint of the real ones and
// treats changed races as having no lap data.

import { resultsSig, type Db, type JolpicaMeta, type LeadSpan, type SprintFastestLap } from "./dataset.ts";

export type { LeadSpan } from "./dataset.ts";

/** First season with lap-by-lap race data (neither F1DB nor Jolpica has earlier lap leaders). */
export const LAPS_FROM = 1996;

/** Per-race file written by scripts/build-data.mjs. Arrays are indexed by lap - 1. */
export type RaceLapFile = {
	raceId: number;
	/** Drivers in finishing order. */
	drivers?: string[];
	/** Position at the end of each lap, per driver (null where unknown). */
	positions?: (number | null)[][];
	/** Lap time in ms, per driver. */
	times?: (number | null)[][];
	/** [driverId, stop number, lap, duration ms] */
	pitStops?: [string, number, number | null, number | null][];
	sprint?: { drivers: string[]; positions: (number | null)[][]; times: (number | null)[][] };
};

const memo = new WeakMap<Db, Map<string, unknown>>();
function cached<T>(db: Db, key: string, compute: () => T): T {
	let m = memo.get(db);
	if (!m) memo.set(db, (m = new Map()));
	if (!m.has(key)) m.set(key, compute());
	return m.get(key) as T;
}

type Which = "race" | "sprint";

/** Races whose lap data still matches this Db's results. */
function validLeaders(db: Db, which: Which): Map<number, LeadSpan[]> {
	return cached(db, `valid:${which}`, () => {
		const leaders = which === "race" ? db.lapLeaders : db.sprintLapLeaders;
		const sig = which === "race" ? db.lapSig : db.sprintLapSig;
		const byRace = which === "race" ? db.resultsByRace : db.sprintByRace;
		const out = new Map<number, LeadSpan[]>();
		for (const [raceId, spans] of leaders ?? []) {
			if (!db.raceById.has(raceId)) continue;
			if (sig?.get(raceId) === resultsSig(byRace.get(raceId))) out.set(raceId, spans);
		}
		return out;
	});
}

/** Who led each lap of a race, or null when there's no (matching) lap data. */
export function lapLeaders(db: Db, raceId: number): LeadSpan[] | null {
	return validLeaders(db, "race").get(raceId) ?? null;
}

export function sprintLapLeaders(db: Db, raceId: number): LeadSpan[] | null {
	return validLeaders(db, "sprint").get(raceId) ?? null;
}

/** Fastest lap of a sprint (Jolpica), or null when unknown or the universe changed the sprint. */
export function sprintFastestLap(db: Db, raceId: number): SprintFastestLap | null {
	const fl = db.sprintFastestLaps?.get(raceId);
	if (!fl) return null;
	return db.sprintFastestSig?.get(raceId) === resultsSig(db.sprintByRace.get(raceId)) ? fl : null;
}

/** All races with usable lap-leader data in this Db. */
export function lapLedRaces(db: Db, which: Which = "race"): Map<number, LeadSpan[]> {
	return validLeaders(db, which);
}

/** True when the race has lap data and the Db's results still match it (lap chart, pit stops). */
export function hasLapData(db: Db, raceId: number): boolean {
	return lapLeaders(db, raceId) != null;
}

export type LapCoverage = {
	meta: JolpicaMeta | null;
	from: number;
	to: number;
	/** Races with lap data that this Db (a universe) changed, so lap-based figures leave them out. */
	excluded: number;
	sprintFrom: number | null;
	sprintExcluded: number;
	dumpDate: string | null;
};

export function lapCoverage(db: Db): LapCoverage {
	return cached(db, "coverage", () => {
		const meta = db.meta.jolpica ?? null;
		const count = (m: Map<number, unknown> | undefined) => [...(m?.keys() ?? [])].filter((id) => db.raceById.has(id)).length;
		return {
			meta,
			from: meta?.lapsFrom ?? LAPS_FROM,
			to: meta?.lapsTo ?? LAPS_FROM,
			excluded: count(db.lapLeaders) - validLeaders(db, "race").size,
			sprintFrom: meta?.sprintLapsFrom ?? null,
			sprintExcluded: count(db.sprintLapLeaders) - validLeaders(db, "sprint").size,
			dumpDate: meta?.dumpDate ?? null,
		};
	});
}

/** Laps led per driver in one race. */
export function lapsLedIn(spans: LeadSpan[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const [d, a, b] of spans) out.set(d, (out.get(d) ?? 0) + b - a + 1);
	return out;
}

/** Last lap with a known leader. */
export const lastLedLap = (spans: LeadSpan[]) => (spans.length ? spans[spans.length - 1][2] : 0);

/** Total laps led by a driver over every race with (valid) lap data. */
export function driverLapsLed(db: Db, driverId: string): { laps: number; races: number } {
	const all = cached(db, "driverLapsLed", () => {
		const m = new Map<string, { laps: number; races: number }>();
		for (const spans of validLeaders(db, "race").values())
			for (const [d, n] of lapsLedIn(spans)) {
				const x = m.get(d) ?? { laps: 0, races: 0 };
				x.laps += n;
				x.races++;
				m.set(d, x);
			}
		return m;
	});
	return all.get(driverId) ?? { laps: 0, races: 0 };
}

/** "1:23.456" from milliseconds. */
export function lapTimeText(ms: number | null | undefined): string {
	if (ms == null) return "";
	const m = Math.floor(ms / 60000);
	const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
	return m ? `${m}:${s}` : `${(ms / 1000).toFixed(3)}`;
}
