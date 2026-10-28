// Fills safety cars and virtual safety cars in data/race-notes/ from the "Formula 1 Race Events" dataset
// (jtrotman on Kaggle, CC0, scraped from Wikipedia's deployment lists and kept up to date; read from the
// TracingInsights/RaceData mirror on GitHub). It covers 2022, which the Wikipedia import has no safety
// cars for, and some races the old tables missed.
//
// Like the other imports it never changes what's there: a period is only added when the round has none of
// that kind on those laps. A race where the result wouldn't pass the build's checks is listed instead.
//
//   node scripts/import-race-events.mjs          fetch (cached in .cache/race-events), merge, report
//   node scripts/import-race-events.mjs --dry    report what it would add, write nothing
//
// Reads F1DB from ./f1db (or F1DB_DIR).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRaceNotes } from "./lib/race-notes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(process.env.F1DB_DIR ?? join(root, "f1db"));
const notesDir = join(root, "data", "race-notes");
const cacheDir = join(root, ".cache", "race-events");
const dry = process.argv.includes("--dry");
const load = (name) => JSON.parse(readFileSync(join(srcDir, `f1db-${name}.json`), "utf8"));

const races = load("races");
const raceResults = load("races-race-results");
const drivers = load("drivers");
const grandsPrix = new Map(load("grands-prix").map((g) => [g.id, g]));
const lapsOf = new Map();
for (const r of raceResults) lapsOf.set(r.raceId, Math.max(lapsOf.get(r.raceId) ?? 0, r.laps ?? 0));
const run = races.filter((r) => lapsOf.has(r.id));
const title = (r) => `${r.year} ${grandsPrix.get(r.grandPrixId)?.fullName ?? r.grandPrixId}`;
const byTitle = new Map(run.map((r) => [title(r).toLowerCase(), r]));
const SOURCE = "https://www.kaggle.com/datasets/jtrotman/formula-1-race-events";
const BASE = "https://raw.githubusercontent.com/TracingInsights/RaceData/main/data";

/** The dataset's race names, where they differ from F1DB's. */
function raceOf(name) {
	const exact = byTitle.get(name.toLowerCase());
	if (exact) return exact;
	const [, year, gp] = /^(\d{4}) (.+)$/.exec(name) ?? [];
	if (!year) return null;
	// "2026 Bahrain Grand Prix in Malaysia": the race kept its name when it moved
	const plain = gp.replace(/ in [A-Z][\w ]+$/, "");
	const alias = { "Mexico City Grand Prix": "Mexican Grand Prix", "Brazilian Grand Prix": "São Paulo Grand Prix" }[plain];
	return byTitle.get(`${year} ${plain}`.toLowerCase()) ?? (alias ? byTitle.get(`${year} ${alias}`.toLowerCase()) : null) ?? null;
}

async function csv(file) {
	const cached = join(cacheDir, file);
	let text;
	if (existsSync(cached)) text = readFileSync(cached, "utf8");
	else {
		const res = await fetch(`${BASE}/${file}`);
		if (!res.ok) throw new Error(`${res.status} for ${BASE}/${file}`);
		text = await res.text();
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(cached, text);
	}
	const [head, ...lines] = text.trim().split(/\r?\n/);
	const cols = head.split(",");
	return lines.map((l) => Object.fromEntries([...l.matchAll(/("([^"]*)"|[^,]*)(?:,|$)/g)].slice(0, cols.length).map((m, i) => [cols[i], m[2] ?? m[1]])));
}

/* -------------------------------------------------------------- import --- */

const found = new Map(); // raceId -> periods
const unmatched = new Set();
const skipped = [];
const lap = (v) => (v === "" || v == null ? null : Math.round(Number(v)));
for (const [type, file] of [
	["SC", "safety_cars.csv"],
	["VSC", "virtual_safety_cars.csv"],
]) {
	for (const row of await csv(file)) {
		const race = raceOf(row.Race);
		if (!race) {
			unmatched.add(row.Race);
			continue;
		}
		const max = lapsOf.get(race.id);
		// "lap 0": out from the start
		const from = Math.min(Math.max(1, lap(row.Deployed) ?? NaN), max);
		// still out at the flag
		const to = Math.min(lap(row.Retreated) ?? max, max);
		if (!(from >= 1) || to < from || (type === "VSC" && race.year < 2015)) {
			skipped.push(`${row.Race} ${type} ${row.Deployed}-${row.Retreated}`);
			continue;
		}
		(found.get(race.id) ?? found.set(race.id, []).get(race.id)).push({ type, from, to });
	}
}

/* --------------------------------------------------------------- merge --- */

const added = { periods: 0, races: 0 };
const review = [];
const raceById = new Map(run.map((r) => [r.id, r]));
const byYear = new Map();
for (const [id, periods] of found) {
	const race = raceById.get(id);
	(byYear.get(race.year) ?? byYear.set(race.year, []).get(race.year)).push([race, periods]);
}
for (const [year, list] of [...byYear].sort((a, b) => a[0] - b[0])) {
	const file = join(notesDir, `${year}.json`);
	const notes = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	let changed = false;
	for (const [race, periods] of list.sort((a, b) => a[0].round - b[0].round)) {
		const note = notes[race.round] ?? {};
		const have = note.neutralised ?? [];
		// only periods the round doesn't have: none of that kind starting within two laps
		const fresh = periods.filter((p) => !have.some((h) => h.type === p.type && Math.abs(h.from - p.from) <= 2));
		if (!fresh.length) continue;
		// a VSC that turned into a safety car ends as it comes out
		const all = [...have, ...fresh];
		for (const v of fresh.filter((n) => n.type === "VSC")) for (const s of all.filter((n) => n.type === "SC")) if (s.from >= v.from && s.from < v.to) v.to = s.from;
		const sorted = all.sort((a, b) => (a.from ?? a.lap) - (b.from ?? b.lap) || (a.to ?? a.lap) - (b.to ?? b.lap));
		const cars = sorted.filter((n) => n.type !== "RF");
		if (cars.some((n, i) => i > 0 && n.from < cars[i - 1].to)) {
			review.push(`${title(race)}: would have ${cars.map((n) => `${n.type} ${n.from}-${n.to}`).join(", ")}, which overlap`);
			continue;
		}
		note.neutralised = sorted;
		note.sources = [...new Set([...(note.sources ?? []), SOURCE])];
		notes[race.round] = note;
		added.periods += fresh.length;
		added.races++;
		changed = true;
	}
	if (!dry && changed) {
		const sorted = Object.fromEntries(Object.entries(notes).sort((a, b) => Number(a[0]) - Number(b[0])));
		mkdirSync(notesDir, { recursive: true });
		writeFileSync(file, `${JSON.stringify(sorted, null, "\t")}\n`);
	}
}

console.log(`${dry ? "Would add" : "Added"}: ${added.periods} SC/VSC periods to ${added.races} races.`);
if (unmatched.size) console.log(`Races not found in F1DB:\n  ${[...unmatched].join("\n  ")}`);
if (skipped.length) console.log(`Skipped (laps that don't fit):\n  ${skipped.join("\n  ")}`);
if (review.length) console.log(`Left as they are, to check by hand:\n  ${review.join("\n  ")}`);
if (!dry) {
	const check = buildRaceNotes(notesDir, { races, drivers, raceResults });
	for (const e of check.errors) console.log(`error: ${e}`);
	console.log(check.errors.length ? "Fix the errors above (or remove those entries) before building." : "The notes pass the build's checks.");
}
