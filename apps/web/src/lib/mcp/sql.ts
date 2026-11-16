// The read-only SQL database behind the MCP server's run_sql tool: the whole dataset (data/f1.json, already
// hydrated by src/lib/server.ts) as SQLite tables, built once per server process into a temp file and opened
// read-only. The CREATE statements below are also the schema the AI reads (describe_schema returns them
// from sqlite_master, comments included), so keep their comments accurate.
//
// Per-lap positions, lap times and pit stops (data/laps, from Jolpica) are deliberately not in here: they
// are only served race by race through get_race, so the raw lap data can't be pulled out in bulk.

import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db, Result } from "@pitwall/core/f1/dataset";

export const SCHEMA = `
CREATE TABLE countries (
  id TEXT PRIMARY KEY,          -- e.g. 'united-kingdom'
  name TEXT,
  alpha2 TEXT,                  -- ISO 3166-1 alpha-2, e.g. 'GB'
  demonym TEXT                  -- e.g. 'British'
);
CREATE TABLE drivers (
  id TEXT PRIMARY KEY,          -- e.g. 'lewis-hamilton' (use the search tool to find ids)
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  abbreviation TEXT,            -- e.g. 'HAM'
  permanent_number TEXT,
  date_of_birth TEXT,           -- YYYY-MM-DD
  date_of_death TEXT,           -- YYYY-MM-DD, NULL if alive
  nationality TEXT REFERENCES countries(id),
  place_of_birth TEXT,
  gender TEXT                   -- 'M' or 'F'
);
CREATE TABLE driver_family (
  driver_id TEXT REFERENCES drivers(id),
  related_driver_id TEXT REFERENCES drivers(id),
  relation TEXT                 -- driver_id is the <relation> of related_driver_id, e.g. 'CHILD', 'SIBLING'
);
CREATE TABLE constructors (
  id TEXT PRIMARY KEY,          -- e.g. 'ferrari', 'red-bull'
  name TEXT,
  full_name TEXT,
  country TEXT REFERENCES countries(id)
);
CREATE TABLE engines (
  id TEXT PRIMARY KEY,          -- engine manufacturer, e.g. 'mercedes', 'cosworth'
  name TEXT,
  country TEXT REFERENCES countries(id)
);
CREATE TABLE tyres (
  id TEXT PRIMARY KEY,          -- tyre manufacturer, e.g. 'pirelli'
  name TEXT,
  country TEXT REFERENCES countries(id)
);
CREATE TABLE circuits (
  id TEXT PRIMARY KEY,          -- e.g. 'monaco', 'silverstone'
  name TEXT,
  full_name TEXT,
  place TEXT,
  country TEXT REFERENCES countries(id),
  latitude REAL,
  longitude REAL,
  type TEXT,                    -- 'RACE', 'ROAD' or 'STREET'
  direction TEXT,               -- 'CLOCKWISE' or 'ANTI_CLOCKWISE'
  length_km REAL,               -- current layout
  turns INTEGER
);
CREATE TABLE grands_prix (
  id TEXT PRIMARY KEY,          -- e.g. 'british', 'monaco'
  name TEXT,                    -- e.g. 'British Grand Prix'
  full_name TEXT,
  short_name TEXT,
  country TEXT REFERENCES countries(id)
);
CREATE TABLE races (
  id INTEGER PRIMARY KEY,
  year INTEGER,
  round INTEGER,
  date TEXT,                    -- YYYY-MM-DD
  grand_prix_id TEXT REFERENCES grands_prix(id),
  circuit_id TEXT REFERENCES circuits(id),
  official_name TEXT,
  laps INTEGER,                 -- laps actually run
  scheduled_laps INTEGER,       -- set only when the race was stopped short of its scheduled distance
  distance_km REAL,
  course_length_km REAL,        -- lap length that year
  has_sprint INTEGER,           -- 1 if the weekend had a sprint
  qualifying_format TEXT,
  completed INTEGER             -- 1 once results exist (0 = scheduled, not yet run)
);
CREATE TABLE results (           -- World Championship Grand Prix classifications (Indianapolis 500 1950-60 included)
  race_id INTEGER REFERENCES races(id),
  position INTEGER,             -- classified finishing position, NULL if not classified
  position_text TEXT,           -- '1', '2', ... or 'DNF', 'DSQ', 'DNS', 'DNQ', 'DNPQ', 'NC', 'EX', ...
  driver_id TEXT REFERENCES drivers(id),
  constructor_id TEXT REFERENCES constructors(id),
  engine_id TEXT REFERENCES engines(id),
  tyre_id TEXT REFERENCES tyres(id),
  car_number TEXT,
  grid INTEGER,                 -- starting position (NULL for pit-lane start or no start)
  laps INTEGER,
  time TEXT,                    -- winner's race time or the finisher's time as published
  gap TEXT,                     -- gap to the winner, e.g. '+5.123' or '+1 lap'
  reason_retired TEXT,
  points REAL,                  -- points scored as officially awarded
  fastest_lap INTEGER,          -- 1 if they set the race's fastest lap
  pole INTEGER,                 -- 1 if they started from pole
  shared_car INTEGER,           -- 1 if the car was shared between drivers (1950s)
  qualifying_position INTEGER,
  grand_slam INTEGER,           -- 1 = pole, win, fastest lap and led every lap
  driver_of_the_day INTEGER     -- 1 if voted Driver of the Day (2016 onwards)
);
-- DNQ, DNPQ, DNP and DNS in results.position_text mean the driver did not start: count starts with
-- position_text NOT IN ('DNQ','DNPQ','DNP','DNS').
CREATE TABLE sprint_results (    -- sprint classifications (2021 onwards), same columns as results
  race_id INTEGER REFERENCES races(id),
  position INTEGER,
  position_text TEXT,
  driver_id TEXT REFERENCES drivers(id),
  constructor_id TEXT REFERENCES constructors(id),
  engine_id TEXT REFERENCES engines(id),
  tyre_id TEXT REFERENCES tyres(id),
  car_number TEXT,
  grid INTEGER,
  laps INTEGER,
  time TEXT,
  gap TEXT,
  reason_retired TEXT,
  points REAL,
  fastest_lap INTEGER,
  pole INTEGER,
  shared_car INTEGER,
  qualifying_position INTEGER,
  grand_slam INTEGER,
  driver_of_the_day INTEGER
);
CREATE TABLE qualifying (
  race_id INTEGER REFERENCES races(id),
  position INTEGER,
  position_text TEXT,
  driver_id TEXT REFERENCES drivers(id),
  constructor_id TEXT REFERENCES constructors(id),
  time TEXT,                    -- best time, e.g. '1:23.456'
  q1 TEXT,
  q2 TEXT,
  q3 TEXT
);
CREATE TABLE fastest_laps (       -- fastest lap of each race
  race_id INTEGER REFERENCES races(id),
  driver_id TEXT REFERENCES drivers(id),
  lap INTEGER,
  time TEXT                     -- e.g. '1:18.887'
);
CREATE TABLE driver_standings (   -- final (or current, for a season in progress) championship table
  year INTEGER,
  position INTEGER,
  position_text TEXT,
  driver_id TEXT REFERENCES drivers(id),
  points REAL,
  champion INTEGER              -- 1 for the World Champion
);
CREATE TABLE constructor_standings (  -- from 1958; a team can appear once per engine in early years
  year INTEGER,
  position INTEGER,
  position_text TEXT,
  constructor_id TEXT REFERENCES constructors(id),
  engine_id TEXT REFERENCES engines(id),
  points REAL,
  champion INTEGER
);
CREATE TABLE entrants (           -- announced line-up of a season that has not finished
  year INTEGER,
  constructor_id TEXT REFERENCES constructors(id),
  engine_id TEXT REFERENCES engines(id),
  driver_id TEXT REFERENCES drivers(id)
);
CREATE TABLE laps_led (           -- who led which laps (1996 onwards, Jolpica F1); one row per spell in the lead
  race_id INTEGER REFERENCES races(id),
  session TEXT,                 -- 'race' or 'sprint'
  driver_id TEXT REFERENCES drivers(id),
  from_lap INTEGER,
  to_lap INTEGER,               -- inclusive, so laps led = to_lap - from_lap + 1
  laps INTEGER                  -- to_lap - from_lap + 1
);
CREATE TABLE race_conditions (    -- hand-entered race notes, where available
  race_id INTEGER REFERENCES races(id),
  weather TEXT                  -- 'dry', 'wet' or 'mixed'
);
CREATE TABLE neutralisations (    -- safety cars, virtual safety cars and red flags, where entered
  race_id INTEGER REFERENCES races(id),
  kind TEXT,                    -- 'SC', 'VSC' or 'RF' (red flag)
  from_lap INTEGER,
  to_lap INTEGER
);
CREATE TABLE stewards_penalties ( -- stewards' decisions from the FIA's documents (2019 onwards)
  race_id INTEGER REFERENCES races(id),
  driver_id TEXT REFERENCES drivers(id),
  session TEXT,
  penalty TEXT                  -- T5 = 5 s time penalty, SG10 = stop-and-go, DT = drive-through, G3 = 3 grid places,
                                -- BG = back of grid, PL = pit-lane start, DQ, R = driving reprimand, RN = other reprimand,
                                -- W = warning, F5000 = EUR 5000 fine, P2 = penalty points, LD2 = lap times deleted,
                                -- L1 = penalty laps, BAN = race ban, N = no further action
);
CREATE TABLE new_power_unit_elements (  -- power unit elements fitted new at an event (FIA documents, 2019 onwards)
  race_id INTEGER REFERENCES races(id),
  driver_id TEXT REFERENCES drivers(id),
  element TEXT                  -- ICE, TC, MGU-H, MGU-K, ES, CE or EX
);
CREATE VIEW race_results AS       -- results joined with the race, for convenience
  SELECT r.year, r.round, r.date, r.grand_prix_id, r.circuit_id, res.*
  FROM results res JOIN races r ON r.id = res.race_id;
`;

