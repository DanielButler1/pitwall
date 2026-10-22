// "Higher or lower": two drivers (or two constructors) and one career stat; is the hidden
// one's number higher or lower? The challenger then becomes the one to beat. Daily is a fixed
// run of ten rounds, the same for everyone; endless (practice) goes on until the first miss.
// Pure, so the page and the tests share it; data is public/data/higher-lower.json.

import { emptyStats as emptyGameStats, hash, recordResult as recordGameResult, rng, type GameStats } from "./daily.ts";

export { puzzleNumber } from "./daily.ts";

export type Kind = "driver" | "team";

/** [id, kind (0 driver, 1 team), name, flag, firstYear, lastYear, context, starts, wins, podiums, poles, lapsLed (null: career before lap data), titles] */
export type PackedEntity = [string, 0 | 1, string, string | null, number, number, string, number, number, number, number, number | null, number];
export type HigherLowerFile = { lapsFrom: number; entities: PackedEntity[] };

export type Entity = {
	id: string;
	kind: Kind;
	name: string;
	flag: string | null;
	first: number;
	last: number;
	/** Driver: the team they raced for most. Team: empty. */
	context: string;
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	lapsLed: number | null;
	titles: number;
};

export const unpack = ([id, k, name, flag, first, last, context, starts, wins, podiums, poles, lapsLed, titles]: PackedEntity): Entity => ({
	id,
	kind: k ? "team" : "driver",
	name,
	flag,
	first,
	last,
	context,
	starts,
	wins,
	podiums,
	poles,
	lapsLed,
	titles,
});

export type StatKey = "wins" | "poles" | "starts" | "podiums" | "lapsLed";
export const STATS: Record<StatKey, { label: string; question: Record<Kind, string>; unit: [string, string] }> = {
	wins: { label: "Wins", question: { driver: "More career wins?", team: "More race wins?" }, unit: ["win", "wins"] },
	poles: { label: "Poles", question: { driver: "More pole positions?", team: "More pole positions?" }, unit: ["pole", "poles"] },
	starts: { label: "Starts", question: { driver: "More race starts?", team: "More races started?" }, unit: ["start", "starts"] },
	podiums: { label: "Podiums", question: { driver: "More podiums?", team: "More podium finishes?" }, unit: ["podium", "podiums"] },
	lapsLed: { label: "Laps led", question: { driver: "More laps led?", team: "More laps led?" }, unit: ["lap led", "laps led"] },
};
const STAT_KEYS = Object.keys(STATS) as StatKey[];

/** The stat's value, or null when it isn't known for this entity (laps led before lap data). */
export const value = (e: Entity, stat: StatKey): number | null => (stat === "lapsLed" ? (e.kind === "driver" ? e.lapsLed : null) : e[stat]);

export type Round = { stat: StatKey; left: Entity; right: Entity };
export type Choice = "higher" | "lower";

/** Ties count as correct either way. */
export function isCorrect(round: Round, choice: Choice): boolean {
	const a = value(round.left, round.stat) ?? 0;
	const b = value(round.right, round.stat) ?? 0;
	return choice === "higher" ? b >= a : b <= a;
}

/** How far apart two values are: 1 is equal; (1 + max) / (1 + min) so zeros stay finite. */
export const gapRatio = (a: number, b: number) => (1 + Math.max(a, b)) / (1 + Math.min(a, b));

export type Gap = "close" | "medium" | "far";
export const gapOf = (a: number, b: number): Gap => {
	const r = gapRatio(a, b);
	return r <= 1.3 ? "close" : r <= 2.2 ? "medium" : "far";
};
const GAP_ODDS: [Gap, number][] = [
	["close", 0.4],
	["medium", 0.35],
	["far", 0.25],
];

/** How well known: a damped mix of starts and results, so stars come up more but not every time. */
export const fame = (e: Entity) => Math.sqrt(e.starts + 8 * e.wins + 3 * e.podiums + 20 * e.titles);

/** A random pick, weighted by fame. */
function pickOne(items: readonly Entity[], random: () => number): Entity {
	const total = items.reduce((s, e) => s + fame(e), 0);
	let roll = random() * total;
	for (const e of items) if ((roll -= fame(e)) < 0) return e;
	return items[items.length - 1];
}

/**
 * The next round after `history`, for `kind`: the last challenger carries over as the one to
 * beat when it's the same kind (else a fresh pair). The stat changes every round and the
 * challenger is someone not seen yet this run, at a close, medium or far gap; never 0 vs 0,
 * never a tie when avoidable.
 */
