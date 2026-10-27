// Shape of data/f1.json (see scripts/build-data.mjs) and the hydrated, indexed
// model every page is computed from. The same code runs on the server for the
// real history and in the browser for alternate universes.

import type { EraRules } from "./points.ts";

type N<T> = T | null;

export type RawDataset = {
	meta: {
		source: string;
		release: { tag: string; publishedAt: string } | null;
		generatedAt: string;
		firstYear: number;
		lastCompletedYear: number;
		/** Jolpica supplement (lap data, pit stops); absent when the dataset was built without it. */
		jolpica?: JolpicaMeta | null;
	};
	countries: [string, string, string, N<string>][];
	drivers: [string, string, string, string, N<string>, N<string>, N<string>, N<string>, string, N<string>, "M" | "F"][];
	families: [string, string, string][];
	constructors: [string, string, N<string>, string][];
	engines: [string, string, string][];
	tyres: [string, string, string][];
	circuits: [string, string, string, string, string, number, number, string, string, number, number][];
	grandsPrix: [string, string, string, string, string][];
	races: [number, number, number, string, string, string, string, number, number, number, 0 | 1, string][];
	results: RawResult[];
	sprintResults: RawResult[];
	qualifying: [number, N<number>, string, string, string, N<string>, N<string>, N<string>, N<string>][];
	fastestLaps: [number, string, N<number>, N<string>][];
	driverStandings: [number, N<number>, string, string, number, 0 | 1][];
	constructorStandings: [number, N<number>, string, string, string, number, 0 | 1][];
	upcomingEntrants: [number, string, string, string][];
	/** F1DB test drivers who never entered a race: [driverId, practice weekends, firstYear, lastYear, constructorIds]. */
	thirdDrivers?: [string, number, number, number, string[]][];
	/** Jolpica: race lap leaders, run-length encoded. */
	lapLeaders?: [number, LeadSpan[]][];
	sprintLapLeaders?: [number, LeadSpan[]][];
	/** Jolpica: fastest lap of each sprint: [raceId, driverId, lap, timeMs]. */
	sprintFastestLaps?: [number, string, N<number>, number][];
	/** Hand-entered race notes (data/race-notes): [raceId, weather, neutralisations, has tyres (in the race file)]. */
	raceNotes?: [number, N<Weather>, Neutralisation[], 0 | 1][];
};

export type Weather = "dry" | "wet" | "mixed";
/** A safety car (SC), virtual safety car (VSC) or red flag (RF) over laps fromLap..toLap (a red flag: its lap twice). */
export type Neutralisation = ["SC" | "VSC" | "RF", number, number];
export type RaceNote = { raceId: number; weather: Weather | null; neutralised: Neutralisation[]; tyres: boolean };

export type JolpicaMeta = {
	source: string;
	/** Date of the Jolpica database dump (YYYY-MM-DD). */
	dumpDate: string | null;
	/** Seasons with lap-by-lap race data. */
	lapsFrom: number;
	lapsTo: number;
	/** Latest race with lap data (later races aren't in the delayed dump yet). */
	lastLapRaceId: number | null;
	sprintLapsFrom: number | null;
	pitStopsFrom: number | null;
	sprintFastestLapsFrom?: number | null;
};

export type SprintFastestLap = { raceId: number; driverId: string; lap: number | null; ms: number };

/** [driverId, fromLap, toLap]: a driver led laps fromLap..toLap (inclusive). */
export type LeadSpan = [string, number, number];

type RawResult = [
	number, N<number>, string, string, string, string, N<string>, N<number>, N<number>,
	N<string>, N<string>, N<string>, N<number>, 0 | 1, 0 | 1, 0 | 1, N<number>, N<string>, 0 | 1,
];