const MAX_ROWS = 500;

let conn: DatabaseSync | undefined;

function build(db: Db, file: string) {
	const w = new DatabaseSync(file);
	w.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
	w.exec(SCHEMA);
	w.exec("BEGIN");
	const insert = (table: string, rows: Iterable<unknown[]>) => {
		let stmt: ReturnType<DatabaseSync["prepare"]> | undefined;
		for (const row of rows) {
			stmt ??= w.prepare(`INSERT INTO ${table} VALUES (${row.map(() => "?").join(",")})`);
			stmt.run(...(row.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v)) as (string | number | null)[]));
		}
	};
	const result = (r: Result) => [
		r.raceId, r.position, r.positionText, r.driverId, r.constructorId, r.engineId, r.tyreId, r.number, r.grid, r.laps,
		r.time, r.gap, r.reasonRetired, r.points, r.fastestLap, r.pole, r.sharedCar, r.qualifying, r.grandSlam, r.driverOfTheDay ?? false,
	];

	insert("countries", [...db.countries.values()].map((c) => [c.id, c.name, c.alpha2, c.demonym]));
	insert("drivers", [...db.drivers.values()].map((d) => [
		d.id, d.name, d.firstName, d.lastName, d.abbreviation, d.number, d.dateOfBirth, d.dateOfDeath, d.nationality, d.placeOfBirth, d.gender,
	]));
	insert("driver_family", db.families.map((f) => [f.driverId, f.relatedId, f.type]));
	insert("constructors", [...db.constructors.values()].map((c) => [c.id, c.name, c.fullName, c.country]));
	insert("engines", [...db.engines.values()].map((e) => [e.id, e.name, e.country]));
	insert("tyres", [...db.tyres.values()].map((t) => [t.id, t.name, t.country]));
	insert("circuits", [...db.circuits.values()].map((c) => [
		c.id, c.name, c.fullName, c.place, c.country, c.lat, c.lng, c.type, c.direction, c.length, c.turns,
	]));
	insert("grands_prix", [...db.grandsPrix.values()].map((g) => [g.id, g.name, g.fullName, g.shortName, g.country]));
	insert("races", db.races.map((r) => [
		r.id, r.year, r.round, r.date, r.grandPrixId, r.circuitId, r.officialName, r.laps, r.scheduledLaps ?? null,
		r.distance, r.courseLength, r.hasSprint, r.qualifyingFormat, db.resultsByRace.has(r.id),
	]));
	insert("results", db.results.map(result));
	insert("sprint_results", db.sprintResults.map(result));
	insert("qualifying", db.qualifying.map((q) => [q.raceId, q.position, q.positionText, q.driverId, q.constructorId, q.time, q.q1, q.q2, q.q3]));
	insert("fastest_laps", db.fastestLaps.map((f) => [f.raceId, f.driverId, f.lap, f.time]));
	insert("driver_standings", [...db.driverStandings].flatMap(([year, rows]) => rows.map((s) => [year, s.position, s.positionText, s.id, s.points, s.champion])));
	insert("constructor_standings", [...db.constructorStandings].flatMap(([year, rows]) => rows.map((s) => [year, s.position, s.positionText, s.id, s.engineId ?? null, s.points, s.champion])));
	insert("entrants", db.upcomingEntrants.map((e) => [e.year, e.constructorId, e.engineId, e.driverId]));
	for (const [session, spans] of [["race", db.lapLeaders], ["sprint", db.sprintLapLeaders]] as const) {
		insert("laps_led", [...(spans ?? [])].flatMap(([raceId, list]) => list.map(([driverId, from, to]) => [raceId, session, driverId, from, to, to - from + 1])));
	}
	insert("race_conditions", [...(db.raceNotes?.values() ?? [])].filter((n) => n.weather).map((n) => [n.raceId, n.weather]));
	insert("neutralisations", [...(db.raceNotes?.values() ?? [])].flatMap((n) => n.neutralised.map(([kind, from, to]) => [n.raceId, kind, from, to])));
	insert("stewards_penalties", [...(db.stewards?.values() ?? [])].flatMap((s) =>
		s.decisions.flatMap((d) => d.penalties.map((p) => [s.raceId, d.driverId, d.session, p])),
	));
	insert("new_power_unit_elements", [...(db.stewards?.values() ?? [])].flatMap((s) =>
		[...s.newPu].flatMap(([driverId, elements]) => elements.map((e) => [s.raceId, driverId, e])),
	));
	w.exec("COMMIT");
	w.exec(`
		CREATE INDEX results_race ON results(race_id); CREATE INDEX results_driver ON results(driver_id);
		CREATE INDEX results_constructor ON results(constructor_id); CREATE INDEX sprint_race ON sprint_results(race_id);
		CREATE INDEX quali_race ON qualifying(race_id); CREATE INDEX quali_driver ON qualifying(driver_id);
		CREATE INDEX races_year ON races(year, round); CREATE INDEX laps_led_race ON laps_led(race_id);
		CREATE INDEX laps_led_driver ON laps_led(driver_id); CREATE INDEX standings_driver ON driver_standings(driver_id);
	`);
	w.close();
}

