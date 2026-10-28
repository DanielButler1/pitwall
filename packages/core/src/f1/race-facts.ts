// Talking points for one race: what made its result unusual against everything that happened
// before it. "Ferrari's first win in 30 races", "Norris's 10th podium in a row, the longest run
// since 2023", "the lowest grid slot for a winner since 2009". Every fact is found by asking how
// often something has happened and when it last did, so it only ever looks at races up to the one
// in question, and works the same inside a universe (its own Db, its own history).
//
// Each fact gets a score for how surprising it is; a race keeps its best few. The scores are rough
// by design: long gaps, records and round numbers win, near-misses and routine runs lose.

import { isStart, type Db, type Race, type Result } from "./dataset.ts";
import { ageDaysAt, cached, facts, isPodium, isWin, type RaceFacts } from "./records/facts.ts";
import { cDriver, cGp, cRace, cSeason, cTeam, cText } from "./records/cells.ts";
import type { Cell } from "./records/types.ts";
import { nationRef } from "./views.ts";
import { ordinal } from "./anniversaries.ts";

export type FactKind = "first" | "since" | "nth" | "record" | "venue" | "ranking" | "streak" | "streak-end" | "grid" | "age" | "podium" | "season";

export type RaceFact = {
	/** Stable identity, e.g. "since:constructor:ferrari:win". */
	key: string;
	kind: FactKind;
	/** How surprising it is, roughly 0–10. */
	score: number;
	/** The sentence, with links to drivers, teams, races and seasons. */
	cells: Cell[];
};

type SubjectKind = "driver" | "constructor" | "nation";
type EventId = "win" | "pole" | "podium" | "points" | "start" | "oneTwo";

type EventDef = {
	one: string;
	many: string;
	/** How much an event of this kind matters, for scoring. */
	weight: number;
	kinds: SubjectKind[];
	/** Per result; or `race` for events that belong to a whole race (a one-two). */
	test?: (r: Result) => boolean;
	race?: (f: RaceFacts) => string[];
};

const EVENTS: Record<EventId, EventDef> = {
	win: { one: "win", many: "wins", weight: 3, kinds: ["driver", "constructor", "nation"], test: isWin },
	pole: { one: "pole position", many: "pole positions", weight: 2.2, kinds: ["driver", "constructor", "nation"], test: (r) => r.pole },
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
};

/* ------------------------------------------------------------- indexes --- */

function keyFor(db: Db, kind: SubjectKind, r: Result): string | null {
	if (kind === "driver") return r.driverId;
	if (kind === "constructor") return r.constructorId;
	return db.drivers.get(r.driverId)?.nationality ?? null;
}

