// Fills data/race-notes/ from OpenF1 (https://openf1.org, 2023 on; CC BY-NC-SA 4.0, see
// data/race-notes/README.md), only where a round doesn't have it yet:
//   - tyres: each driver's compounds, stint by stint, from /v1/stints
//   - neutralised: safety cars, virtual safety cars and red flags, from /v1/race_control. A round that only
//     has red flags (the Wikipedia import has nothing else from 2022) gets the full list, as long as it has
//     the same red flags; otherwise it's listed for a person to check
//   - weather: from the tyres used (wet tyres all race, some of it, or none), for rounds without any;
//     where a round has weather that disagrees, it's listed, not changed
//
//   node scripts/import-openf1.mjs           fetch (cached in .cache/openf1), merge, report
//   node scripts/import-openf1.mjs --dry     report what it would add, write nothing
//
// Reads F1DB from ./f1db (or F1DB_DIR).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRaceNotes } from "./lib/race-notes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(process.env.F1DB_DIR ?? join(root, "f1db"));
const notesDir = join(root, "data", "race-notes");
const cacheDir = join(root, ".cache", "openf1");
const dry = process.argv.includes("--dry");
const load = (name) => JSON.parse(readFileSync(join(srcDir, `f1db-${name}.json`), "utf8"));
const FROM = 2023;

const races = load("races");
const raceResults = load("races-race-results");
const drivers = load("drivers");
const resultsOf = new Map();
for (const r of raceResults) (resultsOf.get(r.raceId) ?? resultsOf.set(r.raceId, []).get(r.raceId)).push(r);
const grandsPrix = new Map(load("grands-prix").map((g) => [g.id, g]));
const title = (r) => `${r.year} ${grandsPrix.get(r.grandPrixId)?.fullName ?? r.grandPrixId}`;

/* ------------------------------------------------------------ fetching --- */

const API = "https://api.openf1.org/v1";
let last = 0;
async function api(path) {
	const file = join(cacheDir, `${path.replace(/[^\w.=&-]+/g, "_")}.json`);
	if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
	for (let attempt = 1; ; attempt++) {
		// gently: well inside the free tier's limits
		const wait = last + 2100 - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		last = Date.now();
		const res = await fetch(`${API}/${path}`, { headers: { "User-Agent": "Pitwall race notes import (https://pitwall.phaseo.app)" } });
		if (res.ok) {
			const json = await res.json();
			mkdirSync(cacheDir, { recursive: true });
			writeFileSync(file, JSON.stringify(json));
			return json;
		}
		// no data for the session yet
		if (res.status === 404) return [];
		if (attempt >= 5) throw new Error(`OpenF1 ${res.status} for ${path}`);
		await new Promise((r) => setTimeout(r, 5000 * attempt));
	}
}

/* ------------------------------------------------------------- reading --- */

/** Safety cars, VSCs and red flags from the race control messages, as race-notes entries. */
function neutralisations(messages, raceLaps) {
	const out = [];
	let sc = null;
	let vsc = null;
	const close = (lap) => {
		if (sc) out.push({ type: "SC", from: sc, to: Math.max(sc, lap) });
		if (vsc) out.push({ type: "VSC", from: vsc, to: Math.max(vsc, lap) });
		sc = vsc = null;
	};
	for (const m of [...messages].sort((a, b) => a.date.localeCompare(b.date))) {
		const msg = m.message ?? "";
		const lap = Math.min(m.lap_number ?? 1, raceLaps);
		if (/CHEQUERED FLAG/.test(msg)) {
			close(lap);
			break;
		}
		if ((m.category === "Flag" && m.flag === "RED") || /^RED FLAG/.test(msg)) {
			close(lap);
			if (!out.some((n) => n.type === "RF" && n.lap === lap)) out.push({ type: "RF", lap });
		} else if (/^(VIRTUAL SAFETY CAR|VSC) DEPLOYED/.test(msg)) vsc ??= lap;
		else if (/^(VIRTUAL SAFETY CAR|VSC) ENDING/.test(msg) && vsc) {
			out.push({ type: "VSC", from: vsc, to: lap });
			vsc = null;
		} else if (/^SAFETY CAR DEPLOYED|^RACE WILL START BEHIND THE SAFETY CAR/.test(msg)) {
			// a VSC turned into a full safety car ends as it comes out
			if (vsc) out.push({ type: "VSC", from: vsc, to: lap });
			vsc = null;
			sc ??= lap;
		} else if (/^SAFETY CAR IN THIS LAP/.test(msg) && sc) {
			out.push({ type: "SC", from: sc, to: lap });
			sc = null;
		}
	}
	close(raceLaps);
	return out.sort((a, b) => (a.from ?? a.lap) - (b.from ?? b.lap) || (a.to ?? a.lap) - (b.to ?? b.lap));
}

