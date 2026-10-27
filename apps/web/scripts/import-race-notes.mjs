// Seeds data/race-notes/ from Wikipedia (text CC BY-SA 4.0; see data/race-notes/README.md), filling only what
// isn't there yet: anything already in a notes file, typed by hand or imported before, is never changed.
//
//   node scripts/import-race-notes.mjs           fetch (cached in .cache/wikipedia), merge, report
//   node scripts/import-race-notes.mjs --dry     report what it would add, write nothing
//
// What it takes:
//   - red flags, 1971 on: "List of red-flagged Formula One races" (the lap each race was stopped on)
//   - safety cars 1973-2021 and virtual safety cars 2015-2021: the deployment tables of the "Safety car"
//     article as of February 2022 (revision 1072024350; they were removed from the article after that)
//   - weather: each race article's infobox, read as dry / wet / mixed where the words are clear
//   - compounds, 2019 on: the race article's "Tyre choices" ("brought the C1, C2, and C3 ...")
// The tables have gaps, so a race without a safety car here may still have had one.
//
// Reads F1DB from ./f1db (or F1DB_DIR).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRaceNotes } from "./lib/race-notes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(process.env.F1DB_DIR ?? join(root, "f1db"));
const notesDir = join(root, "data", "race-notes");
const cacheDir = join(root, ".cache", "wikipedia");
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
const raceByTitle = new Map(run.map((r) => [title(r).toLowerCase(), r]));
const SAFETY_CAR_REVISION = 1072024350;
const link = (t) => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;

/* ------------------------------------------------------------ fetching --- */

const API = "https://en.wikipedia.org/w/api.php";
const HEADERS = { "User-Agent": "Pitwall race notes import (https://pitwall.phaseo.app)" };

async function api(params) {
	const key = Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&").replace(/[^\w.=&-]+/g, "_").slice(0, 180);
	const file = join(cacheDir, `${key}.json`);
	if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
	const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, { headers: HEADERS });
		if (res.ok) {
			const json = await res.json();
			mkdirSync(cacheDir, { recursive: true });
			writeFileSync(file, JSON.stringify(json));
			return json;
		}
		if (attempt >= 4) throw new Error(`Wikipedia ${res.status} for ${url}`);
		await new Promise((r) => setTimeout(r, 2000 * attempt));
	}
}

const pageText = async (page) => (await api({ action: "parse", page, prop: "wikitext" })).parse.wikitext;
const revisionText = async (oldid) => (await api({ action: "parse", oldid: String(oldid), prop: "wikitext" })).parse.wikitext;

/** Wikitext of many articles, 50 at a time, keyed by the title asked for (redirects followed). */
async function articles(titles) {
	const out = new Map();
	for (let i = 0; i < titles.length; i += 50) {
		const batch = titles.slice(i, i + 50);
		const json = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: batch.join("|") });
		const back = new Map(batch.map((t) => [t, t]));
		for (const n of json.query.normalized ?? []) back.set(n.to, back.get(n.from) ?? n.from);
		for (const r of json.query.redirects ?? []) back.set(r.to, back.get(r.from) ?? r.from);
		for (const p of json.query.pages ?? []) if (!p.missing) out.set(back.get(p.title) ?? p.title, p.revisions?.[0]?.slots?.main?.content ?? "");
	}
	return out;
}

/* ------------------------------------------------------------- parsing --- */

/** Rows of every wikitable in a piece of wikitext: arrays of raw cell text. */
function tableRows(text) {
	const rows = [];
	for (const table of text.split(/\n\{\|/).slice(1)) {
		const body = table.split(/\n\|\}/)[0];
		for (const row of body.split(/\n\|-[^\n]*/).slice(1)) {
			const cells = [];
			for (const line of row.split("\n")) {
				if (!/^[|!]/.test(line)) {
					if (cells.length) cells[cells.length - 1] += `\n${line}`;
					continue;
				}
				for (const cell of line.slice(1).split(/\|\||!!/)) {
					// "align=center | 64": drop the attributes before a single "|" outside [[links]] and {{templates}}
					const plain = cell.replace(/\[\[[^\]]*\]\]|\{\{[^}]*\}\}/g, (m) => "\0".repeat(m.length));
					const bar = plain.search(/(?<!\|)\|(?!\|)/);
					cells.push((bar >= 0 && /=/.test(cell.slice(0, bar)) ? cell.slice(bar + 1) : cell).trim());
				}
			}
			rows.push(cells);
		}
	}
	return rows;
}

