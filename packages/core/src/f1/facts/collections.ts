// Facts gathered across races, for pages about more than one race: a season, a driver's or team's career,
// a Grand Prix or a circuit. Every race's facts are worked out once into an index (`factIndex`, about ten
// seconds for the whole history), which the data build writes to facts.json so the site and the app only
// load it; each page then keeps the best few that are about it.

import type { Db } from "../dataset.ts";
import { cached, facts } from "../records/facts.ts";
import type { Cell } from "../records/types.ts";
import { MIN_SCORE, cRaceFull, type FactKind, type RaceFact } from "./shared.ts";

/** Facts kept per race in the index: enough for a driver's or team's own to be among them. */
const PER_RACE = 12;

/** Each completed race's facts, best first. */
export type FactIndex = Map<number, RaceFact[]>;
/** facts.json: the index, with the dataset it belongs to. */
export type PackedFacts = { generatedAt: string; races: [number, RaceFact[]][] };

/** One race's facts for the index (exported so the app can work through races a few at a time). */
export type RaceFactsFn = (db: Db, raceId: number, limit: number) => RaceFact[];

/** Every completed race's facts (the slow part: about ten seconds for the whole history). */
export function factIndex(db: Db, raceFacts: RaceFactsFn): FactIndex {
	return cached(db, "race-facts:index", () => {
		const out: FactIndex = new Map();
		for (const f of facts(db).races) out.set(f.race.id, raceFacts(db, f.race.id, PER_RACE));
		return out;
	});
}

export const packFacts = (db: Db, index: FactIndex): PackedFacts => ({ generatedAt: db.meta.generatedAt, races: [...index] });
/** The index from facts.json, or null when it belongs to another dataset. */
export const unpackFacts = (db: Db, packed: PackedFacts | null | undefined): FactIndex | null =>
	packed && packed.generatedAt === db.meta.generatedAt ? new Map(packed.races) : null;

/** A fact with the race it's from. */
export type FactEntry = { raceId: number; race: Cell; fact: RaceFact };

/** The subject a fact is about, from its key ("since:constructor:ferrari:win" -> "constructor:ferrari"). */
const subjectOf = (f: RaceFact) => f.key.split(":").slice(1, 3).join(":");

/** The best facts of some races: a few of each kind, one per subject and kind, no more than two per subject. */
function best(db: Db, index: FactIndex, raceIds: number[], limit: number, keep: (f: RaceFact) => boolean = () => true, perSubject = 2): FactEntry[] {
	const all: FactEntry[] = [];
	for (const raceId of raceIds) {
		const race = db.raceById.get(raceId);
		if (!race) continue;
		for (const fact of index.get(raceId) ?? []) if (fact.score >= MIN_SCORE && keep(fact)) all.push({ raceId, race: cRaceFull(db, race), fact });
	}
	all.sort((a, b) => b.fact.score - a.fact.score || b.raceId - a.raceId);
	const kinds = new Map<FactKind, number>();
	const subjects = new Map<string, number>();
	const topics = new Set<string>();
	const out: FactEntry[] = [];
	for (const e of all) {
		if (out.length >= limit) break;
		const who = subjectOf(e.fact);
		const topic = `${who}:${e.fact.kind}`;
		if (topics.has(topic)) continue;
		if ((subjects.get(who) ?? 0) >= perSubject || (kinds.get(e.fact.kind) ?? 0) >= 2) continue;
		topics.add(topic);
		subjects.set(who, (subjects.get(who) ?? 0) + 1);
		kinds.set(e.fact.kind, (kinds.get(e.fact.kind) ?? 0) + 1);
		out.push(e);
	}
	return out;
}

const completed = (db: Db, test: (raceId: number) => boolean) => facts(db).races.map((f) => f.race.id).filter(test);

/** A season's standout facts, from all its races. */
export function seasonFacts(db: Db, index: FactIndex, year: number, limit = 8): FactEntry[] {
	return best(db, index, completed(db, (id) => db.raceById.get(id)?.year === year), limit);
}

/** A driver's or team's career in facts: those about them, best first. */
export function subjectFacts(db: Db, index: FactIndex, kind: "driver" | "constructor", id: string, limit = 8): FactEntry[] {
	const results = (kind === "driver" ? db.resultsByDriver : db.resultsByConstructor).get(id) ?? [];
	const raceIds = [...new Set(results.map((r) => r.raceId))];
	return best(db, index, raceIds, limit, (f) => subjectOf(f) === `${kind}:${id}`, limit);
}

/** The standout facts from a Grand Prix's or circuit's runnings. */
export function venueFacts(db: Db, index: FactIndex, where: { grandPrixId: string } | { circuitId: string }, limit = 8): FactEntry[] {
	const at = (id: number) => {
		const race = db.raceById.get(id);
		return !!race && ("grandPrixId" in where ? race.grandPrixId === where.grandPrixId : race.circuitId === where.circuitId);
	};
	return best(db, index, completed(db, at), limit);
}

/** Facts about a race's sprint (sprint wins, sprint and Grand Prix doubles). */
export function sprintFacts(db: Db, raceId: number, raceFacts: RaceFactsFn, limit = 6): RaceFact[] {
	return raceFacts(db, raceId, 40)
		.filter((f) => /:sprint(Win|Double)\b/.test(f.key))
		.slice(0, limit);
}