/** The read-only connection, building the database file on first use. */
function connection(db: Db): DatabaseSync {
	if (conn) return conn;
	const dir = join(tmpdir(), "pitwall-mcp");
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `f1-${db.meta.generatedAt.replace(/\W/g, "")}-${process.pid}.sqlite`);
	if (!existsSync(file)) {
		const partial = `${file}.${Date.now()}.tmp`;
		try {
			build(db, partial);
			rmSync(file, { force: true });
			// rename is atomic, so a concurrent request never opens a half-built file
			renameSync(partial, file);
		} finally {
			rmSync(partial, { force: true });
		}
	}
	conn = new DatabaseSync(file, { readOnly: true, allowExtension: false });
	return conn;
}

/** The schema as the AI should read it: every table and view's CREATE statement, with its comments. */
export function describeSchema(db: Db): string {
	const rows = connection(db).prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND sql IS NOT NULL ORDER BY rowid").all();
	return rows.map((r) => `${r.sql};`).join("\n\n");
}

export type SqlResult = { columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean };

/** Runs one read-only statement and returns at most maxRows rows. */
export function runSql(db: Db, sql: string, maxRows = 200): SqlResult {
	const text = sql.trim().replace(/;\s*$/, "");
	if (!/^(select|with|values|explain)\b/i.test(text)) throw new Error("Only SELECT (or WITH ... SELECT) queries are allowed.");
	if (/\b(attach|detach|pragma|load_extension)\b/i.test(text)) throw new Error("ATTACH, DETACH, PRAGMA and load_extension are not allowed.");
	if (text.includes(";")) throw new Error("Send one statement at a time.");
	const limit = Math.max(1, Math.min(MAX_ROWS, Math.trunc(maxRows)));
	const stmt = connection(db).prepare(text);
	stmt.setReturnArrays(true);
	const columns = stmt.columns().map((c) => c.name);
	const rows: unknown[][] = [];
	let truncated = false;
	for (const row of stmt.iterate() as Iterable<unknown[]>) {
		if (rows.length === limit) {
			truncated = true;
			break;
		}
		rows.push(row);
	}
	return { columns, rows, rowCount: rows.length, truncated };
}