const firstRace = (cell) => {
	for (const m of cell.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g)) {
		const race = raceByTitle.get(m[1].trim().toLowerCase());
		if (race) return race;
	}
	return null;
};
const plainText = (s) => s.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/\{\{[^}]*\}\}/g, "").replace(/<[^>]+>/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").trim();
const lapNumber = (cell) => {
	const t = plainText(cell).toLowerCase();
	if (/^(start|formation|grid)/.test(t)) return 1;
	const m = t.match(/^\d+/);
	return m ? Number(m[0]) : null;
};

/* -------------------------------------------------------------- import --- */

const found = new Map(); // raceId -> { neutralised: [], weather, compounds, sources: Set }
const at = (race) => found.get(race.id) ?? found.set(race.id, { race, neutralised: [], weather: null, compounds: null, sources: new Set() }).get(race.id);
const skipped = [];

function addPeriod(race, type, from, to, source) {
	const max = lapsOf.get(race.id);
	// a race stopped and counted back (e.g. stopped on lap 56, classified after 54) ends at its last counted lap
	if (from != null && from > max && from - max <= 3) from = max;
	if (to != null && to > max && to - max <= 3) to = max;
	if (from == null || to == null || from < 1 || to < from || to > max) {
		skipped.push(`${title(race)} ${type} ${from}-${to} (race ${max} laps)`);
		return;
	}
	if (type === "VSC" && race.year < 2015) return skipped.push(`${title(race)} VSC before 2015`);
	const x = at(race);
	x.neutralised.push(type === "RF" ? { type, lap: from } : { type, from, to });
	x.sources.add(source);
}

// red flags
const redFlags = "List of red-flagged Formula One races";
for (const cells of tableRows(await pageText(redFlags))) {
	const i = cells.findIndex((c) => firstRace(c));
	if (i < 0) continue;
	const race = firstRace(cells[i]);
	const lap = lapNumber(cells[i + 1] ?? "");
	if (lap === 0) continue; // stopped before a lap was completed: nothing to mark
	addPeriod(race, "RF", lap, lap, link(redFlags));
}

// safety cars and virtual safety cars (the article's tables as of February 2022)
const scText = await revisionText(SAFETY_CAR_REVISION);
const scSource = `https://en.wikipedia.org/w/index.php?title=Safety_car&oldid=${SAFETY_CAR_REVISION}`;
const vscStart = scText.indexOf("List of virtual safety car deployments");
const carsList = scText.indexOf("List of Formula One safety cars");
for (const [type, text] of [
	["SC", scText.slice(0, carsList > 0 ? carsList : vscStart)],
	["VSC", scText.slice(vscStart)],
]) {
	for (const cells of tableRows(text)) {
		const i = cells.findIndex((c) => firstRace(c));
		if (i < 0 || cells.length < i + 4) continue;
		// Grand Prix | cause | deployed (lap) | withdrawn / ended (lap): out from one to the other, inclusive;
		// "finish" / "end of race": it was still out at the flag
		const race = firstRace(cells[i]);
		const end = /finish|end|chequer|flag/i.test(plainText(cells[i + 3])) && lapNumber(cells[i + 3]) == null ? lapsOf.get(race.id) : lapNumber(cells[i + 3]);
		addPeriod(race, type, lapNumber(cells[i + 2]), end, scSource);
	}
}

// weather and compounds from each race's article
function weatherOf(text) {
	const m = text.match(/\n\s*\|\s*[Ww]eather\s*=([^\n]*)/);
	if (!m) return null;
	const w = plainText(m[1]).toLowerCase();
	if (!w || /threat|risk|chance|forecast|expected|possible/.test(w)) return null;
	const wet = /\b(wet|rain\w*|showers?|drizzle|damp|storm\w*|thunder\w*|downpour)\b/.test(w);
	const dry = /\b(dry\w*|sunny|sun|clear|fine|cloudy|overcast|hot|warm|mild|bright|fair)\b/.test(w);
	if (wet && (dry || /\b(later|then|initially|until|stopp\w*|eas\w*)\b/.test(w))) return "mixed";
	if (wet) return "wet";
	return dry ? "dry" : null;
}
function compoundsOf(text) {
	const section = text.match(/===\s*Tyre choices?\s*===([\s\S]*?)\n==/)?.[1];
	if (!section) return null;
	const cs = [...new Set([...plainText(section).matchAll(/\bC(\d)\b/g)].map((m) => Number(m[1])))].sort();
	if (cs.length !== 3 || cs[2] - cs[0] > 4) return null;
	return { H: `C${cs[0]}`, M: `C${cs[1]}`, S: `C${cs[2]}` };
}
const texts = await articles(run.map(title));
let noArticle = 0;
for (const race of run) {
	const text = texts.get(title(race));
	if (!text) {
		noArticle++;
		continue;
	}
	const weather = weatherOf(text);
	const compounds = race.year >= 2019 ? compoundsOf(text) : null;
	if (!weather && !compounds) continue;
	const x = at(race);
	x.weather = weather;
	x.compounds = compounds;
	x.sources.add(link(title(race)));
}

/* --------------------------------------------------------------- merge --- */

const byYear = new Map();
for (const x of found.values()) (byYear.get(x.race.year) ?? byYear.set(x.race.year, []).get(x.race.year)).push(x);
const added = { neutralised: 0, weather: 0, compounds: 0 };
const review = [];
for (const [year, list] of [...byYear].sort((a, b) => a[0] - b[0])) {
	const file = join(notesDir, `${year}.json`);
	const notes = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
	for (const x of list.sort((a, b) => a.race.round - b.race.round)) {
		const note = notes[x.race.round] ?? {};
		let changed = false;
		if (x.weather && note.weather == null) {
			note.weather = x.weather;
			added.weather++;
			changed = true;
		}
		if (x.neutralised.length && note.neutralised == null) {
			// a VSC "turned into a full SC" ends on the lap the safety car came out
			for (const v of x.neutralised.filter((n) => n.type === "VSC"))
				for (const s of x.neutralised.filter((n) => n.type === "SC")) if (s.from >= v.from && s.from < v.to) v.to = s.from;
			const sorted = x.neutralised.sort((a, b) => (a.from ?? a.lap) - (b.from ?? b.lap) || (a.to ?? a.lap) - (b.to ?? b.lap));
			// two cars out at once means the source is wrong somewhere: leave the race for a person to check
			const clash = sorted.filter((n) => n.type !== "RF").some((n, i, cars) => i > 0 && n.from < cars[i - 1].to);
			if (clash) review.push(`${title(x.race)}: ${sorted.map((n) => `${n.type} ${n.lap ?? `${n.from}-${n.to}`}`).join(", ")} overlap`);
			else {
				note.neutralised = sorted;
				added.neutralised += sorted.length;
				changed = true;
			}
		}
		if (x.compounds && note.compounds == null) {
			note.compounds = x.compounds;
			added.compounds++;
			changed = true;
		}
		if (!changed) continue;
		note.sources = [...new Set([...(note.sources ?? []), ...x.sources])];
		notes[x.race.round] = note;
	}
	const sorted = Object.fromEntries(Object.entries(notes).sort((a, b) => Number(a[0]) - Number(b[0])));
	if (!dry && Object.keys(sorted).length) {
		mkdirSync(notesDir, { recursive: true });
		writeFileSync(file, `${JSON.stringify(sorted, null, "\t")}\n`);
	}
}

console.log(`${dry ? "Would add" : "Added"}: ${added.neutralised} SC/VSC/red flag periods, weather for ${added.weather} races, compounds for ${added.compounds} races.`);
console.log(`${run.length - noArticle}/${run.length} race articles found.`);
if (skipped.length) console.log(`Skipped ${skipped.length} that don't fit F1DB's laps:\n  ${skipped.join("\n  ")}`);
if (review.length) console.log(`Left out (the source contradicts itself; enter these by hand):\n  ${review.join("\n  ")}`);
if (!dry) {
	const check = buildRaceNotes(notesDir, { races, drivers, raceResults });
	for (const e of check.errors) console.log(`error: ${e}`);
	console.log(check.errors.length ? "Fix the errors above (or remove those entries) before building." : "The notes pass the build's checks.");
}