/** Races (by index) in which each subject had the event, once per race. `atGp` keys them by Grand Prix too. */
function occurrences(db: Db, kind: SubjectKind, ev: EventId, atGp = false): Map<string, number[]> {
	return cached(db, `race-facts:${kind}:${ev}:${atGp}`, () => {
		const def = EVENTS[ev];
		const out = new Map<string, number[]>();
		for (const f of facts(db).races) {
			const keys = new Set<string>();
			if (def.race) for (const k of def.race(f)) keys.add(k);
			else for (const r of f.results) if (def.test!(r)) keys.add(keyFor(db, kind, r) ?? "");
			keys.delete("");
			for (const k of keys) {
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
function upTo(list: number[], idx: number): number {
	let lo = 0;
	let hi = list.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (list[mid] <= idx) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

type Run = { key: string; idxs: number[] };

/** Every run of two or more consecutive starts with the event, per subject. */
function runs(db: Db, kind: SubjectKind, ev: EventId): Run[] {
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

/* ---------------------------------------------------------------- text --- */

const P = (n: number) => `P${n}`;
const demonym = (db: Db, id: string) => db.countries.get(id)?.demonym ?? nationRef(db, id).name;

/** A subject with something of theirs: "Ferrari's 250th win", "the 300th win by a British driver". */
function owned(db: Db, kind: SubjectKind, id: string, what: string): Cell[] {
	if (kind !== "nation") return [...possessive(subject(db, kind, id)), cText(` ${what}`)];
	const name = demonym(db, id);
	return [cText(`the ${what} by ${/^[AEIOU]/.test(name) ? "an" : "a"} `), { t: "nation", ref: { ...nationRef(db, id), name } }, cText(" driver")];
}
function subject(db: Db, kind: SubjectKind, id: string): Cell {
	return kind === "driver" ? cDriver(db, id) : kind === "constructor" ? cTeam(db, id) : { t: "nation", ref: nationRef(db, id) };
}
/** "Norris's" but "Mercedes'". */
function possessive(cell: Cell): Cell[] {
	const name = "ref" in cell ? cell.ref.name : "";
	return [cell, cText(name.endsWith("s") && !name.endsWith("ss") ? "'" : "'s")];
}
/** A race by its Grand Prix's full name: "the 2016 Spanish Grand Prix". */
function cRaceFull(db: Db, race: Race): Cell {
	const cell = cRace(db, race);
	return cell.t === "race" ? { t: "race", ref: { ...cell.ref, name: db.grandsPrix.get(race.grandPrixId)?.fullName ?? cell.ref.name } } : cell;
}

/** Joins text pieces and capitalises the start of the sentence. */
function sentence(...parts: (Cell | string | (Cell | string)[])[]): Cell[] {
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

const log2 = (x: number) => (x > 0 ? Math.log2(x) : 0);
const clamp = (x: number) => Math.round(Math.max(0, Math.min(10, x)) * 10) / 10;

/** Round numbers worth a mention. */
function isMark(ev: EventId, kind: SubjectKind, n: number): boolean {
	if (ev === "start" || ev === "points") return kind === "driver" ? n % 50 === 0 : n % 100 === 0;
	if (n === 10 || n === 25) return true;
	return n <= 100 ? n % 25 === 0 : n % 50 === 0;
}

/** Shortest run worth a mention, and the shortest whose end is. */
const STREAK: Record<"driver" | "constructor", Partial<Record<EventId, [number, number]>>> = {
	driver: { win: [3, 4], pole: [3, 4], podium: [5, 8], points: [10, 15] },
	constructor: { win: [4, 6], pole: [4, 6], podium: [12, 20], points: [25, 40], oneTwo: [3, 4] },
};

/** Gaps (in the subject's starts, or races for nations) shorter than this aren't news. */
/** Races before "ever", records and nations' firsts mean something. */
const HISTORY = 30;
/** Facts scoring less than this aren't worth showing. */
const MIN_SCORE = 2;

const SINCE_MIN: Partial<Record<EventId, number>> = { win: 10, pole: 10, podium: 15, points: 15, oneTwo: 15 };

/* --------------------------------------------------------------- facts --- */

/** The race's facts, best first. */
export function raceFacts(db: Db, raceId: number, limit = 8): RaceFact[] {
	const F = facts(db);
	const f = F.byId.get(raceId);
	if (!f) return [];
	const out: RaceFact[] = [];
	const add = (kind: FactKind, key: string, score: number, cells: Cell[]) => out.push({ kind, key: `${kind}:${key}`, score: clamp(score), cells });
	const raceAt = (i: number) => F.races[i].race;
	// in the first seasons everything is a record and a first; "ever" means little until there's some history
	const settled = f.idx >= HISTORY;

	for (const ev of Object.keys(EVENTS) as EventId[]) {
		const def = EVENTS[ev];
		for (const kind of def.kinds) {
			const occ = occurrences(db, kind, ev);
			const starts = occurrences(db, kind, "start");
			const here = new Set<string>();
			if (def.race) for (const k of def.race(f)) here.add(k);
			else for (const r of f.results) if (def.test!(r)) here.add(keyFor(db, kind, r) ?? "");
			here.delete("");

			for (const id of here) {
				const list = occ.get(id)!;
				const n = upTo(list, f.idx);
				const tag = `${kind}:${id}:${ev}`;
				// opportunities since the last time: the subject's starts, or every race for a nation
				// a nation's fact that is only one driver's own (every Dutch pole is Verstappen's) is left to the driver
				const solo = kind === "nation" ? f.results.filter((r) => def.test!(r) && keyFor(db, kind, r) === id).map((r) => r.driverId) : [];
				const ownedBy = (i: number) => solo.length === 1 && F.races[i].results.some((r) => r.driverId === solo[0] && def.test!(r));
				const gap = (prev: number) => (kind === "nation" ? f.idx - prev : upTo(starts.get(id) ?? [], f.idx) - upTo(starts.get(id) ?? [], prev));

				// firsts
				if (n === 1 && ev !== "start" && ev !== "points" && (settled || kind !== "nation")) {
					const tries = kind === "driver" ? upTo(starts.get(id) ?? [], f.idx) : 0;
					const attempt = tries > 1 ? `, at the ${ordinal(tries)} attempt` : "";
					add("first", tag, (kind === "nation" ? 8 : 4) + def.weight * 1.5 + (tries > 100 ? 1 : 0), sentence(owned(db, kind, id, `first ${def.one}`), attempt));
				} else if (n === 1 && ev === "points" && kind !== "nation") {
					add("first", tag, kind === "constructor" ? 5 : 3.5, sentence(owned(db, kind, id, "first points")));
				} else if (n === 1 && ev === "start" && kind === "constructor") {
					add("first", tag, 3, sentence(owned(db, kind, id, "first Grand Prix")));
				}

				// the first in a while
				const min = SINCE_MIN[ev];
				if (n > 1 && min) {
					const prev = list[n - 2];
					const g = gap(prev);
					const need = kind === "nation" ? min * 2 : min;
					if (g >= need && !ownedBy(prev)) {
						const unit = kind === "driver" ? "starts" : "races";
						add("since", tag, def.weight * 1.3 * log2(g / (need / 2)), sentence(owned(db, kind, id, `first ${def.one}`), ` in ${g} ${unit}, since the `, cRaceFull(db, raceAt(prev))));
					}
				}

				// round numbers
				if (n > 1 && isMark(ev, kind, n) && !(solo.length === 1 && upTo(occurrences(db, "driver", ev).get(solo[0]) ?? [], f.idx) === n)) {
					const what = ev === "start" ? (kind === "driver" ? "Grand Prix start" : "Grand Prix") : def.one;
					add("nth", tag, 1.5 + def.weight * Math.log10(n), sentence(owned(db, kind, id, `${ordinal(n)} ${what}`)));
				}

				// the all-time list
				if (kind !== "nation" && ev !== "points" && n > 1 && settled) {
					const others = [...occ].filter(([k]) => k !== id).map(([k, l]) => [k, upTo(l, f.idx)] as const);
					const best = Math.max(0, ...others.map(([, c]) => c));
					const holder = (c: number) => others.filter(([, x]) => x === c).sort((a, b) => occ.get(b[0])![c - 1] - occ.get(a[0])![c - 1])[0]?.[0];
					if (best < (ev === "start" ? 50 : 10)) {
						// small numbers: a record of 6 isn't one yet
					} else if (n === best + 1) {
						const prior = holder(best);
						add("record", tag, 5 + def.weight, sentence(owned(db, kind, id, `${ordinal(n)} ${def.one}`), ", breaking ", prior ? [...possessive(subject(db, kind, prior)), " record"] : "the record", ` of ${best}`));
					} else if (n === best && best > 1) {
						add("record", tag, 4 + def.weight, sentence(owned(db, kind, id, `${ordinal(n)} ${def.one}`), ", equalling the record held by ", subject(db, kind, holder(best)!)));
					} else if (n < best && ev !== "start") {
						const rank = others.filter(([, c]) => c >= n).length + 1;
						const passed = others.filter(([, c]) => c === n - 1).map(([k]) => k);
						const level = others.filter(([, c]) => c === n).map(([k]) => k);
						if (rank <= 10 && passed.length) {
							const who = level.length ? ["level with ", subject(db, kind, level[0])] : ["ahead of ", subject(db, kind, passed[0])];
							add("ranking", tag, 2 + def.weight * (11 - rank) / 6, sentence(owned(db, kind, id, `${ordinal(n)} ${def.one}`), `, now ${ordinal(rank)} on the all-time list, `, ...who));
						}
					}
				}

				// runs
				const limits = kind !== "nation" ? STREAK[kind][ev] : undefined;
				if (limits) {
					const s = starts.get(id) ?? [];
					const yes = new Set(list);
					let pos = upTo(s, f.idx) - 1;
					let L = 0;
					while (pos >= 0 && yes.has(s[pos])) [L, pos] = [L + 1, pos - 1];
					if (L >= limits[0]) {
						// the longest other run so far, and the latest at least `len` long
						const compare = (len: number) => {
							let longest = 0;
							let since: { key: string; at: number } | null = null;
							for (const run of runs(db, kind, ev)) {
								if (run.idxs[0] > f.idx || (run.key === id && run.idxs.includes(f.idx))) continue;
								const n = upTo(run.idxs, f.idx);
								longest = Math.max(longest, n);
								const at = run.idxs[n - 1];
								if (n >= len && (!since || at > since.at)) since = { key: run.key, at };
							}
							return { longest, since };
						};
						const { longest, since } = compare(L);
						// "the longest since" is news when it reaches further back than last time
						const news = since?.at !== compare(L - 1).since?.at || L % 5 === 0;
						const head = owned(db, kind, id, `${ordinal(L)} ${def.one} in a row`);
						if (L > longest && settled) add("streak", tag, 5 + def.weight * 1.5, sentence(head, ", the longest run ever"));
						else if (L === longest && since && settled) add("streak", tag, 4 + def.weight, sentence(head, ", equalling the record set by ", subject(db, kind, since.key)));
						else if (since && f.idx - since.at >= 20 && news) {
														add("streak", tag, def.weight * log2((f.idx - since.at) / 10), sentence(head, ", the longest run since ", ...possessive(subject(db, kind, since.key)), " in ", cSeason(raceAt(since.at).year)));
						} else if (L === limits[0] || L % 5 === 0) add("streak", tag, def.weight * 0.8, sentence(head));
					}
				}
			}

			// runs that ended here
			if (kind === "nation") continue;
			const limits = STREAK[kind][ev];
			if (!limits) continue;
			for (const [id, s] of starts) {
				const pos = upTo(s, f.idx) - 1;
				if (pos < 1 || s[pos] !== f.idx || here.has(id)) continue;
				const yes = new Set(occ.get(id));
				let L = 0;
				for (let p = pos - 1; p >= 0 && yes.has(s[p]); p--) L++;
				if (L >= limits[1]) add("streak-end", `${kind}:${id}:${ev}`, def.weight * log2(L / limits[1] + 1) * 1.5, sentence(owned(db, kind, id, `run of ${L} ${def.many} in a row`), " came to an end"));
			}
		}
	}

	// most wins at this Grand Prix
	for (const kind of ["driver", "constructor"] as const) {
		const winner = f.winner && keyFor(db, kind, f.winner);
		if (!winner) continue;
		const occ = occurrences(db, kind, "win", true);
		const gp = f.race.grandPrixId;
		const n = upTo(occ.get(`${winner}@${gp}`)!, f.idx);
		if (n < 3) continue;
		const others = [...occ].filter(([k]) => k.endsWith(`@${gp}`) && k !== `${winner}@${gp}`).map(([k, l]) => [k.slice(0, k.lastIndexOf("@")), upTo(l, f.idx)] as const);
		const best = Math.max(0, ...others.map(([, c]) => c));
		if (n < best) continue;
		const head = [...possessive(subject(db, kind, winner)), ` ${ordinal(n)} win at the `, cGp(db, gp)];
		if (n === best) add("venue", `${kind}:${winner}:gp`, 3.5, sentence(head, ", level with ", subject(db, kind, others.find(([, c]) => c === best)![0]), " for the most"));
		else if (n === best + 1) add("venue", `${kind}:${winner}:gp`, 4 + n / 3, sentence(head, `, the most by any ${kind === "driver" ? "driver" : "team"}`));
		else add("venue", `${kind}:${winner}:gp`, 2 + n / 6, sentence(head, ", extending the record"));
	}

	// the winner's grid slot
	const w = f.winner;
	if (w?.grid && w.grid >= 5) {
		let prev = f.idx - 1;
		while (prev >= 0 && !((F.races[prev].winner?.grid ?? 0) >= w.grid)) prev--;
		const g = f.idx - prev;
		if (prev < 0 && settled) add("grid", `driver:${w.driverId}`, 9, sentence(cDriver(db, w.driverId), ` won from ${P(w.grid)}, the lowest grid slot a Grand Prix has ever been won from`));
		else if (g >= 15) {
			const pw = F.races[prev].winner!;
			add("grid", `driver:${w.driverId}`, 3 * log2(g / 8), sentence(cDriver(db, w.driverId), ` won from ${P(w.grid)}, the lowest grid slot for a winner since `, cDriver(db, pw.driverId), ` (${P(pw.grid!)}) at the `, cRaceFull(db, raceAt(prev))));
		}
	}

	// youngest and oldest
	const AGES: [EventId, string, (r: Result) => boolean][] = [
		["win", "race winner", isWin],
		["pole", "polesitter", (r) => r.pole],
		["podium", "podium finisher", isPodium],
	];
	for (const [ev, noun, test] of AGES) {
		const seen = new Set<string>();
		for (const r of f.results.filter(test)) {
			if (seen.has(r.driverId)) continue;
			seen.add(r.driverId);
			const age = ageDaysAt(db, r.driverId, f.race.date);
			if (age == null) continue;
			// the driver's previous time, to tell "oldest since X" apart from the same news again
			let last = f.idx - 1;
			while (last >= 0 && !F.races[last].results.some((x) => x.driverId === r.driverId && test(x))) last--;
			for (const young of [true, false]) {
				const { prev, who } = latestAged(F.races, test, (a) => (young ? a <= age : a >= age), f.idx - 1);
				if (last >= 0 && who) {
					const age0 = ageDaysAt(db, r.driverId, F.races[last].race.date)!;
					if (latestAged(F.races, test, (a) => (young ? a <= age0 : a >= age0), last - 1).prev === prev) continue;
				}
				const g = f.idx - prev;
				const label = `${young ? "youngest" : "oldest"} ${noun}`;
				if (!who) {
					if (settled) add("age", `driver:${r.driverId}:${ev}:${young}`, 6 + EVENTS[ev].weight, sentence(cDriver(db, r.driverId), ` became the ${label} ever`));
				}
				else if (g >= 25 && who.driverId !== r.driverId)
					add("age", `driver:${r.driverId}:${ev}:${young}`, EVENTS[ev].weight * log2(g / 12), sentence(cDriver(db, r.driverId), ` became the ${label} since `, cDriver(db, who.driverId), " at the ", cRaceFull(db, raceAt(prev))));
			}
		}
	}

	function latestAged(races: RaceFacts[], test: (r: Result) => boolean, ok: (age: number) => boolean, from: number) {
		for (let prev = from; prev >= 0; prev--) {
			const pf = races[prev];
			const who = pf.results.find((x) => {
				if (!test(x)) return false;
				const a = ageDaysAt(db, x.driverId, pf.race.date);
				return a != null && ok(a);
			});
			if (who) return { prev, who };
		}
		return { prev: -1, who: undefined };
	}

	// the same top three as before
	const podium = (rf: RaceFacts) => [1, 2, 3].map((p) => rf.results.find((r) => r.position === p)?.driverId ?? "").join(",");
	const top = podium(f);
	if (!top.includes(",,") && !top.endsWith(",")) {
		let prev = f.idx - 1;
		while (prev >= 0 && podium(F.races[prev]) !== top) prev--;
		if (prev >= 0 && f.idx - prev >= 30) add("podium", top, 2 + log2((f.idx - prev) / 30), sentence("The same top three, in the same order, as the ", cRaceFull(db, raceAt(prev))));
	}

	// different winners this season
	for (const kind of ["driver", "constructor"] as const) {
		if (!f.winner) break;
		const id = keyFor(db, kind, f.winner)!;
		const season = F.seasons.get(f.race.year)!.filter((i) => i <= f.idx);
		const winners = new Set(season.map((i) => F.races[i].winner).filter((x) => x != null).map((x) => keyFor(db, kind, x)));
		const before = new Set(season.slice(0, -1).map((i) => F.races[i].winner).filter((x) => x != null).map((x) => keyFor(db, kind, x)));
		const n = winners.size;
		if (before.has(id) || n < (kind === "driver" ? 5 : 4)) continue;
		let year = f.race.year - 1;
		for (; year >= 1950; year--) {
			const all = new Set((F.seasons.get(year) ?? []).map((i) => F.races[i].winner).filter((x) => x != null).map((x) => keyFor(db, kind, x)));
			if (all.size >= n) break;
		}
		const head = sentence(subject(db, kind, id), ` is the ${ordinal(n)} different ${kind === "driver" ? "winner" : "team to win"} in `, cSeason(f.race.year));
		const gapYears = f.race.year - year;
		if (year < 1950 && settled) add("season", `${kind}:${f.race.year}`, 8, sentence(head, ", a record for a season"));
		else if (gapYears >= 3) add("season", `${kind}:${f.race.year}`, 2 + log2(gapYears), sentence(head, ", the most since ", cSeason(year)));
	}

	// best first; one fact per subject and topic, and no more than two per subject
	out.sort((a, b) => b.score - a.score);
	const perSubject = new Map<string, number>();
	const topics = new Set<string>();
	const kept: RaceFact[] = [];
	for (const fact of out) {
		if (fact.score < MIN_SCORE) break;
		const [, kind, id] = fact.key.split(":");
		const who = `${kind}:${id}`;
		const topic = `${who}:${fact.kind}`;
		if (topics.has(topic) || (perSubject.get(who) ?? 0) >= 2) continue;
		topics.add(topic);
		perSubject.set(who, (perSubject.get(who) ?? 0) + 1);
		kept.push(fact);
		if (kept.length >= limit) break;
	}
	return kept;
}