const CODE = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W" };

/**
 * Each driver's compounds ("M H"), keyed by F1DB id, for drivers in the race's results. OpenF1 splits one
 * set of tyres into several stints at times (the field led through the pit lane behind the safety car, a
 * red flag), so a stint on tyres as old as an earlier set's would be by then is that set, and "stops" on
 * the same compound a lap apart are passes through the pit lane, the first of them included.
 */
function tyresOf(stints, results) {
	const byNumber = new Map(results.map((r) => [String(r.driverNumber), r.driverId]));
	const raw = new Map();
	for (const s of [...stints].sort((a, b) => a.stint_number - b.stint_number)) {
		const id = byNumber.get(String(s.driver_number));
		if (id) (raw.get(id) ?? raw.set(id, []).get(id)).push(s);
	}
	const per = new Map();
	for (const [id, list] of raw) {
		const sets = [];
		for (const s of list) {
			const code = CODE[s.compound] ?? "?";
			if (s.lap_start != null && s.tyre_age_at_start > 0) {
				// the earliest set it continues, with only the same compound since
				let j = Math.max(0, sets.length - 1);
				while (j > 0 && sets[j - 1].code === code && sets.slice(j - 1).every((x) => x.code === code)) j--;
				for (; j < sets.length; j++) {
					const set = sets[j];
					if (set.code === code && set.start != null && s.tyre_age_at_start >= set.age + (s.lap_start - set.start) - 1) break;
				}
				if (j < sets.length) {
					sets.length = j + 1;
					sets[j].end = Math.max(sets[j].end ?? 0, s.lap_end ?? 0);
					sets[j].last = s.lap_start;
					continue;
				}
			}
			const prev = sets.at(-1);
			if (prev && prev.code === code && s.lap_start != null && prev.last != null && s.lap_start - prev.last <= 1) {
				prev.end = Math.max(prev.end ?? 0, s.lap_end ?? 0);
				prev.last = s.lap_start;
				// the run's first "stop" was a pass through the pit lane too
				const before = sets.at(-2);
				if (before && before.code === code && prev.start - (before.last ?? before.start) > 1) {
					before.end = prev.end;
					before.last = prev.last;
					sets.pop();
				}
				continue;
			}
			sets.push({ code, start: s.lap_start, end: s.lap_end, age: s.tyre_age_at_start ?? 0, last: s.lap_start });
		}
		per.set(id, sets.map((x) => x.code));
	}
	return per;
}

/** dry / wet / mixed from the tyres the field used: wet tyres all race, for some of it, or not at all. */
function weatherOf(stints) {
	let wet = 0;
	let all = 0;
	for (const s of stints) {
		if (s.lap_start == null || s.lap_end == null) continue;
		const laps = s.lap_end - s.lap_start + 1;
		all += laps;
		if (s.compound === "INTERMEDIATE" || s.compound === "WET") wet += laps;
	}
	if (!all) return null;
	if (wet === 0) return "dry";
	return wet / all >= 0.9 ? "wet" : "mixed";
}

/* --------------------------------------------------------------- merge --- */