export type Country = { id: string; name: string; alpha2: string; demonym: string | null };
export type Driver = {
	id: string;
	name: string;
	firstName: string;
	lastName: string;
	abbreviation: string | null;
	number: string | null;
	dateOfBirth: string | null;
	dateOfDeath: string | null;
	nationality: string;
	placeOfBirth: string | null;
	gender: "M" | "F";
};
export type Engine = { id: string; name: string; country: string };
export type Tyre = { id: string; name: string; country: string };
/** `driverId` is the `type` (e.g. CHILD, SIBLING) of `relatedId`. */
export type FamilyLink = { driverId: string; relatedId: string; type: string };
export type Constructor = { id: string; name: string; fullName: string | null; country: string };
export type Circuit = {
	id: string;
	name: string;
	fullName: string;
	place: string;
	country: string;
	lat: number;
	lng: number;
	type: string;
	direction: string;
	length: number;
	turns: number;
};
export type GrandPrix = { id: string; name: string; fullName: string; shortName: string; country: string };
export type Race = {
	id: number;
	year: number;
	round: number;
	date: string;
	grandPrixId: string;
	circuitId: string;
	officialName: string;
	laps: number;
	distance: number;
	courseLength: number;
	hasSprint: boolean;
	qualifyingFormat: string;
};
export type Result = {
	raceId: number;
	position: number | null;
	positionText: string;
	driverId: string;
	constructorId: string;
	engineId: string;
	number: string | null;
	grid: number | null;
	laps: number | null;
	time: string | null;
	gap: string | null;
	reasonRetired: string | null;
	points: number;
	fastestLap: boolean;
	pole: boolean;
	sharedCar: boolean;
	qualifying: number | null;
	tyreId: string | null;
	/** Pole, win, fastest lap and led every lap (from F1DB). */
	grandSlam: boolean;
};
export type QualifyingRow = {
	raceId: number;
	position: number | null;
	positionText: string;
	driverId: string;
	constructorId: string;
	time: string | null;
	q1: string | null;
	q2: string | null;
	q3: string | null;
};
export type FastestLap = { raceId: number; driverId: string; lap: number | null; time: string | null };
export type StandingRow = {
	position: number | null;
	positionText: string;
	id: string;
	points: number;
	champion: boolean;
	engineId?: string;
};
export type Entrant = { year: number; constructorId: string; engineId: string; driverId: string };

/** The plain data a universe can modify. Indexes are derived from it by `indexData`. */
export type F1Data = {
	meta: RawDataset["meta"];
	countries: Map<string, Country>;
	drivers: Map<string, Driver>;
	constructors: Map<string, Constructor>;
	engines: Map<string, Engine>;
	tyres: Map<string, Tyre>;
	families: FamilyLink[];
	circuits: Map<string, Circuit>;
	grandsPrix: Map<string, GrandPrix>;
	races: Race[];
	results: Result[];
	sprintResults: Result[];
	qualifying: QualifyingRow[];
	fastestLaps: FastestLap[];
	driverStandings: Map<number, StandingRow[]>;
	constructorStandings: Map<number, StandingRow[]>;
	upcomingEntrants: Entrant[];
	/** Drivers who only ever took part in Friday practice (F1DB test drivers). */
	thirdDrivers?: { driverId: string; weekends: number; firstYear: number; lastYear: number; constructorIds: string[] }[];
	/** Jolpica lap leaders per race (real history; see laps.ts for universe-safe access). */
	lapLeaders?: Map<number, LeadSpan[]>;
	sprintLapLeaders?: Map<number, LeadSpan[]>;
	/** Signature of the real results each lap-led race's data belongs to (laps.ts). */
	lapSig?: Map<number, string>;
	sprintLapSig?: Map<number, string>;
	/** Jolpica sprint fastest laps, with the signature of the sprint results they belong to. */
	sprintFastestLaps?: Map<number, SprintFastestLap>;
	sprintFastestSig?: Map<number, string>;
	/** Hand-entered race notes, with the signature of the results they belong to (laps.ts raceNote). */
	raceNotes?: Map<number, RaceNote>;
	raceNotesSig?: Map<number, string>;
	/** Set by universes that change a season's scoring; absent means historic era rules. */
	rulesOverride?: Map<number, EraRules>;
	/** Seasons a universe changed, for "differs from reality" markers. */
	modifiedYears?: Set<number>;
};

function hydrateResult(r: RawResult): Result {
	return {
		raceId: r[0],
		position: r[1],
		positionText: r[2],
		driverId: r[3],
		constructorId: r[4],
		engineId: r[5],
		number: r[6],
		grid: r[7],
		laps: r[8],
		time: r[9],
		gap: r[10],
		reasonRetired: r[11],
		points: r[12] ?? 0,
		fastestLap: r[13] === 1,
		pole: r[14] === 1,
		sharedCar: r[15] === 1,
		qualifying: r[16],
		tyreId: r[17] ?? null,
		grandSlam: r[18] === 1,
	};
}

