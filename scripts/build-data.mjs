// Builds the compact dataset used by both the server-rendered site and the
// in-browser universe engine. Source: F1DB split JSON (https://github.com/f1db/f1db).
//
//   node scripts/build-data.mjs            (reads ./f1db)
//   F1DB_DIR=/path/to/f1db node scripts/build-data.mjs
//   node scripts/update-f1db.mjs           (fetches the latest release into ./f1db)
//   node scripts/update-jolpica.mjs        (fetches the Jolpica dump into ./jolpica)
//
// Writes data/f1.json (server) and public/data/f1.json (browser). Row arrays are
// stored as tuples to keep the payload small; src/lib/f1/dataset.ts hydrates them.
//
// When ./jolpica (or JOLPICA_DIR) holds a Jolpica CSV dump, it supplements F1DB
// (see scripts/lib/jolpica.mjs): lap leaders go into f1.json, and per-race lap
// charts and pit stops into data/laps/<raceId>.json and public/data/laps/.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildJolpica } from "./lib/jolpica.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(process.env.F1DB_DIR ?? join(root, "f1db"));

function load(name) {
	const file = join(srcDir, `f1db-${name}.json`);
	if (!existsSync(file)) throw new Error(`Missing ${file}. Run node scripts/prepare-data.mjs, or set F1DB_DIR to an F1DB split-JSON folder.`);
	return JSON.parse(readFileSync(file, "utf8"));
}

const nn = (v) => (v === undefined ? null : v);
const flag = (v) => (v ? 1 : 0);

const countries = load("countries");
const drivers = load("drivers");
const constructors = load("constructors");
const engines = load("engine-manufacturers");
const tyres = load("tyre-manufacturers");
const families = load("drivers-family-relationships");
const circuits = load("circuits");
const grandsPrix = load("grands-prix");
const races = load("races");
const raceResults = load("races-race-results");
const sprintResults = load("races-sprint-race-results");
const qualifying = load("races-qualifying-results");
const fastestLaps = load("races-fastest-laps");
const seasonDriverStandings = load("seasons-driver-standings");
const seasonConstructorStandings = load("seasons-constructor-standings");
const seasonEntrantsDrivers = load("seasons-entrants-drivers");
const practice = ["1", "2", "3", "4"].flatMap((n) => (existsSync(join(srcDir, `f1db-races-free-practice-${n}-results.json`)) ? load(`races-free-practice-${n}-results`) : []));

let release = null;
const releaseFile = join(srcDir, "f1db-release.json");
if (existsSync(releaseFile)) {
	const r = JSON.parse(readFileSync(releaseFile, "utf8"));
	release = { tag: r.tag, publishedAt: r.publishedAt };
}

const jolpicaDir = resolve(process.env.JOLPICA_DIR ?? join(root, "jolpica"));
const jolpica = buildJolpica(jolpicaDir, { races, drivers, grandsPrix, raceResults, sprintResults });

const resultYears = raceResults.map((r) => r.year);
const lastCompletedYear = Math.max(...resultYears);

