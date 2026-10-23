// "Race prediction": one historical race a day (the same for everyone). From the starting grid,
// predict the top six and who set the fastest lap, then see how it really finished. Pure, so
// the page and the tests share it; the races come from public/data/race-entries.json.

import { dailyPick, randomPick, VERDICT_SQUARE, type Verdict } from "./daily.ts";
import { percentBucket, raceLabel, type Entry, type RaceEntry } from "./race-entries.ts";

export { PERCENT_BUCKETS, percentBucketLabel, percentBucketSrLabel } from "./race-entries.ts";

export const SLOTS = 6;
export const POINTS = { exact: 10, close: 5, top: 2, bonus: 5 } as const;
export const MAX_POINTS = SLOTS * POINTS.exact + POINTS.bonus;
/** A daily counts as won with this many points or more. */
export const WIN_POINTS = 30;

/** Races to predict: since 1980, with six classified finishers and a known fastest lap. */
export function eligible(r: RaceEntry): boolean {
	return r.year >= 1980 && r.fastestLap != null && r.entries.filter((e) => e.finish != null && e.finish <= SLOTS).length === SLOTS;
}

export const predictPool = (races: readonly RaceEntry[]) => races.filter(eligible).sort((a, b) => a.order - b.order);
export const dailyRace = (races: readonly RaceEntry[], day: number) => dailyPick(predictPool(races), "predict", day);
export const randomRace = (races: readonly RaceEntry[], random = Math.random, exclude?: string) => randomPick(races.filter(eligible), random, exclude);

/** The real top six, in order. */
export const podium = (r: RaceEntry): Entry[] =>
	r.entries
		.filter((e) => e.finish != null && e.finish <= SLOTS)
		.sort((a, b) => a.finish! - b.finish!);

/* -------------------------------------------------------------- scoring --- */

export type SlotScore = {
	/** 1-based predicted position. */
	slot: number;
	/** Driver id picked for this slot (null if left empty). */
	pick: string | null;
	/** Where the picked driver really finished (null: not classified or not picked). */
	finish: number | null;
	points: number;
	verdict: Verdict;
};
export type Score = { slots: SlotScore[]; bonus: { pick: string | null; actual: string | null; points: number }; total: number; max: number };

/**
 * Per slot: the exact position is 10, off by one 5, anywhere else in the top six 2; the
 * fastest lap is 5 more. Exact is a match (green), off by one close (amber), the rest a miss.
 */
export function score(r: RaceEntry, picks: readonly (string | null)[], fastestLap: string | null): Score {
	const finish = new Map(r.entries.map((e) => [e.driver.id, e.finish]));
	const slots = Array.from({ length: SLOTS }, (_, i): SlotScore => {
		const pick = picks[i] ?? null;
		const at = pick ? (finish.get(pick) ?? null) : null;
		const slot = i + 1;
		if (at == null) return { slot, pick, finish: null, points: 0, verdict: "miss" };
		if (at === slot) return { slot, pick, finish: at, points: POINTS.exact, verdict: "match" };
		if (Math.abs(at - slot) === 1) return { slot, pick, finish: at, points: POINTS.close, verdict: "close" };
		return { slot, pick, finish: at, points: at <= SLOTS ? POINTS.top : 0, verdict: "miss" };
	});
	const actual = r.fastestLap?.id ?? null;
	const bonus = { pick: fastestLap, actual, points: fastestLap && fastestLap === actual ? POINTS.bonus : 0 };
	return { slots, bonus, total: slots.reduce((s, x) => s + x.points, 0) + bonus.points, max: MAX_POINTS };
}

/* ------------------------------------------------------------- picking --- */

/** Taps a driver: into the first empty slot, or out again if already picked. */
export function toggle(picks: readonly (string | null)[], id: string): (string | null)[] {
	const out = Array.from({ length: SLOTS }, (_, i) => picks[i] ?? null);
	const at = out.indexOf(id);
	if (at >= 0) out[at] = null;
	else {
		const empty = out.indexOf(null);
		if (empty >= 0) out[empty] = id;
	}
	return out;
}

/** Swaps two slots (drag and drop). */
export function swap(picks: readonly (string | null)[], a: number, b: number): (string | null)[] {
	const out = Array.from({ length: SLOTS }, (_, i) => picks[i] ?? null);
	[out[a], out[b]] = [out[b], out[a]];
	return out;
}

/** Puts a driver in a slot (drag from the grid), moving them out of any other slot. */
export function place(picks: readonly (string | null)[], id: string, slot: number): (string | null)[] {
	const out = Array.from({ length: SLOTS }, (_, i) => (picks[i] === id ? null : (picks[i] ?? null)));
	out[slot] = id;
	return out;
}

export const complete = (picks: readonly (string | null)[]) => picks.length >= SLOTS && picks.slice(0, SLOTS).every((p) => p != null);

/* -------------------------------------------------------------- sharing --- */

/** "Pitwall Prediction #3 · 1997 Austrian GP · 34/65 🟩🟨⬛🟩⬛⬛" and the link. */
export function shareText({ label, race, result, url }: { label: string; race: RaceEntry; result: Score; url?: string }) {
	const squares = result.slots.map((s) => VERDICT_SQUARE[s.verdict]).join("");
	return [`Pitwall Prediction ${label} · ${raceLabel(race)} · ${result.total}/${result.max} ${squares}`, ...(url ? [url] : [])].join("\n");
}

/* ---------------------------------------------------------------- stats --- */

export const isWin = (total: number) => total >= WIN_POINTS;
export const resultBucket = (total: number) => percentBucket(total, MAX_POINTS);
