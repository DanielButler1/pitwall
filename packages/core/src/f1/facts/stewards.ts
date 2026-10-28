// Facts from the FIA's documents (2018 on, ../stewards.ts): penalties handed out in a race, lap times
// deleted for track limits, penalty points over twelve months, driving reprimands and new engines in a
// season. They only reach back as far as the documents do, so the furthest they claim is "since 2018".

import type { Db } from "../dataset.ts";
import { cached, facts, type RaceFacts } from "../records/facts.ts";
import { cDriver, cSeason } from "../records/cells.ts";
import { ordinal } from "../anniversaries.ts";
import { penaltyCode, SPORTING, STEWARDS_FROM, stewardsOf } from "../stewards.ts";
import { cRaceFull, log2, possessive, sentence, type Add } from "./shared.ts";

/** Penalty points are counted over twelve months; twelve of them mean a race ban. */
export const POINTS_BAN = 12;
const YEAR_MS = 365 * 86_400_000;

/** Deleted lap times are tabled for every race from this season (before, only some were decided one by one). */
export const DELETED_FROM = 2020;

/** The latest race before `from` that `test` holds for with every race on the way back documented; -1 back to `since`. */
function lastDocumented(db: Db, from: number, test: (rf: RaceFacts) => boolean, since = STEWARDS_FROM): number | null {
	const F = facts(db);
	for (let i = from - 1; i >= 0; i--) {
		const rf = F.races[i];
		if (rf.race.year < since) return -1;
		if (!stewardsOf(db, rf.race.id)) return null;
		if (test(rf)) return i;
	}
	return -1;
}

/** "The most in the FIA's documents" means little before this many documented races. */
const SETTLED = 40;
/** Documented races before race idx, from `since`. */
function documented(db: Db, idx: number, since = STEWARDS_FROM): number {
	return facts(db).races.slice(0, idx).filter((rf) => rf.race.year >= since && stewardsOf(db, rf.race.id)).length;
}

const has = (codes: string[], kinds: Set<string>) => codes.some((c) => kinds.has(penaltyCode(c)[0]));
const IN_RACE = new Set(["T", "SG", "DT", "DQ"]);

/** Penalties given for what happened in a race (time, stop-and-go, drive-through, disqualification). */
const racePenalties = (db: Db, rf: RaceFacts) => stewardsOf(db, rf.race.id)?.decisions.filter((d) => d.session === "Race" && has(d.penalties, IN_RACE)).length ?? 0;
const deletedIn = (db: Db, rf: RaceFacts, session = "Race") => stewardsOf(db, rf.race.id)?.deleted.filter((d) => d.session === session) ?? [];

/** Each driver's penalty points: [race date ms, points][], in race order. */
export function pointsAwards(db: Db): Map<string, [number, number][]> {
	return cached(db, "race-facts:penalty-points", () => {
		const out = new Map<string, [number, number][]>();
		for (const rf of facts(db).races) {
			const s = stewardsOf(db, rf.race.id);
			if (!s) continue;
			for (const d of s.decisions)
				for (const c of d.penalties) {
					const [kind, n] = penaltyCode(c);
					if (kind === "P" && n) out.set(d.driverId, [...(out.get(d.driverId) ?? []), [Date.parse(rf.race.date), n]]);
				}
		}
		return out;
	});
}
/** A driver's penalty points over the twelve months up to a date. */
export function pointsAt(db: Db, driverId: string, date: string): number {
	const t = Date.parse(date);
	return (pointsAwards(db).get(driverId) ?? []).filter(([at]) => at <= t && at > t - YEAR_MS).reduce((a, [, n]) => a + n, 0);
}

/** Per season and driver, the races (indexes) where they were given a driving reprimand / a new engine. */
function perSeason(db: Db, name: string, test: (db: Db, rf: RaceFacts, driverId: string) => boolean): Map<string, number[]> {
	return cached(db, `race-facts:season:${name}`, () => {
		const out = new Map<string, number[]>();
		for (const rf of facts(db).races) {
			const s = stewardsOf(db, rf.race.id);
			if (!s) continue;
			const ids = new Set([...s.decisions.map((d) => d.driverId), ...s.newPu.keys()]);
			for (const id of ids) if (test(db, rf, id)) out.set(`${rf.race.year}|${id}`, [...(out.get(`${rf.race.year}|${id}`) ?? []), rf.idx]);
		}
		return out;
	});
}
const reprimanded = (db: Db, rf: RaceFacts, id: string) => !!stewardsOf(db, rf.race.id)?.decisions.some((d) => d.driverId === id && d.penalties.includes("R"));
const newEngine = (db: Db, rf: RaceFacts, id: string) => !!stewardsOf(db, rf.race.id)?.newPu.get(id)?.includes("ICE");