function byKey<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const map = new Map<K, T[]>();
	for (const row of rows) {
		const k = key(row);
		const list = map.get(k);
		if (list) list.push(row);
		else map.set(k, [row]);
	}
	return map;
}

/** Order-independent fingerprint of a race's classification, to detect races a universe changed. */
export function resultsSig(results: { driverId: string; positionText: string; laps: number | null }[] | undefined): string {
	if (!results?.length) return "";
	return results
		.map((r) => `${r.driverId}:${r.positionText}:${r.laps ?? ""}`)
		.sort()
		.join("|");
}

function lapIndex<T>(rows: [number, T][] | undefined, results: Result[]) {
	const leaders = new Map(rows ?? []);
	const byRace = new Map<number, Result[]>();
	for (const r of results) if (leaders.has(r.raceId)) (byRace.get(r.raceId) ?? byRace.set(r.raceId, []).get(r.raceId)!).push(r);
	return { leaders, sig: new Map([...leaders.keys()].map((id) => [id, resultsSig(byRace.get(id))])) };
}

export function hydrate(raw: RawDataset): F1Data {
	const results = raw.results.map(hydrateResult);
	const sprintResults = raw.sprintResults.map(hydrateResult);
	const laps = lapIndex(raw.lapLeaders, results);
	const sprintLaps = lapIndex(raw.sprintLapLeaders, sprintResults);
	const sprintFl = lapIndex<SprintFastestLap>(
		(raw.sprintFastestLaps ?? []).map(([raceId, driverId, lap, ms]) => [raceId, { raceId, driverId, lap, ms }]),
		sprintResults,
	);
	const notes = lapIndex<RaceNote>(
		(raw.raceNotes ?? []).map(([raceId, weather, neutralised, tyres]) => [raceId, { raceId, weather, neutralised, tyres: tyres === 1 }]),
		results,
	);
	return {
		meta: raw.meta,
		countries: new Map(raw.countries.map(([id, name, alpha2, demonym]) => [id, { id, name, alpha2, demonym }])),
		drivers: new Map(
			raw.drivers.map(([id, name, firstName, lastName, abbreviation, number, dob, dod, nationality, pob, gender]) => [
				id,
				{ id, name, firstName, lastName, abbreviation, number, dateOfBirth: dob, dateOfDeath: dod, nationality, placeOfBirth: pob, gender: gender ?? "M" },
			]),
		),
		constructors: new Map(raw.constructors.map(([id, name, fullName, country]) => [id, { id, name, fullName, country }])),
		engines: new Map(raw.engines.map(([id, name, country]) => [id, { id, name, country }])),
		tyres: new Map((raw.tyres ?? []).map(([id, name, country]) => [id, { id, name, country }])),
		families: (raw.families ?? []).map(([driverId, relatedId, type]) => ({ driverId, relatedId, type })),
		circuits: new Map(
			raw.circuits.map(([id, name, fullName, place, country, lat, lng, type, direction, length, turns]) => [
				id,
				{ id, name, fullName, place, country, lat, lng, type, direction, length, turns },
			]),
		),
		grandsPrix: new Map(
			raw.grandsPrix.map(([id, name, fullName, shortName, country]) => [id, { id, name, fullName, shortName, country }]),
		),
		races: raw.races
			.map(([id, year, round, date, grandPrixId, circuitId, officialName, laps, distance, courseLength, hasSprint, qf]) => ({
				id, year, round, date, grandPrixId, circuitId, officialName, laps, distance, courseLength,
				hasSprint: hasSprint === 1,
				qualifyingFormat: qf,
			}))
			.sort((a, b) => a.year - b.year || a.round - b.round),
		results,
		sprintResults,
		qualifying: raw.qualifying.map(([raceId, position, positionText, driverId, constructorId, time, q1, q2, q3]) => ({
			raceId, position, positionText, driverId, constructorId, time, q1, q2, q3,
		})),
		fastestLaps: raw.fastestLaps.map(([raceId, driverId, lap, time]) => ({ raceId, driverId, lap, time })),
		driverStandings: byKey(
			raw.driverStandings.map(([year, position, positionText, id, points, champion]) => ({
				year, position, positionText, id, points, champion: champion === 1,
			})),
			(r) => r.year,
		) as Map<number, StandingRow[]>,
		constructorStandings: byKey(
			raw.constructorStandings.map(([year, position, positionText, id, engineId, points, champion]) => ({
				year, position, positionText, id, engineId, points, champion: champion === 1,
			})),
			(r) => r.year,
		) as Map<number, StandingRow[]>,
		upcomingEntrants: raw.upcomingEntrants.map(([year, constructorId, engineId, driverId]) => ({
			year, constructorId, engineId, driverId,
		})),
		thirdDrivers: (raw.thirdDrivers ?? []).map(([driverId, weekends, firstYear, lastYear, constructorIds]) => ({ driverId, weekends, firstYear, lastYear, constructorIds })),
		lapLeaders: laps.leaders,
		lapSig: laps.sig,
		sprintLapLeaders: sprintLaps.leaders,
		sprintLapSig: sprintLaps.sig,
		sprintFastestLaps: sprintFl.leaders,
		sprintFastestSig: sprintFl.sig,
		raceNotes: notes.leaders,
		raceNotesSig: notes.sig,
	};
}

