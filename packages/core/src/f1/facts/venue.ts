// Facts about where and how far a race was run: a new circuit, a circuit back after years away,
// round-number runnings of a circuit or Grand Prix, a race stopped short of its distance, and a
// Grand Prix that keeps finding new winners. Shared with upcoming.ts, which says them in advance.

import type { Db, Race } from "../dataset.ts";
import { facts, type RaceFacts } from "../records/facts.ts";
import { cCircuit, cDriver, cGp, cSeason } from "../records/cells.ts";
import { ordinal } from "../anniversaries.ts";
import { HISTORY, cRaceFull, log2, sentence, type Add } from "./shared.ts";
import type { Cell } from "../records/types.ts";

/** Round-number runnings of a circuit or Grand Prix. */
const isRunningMark = (n: number) => n % 25 === 0;

/**
 * What's notable about a race's venue, before it's run: indexes are of completed races, `prior` the
 * races before this one. Facts come back as [key, score, cells] for the caller to word around.
 */
export function venueNews(db: Db, race: Race, prior: RaceFacts[], settled: boolean): [string, number, Cell[]][] {
	const out: [string, number, Cell[]][] = [];
	const circuit = db.circuits.get(race.circuitId);
	const here = prior.filter((rf) => rf.race.circuitId === race.circuitId);
	if (circuit) {
		const last = here.at(-1);
		if (!last && settled) out.push([`circuit:${race.circuitId}:first`, 5, sentence("The first Grand Prix at ", cCircuit(db, race.circuitId))]);
		else if (last && race.year - last.race.year >= 10)
			out.push([`circuit:${race.circuitId}:return`, 2 + 1.5 * log2((race.year - last.race.year) / 5), sentence("The first Grand Prix at ", cCircuit(db, race.circuitId), " since ", cSeason(last.race.year))]);
		if (isRunningMark(here.length + 1)) out.push([`circuit:${race.circuitId}:nth`, 2 + log2((here.length + 1) / 12.5), sentence(`The ${ordinal(here.length + 1)} Grand Prix at `, cCircuit(db, race.circuitId))]);
	}
	const editions = prior.filter((rf) => rf.race.grandPrixId === race.grandPrixId).length + 1;
	if (isRunningMark(editions) && editions > 1) out.push([`gp:${race.grandPrixId}:nth`, 2.5 + log2(editions / 12.5), sentence(`The ${ordinal(editions)} world championship `, cGp(db, race.grandPrixId))]);
	return out;
}

export function venueFacts(db: Db, f: RaceFacts, add: Add) {
	const F = facts(db);
	const race = f.race;
	const settled = f.idx >= HISTORY;
	for (const [key, score, cells] of venueNews(db, race, F.races.slice(0, f.idx), settled)) {
		// a new circuit's first winner is part of the story
		if (key.endsWith(":first") && f.winner) add("circuit", key, score, sentence(cells, ", won by ", cDriver(db, f.winner.driverId)));
		else add("circuit", key, score, cells);
	}

	// stopped short of its distance
	const planned = race.scheduledLaps;
	if (planned && f.winnerLaps < planned) {
		const share = f.winnerLaps / planned;
		const short = (rf: RaceFacts) => !!rf.race.scheduledLaps && rf.winnerLaps / rf.race.scheduledLaps <= share;
		let prev = f.idx - 1;
		while (prev >= 0 && !short(F.races[prev])) prev--;
		const text = `Only ${f.winnerLaps} of the ${planned} planned laps ${f.winnerLaps === 1 ? "was" : "were"} run`;
		if (share <= 0.9 && prev >= 0 && f.idx - prev >= 20) add("shape", "race:short", 2 * log2((f.idx - prev) / 10), sentence(text, ", the shortest race against its distance since the ", cRaceFull(db, F.races[prev].race)));
		else if (share <= 0.9 && prev < 0 && settled) add("shape", "race:short", 6, sentence(text, ", the shortest race against its distance"));
	}

	// a Grand Prix that keeps finding new winners
	if (f.winner) {
		const editions = F.races.slice(0, f.idx + 1).filter((rf) => rf.race.grandPrixId === race.grandPrixId);
		const seen = new Set<string>();
		let k = 0;
		for (let i = editions.length - 1; i >= 0; i--) {
			const id = editions[i].winner?.driverId;
			if (!id || seen.has(id)) break;
			seen.add(id);
			k++;
		}
		if (k >= 8 && k < editions.length && editions.length >= 15) add("venue", `gp:${race.grandPrixId}:winners`, 2 + (k - 6) * 0.5, sentence(`The ${ordinal(k)} different winner of the `, cGp(db, race.grandPrixId), ` in ${k} runnings`));
	}
}
