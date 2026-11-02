// Reads the text of the FIA's documents (scripts/fia-docs.mjs) into data, per race:
//   - decisions: each stewards' decision on a car (who, which session, what for, and the penalty)
//   - deletedLaps: lap times deleted for leaving the track, per session and driver
//   - newPu: power unit elements fitted new at the event, per driver
//   - compounds: the three dry compounds Pirelli brought (from the Pirelli preview)
// Races and drivers are matched to F1DB (cars by their number in the race's results).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const srcDir = resolve(process.env.F1DB_DIR ?? join(import.meta.dirname, "..", "..", "f1db"));
const load = (name) => JSON.parse(readFileSync(join(srcDir, `f1db-${name}.json`), "utf8"));
let f1db = null;
function db() {
	if (f1db) return f1db;
	const races = load("races");
	const results = load("races-race-results");
	const grandsPrix = new Map(load("grands-prix").map((g) => [g.id, g]));
	const drivers = new Map(load("drivers").map((d) => [d.id, d]));
	const resultsOf = new Map();
	for (const r of results) (resultsOf.get(r.raceId) ?? resultsOf.set(r.raceId, []).get(r.raceId)).push(r);
	f1db = { races, grandsPrix, drivers, resultsOf };
	return f1db;
}

const norm = (s) =>
	s
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/^formula 1 /, "")
		.replace(/ - right of review$/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
/** The FIA's event names, where F1DB's differ. */
const ALIAS = {
	"grand prix of japan": "japanese grand prix",
	"saudi arabia grand prix": "saudi arabian grand prix",
	"mexican grand prix": "mexico city grand prix",
	"barcelona catalunya grand prix": "spanish grand prix",
	"sao paulo grand prix": "sao paulo grand prix",
	"brazilian grand prix": "sao paulo grand prix",
};

/** F1DB's race for an FIA event name in a season. */
export function raceFor(year, event) {
	const { races, grandsPrix, resultsOf } = db();
	const want = norm(event);
	const names = (r) => {
		const g = grandsPrix.get(r.grandPrixId);
		return [g?.fullName, g?.name, g?.shortName].filter(Boolean).map(norm);
	};
	const season = races.filter((r) => r.year === year && resultsOf.has(r.id));
	return season.find((r) => names(r).includes(want)) ?? season.find((r) => names(r).includes(ALIAS[want] ?? "")) ?? (ALIAS[want] ? null : season.find((r) => names(r).some((n) => n.includes(want) || want.includes(n)))) ?? null;
}

/* ----------------------------------------------------------- decisions --- */

/** A labelled field of a decision document: the text after "Label" up to the next label. */
function field(text, label) {
	const re = new RegExp(`^\\s*${label}\\s+([\\s\\S]*?)(?=^\\s*(?:No \\/ Driver|Competitor|Time|Session|Fact|Infringement|Offence|Decision|Reason|Competitors are reminded)\\b)`, "m");
	return re.exec(text)?.[1].replace(/\s+/g, " ").trim() ?? null;
}

/** The penalties in a decision's wording. */
export function penaltiesOf(decision) {
	const WORDS = { one: 1, two: 2, three: 3, five: 5, ten: 10, twenty: 20 };
	const d = decision.replace(/\s+/g, " ").replace(/\b(one|two|three|five|ten|twenty)\b(?= ?(?:-| )?(?:second|sec|place|grid|penalty))/gi, (w) => String(WORDS[w.toLowerCase()]));
	const out = [];
	let m;
	if ((m = /(\d+) ?(?:second|sec)s? (?:time )?penalty/i.exec(d)) && !/stop\W*(?:and|&)?\W*go\b/i.test(m[0])) out.push({ type: "time", seconds: Number(m[1]) });
	if ((m = /(\d+)? ?(?:second )?stop\W*(?:and|&)?\W*go\b/i.exec(d))) out.push({ type: "stopGo", seconds: m[1] ? Number(m[1]) : null });
	if ((m = /deletion of (?:the )?(?:relevant )?(\d+ )?lap times?/i.exec(d))) out.push({ type: "lapDeleted", laps: m[1] ? Number(m[1]) : 1 });
	if (/drive[ -]through/i.test(d)) out.push({ type: "driveThrough" });
	if ((m = /(?:drop of|grid penalty of)? ?(\d+) (?:grid )?(?:positions?|places?)(?: grid penalty)?/i.exec(d)) && /grid/i.test(d)) out.push({ type: "grid", places: Number(m[1]) });
	if (/(?:back|rear) of the (?:starting )?grid/i.test(d)) out.push({ type: "backOfGrid" });
	if (/start (?:the (?:race|sprint)(?: and the race)? )?from (?:the )?pit ?lane/i.test(d)) out.push({ type: "pitLane" });
	if (/behind any other classified driver/i.test(d)) out.push({ type: "backOfGrid" });
	if ((m = /(\d+) penalty laps?/i.exec(d))) out.push({ type: "penaltyLap", laps: Number(m[1]) });
	if (/(?:super licence|licence of the driver).{0,60}suspended|suspended from (?:the next|one)/i.test(d)) out.push({ type: "ban" });
	if (/disqualif/i.test(d)) out.push({ type: "dsq" });
	if (/reprimand/i.test(d)) out.push({ type: "reprimand", driving: /\bdriving\b/i.test(d) && !/non[ -]driving/i.test(d) });
	if (/\bwarning\b/i.test(d) || /black and white flag/i.test(d)) out.push({ type: "warning" });
	if ((m = /fined?(?: of)?\s*(?:€|EUR|�|\?)?\s*([\d.,]+)\s*(?:€|EUR|euros?)?/i.exec(d))) out.push({ type: "fine", euros: Number(m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")) });
	if ((m = /(\d+) penalty points?/i.exec(d))) out.push({ type: "points", points: Number(m[1]) });
	if (!out.length && /no further action|no penalty|no action/i.test(d)) out.push({ type: "none" });
	return out;
}

function decisionOf(text) {
	const who = /No \/ Driver\s+(\d+)\s*-\s*([^\n]+)/.exec(text);
	let decision = field(text, "Decision");
	if (!who || !decision) return null;
	let fact = field(text, "Fact");
	let penalties = penaltiesOf(decision);
	// the layout sometimes lifts each value a label up (the penalty beside "Infringement")
	const infringement = field(text, "Infringement") ?? field(text, "Offence");
	if (!penalties.length && infringement && penaltiesOf(infringement).length) {
		[fact, decision] = [infringement === fact ? fact : field(text, "Fact"), infringement];
		penalties = penaltiesOf(decision);
	}
	// no session line (a media matter, or a sprint): the decision often says which
	const session = field(text, "Session") ?? (/sprint (?:time|classification)/i.test(decision) ? "Sprint" : /race (?:time|classification)/i.test(decision) ? "Race" : null);
	return { car: who[1], name: who[2].trim(), session, fact, decision, penalties };
}

/* --------------------------------------------------------- the reports --- */

/** Deleted lap times, per car: the rows of the table, with the turn or without ("1  15  2  Logan Sargeant", "1  18  Lance Stroll"). */
function deletedLaps(text) {
	const cars = new Map();
	for (const m of text.matchAll(/^\s*\d{1,3}\s+(?:(?:\(T?\d+\)|T?\d{1,2})\s+)?(\d{1,2})\s+[A-Z][\p{L}'.-]+/gmu)) cars.set(m[1], (cars.get(m[1]) ?? 0) + 1);
	return cars;
}

const PU = { "internal combustion engine": "ICE", turbocharger: "TC", "mgu-h": "MGU-H", "mgu-k": "MGU-K", "energy store": "ES", "control electronics": "CE", exhaust: "EX" };
/** New power unit elements per car: each "with a new <element>" section's rows ("04  McLaren  Lando Norris  2"). */
function newPu(text) {
	const cars = new Map();
	const parts = text.split(/with (?:a )?new ([^:(\n]+?)\s*(?:\([^)]*\))?\s*:/i);
	for (let i = 1; i < parts.length; i += 2) {
		const kind = Object.entries(PU).find(([k]) => parts[i].toLowerCase().includes(k))?.[1];
		if (!kind) continue;
		const table = parts[i + 1].split(/\n\s*The (?:internal|turbo|mgu|energy|control|exhaust|following)/i)[0];
		for (const m of table.matchAll(/^\s*(\d{1,2})\s+/gm)) {
			const car = String(Number(m[1]));
			cars.set(car, [...(cars.get(car) ?? []), kind]);
		}
	}
	return cars;
}

/** Pirelli's three dry compounds, hardest first. */
function compounds(text) {
	const after = text.slice(Math.max(0, text.search(/compounds? selection|compounds? nominated|selection/i)));
	const cs = [...new Set([...after.matchAll(/\bC([0-6])\b/g)].map((m) => Number(m[1])))].slice(0, 3).sort();
	return cs.length === 3 ? { H: `C${cs[0]}`, M: `C${cs[1]}`, S: `C${cs[2]}` } : null;
}

/* --------------------------------------------------------------- season --- */

const SESSION = (s) => {
	if (!s) return null;
	const t = s.toLowerCase();
	if (/sprint (?:qualifying|shootout)/.test(t)) return "Sprint Qualifying";
	if (/sprint/.test(t)) return "Sprint";
	if (/qualifying/.test(t)) return "Qualifying";
	if (/race|reconnaissance|formation|grid/.test(t)) return "Race";
	const p = /practice\s*(\d)|\bp(\d)\b|fp(\d)/.exec(t);
	return p ? `Practice ${p[1] ?? p[2] ?? p[3]}` : s;
};

export function parseSeason(year, cacheDir) {
	const index = JSON.parse(readFileSync(join(cacheDir, `index-${year}.json`), "utf8"));
	const { drivers, resultsOf } = db();
	// as scripts/fia-docs.mjs textFile
	const text = (url) => {
		const [event, name] = url.split("/").slice(-2).map((p) => decodeURIComponent(p).replace(/[^\w.-]+/g, "_"));
		const file = join(cacheDir, "text", String(year), event, `${name.replace(/\.pdf$/i, "")}.txt`);
		return existsSync(file) ? readFileSync(file, "utf8") : null;
	};
	const data = {};
	const unmatched = new Set();
	const count = { decisions: 0, penalties: 0, deleted: 0, pu: 0, compounds: 0, unknownDriver: 0 };
	for (const d of index) {
		const race = raceFor(year, d.event);
		if (!race) {
			unmatched.add(d.event);
			continue;
		}
		const t = text(d.url);
		if (!t) continue;
		const results = resultsOf.get(race.id) ?? [];
		const driverOf = (car, name) => {
			const byCar = results.find((r) => String(r.driverNumber) === String(Number(car)));
			if (byCar) return byCar.driverId;
			const last = name?.trim().split(/\s+/).at(-1)?.toLowerCase();
			return results.find((r) => drivers.get(r.driverId)?.lastName?.toLowerCase() === last)?.driverId ?? null;
		};
		const round = (data[race.round] ??= { event: d.event });
		const title = d.title.toLowerCase();

		if (/deleted lap/.test(title)) {
			const session = SESSION(field(t, "Session") ?? (/qualifying/.test(title) ? "Qualifying" : /sprint/.test(title) ? "Sprint" : "Race"));
			// one table per document (2021 had one per corner): a corrected or re-published copy replaces the
			// table it corrects, so they're kept per document, the larger count winning, and added up at the end
			const doc = title.replace(/\b(?:corrected|amended|updated|v\d|\d)\b/g, "").replace(/\s+/g, " ").trim();
			const per = ((round._deleted ??= {})[session] ??= {});
			for (const [car, n] of deletedLaps(t)) {
				const id = driverOf(car);
				if (!id) continue;
				const s = (per[doc] ??= {});
				s[id] = Math.max(s[id] ?? 0, n);
			}
		} else if (/new pu elements/.test(title)) {
			for (const [car, kinds] of newPu(t)) {
				const id = driverOf(car);
				if (!id) continue;
				const pu = (round.newPu ??= {});
				pu[id] = [...new Set([...(pu[id] ?? []), ...kinds])];
			}
		} else if (/pirelli preview/.test(title)) {
			const c = compounds(t);
			if (c) round.compounds = c;
		} else if (/\b(decision|infringement|offence)\b/.test(title)) {
			const dec = decisionOf(t);
			if (!dec) continue;
			const driverId = driverOf(dec.car, dec.name);
			if (!driverId) count.unknownDriver++;
			const list = (round.decisions ??= []);
			const offence = d.title.replace(/^.*?\b(decision|infringement|offence)\b/i, "$1").replace(/^(?:decision|infringement|offence)\s+(?:car \d+\s+(?:[a-z]{3}\s+)?)?/i, "").replace(/\s+(?:\d+(?:st|nd|rd|th)|second|third|corrected|amended|\d)$/i, "");
			// re-published copies ("_0", "(2nd)") of one decision: the same car, session and wording
			if (list.some((x) => x.car === dec.car && x.session === SESSION(dec.session) && x.decision === dec.decision && x.fact === dec.fact)) continue;
			if (driverId && dec.penalties.some((p) => p.type === "lapDeleted")) {
				const s = ((round.deletedLaps ??= {})[SESSION(dec.session) ?? "Race"] ??= {});
				s[driverId] = (s[driverId] ?? 0) + dec.penalties.filter((p) => p.type === "lapDeleted").reduce((a, p) => a + p.laps, 0);
			}
			list.push({ doc: d.doc, car: dec.car, driverId, session: SESSION(dec.session), offence, fact: dec.fact, decision: dec.decision, penalties: dec.penalties });
		}
	}
	for (const r of Object.values(data)) {
		for (const [session, docs] of Object.entries(r._deleted ?? {}))
			for (const table of Object.values(docs))
				for (const [id, n] of Object.entries(table)) {
					const s = ((r.deletedLaps ??= {})[session] ??= {});
					s[id] = (s[id] ?? 0) + n;
				}
		delete r._deleted;
		count.decisions += r.decisions?.length ?? 0;
		count.penalties += r.decisions?.filter((x) => x.penalties.some((p) => p.type !== "none")).length ?? 0;
		count.deleted += Object.values(r.deletedLaps ?? {}).reduce((a, s) => a + Object.values(s).reduce((x, y) => x + y, 0), 0);
		count.pu += Object.keys(r.newPu ?? {}).length;
		if (r.compounds) count.compounds++;
	}
	const summary = `${Object.keys(data).length} races, ${count.decisions} decisions (${count.penalties} with a penalty, ${count.unknownDriver} drivers not matched), ${count.deleted} deleted lap times, new PU elements for ${count.pu} driver-races, compounds for ${count.compounds} races${unmatched.size ? `; events not matched: ${[...unmatched].join(", ")}` : ""}`;
	return { data: Object.fromEntries(Object.entries(data).sort((a, b) => Number(a[0]) - Number(b[0]))), summary };
}