/** Position texts that mean the driver did not take the start. */
export const NON_STARTS = new Set(["DNQ", "DNPQ", "DNP", "DNS"]);
export const isStart = (r: Result) => !NON_STARTS.has(r.positionText);

export type Db = F1Data & {
	raceById: Map<number, Race>;
	racesByYear: Map<number, Race[]>;
	years: number[];
	resultsByRace: Map<number, Result[]>;
	sprintByRace: Map<number, Result[]>;
	qualifyingByRace: Map<number, QualifyingRow[]>;
	fastestLapByRace: Map<number, FastestLap>;
	resultsByDriver: Map<string, Result[]>;
	resultsByConstructor: Map<string, Result[]>;
	sprintByDriver: Map<string, Result[]>;
	sprintByConstructor: Map<string, Result[]>;
	racesByCircuit: Map<string, Race[]>;
};

const sortByDisplay = (a: Result, b: Result) =>
	(a.position ?? 999) - (b.position ?? 999) || (b.laps ?? 0) - (a.laps ?? 0);

export function indexData(data: F1Data): Db {
	const raceById = new Map(data.races.map((r) => [r.id, r]));
	const raceOrder = (r: Result) => {
		const race = raceById.get(r.raceId)!;
		return race.year * 100 + race.round;
	};
	const chrono = (list: Result[]) => list.sort((a, b) => raceOrder(a) - raceOrder(b));

	const resultsByRace = byKey(data.results, (r) => r.raceId);
	for (const list of resultsByRace.values()) list.sort(sortByDisplay);
	const sprintByRace = byKey(data.sprintResults, (r) => r.raceId);
	for (const list of sprintByRace.values()) list.sort(sortByDisplay);

	const resultsByDriver = byKey(data.results, (r) => r.driverId);
	const resultsByConstructor = byKey(data.results, (r) => r.constructorId);
	for (const list of resultsByDriver.values()) chrono(list);
	for (const list of resultsByConstructor.values()) chrono(list);

	const racesByYear = byKey(data.races, (r) => r.year);
	return {
		...data,
		raceById,
		racesByYear,
		years: [...racesByYear.keys()].sort((a, b) => a - b),
		resultsByRace,
		sprintByRace,
		qualifyingByRace: byKey(data.qualifying, (r) => r.raceId),
		fastestLapByRace: new Map(data.fastestLaps.map((f) => [f.raceId, f])),
		resultsByDriver,
		resultsByConstructor,
		sprintByDriver: byKey(data.sprintResults, (r) => r.driverId),
		sprintByConstructor: byKey(data.sprintResults, (r) => r.constructorId),
		racesByCircuit: byKey(data.races, (r) => r.circuitId),
	};
}

/** Races of a season that have results (excludes scheduled, not-yet-run races). */
export function completedRaces(db: Db, year: number): Race[] {
	return (db.racesByYear.get(year) ?? []).filter((r) => db.resultsByRace.has(r.id));
}

/** A season that has started but still has rounds to run, so it has a leader rather than a champion. */
export function seasonInProgress(db: Db, year: number): boolean {
	const done = completedRaces(db, year).length;
	return done > 0 && done < (db.racesByYear.get(year)?.length ?? 0);
}
