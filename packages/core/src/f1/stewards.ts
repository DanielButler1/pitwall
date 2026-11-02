// The FIA's documents (2018 on): stewards' decisions, deleted lap times and new power unit elements,
// read through the race's results like the lap data, so a universe that changed a race has none.

import { resultsSig, type Db, type Stewards } from "./dataset.ts";

export type { Stewards, StewardsDecision } from "./dataset.ts";

/** First season the FIA's documents cover. */
export const STEWARDS_FROM = 2018;

/** A race's stewards' data, or null when there is none or a universe changed the race. */
export function stewardsOf(db: Db, raceId: number): Stewards | null {
	const s = db.stewards?.get(raceId);
	if (!s) return null;
	return db.stewardsSig?.get(raceId) === resultsSig(db.resultsByRace.get(raceId)) ? s : null;
}

/** A penalty code's kind and number: "T5" -> ["T", 5], "RN" -> ["RN", null]. */
export function penaltyCode(code: string): [string, number | null] {
	const m = /^([A-Z]+)(\d+)?$/.exec(code);
	return m ? [m[1], m[2] ? Number(m[2]) : null] : [code, null];
}

/** Penalties that changed a result or a grid (not reprimands, warnings, fines or points alone). */
export const SPORTING = new Set(["T", "SG", "DT", "G", "BG", "PL", "DQ"]);
