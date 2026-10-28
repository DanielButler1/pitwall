// What every kind of fact shares: the events facts are about, per-subject indexes of when they
// happened, the sentence builders and the scoring helpers. See ../race-facts.ts for the overview.

import type { Db, Race, Result } from "../dataset.ts";
import { isStart } from "../dataset.ts";
import { cached, facts, isClassified, isPodium, isWin, type RaceFacts } from "../records/facts.ts";
import { cDriver, cEngine, cRace, cTeam, cText } from "../records/cells.ts";
import type { Cell } from "../records/types.ts";
import { nationRef } from "../views.ts";

export type FactKind =
	| "title"
	| "lead"
	| "first"
	| "since"
	| "nth"
	| "record"
	| "venue"
	| "ranking"
	| "streak"
	| "streak-end"
	| "grid"
	| "age"
	| "podium"
	| "season"
	| "drought"
	| "chance"
	| "shape"
	| "margin"
	| "quali"
	| "laps"
	| "birthday"
	| "home"
	| "debut"
	| "family"
	| "teammate";

export type RaceFact = {
	/** Stable identity, e.g. "since:constructor:ferrari:win". */
	key: string;
	kind: FactKind;
	/** How surprising it is, roughly 0–10. */
	score: number;
	/** The sentence, with links to drivers, teams, races and seasons. */
	cells: Cell[];
};

export type SubjectKind = "driver" | "constructor" | "nation" | "engine";
export type EventId = "win" | "pole" | "podium" | "points" | "start" | "oneTwo" | "sprintWin" | "sprintStart" | "finish";

export type EventDef = {
	one: string;
	many: string;
	/** How much an event of this kind matters, for scoring. */
	weight: number;
	kinds: SubjectKind[];
	/** Per result (of the sprint with `sprint`); or `race` for events that belong to a whole race (a one-two). */
	test?: (r: Result) => boolean;
	sprint?: boolean;
	/** Only counted (sprint starts, to measure gaps between sprint wins), never a fact itself. */
	quiet?: boolean;
	/** Only its runs are news (a run of classified finishes), not firsts, gaps or totals. */
	runsOnly?: boolean;
	race?: (f: RaceFacts) => string[];
};

export const EVENTS: Record<EventId, EventDef> = {
	win: { one: "win", many: "wins", weight: 3, kinds: ["driver", "constructor", "nation", "engine"], test: isWin },
	pole: { one: "pole position", many: "pole positions", weight: 2.2, kinds: ["driver", "constructor", "nation", "engine"], test: (r) => r.pole },
	podium: { one: "podium", many: "podiums", weight: 2, kinds: ["driver", "constructor", "nation"], test: isPodium },
	points: { one: "points finish", many: "points finishes", weight: 1.2, kinds: ["driver", "constructor"], test: (r) => r.points > 0 },
	start: { one: "Grand Prix", many: "Grands Prix", weight: 1, kinds: ["driver", "constructor"], test: isStart },
	oneTwo: {
		one: "one-two",
		many: "one-twos",
		weight: 2.4,
		kinds: ["constructor"],
		race: (f) => {
			const [a, b] = [f.results.find((r) => r.position === 1), f.results.find((r) => r.position === 2)];
			return a && b && a.constructorId === b.constructorId ? [a.constructorId] : [];
		},
	},
	sprintWin: { one: "sprint win", many: "sprint wins", weight: 1.6, kinds: ["driver", "constructor"], test: isWin, sprint: true },
	finish: { one: "classified finish", many: "classified finishes", weight: 1, kinds: ["driver"], test: isClassified, runsOnly: true },
	sprintStart: { one: "sprint", many: "sprints", weight: 0, kinds: ["driver", "constructor"], test: isStart, sprint: true, quiet: true },
};

/* ------------------------------------------------------------- indexes --- */

export function keyFor(db: Db, kind: SubjectKind, r: Result): string | null {
	if (kind === "driver") return r.driverId;
	if (kind === "constructor") return r.constructorId;
	if (kind === "engine") return r.engineId;
	return db.drivers.get(r.driverId)?.nationality ?? null;
}

/** A nation's facts are made by its drivers, an engine's by the teams using it. */
export const madeBy = (kind: SubjectKind): SubjectKind | null => (kind === "nation" ? "driver" : kind === "engine" ? "constructor" : null);

/** The subjects that had the event in a race. */
export function holders(db: Db, f: RaceFacts, kind: SubjectKind, ev: EventId): Set<string> {
	const def = EVENTS[ev];
	const keys = new Set<string>();
	if (def.race) for (const k of def.race(f)) keys.add(k);
	else for (const r of def.sprint ? f.sprint : f.results) if (def.test!(r)) keys.add(keyFor(db, kind, r) ?? "");
	keys.delete("");
	return keys;
}