export function nextRound(entities: readonly Entity[], history: readonly Round[], kind: Kind, random: () => number): Round {
	const pool = entities.filter((e) => e.kind === kind);
	const used = new Set(history.flatMap((r) => [r.left.id, r.right.id]));
	const prev = history[history.length - 1];
	const fresh = (pred: (e: Entity) => boolean) => pool.filter((e) => !used.has(e.id) && pred(e));
	// a fresh "one to beat" leans towards the well known: the busier half of the pool
	const left = prev && prev.right.kind === kind ? prev.right : pickOne(fresh((e) => e.starts >= 80 || e.wins > 0).length ? fresh((e) => e.starts >= 80 || e.wins > 0) : pool, random);
	used.add(left.id);

	const stats = STAT_KEYS.filter((s) => s !== prev?.stat && value(left, s) != null);
	const nonZero = stats.filter((s) => (value(left, s) ?? 0) > 0);
	// stats in random order, ones where the card to beat has something on the board first
	const shuffled = (list: StatKey[]) => list.map((s) => [s, random()] as const).sort((a, b) => a[1] - b[1]).map(([s]) => s);
	const order = [...shuffled(nonZero), ...shuffled(stats.filter((s) => !nonZero.includes(s)))];
	if (!order.length) order.push(...STAT_KEYS.filter((s) => value(left, s) != null));

	let roll = random();
	const wanted = GAP_ODDS.find(([, p]) => (roll -= p) < 0)?.[0] ?? "far";
	const gaps: Gap[] = [wanted, ...(["medium", "close", "far"] as Gap[]).filter((g) => g !== wanted)];
	for (const relaxUsed of [false, true]) {
		for (const g of gaps) {
			for (const stat of order) {
				const a = value(left, stat)!;
				const ok = (e: Entity) => {
					const b = value(e, stat);
					return e.id !== left.id && b != null && b !== a && (a > 0 || b > 0) && gapOf(a, b) === g;
				};
				const candidates = relaxUsed ? pool.filter(ok) : fresh(ok);
				if (candidates.length) return { stat, left, right: pickOne(candidates, random) };
			}
		}
	}
	throw new Error(`No challenger for ${left.id}`);
}

/* --------------------------------------------------------------- daily --- */

export const DAILY_ROUNDS = 10;
export const CONSTRUCTOR_ROUNDS = 3;

/** The day's ten rounds: drivers, with a run of three constructor rounds somewhere from round 4. */
export function dailyRounds(entities: readonly Entity[], day: number): Round[] {
	const random = rng(hash(`pitwall-higher-lower:${day}`));
	const sorted = [...entities].sort((a, b) => a.id.localeCompare(b.id));
	const start = 3 + Math.floor(random() * (DAILY_ROUNDS - CONSTRUCTOR_ROUNDS - 2));
	const rounds: Round[] = [];
	for (let i = 0; i < DAILY_ROUNDS; i++) rounds.push(nextRound(sorted, rounds, i >= start && i < start + CONSTRUCTOR_ROUNDS ? "team" : "driver", random));
	return rounds;
}

/** Endless: drivers, now and then a short run of constructors. */
export function endlessKind(history: readonly Round[], random: () => number): Kind {
	const last = history[history.length - 1]?.right.kind ?? "driver";
	let run = 0;
	for (let i = history.length - 1; i >= 0 && history[i].right.kind === last; i--) run++;
	if (last === "driver") return run >= 4 && random() < 0.2 ? "team" : "driver";
	return run >= 3 || (run >= 2 && random() < 0.5) ? "driver" : "team";
}

/** Daily score: right answers out of the rounds played. */
export const score = (rounds: readonly Round[], answers: readonly Choice[]) => answers.filter((c, i) => rounds[i] && isCorrect(rounds[i], c)).length;

/** A daily counts as a win (for the streak) at 7 or more out of 10. */
export const WIN_SCORE = 7;

export function shareText({ marks, label, tail, url }: { marks: boolean[]; label: string; tail: string; url?: string }): string {
	return [`Pitwall Higher or lower ${label} ${marks.map((m) => (m ? "✅" : "❌")).join("")} ${tail}`, ...(url ? [url] : [])].join("\n");
}

/** Distribution by score, 0..10. */
export const emptyStats = (): GameStats => emptyGameStats(DAILY_ROUNDS + 1);
export const recordResult = (stats: GameStats, day: number, points: number): GameStats => recordGameResult(stats, day, points >= WIN_SCORE, points);
