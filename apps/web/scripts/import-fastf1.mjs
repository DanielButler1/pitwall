// Fills tyres in data/race-notes/ for 2018-2022 (before OpenF1 starts) from FastF1's lap data, as exported
// per race by TracingInsights (github.com/TracingInsights/<year>, Race/session_laptimes.json: each lap's
// driver, stint, compound and tyre age). Like the other imports it only fills what a round doesn't have,
// and weather (from the tyres used) only where a round has none; where it disagrees, the race is listed.
//
// The lap data comes from F1's live timing, like OpenF1's: see data/race-notes/README.md on licensing.
//
//   node scripts/import-fastf1.mjs           fetch (cached in .cache/fastf1), merge, report
//   node scripts/import-fastf1.mjs --dry     report what it would add, write nothing
//
// Reads F1DB from ./f1db (or F1DB_DIR).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRaceNotes } from "./lib/race-notes.mjs";
import { setsOf, weatherFromStints } from "./lib/stints.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(process.env.F1DB_DIR ?? join(root, "f1db"));
const notesDir = join(root, "data", "race-notes");
const cacheDir = join(root, ".cache", "fastf1");
const dry = process.argv.includes("--dry");
const load = (name) => JSON.parse(readFileSync(join(srcDir, `f1db-${name}.json`), "utf8"));
const YEARS = [2018, 2019, 2020, 2021, 2022];

const races = load("races");
const raceResults = load("races-race-results");
const drivers = load("drivers");
const driverById = new Map(drivers.map((d) => [d.id, d]));
const resultsOf = new Map();
for (const r of raceResults) (resultsOf.get(r.raceId) ?? resultsOf.set(r.raceId, []).get(r.raceId)).push(r);
const grandsPrix = new Map(load("grands-prix").map((g) => [g.id, g]));
const title = (r) => `${r.year} ${grandsPrix.get(r.grandPrixId)?.fullName ?? r.grandPrixId}`;

/* ------------------------------------------------------------ fetching --- */

async function get(url, file, json = true) {
	const cached = join(cacheDir, file);
	if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: { "User-Agent": "Pitwall race notes import (https://pitwall.phaseo.app)", ...(json ? { Accept: "application/vnd.github+json" } : {}) } });
		if (res.ok) {
			const data = await res.json();
			mkdirSync(dirname(cached), { recursive: true });
			writeFileSync(cached, JSON.stringify(data));
			return data;
		}
		if (res.status === 404) return null;
		if (attempt >= 4) throw new Error(`${res.status} for ${url}`);
		await new Promise((r) => setTimeout(r, 3000 * attempt));
	}
}

/** The race folders of a season ("Australian Grand Prix"). */
const eventsOf = async (year) => ((await get(`https://api.github.com/repos/TracingInsights/${year}/contents`, `${year}/contents.json`)) ?? []).filter((e) => e.type === "dir" && / Grand Prix$/.test(e.name)).map((e) => e.name);
const lapsOf = (year, event) => get(`https://raw.githubusercontent.com/TracingInsights/${year}/main/${encodeURIComponent(event)}/Race/session_laptimes.json`, `${year}/${event}.json`, false);

/** F1DB's race for a FastF1 event name. */
function raceOf(year, event) {
	const season = races.filter((r) => r.year === year && resultsOf.has(r.id));
	const named = (name) => season.find((r) => [grandsPrix.get(r.grandPrixId)?.fullName, grandsPrix.get(r.grandPrixId)?.name].some((n) => n?.toLowerCase() === name.toLowerCase()));
	const alias = { "Mexico City Grand Prix": "Mexican Grand Prix", "São Paulo Grand Prix": "Brazilian Grand Prix" }[event];
	return named(event) ?? (alias ? named(alias) : null) ?? null;
}

/** Each driver's stints from the per-lap columns: [driver key, stints in order]. */
function stintsByDriver(t) {
	const per = new Map();
	for (let i = 0; i < t.lap.length; i++) {
		const stint = t.stint[i];
		if (stint == null || stint === "None" || t.compound[i] === "None") continue;
		const key = `${t.dNum[i]}|${t.drv[i]}`;
		const list = per.get(key) ?? per.set(key, []).get(key);
		const last = list.at(-1);
		if (last && last.n === stint) last.lapEnd = t.lap[i];
		else {
			const life = Number(t.life[i]);
			list.push({ n: stint, compound: t.compound[i], lapStart: t.lap[i], lapEnd: t.lap[i], age: Number.isFinite(life) ? Math.max(0, life - 1) : 0 });
		}
	}
	return per;
}

/* --------------------------------------------------------------- merge --- */

const added = { tyres: 0, weather: 0 };
const review = [];
const missing = [];
for (const year of YEARS) {
	const file = join(notesDir, `${year}.json`);
	const notes = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	let changed = false;
	for (const event of await eventsOf(year)) {
		const race = raceOf(year, event);
		if (!race) {
			missing.push(`${year} ${event} (no F1DB race by that name)`);
			continue;
		}
		const t = await lapsOf(year, event);
		if (!t?.lap?.length) {
			missing.push(`${title(race)} (no lap data)`);
			continue;
		}
		const results = resultsOf.get(race.id);
		const idOf = (key) => {
			const [num, abbr] = key.split("|");
			return (results.find((r) => String(r.driverNumber) === num) ?? results.find((r) => driverById.get(r.driverId)?.abbreviation === abbr))?.driverId;
		};
		const note = notes[race.round] ?? {};
		const stints = stintsByDriver(t);
		let touched = false;
		if (note.tyres == null) {
			const order = new Map(results.map((r, i) => [r.driverId, r.positionDisplayOrder ?? i]));
			const tyres = [...stints].map(([key, list]) => [idOf(key), setsOf(list)]).filter(([id, codes]) => id && codes.length);
			if (tyres.length) {
				note.tyres = Object.fromEntries(tyres.sort((a, b) => order.get(a[0]) - order.get(b[0])).map(([id, codes]) => [id, codes.join(" ")]));
				note.sources = [...new Set([...(note.sources ?? []), `https://github.com/TracingInsights/${year}/tree/main/${encodeURIComponent(event)}/Race`])];
				added.tyres++;
				touched = true;
			}
		}
		const weather = weatherFromStints([...stints.values()].flat());
		if (weather && note.weather == null) {
			note.weather = weather;
			added.weather++;
			touched = true;
		} else if (weather && note.weather !== weather) review.push(`${title(race)}: weather is "${note.weather}", the tyres used say "${weather}"`);
		if (touched) {
			notes[race.round] = note;
			changed = true;
		}
	}
	if (!dry && changed) {
		const sorted = Object.fromEntries(Object.entries(notes).sort((a, b) => Number(a[0]) - Number(b[0])));
		writeFileSync(file, `${JSON.stringify(sorted, null, "\t")}\n`);
	}
}

console.log(`${dry ? "Would add" : "Added"}: tyres for ${added.tyres} races, weather for ${added.weather} races.`);
if (missing.length) console.log(`Not found:\n  ${missing.join("\n  ")}`);
if (review.length) console.log(`Left as they are, to check by hand:\n  ${review.join("\n  ")}`);
if (!dry) {
	const check = buildRaceNotes(notesDir, { races, drivers, raceResults });
	for (const e of check.errors) console.log(`error: ${e}`);
	console.log(check.errors.length ? "Fix the errors above (or remove those entries) before building." : "The notes pass the build's checks.");
}