/** Races (by index) in which each subject had the event, once per race. `atGp` keys them by Grand Prix too. */
export function occurrences(db: Db, kind: SubjectKind, ev: EventId, atGp = false): Map<string, number[]> {
	return cached(db, `race-facts:${kind}:${ev}:${atGp}`, () => {
		const out = new Map<string, number[]>();
		for (const f of facts(db).races) {
			for (const k of holders(db, f, kind, ev)) {
				const key = atGp ? `${k}@${f.race.grandPrixId}` : k;
				const list = out.get(key);
				if (list) list.push(f.idx);
				else out.set(key, [f.idx]);
			}
		}
		return out;
	});
}

/** Entries of a sorted list that are <= idx. */
export function upTo(list: number[], idx: number): number {
	let lo = 0;
	let hi = list.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (list[mid] <= idx) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Each subject's count of an event up to and including race idx, leaving one subject out. */
export function countsAt(occ: Map<string, number[]>, idx: number, except: string): (readonly [string, number])[] {
	const out: (readonly [string, number])[] = [];
	for (const [k, l] of occ) if (k !== except) out.push([k, upTo(l, idx)] as const);
	return out;
}

export type Run = { key: string; idxs: number[] };

/** Every run of two or more consecutive starts with the event, per subject. */
export function runs(db: Db, kind: SubjectKind, ev: EventId): Run[] {
	return cached(db, `race-facts:runs:${kind}:${ev}`, () => {
		const starts = occurrences(db, kind, "start");
		const had = occurrences(db, kind, ev);
		const out: Run[] = [];
		for (const [key, list] of starts) {
			const yes = new Set(had.get(key));
			let run: number[] = [];
			for (const i of [...list, -1]) {
				if (yes.has(i)) run.push(i);
				else {
					if (run.length > 1) out.push({ key, idxs: run });
					run = [];
				}
			}
		}
		return out;
	});
}

/** The run a subject is on after race idx (its starts up to then that all had the event). */
export function runAt(db: Db, kind: SubjectKind, ev: EventId, id: string, idx: number): number {
	const s = occurrences(db, kind, "start").get(id) ?? [];
	const yes = new Set(occurrences(db, kind, ev).get(id));
	let pos = upTo(s, idx) - 1;
	let L = 0;
	while (pos >= 0 && yes.has(s[pos])) [L, pos] = [L + 1, pos - 1];
	return L;
}

/** Other subjects' runs as they stood after race idx: the longest, and the latest at least `len` long. */
export function compareRuns(db: Db, kind: SubjectKind, ev: EventId, id: string, idx: number, len: number) {
	let longest = 0;
	let since: { key: string; at: number } | null = null;
	for (const run of runs(db, kind, ev)) {
		// the subject's own current run isn't something to compare with
		if (run.idxs[0] > idx || (run.key === id && isCurrent(db, kind, id, run, idx))) continue;
		const n = upTo(run.idxs, idx);
		longest = Math.max(longest, n);
		const at = run.idxs[n - 1];
		if (n >= len && (!since || at > since.at)) since = { key: run.key, at };
	}
	return { longest, since };
}
/** Whether a run is the one the subject is on at race idx (it reaches their latest start by then). */
function isCurrent(db: Db, kind: SubjectKind, id: string, run: Run, idx: number): boolean {
	const s = occurrences(db, kind, "start").get(id) ?? [];
	const last = s[upTo(s, idx) - 1];
	return run.idxs.includes(last);
}

/* ---------------------------------------------------------------- text --- */

export const P = (n: number) => `P${n}`;
const demonym = (db: Db, id: string) => db.countries.get(id)?.demonym ?? nationRef(db, id).name;
const article = (word: string) => (/^[AEIOU]/.test(word) ? "an" : "a");

/** A nation by its demonym, linking to its page: "British". */
export function cDemonym(db: Db, id: string): Cell {
	return { t: "nation", ref: { ...nationRef(db, id), name: demonym(db, id) } };
}
export function aDemonym(db: Db, id: string): (Cell | string)[] {
	return [`${article(demonym(db, id))} `, cDemonym(db, id)];
}

/** A subject with something of theirs: "Ferrari's 250th win", "the 300th win by a British driver", "the 200th win for Mercedes power". */
export function owned(db: Db, kind: SubjectKind, id: string, what: string): (Cell | string)[] {
	if (kind === "nation") return [`the ${what} by `, ...aDemonym(db, id), " driver"];
	if (kind === "engine") return [`the ${what} for `, cEngine(db, id), " power"];
	return [...possessive(subject(db, kind, id)), ` ${what}`];
}
export function subject(db: Db, kind: SubjectKind, id: string): Cell {
	if (kind === "driver") return cDriver(db, id);
	if (kind === "constructor") return cTeam(db, id);
	if (kind === "engine") return cEngine(db, id);
	return { t: "nation", ref: nationRef(db, id) };
}
/** "Norris's" but "Mercedes'". */
export function possessive(cell: Cell): Cell[] {
	const name = "ref" in cell ? cell.ref.name : "";
	return [cell, cText(name.endsWith("s") && !name.endsWith("ss") ? "'" : "'s")];
}
/** A race by its Grand Prix's full name: "the 2016 Spanish Grand Prix". */
export function cRaceFull(db: Db, race: Race): Cell {
	const cell = cRace(db, race);
	return cell.t === "race" ? { t: "race", ref: { ...cell.ref, name: db.grandsPrix.get(race.grandPrixId)?.fullName ?? cell.ref.name } } : cell;
}

/** Joins text pieces and capitalises the start of the sentence. */
export function sentence(...parts: (Cell | string | (Cell | string)[])[]): Cell[] {
	const cells: Cell[] = [];
	for (const p of parts.flat()) {
		const c = typeof p === "string" ? cText(p) : p;
		const last = cells.at(-1);
		if (c.t === "text" && last?.t === "text") cells[cells.length - 1] = cText(last.text + c.text);
		else cells.push(c);
	}
	if (cells[0]?.t === "text") cells[0] = cText(cells[0].text[0].toUpperCase() + cells[0].text.slice(1));
	return cells;
}

/** The sentence as plain text (for alt text, sharing and the sample script). */
export function factText(cells: Cell[]): string {
	return cells
		.map((c) => {
			switch (c.t) {
				case "text":
					return c.text;
				case "race":
					return `${c.ref.year} ${c.ref.name}`;
				case "season":
					return String(c.year);
				case "date":
					return c.iso;
				case "number":
					return c.number;
				default:
					return c.ref.name;
			}
		})
		.join("");
}

/* ------------------------------------------------------------- scoring --- */

export const log2 = (x: number) => (x > 0 ? Math.log2(x) : 0);
const clamp = (x: number) => Math.round(Math.max(0, Math.min(10, x)) * 10) / 10;

/** Collects facts as they're found. */
export function collector() {
	const out: RaceFact[] = [];
	const add = (kind: FactKind, key: string, score: number, cells: Cell[]) => {
		out.push({ kind, key: `${kind}:${key}`, score: clamp(score), cells });
	};
	return { out, add };
}
export type Add = ReturnType<typeof collector>["add"];

/** Round numbers worth a mention. */
export function isMark(ev: EventId, kind: SubjectKind, n: number): boolean {
	if (ev === "start" || ev === "points") return kind === "driver" ? n % 50 === 0 : n % 100 === 0;
	if (n === 10 || n === 25) return true;
	return n <= 100 ? n % 25 === 0 : n % 50 === 0;
}
export const markScore = (ev: EventId, n: number) => 1.5 + EVENTS[ev].weight * Math.log10(n);

/** Shortest run worth a mention, and the shortest whose end is. */
export const STREAK: Partial<Record<SubjectKind, Partial<Record<EventId, [number, number]>>>> = {
	driver: { win: [3, 4], pole: [3, 4], podium: [5, 8], points: [10, 15], finish: [25, 30] },
	constructor: { win: [4, 6], pole: [4, 6], podium: [12, 20], points: [25, 40], oneTwo: [3, 4] },
};

/** Gaps (in the subject's starts, or races for nations and engines) shorter than this aren't news. */
export const SINCE_MIN: Partial<Record<EventId, number>> = { win: 10, pole: 10, podium: 15, points: 15, oneTwo: 15, sprintWin: 6 };

/** Ages in days: "youngest since" is only news for the young, "oldest since" for the old. */
export const years = (n: number) => Math.round(n * 365.25);

/** Races before "ever", records and nations' firsts mean something. */
export const HISTORY = 30;
/** Facts scoring less than this aren't worth showing. */
export const MIN_SCORE = 2;

/** Best first; one fact per subject and topic, no more than two per subject and `perKind` of a kind. */
export function pick(all: RaceFact[], limit: number, perKind = Infinity): RaceFact[] {
	const sorted = [...all].sort((a, b) => b.score - a.score);
	const perSubject = new Map<string, number>();
	const topics = new Set<string>();
	const kinds = new Map<FactKind, number>();
	const kept: RaceFact[] = [];
	for (const fact of sorted) {
		if (fact.score < MIN_SCORE || kept.length >= limit) break;
		const [, kind, id] = fact.key.split(":");
		const who = `${kind}:${id}`;
		const topic = `${who}:${fact.kind}`;
		if (topics.has(topic) || (perSubject.get(who) ?? 0) >= 2 || (kinds.get(fact.kind) ?? 0) >= perKind) continue;
		topics.add(topic);
		kinds.set(fact.kind, (kinds.get(fact.kind) ?? 0) + 1);
		perSubject.set(who, (perSubject.get(who) ?? 0) + 1);
		kept.push(fact);
	}
	return kept;
}