export function stewardsFacts(db: Db, f: RaceFacts, add: Add) {
	const s = stewardsOf(db, f.race.id);
	if (!s) return;
	const F = facts(db);
	const since = (i: number) => cRaceFull(db, F.races[i].race);
	const from = `in the FIA's documents (from ${STEWARDS_FROM})`;

	// penalties handed out in the race
	const n = racePenalties(db, f);
	if (n >= 4) {
		const prev = lastDocumented(db, f.idx, (rf) => racePenalties(db, rf) >= n);
		const head = `The stewards handed out ${n} penalties for the race`;
		if (prev === -1 && documented(db, f.idx) >= SETTLED) add("stewards", "race:penalties", 6, sentence(head, `, the most ${from}`));
		else if (prev != null && prev >= 0 && f.idx - prev >= 15) add("stewards", "race:penalties", 2 * log2((f.idx - prev) / 7), sentence(head, ", the most since the ", since(prev)));
	}

	// lap times deleted for track limits
	const fromDeleted = `in the FIA's documents (from ${DELETED_FROM})`;
	const deleted = f.race.year >= DELETED_FROM ? deletedIn(db, f) : [];
	const total = deleted.reduce((a, d) => a + d.laps, 0);
	if (total >= 10) {
		const sum = (rf: RaceFacts) => deletedIn(db, rf).reduce((a, d) => a + d.laps, 0);
		const prev = lastDocumented(db, f.idx, (rf) => sum(rf) >= total, DELETED_FROM);
		const head = `${total} lap times were deleted for track limits in the race`;
		if (prev === -1 && documented(db, f.idx, DELETED_FROM) >= SETTLED) add("stewards", "race:deleted", 5.5, sentence(head, `, the most ${fromDeleted}`));
		else if (prev != null && prev >= 0 && f.idx - prev >= 15) add("stewards", "race:deleted", 2 * log2((f.idx - prev) / 7), sentence(head, ", the most since the ", since(prev)));
	}
	const worst = [...deleted].sort((a, b) => b.laps - a.laps)[0];
	if (worst && worst.laps >= 4) {
		const most = (rf: RaceFacts) => Math.max(0, ...deletedIn(db, rf).map((d) => d.laps));
		const prev = lastDocumented(db, f.idx, (rf) => most(rf) >= worst.laps, DELETED_FROM);
		const head = sentence(cDriver(db, worst.driverId), ` had ${worst.laps} lap times deleted for track limits`);
		if (prev === -1 && documented(db, f.idx, DELETED_FROM) >= SETTLED) add("stewards", `driver:${worst.driverId}:deleted`, 5, sentence(head, `, the most in a race ${fromDeleted}`));
		else if (prev != null && prev >= 0 && f.idx - prev >= 15) add("stewards", `driver:${worst.driverId}:deleted`, 1.5 + 1.5 * log2((f.idx - prev) / 7), sentence(head, ", the most by a driver in a race since the ", since(prev)));
	}

	// penalty points: closing on a race ban
	const given = new Set(s.decisions.filter((d) => d.penalties.some((c) => penaltyCode(c)[0] === "P")).map((d) => d.driverId));
	for (const id of given) {
		const pts = pointsAt(db, id, f.race.date);
		if (pts >= 8) add("stewards", `driver:${id}:points`, 3 + (pts - 8) * 0.8, sentence(cDriver(db, id), ` now has ${pts} penalty points over twelve months; ${POINTS_BAN} mean a race ban`));
	}

	// driving reprimands and new engines in a season
	for (const [name, test, what, min] of [
		["reprimands", reprimanded, "driving reprimand", 3],
		["engines", newEngine, "new engine", 5],
	] as const) {
		const per = perSeason(db, name, test);
		for (const id of new Set([...s.decisions.map((d) => d.driverId), ...s.newPu.keys()])) {
			if (!test(db, f, id)) continue;
			const mine = per.get(`${f.race.year}|${id}`) ?? [];
			const k = mine.indexOf(f.idx) + 1;
			if (k < min) continue;
			// the most anyone had in a season before
			let best = 0;
			for (const [key, list] of per) if (!key.endsWith(`|${id}`) || !key.startsWith(`${f.race.year}|`)) best = Math.max(best, list.filter((i) => i < f.idx).length);
			const head = sentence(...possessive(cDriver(db, id)), ` ${ordinal(k)} ${what} of `, cSeason(f.race.year));
			if (k > best && documented(db, f.idx) >= SETTLED) add("stewards", `driver:${id}:${name}`, 5, sentence(head, `, the most by a driver in a season ${from}`));
			else add("stewards", `driver:${id}:${name}`, 2 + (k - min) * 0.5, head);
		}
	}
}
