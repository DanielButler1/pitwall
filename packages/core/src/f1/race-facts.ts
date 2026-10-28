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
//   facts/notes.ts     weather, safety cars, red flags, tyres (race notes) and pit stops
//   facts/upcoming.ts  what's at stake at the next race

import type { Db } from "./dataset.ts";
import { facts } from "./records/facts.ts";
import { collector, pick, type RaceFact } from "./facts/shared.ts";
import { resultFacts } from "./facts/race.ts";
import { titleFacts } from "./facts/titles.ts";
import { deepFacts } from "./facts/deep.ts";
import { careerFacts } from "./facts/careers.ts";
import { venueFacts } from "./facts/venue.ts";
import { noteFacts } from "./facts/notes.ts";

export { factText, type FactKind, type RaceFact } from "./facts/shared.ts";
export { nextRace, upcomingFacts } from "./facts/upcoming.ts";

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
	return pick(out, limit);
}
