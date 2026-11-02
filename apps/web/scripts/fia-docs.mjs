// The FIA's published Formula 1 documents (2018 on): stewards' decisions, deleted lap times, power unit
// elements, Pirelli's tyre notes and more, one PDF each. fia.com sits behind a bot check, so they're read
// from TracingInsights' mirror of them (github.com/TracingInsights/DDocs, updated every few hours).
// This fetches the ones worth reading into .cache/fia (never committed) and turns their text into data
// (scripts/lib/fia-parse.mjs).
//
//   node scripts/fia-docs.mjs index [year...]     list every document of those seasons, from the mirror's manifest
//   node scripts/fia-docs.mjs fetch [year...]     download the documents worth reading and keep their text
//   node scripts/fia-docs.mjs parse [year...]     write data/stewards/<year>.json from the text
//   node scripts/fia-docs.mjs notes [year...]     add Pirelli's compounds to the race notes where they have none
//
// Text comes from pdftotext (poppler; Git for Windows ships it).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".cache", "fia");
const MIRROR = "https://raw.githubusercontent.com/TracingInsights/DDocs/main";
const MANIFEST = "https://cdn.jsdelivr.net/gh/TracingInsights/DDocs@latest/documents/manifest.json";
const HEADERS = { "User-Agent": "Pitwall data import (https://pitwall.phaseo.app)" };
const [command = "index", ...args] = process.argv.slice(2);
const years = args.length ? args.map(Number) : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

let last = 0;
async function get(url, binary = false) {
	for (let attempt = 1; ; attempt++) {
		const wait = last + 250 - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		last = Date.now();
		const res = await fetch(url, { headers: HEADERS });
		if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
		if (res.status === 404) return null;
		if (attempt >= 5) throw new Error(`${res.status} for ${url}`);
		await new Promise((r) => setTimeout(r, (res.status === 429 ? 30_000 : 3000) * attempt));
	}
}
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(data, null, "\t")}\n`);
};

/* --------------------------------------------------------------- index --- */

/** A document's title from its file name: "infringement-car-11-causing-a-collision.pdf" -> "infringement car 11 causing a collision". */
function titleOf(file, year, event) {
	let t = file.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
	// 2018's names repeat the event and year: "2018 australian grand prix 2018 offence car 38 ..."
	t = t.replace(new RegExp(`^(?:${year} )?${event.replace(/-/g, " ")} (?:${year} )?`, "i"), "");
	return t.replace(/ doc \d+$/i, "");
}

/** A season's documents from the mirror's manifest: [{ event, doc, title, url }]. */
async function indexSeason(year) {
	const file = join(cacheDir, "manifest.json");
	if (!existsSync(file)) {
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(file, await get(MANIFEST));
	}
	const manifest = readJson(file, {});
	return Object.values(manifest)
		.filter((d) => d.source === "decision" && d.year === year)
		.map((d) => {
			const parts = String(d.path).split(/[\\/]/);
			const [event, name] = [parts.at(-2), parts.at(-1)];
			return { event: event.replace(/-/g, " "), doc: d.doc_number ?? null, title: titleOf(name, year, event), url: `${MIRROR}/${parts.map(encodeURIComponent).join("/")}` };
		});
}

/* --------------------------------------------------------------- fetch --- */

/** The documents worth reading: the stewards' decisions and the reports the data comes from. */
export const WANTED = /\b(decision|infringement|offence|deleted lap|pirelli preview|new pu elements|penalty points|reprimand)\b/i;

/** Where a document's text goes: .cache/fia/text/<year>/<event>/<file name>.txt (file names repeat across events). */
export const textFile = (year, url) => {
	const [event, name] = url.split("/").slice(-2).map((p) => decodeURIComponent(p).replace(/[^\w.-]+/g, "_"));
	return join(cacheDir, "text", String(year), event, `${name.replace(/\.pdf$/i, "")}.txt`);
};

/** Downloads each wanted document and keeps its text; the PDF itself goes through one scratch file. */
async function fetchSeason(year) {
	const index = readJson(join(cacheDir, `index-${year}.json`), null);
	if (!index) throw new Error(`No index for ${year}: run "index ${year}" first`);
	const scratch = join(cacheDir, "scratch.pdf");
	let fetched = 0;
	for (const d of index.filter((x) => WANTED.test(x.title))) {
		const txt = textFile(year, d.url);
		if (existsSync(txt)) continue;
		const body = await get(d.url, true);
		mkdirSync(dirname(txt), { recursive: true });
		if (!body) {
			writeFileSync(txt, "");
			continue;
		}
		writeFileSync(scratch, body);
		try {
			execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", scratch, txt]);
		} catch {
			writeFileSync(txt, "");
		}
		fetched++;
	}
	return fetched;
}

/* ---------------------------------------------------------------- main --- */

if (command === "index") {
	for (const year of years) {
		const docs = await indexSeason(year);
		writeJson(join(cacheDir, `index-${year}.json`), docs);
		console.log(`${year}: ${docs.length} documents in ${new Set(docs.map((d) => d.event)).size} events, ${docs.filter((d) => WANTED.test(d.title)).length} worth reading`);
	}
} else if (command === "fetch") {
	for (const year of years) console.log(`${year}: fetched ${await fetchSeason(year)} documents`);
} else if (command === "parse") {
	const { parseSeason } = await import("./lib/fia-parse.mjs");
	for (const year of years) {
		const out = parseSeason(year, cacheDir);
		writeJson(join(root, "data", "stewards", `${year}.json`), out.data);
		console.log(`${year}: ${out.summary}`);
	}
} else if (command === "notes") {
	// Pirelli's compounds into the race notes, for rounds that don't have them yet
	let added = 0;
	for (const year of years) {
		const stewards = readJson(join(root, "data", "stewards", `${year}.json`), {});
		const file = join(root, "data", "race-notes", `${year}.json`);
		const notes = readJson(file, {});
		let changed = false;
		for (const [round, r] of Object.entries(stewards)) {
			if (!r.compounds || notes[round]?.compounds) continue;
			notes[round] = { ...notes[round], compounds: r.compounds };
			added++;
			changed = true;
		}
		if (changed) writeJson(file, Object.fromEntries(Object.entries(notes).sort((a, b) => Number(a[0]) - Number(b[0]))));
	}
	console.log(`Added Pirelli's compounds to ${added} races' notes.`);
} else {
	console.log("Usage: node scripts/fia-docs.mjs index|fetch|parse|notes [year...]");
}