const dataset = {
	meta: {
		source: "F1DB",
		release,
		generatedAt: new Date().toISOString(),
		firstYear: Math.min(...resultYears),
		lastCompletedYear,
		// Jolpica supplement (lap data, pit stops), or null when ./jolpica is absent
		jolpica: jolpica?.meta ?? null,
	},
	// [id, name, alpha2, demonym]
	countries: countries.map((c) => [c.id, c.name, c.alpha2Code, nn(c.demonym)]),
	// [id, name, firstName, lastName, abbreviation, permanentNumber, dateOfBirth, dateOfDeath, nationalityCountryId, placeOfBirth, gender]
	drivers: drivers.map((d) => [
		d.id, d.name, d.firstName, d.lastName, nn(d.abbreviation), nn(d.permanentNumber),
		nn(d.dateOfBirth), nn(d.dateOfDeath), d.nationalityCountryId, nn(d.placeOfBirth), d.gender === "FEMALE" ? "F" : "M",
	]),
	// [driverId, relatedDriverId, type] e.g. type CHILD means driverId is the child of relatedDriverId
	families: families.map((f) => [f.driverId, f.parentDriverId, f.type]),
	// [id, name, fullName, countryId]
	constructors: constructors.map((c) => [c.id, c.name, nn(c.fullName), c.countryId]),
	// [id, name, countryId]
	engines: engines.map((e) => [e.id, e.name, e.countryId]),
	// [id, name, countryId]
	tyres: tyres.map((t) => [t.id, t.name, t.countryId]),
	// [id, name, fullName, placeName, countryId, latitude, longitude, type, direction, length, turns]
	circuits: circuits.map((c) => [
		c.id, c.name, c.fullName, c.placeName, c.countryId, c.latitude, c.longitude,
		c.type, c.direction, c.length, c.turns,
	]),
	// [id, name, fullName, shortName, countryId]
	grandsPrix: grandsPrix.map((g) => [g.id, g.name, g.fullName, g.shortName, g.countryId]),
	// [id, year, round, date, grandPrixId, circuitId, officialName, laps, distance, courseLength, hasSprint, qualifyingFormat]
	races: races.map((r) => [
		r.id, r.year, r.round, r.date, r.grandPrixId, r.circuitId, r.officialName,
		r.laps, r.distance, r.courseLength, flag(r.sprintRaceDate), r.qualifyingFormat,
	]),
	// [raceId, positionNumber, positionText, driverId, constructorId, engineId, number,
	//  grid, laps, time, gap, reasonRetired, points, fastestLap, pole, sharedCar, qualifyingPosition, tyreId, grandSlam]
	results: raceResults.map((r) => [
		r.raceId, nn(r.positionNumber), r.positionText, r.driverId, r.constructorId,
		r.engineManufacturerId, nn(r.driverNumber), nn(r.gridPositionNumber), nn(r.laps),
		nn(r.time), nn(r.gap), nn(r.reasonRetired), nn(r.points), flag(r.fastestLap),
		flag(r.polePosition), flag(r.sharedCar), nn(r.qualificationPositionNumber),
		nn(r.tyreManufacturerId), flag(r.grandSlam),
	]),
	// same tuple shape as results
	sprintResults: sprintResults.map((r) => [
		r.raceId, nn(r.positionNumber), r.positionText, r.driverId, r.constructorId,
		r.engineManufacturerId, nn(r.driverNumber), nn(r.gridPositionNumber), nn(r.laps),
		nn(r.time), nn(r.gap), nn(r.reasonRetired), nn(r.points), flag(r.fastestLap),
		flag(r.polePosition), flag(r.sharedCar), nn(r.qualificationPositionNumber),
		nn(r.tyreManufacturerId), flag(r.grandSlam),
	]),
	// [raceId, positionNumber, positionText, driverId, constructorId, time, q1, q2, q3]
	qualifying: qualifying.map((q) => [
		q.raceId, nn(q.positionNumber), q.positionText, q.driverId, q.constructorId,
		nn(q.time), nn(q.q1), nn(q.q2), nn(q.q3),
	]),
	// fastest lap of each race only: [raceId, driverId, lap, time]
	fastestLaps: fastestLaps
		.filter((f) => f.positionNumber === 1)
		.map((f) => [f.raceId, f.driverId, nn(f.lap), nn(f.time)]),
	// official championship tables: [year, positionNumber, positionText, driverId, points, champion]
	driverStandings: seasonDriverStandings.map((s) => [
		s.year, nn(s.positionNumber), s.positionText, s.driverId, s.points, flag(s.championshipWon),
	]),
	// [year, positionNumber, positionText, constructorId, engineId, points, champion]
	constructorStandings: seasonConstructorStandings.map((s) => [
		s.year, nn(s.positionNumber), s.positionText, s.constructorId, s.engineManufacturerId,
		s.points, flag(s.championshipWon),
	]),
	// race-driver entries for seasons without results yet (the upcoming grid):
	// [year, constructorId, engineId, driverId]
	upcomingEntrants: seasonEntrantsDrivers
		.filter((e) => e.year > lastCompletedYear && !e.testDriver)
		.map((e) => [e.year, e.constructorId, e.engineManufacturerId, e.driverId]),
	// Friday/practice-only drivers (F1DB test drivers who never entered a race):
	// [driverId, practice weekends, firstYear, lastYear, constructorIds]
	thirdDrivers: (() => {
		const raced = new Set(raceResults.map((r) => r.driverId));
		const test = new Set(seasonEntrantsDrivers.filter((e) => e.testDriver && !raced.has(e.driverId)).map((e) => e.driverId));
		const by = new Map();
		for (const p of practice) {
			if (!test.has(p.driverId)) continue;
			const x = by.get(p.driverId) ?? { races: new Set(), years: new Set(), teams: new Set() };
			x.races.add(p.raceId);
			x.years.add(p.year);
			x.teams.add(p.constructorId);
			by.set(p.driverId, x);
		}
		for (const e of seasonEntrantsDrivers) if (test.has(e.driverId) && !by.has(e.driverId)) by.set(e.driverId, { races: new Set(), years: new Set([e.year]), teams: new Set([e.constructorId]) });
		return [...by].map(([id, x]) => [id, x.races.size, Math.min(...x.years), Math.max(...x.years), [...x.teams]]);
	})(),
	// Jolpica: leader of every race lap, run-length encoded: [raceId, [[driverId, fromLap, toLap], ...]]
	lapLeaders: jolpica?.lapLeaders ?? [],
	// same for sprint races (only sprints with complete lap positions)
	sprintLapLeaders: jolpica?.sprintLapLeaders ?? [],
	// Jolpica: fastest lap of each sprint race: [raceId, driverId, lap, timeMs]
	sprintFastestLaps: jolpica?.sprintFastestLaps ?? [],
};

