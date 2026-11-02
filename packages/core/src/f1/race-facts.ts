// Talking points for a race: what made its result unusual against everything that happened before
// it ("Ferrari's first win in 30 races", "Norris's 10th podium in a row, the longest run since
// 2023", "the first title decided at the final race since 2021"), and what's at stake at the next
// one. Every fact is found by asking how often something has happened and when it last did, so a
// race's facts only ever look at the races up to it, and work the same inside a universe (its own
// Db, its own history).
//
// Each fact gets a score for how surprising it is; a race keeps its best few. The scores are rough
// by design: titles, long gaps, records and round numbers win, near-misses and routine runs lose.
//
//   facts/shared.ts    the events, per-subject indexes, sentence builders and scoring
//   facts/race.ts      the result: firsts, gaps, round numbers, records, runs, ages, grid slots
//   facts/titles.ts    titles decided and changes of championship lead
//   facts/deep.ts      the buried ones: margins, finishers, podiums, birthdays, families, team-mates
//   facts/careers.ts   new teams won for, rivals, teams' best results, new nations, best season starts
//   facts/venue.ts     new and returning circuits, round-number runnings, races cut short
//   facts/notes.ts     weather, safety cars, red flags and tyres (race notes)
//   facts/stewards.ts  penalties, track limits, penalty points, reprimands and engines (FIA documents)
//   facts/upcoming.ts  what's at stake at the next race
//   facts/collections.ts  every race's facts in one index, and the best of them per season, career or venue

import type { Db } from "./dataset.ts";
import { facts } from "./records/facts.ts";
import { collector, pick, type RaceFact } from "./facts/shared.ts";
import { resultFacts } from "./facts/race.ts";
import { titleFacts } from "./facts/titles.ts";
import { deepFacts } from "./facts/deep.ts";
import { careerFacts } from "./facts/careers.ts";
import { venueFacts } from "./facts/venue.ts";
import { noteFacts } from "./facts/notes.ts";
import { stewardsFacts } from "./facts/stewards.ts";

export { factText, type FactKind, type RaceFact } from "./facts/shared.ts";
export { onThisDayFacts, packFacts, raceEntries, seasonFacts, subjectFacts, unpackFacts, venueFacts, type FactEntry, type FactIndex, type PackedFacts } from "./facts/collections.ts";
import { factIndex as indexWith, sprintFacts as sprintWith, type FactIndex } from "./facts/collections.ts";
export { nextRace, upcomingFacts } from "./facts/upcoming.ts";
import { upcomingFacts } from "./facts/upcoming.ts";

/** The race's facts, best first. */
export function raceFacts(db: Db, raceId: number, limit = 8): RaceFact[] {
	const f = facts(db).byId.get(raceId);
	if (!f) return [];
	const { out, add } = collector();
	titleFacts(db, f, add);
	resultFacts(db, f, add);
	deepFacts(db, f, add);
	careerFacts(db, f, add);
	venueFacts(db, f, add);
	noteFacts(db, f, add);
	stewardsFacts(db, f, add);
	return pick(out, limit);
}

/** What to say about a race on its page: what made it unusual once it's run, what's at stake if it's next. */
export function factsFor(db: Db, raceId: number, limit = 6): { upcoming: boolean; facts: RaceFact[] } {
	if (db.resultsByRace.has(raceId)) return { upcoming: false, facts: raceFacts(db, raceId, limit) };
	const next = upcomingFacts(db, limit);
	return { upcoming: true, facts: next?.race.id === raceId ? next.facts : [] };
}

/** Every completed race's facts, worked out once per Db (about ten seconds; the build saves it as facts.json). */
export const factIndex = (db: Db): FactIndex => indexWith(db, raceFacts);

/** A race's sprint facts: sprint wins, sprint and Grand Prix doubles. */
export const sprintFacts = (db: Db, raceId: number, limit = 6) => sprintWith(db, raceId, raceFacts, limit);

/**
 * What's at stake at the next race for a driver or team, or at a Grand Prix or circuit when the next race is
 * there (none otherwise).
 */
export function upcomingAbout(db: Db, about: { driver: string } | { constructor: string } | { grandPrixId: string } | { circuitId: string }, limit = 4): RaceFact[] {
	const next = upcomingFacts(db, 30);
	if (!next) return [];
	if ("grandPrixId" in about || "circuitId" in about) {
		const here = "grandPrixId" in about ? next.race.grandPrixId === about.grandPrixId : next.race.circuitId === about.circuitId;
		return here ? next.facts.slice(0, limit) : [];
	}
	const who = "driver" in about ? `driver:${about.driver}` : `constructor:${about.constructor}`;
	return next.facts.filter((f) => f.key.split(":").slice(1, 3).join(":") === who).slice(0, limit);
}
