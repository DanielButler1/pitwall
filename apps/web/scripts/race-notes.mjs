// Helps with the hand-entered race notes in data/race-notes/ (see its README).
//
//   node scripts/race-notes.mjs check                 check every notes file, list what's covered
//   node scripts/race-notes.mjs template 2026 16      print a filled-in skeleton for a race: every driver
//                                                     with one "?" per stint (from the pit stops)
//   node scripts/race-notes.mjs template 2026 16 --add  add it to data/race-notes/2026.json: only the fields
//                                                     the round doesn't have yet, nothing already there changes
//   node scripts/race-notes.mjs missing 2026          what each race of a season still lacks
//
// Reads F1DB from ./f1db (or F1DB_DIR) and pit stops from the built data/laps/ files.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRaceNotes } from "./lib/race-notes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(process.env.F1DB_DIR ?? join(root, "f1db"));
const notesDir = join(root, "data", "race-notes");
const load = (name) => {
	const file = join(srcDir, `f1db-${name}.json`);
	if (!existsSync(file)) throw new Error(`Missing ${file}. Run node scripts/prepare-data.mjs, or set F1DB_DIR.`);
	return JSON.parse(readFileSync(file, "utf8"));
};
const f1db = { races: load("races"), drivers: load("drivers"), raceResults: load("races-race-results") };
const grandsPrix = new Map(load("grands-prix").map((g) => [g.id, g]));
const driverById = new Map(f1db.drivers.map((d) => [d.id, d]));

/** The built race file (pit stops), when there is one. */
const lapFile = (raceId) => {
	const file = join(root, "data", "laps", `${raceId}.json`);
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
};
const lapFiles = new Map(f1db.races.map((r) => [r.id, lapFile(r.id)]).filter(([, f]) => f));
const raceName = (r) => `${r.year} ${grandsPrix.get(r.grandPrixId)?.name ?? r.grandPrixId} Grand Prix`;
const yearFile = (year) => join(notesDir, `${year}.json`);
const readYear = (year) => (existsSync(yearFile(year)) ? JSON.parse(readFileSync(yearFile(year), "utf8")) : {});

const [command, ...args] = process.argv.slice(2);

if (command === "check") {
	const notes = buildRaceNotes(notesDir, f1db, lapFiles);
	for (const e of notes.errors) console.log(`error: ${e}`);
	for (const w of notes.warnings) console.log(`warning: ${w}`);
	const byYear = new Map();
	const raceById = new Map(f1db.races.map((r) => [r.id, r]));
	for (const [raceId, , neutral, tyres] of notes.rows) {
		const y = raceById.get(raceId).year;
		const x = byYear.get(y) ?? { races: 0, neutral: 0, tyres: 0 };
		x.races++;
		x.neutral += neutral.length ? 1 : 0;
		x.tyres += tyres;
		byYear.set(y, x);
	}
	for (const [y, x] of [...byYear].sort((a, b) => a[0] - b[0])) {
		const run = new Set(f1db.raceResults.filter((r) => r.year === y).map((r) => r.raceId)).size;
		console.log(`${y}: ${x.races}/${run} races with notes, ${x.neutral} with SC/VSC/red flags, ${x.tyres} with tyres`);
	}
	console.log(notes.errors.length ? `${notes.errors.length} error(s): the build will fail until they're fixed.` : "All notes are fine.");
	process.exit(notes.errors.length ? 1 : 0);
} else if (command === "template") {
	const [year, round] = args.map(Number);
	const race = f1db.races.find((r) => r.year === year && r.round === round);
	if (!race) throw new Error(`No round ${round} in ${year}.`);
	const results = f1db.raceResults.filter((r) => r.raceId === race.id).sort((a, b) => a.positionDisplayOrder - b.positionDisplayOrder);
	if (!results.length) throw new Error(`${raceName(race)} has no results yet.`);
	const stops = new Map();
	for (const [d] of lapFile(race.id)?.pitStops ?? []) stops.set(d, (stops.get(d) ?? 0) + 1);
	const hasStops = lapFiles.get(race.id)?.pitStops != null;
	const tyres = {};
	for (const r of results) {
		const key = driverById.get(r.driverId)?.abbreviation ?? r.driverId;
		const n = (hasStops ? (stops.get(r.driverId) ?? 0) : (r.pitStops ?? 0)) + 1;
		tyres[key in tyres ? r.driverId : key] = Array(n).fill("?").join(" ");
	}
	const entry = {
		weather: null,
		neutralised: [],
		...(year >= 2011 ? { compounds: { H: "C?", M: "C?", S: "C?" } } : {}),
		tyres,
		sources: [`https://en.wikipedia.org/wiki/${race.year}_${(grandsPrix.get(race.grandPrixId)?.name ?? "").replace(/ /g, "_")}_Grand_Prix`],
	};
	if (args.includes("--add")) {
		// only adds the fields the round doesn't have yet; what's there already stays as it is
		const notes = readYear(year);
		const before = notes[round] ?? {};
		const added = Object.keys(entry).filter((k) => k !== "sources" && before[k] == null);
		if (!added.length) throw new Error(`Round ${round} in ${yearFile(year)} already has all of it; nothing to add.`);
		const { sources, ...rest } = entry;
		notes[round] = { ...Object.fromEntries(Object.entries(rest).filter(([k]) => added.includes(k))), ...before, sources: [...new Set([...(before.sources ?? []), ...sources])] };
		const sorted = Object.fromEntries(Object.entries(notes).sort((a, b) => Number(a[0]) - Number(b[0])));
		writeFileSync(yearFile(year), `${JSON.stringify(sorted, null, "\t")}\n`);
		console.log(`Added ${added.join(", ")} to round ${round} (${raceName(race)}) in ${yearFile(year)}. Fill in each "?" and "C?", then run: node scripts/race-notes.mjs check`);
	} else {
		console.log(`// ${raceName(race)}: ${race.laps} laps. One "?" per stint (stops + 1); replace with HS US SS S M H SH I W.`);
		console.log(JSON.stringify({ [round]: entry }, null, "\t"));
	}
} else if (command === "missing") {
	const year = Number(args[0]);
	const notes = readYear(year);
	const run = f1db.races.filter((r) => r.year === year && f1db.raceResults.some((x) => x.raceId === r.id));
	let complete = 0;
	for (const r of run) {
		const n = notes[r.round] ?? {};
		const gaps = [
			n.neutralised == null && "safety cars (or [] for none)",
			n.tyres == null && year >= 2011 && "tyres",
			n.compounds == null && year >= 2019 && "compounds",
			n.weather == null && "weather",
		].filter(Boolean);
		if (gaps.length) console.log(`round ${r.round}, ${raceName(r)}: no ${gaps.join(", ")}`);
		else complete++;
	}
	console.log(`${complete} of ${run.length} races in ${year} are complete.`);
} else {
	console.log("Usage: node scripts/race-notes.mjs check | template <year> <round> [--add] | missing <year>");
}