const json = JSON.stringify(dataset);
for (const out of [join(root, "data", "f1.json"), join(root, "public", "data", "f1.json")]) {
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, json);
}
// per-race lap charts and pit stops, loaded on demand by the race page
for (const dir of [join(root, "data", "laps"), join(root, "public", "data", "laps")]) {
	rmSync(dir, { recursive: true, force: true });
	if (!jolpica) continue;
	mkdirSync(dir, { recursive: true });
	for (const [raceId, file] of jolpica.files) writeFileSync(join(dir, `${raceId}.json`), JSON.stringify(file));
}
if (jolpica) {
	const sizes = [...jolpica.files.values()].map((f) => JSON.stringify(f).length).sort((a, b) => a - b);
	const r = jolpica.report;
	console.log(
		`Jolpica dump ${jolpica.meta.dumpDate ?? "(undated)"}: laps ${jolpica.meta.lapsFrom}-${jolpica.meta.lapsTo}, ` +
			`sprint laps from ${jolpica.meta.sprintLapsFrom ?? "-"}, pit stops from ${jolpica.meta.pitStopsFrom ?? "-"}; ` +
			`${r.rounds.mapped} rounds mapped, ${r.drivers.mapped} drivers mapped ` +
			`(dob+name ${r.drivers.dobName}, dob only ${r.drivers.dobOnly}, name only ${r.drivers.name}, overrides ${r.drivers.override}); ` +
			`${jolpica.files.size} race files, ${(sizes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1)} MB ` +
			`(median ${(sizes[sizes.length >> 1] / 1024).toFixed(1)} KB, max ${(sizes[sizes.length - 1] / 1024).toFixed(1)} KB)`,
	);
	if (r.rounds.dateWarnings.length) console.log(`  date differs between Jolpica and F1DB (same Grand Prix, accepted): ${r.rounds.dateWarnings.join("; ")}`);
	if (r.rounds.problems.length) console.log(`  unmapped Jolpica rounds (no lap data used): ${r.rounds.problems.join("; ")}`);
	for (const [label, list] of [
		["laps without a position", r.noPosition],
		["drivers with laps but no F1DB result", r.notInResults],
		["lap count differs from the F1DB winner", r.lapCountMismatch],
		["laps without a leader", r.leaderGaps],
	]) {
		const n = Array.isArray(list) ? list.length : list;
		if (n) console.log(`  ${label}: ${n}${Array.isArray(list) ? ` (${list.slice(0, 8).join("; ")}${list.length > 8 ? "; ..." : ""})` : ""}`);
	}
} else console.log(`No Jolpica dump in ${jolpicaDir}: lap data skipped (run node scripts/update-jolpica.mjs).`);
console.log(
	`F1 dataset: ${dataset.races.length} races, ${dataset.results.length} results, ` +
		`${dataset.drivers.length} drivers, ${(json.length / 1024 / 1024).toFixed(1)} MB ` +
		`(seasons ${dataset.meta.firstYear}-${lastCompletedYear}, from ${srcDir})`,
);
execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(root, "scripts", "build-client-data.ts")], { stdio: "inherit" });