const added = { tyres: 0, neutralised: 0, weather: 0 };
const review = [];
const missing = [];
const years = [...new Set(races.filter((r) => r.year >= FROM && resultsOf.has(r.id)).map((r) => r.year))].sort();
for (const year of years) {
	const sessions = (await api(`sessions?year=${year}&session_name=Race`)).filter((s) => !s.is_cancelled);
	const file = join(notesDir, `${year}.json`);
	const notes = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	for (const race of races.filter((r) => r.year === year && resultsOf.has(r.id))) {
		// F1DB dates races locally; a night race can fall on the next day in UTC
		const day = Date.parse(race.date);
		const session = sessions.find((s) => Math.abs(Date.parse(s.date_start.slice(0, 10)) - day) <= 86_400_000);
		if (!session) {
			missing.push(title(race));
			continue;
		}
		const results = resultsOf.get(race.id);
		const raceLaps = Math.max(race.laps ?? 0, ...results.map((r) => r.laps ?? 0));
		const [control, stints] = [await api(`race_control?session_key=${session.session_key}`), await api(`stints?session_key=${session.session_key}`)];
		if (!control.length && !stints.length) {
			missing.push(title(race));
			continue;
		}
		const note = notes[race.round] ?? {};
		const sources = [];
		let changed = false;

		// tyres
		const tyres = tyresOf(stints, results);
		if (tyres.size && note.tyres == null) {
			const order = new Map(results.map((r, i) => [r.driverId, r.positionDisplayOrder ?? i]));
			note.tyres = Object.fromEntries([...tyres].sort((a, b) => order.get(a[0]) - order.get(b[0])).map(([id, codes]) => [id, codes.join(" ")]));
			added.tyres++;
			sources.push(`${API}/stints?session_key=${session.session_key}`);
			changed = true;
		}

		// safety cars, VSCs, red flags
		if (control.length) {
			const found = neutralisations(control, raceLaps);
			const have = note.neutralised ?? null;
			const reds = (list) => list.filter((n) => n.type === "RF").map((n) => n.lap ?? n.from);
			const onlyReds = have != null && have.every((n) => n.type === "RF");
			if (have == null || (onlyReds && found.some((n) => n.type !== "RF"))) {
				const theirs = reds(found);
				// the red flags already there should be in OpenF1's list, give or take a lap
				const agree = (have ?? []).every((n) => theirs.some((l) => Math.abs(l - (n.lap ?? n.from)) <= 1));
				if (!agree) review.push(`${title(race)}: has red flags on laps ${reds(have).join(", ")}, OpenF1 on ${theirs.join(", ") || "none"}`);
				else if (found.length || have == null) {
					note.neutralised = found;
					added.neutralised += found.length;
					sources.push(`${API}/race_control?session_key=${session.session_key}`);
					changed = true;
				}
			}
		}

		// weather
		const weather = weatherOf(stints);
		if (weather && note.weather == null) {
			note.weather = weather;
			added.weather++;
			changed = true;
		} else if (weather && note.weather !== weather) review.push(`${title(race)}: weather is "${note.weather}", the tyres used say "${weather}"`);

		if (!changed) continue;
		note.sources = [...new Set([...(note.sources ?? []), ...sources])];
		notes[race.round] = note;
	}
	const sorted = Object.fromEntries(Object.entries(notes).sort((a, b) => Number(a[0]) - Number(b[0])));
	if (!dry && Object.keys(sorted).length) {
		mkdirSync(notesDir, { recursive: true });
		writeFileSync(file, `${JSON.stringify(sorted, null, "\t")}\n`);
	}
}

console.log(`${dry ? "Would add" : "Added"}: tyres for ${added.tyres} races, ${added.neutralised} SC/VSC/red flag periods, weather for ${added.weather} races.`);
if (missing.length) console.log(`No OpenF1 data (yet) for:\n  ${missing.join("\n  ")}`);
if (review.length) console.log(`Left as they are, to check by hand:\n  ${review.join("\n  ")}`);
if (!dry) {
	const check = buildRaceNotes(notesDir, { races, drivers, raceResults });
	for (const e of check.errors) console.log(`error: ${e}`);
	for (const w of check.warnings.slice(0, 30)) console.log(`warning: ${w}`);
	console.log(check.errors.length ? "Fix the errors above (or remove those entries) before building." : "The notes pass the build's checks.");
}
