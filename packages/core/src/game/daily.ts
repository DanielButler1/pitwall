// Shared plumbing for the daily games under /play: the UTC puzzle calendar, deterministic
// picks, win/streak stats, verdicts, name search and saved state (localStorage, or the app's storage). Pure (no React), so pages
// and node tests share it; the UI half lives in components/play/kit.tsx.

/* ------------------------------------------------------------- calendar --- */

/** Puzzle #1 of every game is 21 October 2026 (UTC). */
export const EPOCH = Date.UTC(2026, 9, 21);
export const DAY = 86_400_000;
/** Days since the first puzzle, by UTC date (0 on launch day). */
export const dayIndex = (now: Date | number = Date.now()) => Math.floor((+now - EPOCH) / DAY);
export const puzzleNumber = (day: number) => day + 1;
/** Milliseconds until the next UTC midnight, when the next puzzle starts. */
export const msToNextPuzzle = (now: Date | number = Date.now()) => DAY - ((((+now - EPOCH) % DAY) + DAY) % DAY);

export type GameMode = "daily" | "practice";

/* --------------------------------------------------------------- random --- */

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** FNV-1a: a string to a 32-bit seed. */
export const hash = (s: string) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
};

export function shuffle<T>(items: readonly T[], seed: number): T[] {
	const out = [...items];
	const next = rng(seed);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * The day's pick for a game: the pool is shuffled once per cycle through it (seeded by
 * `pitwall-${game}:${cycle}`), so nothing repeats until everything has had a turn and each
 * game (or game variant, e.g. "guess:modern") picks independently. The pool must be in a
 * stable order (sort it by id) or picks change when the data file does.
 */
export function dailyPick<T>(pool: readonly T[], game: string, day: number): T {
	if (!pool.length) throw new Error(`Empty pool for ${game}`);
	const cycle = Math.floor(day / pool.length);
	const at = ((day % pool.length) + pool.length) % pool.length;
	return shuffle(pool, hash(`pitwall-${game}:${cycle}`))[at];
}

/** A random pick for practice, never `exclude` (the one just played) unless it's all there is. */
export function randomPick<T extends { id: string }>(pool: readonly T[], random = Math.random, exclude?: string): T {
	const rest = pool.length > 1 ? pool.filter((x) => x.id !== exclude) : pool;
	return rest[Math.floor(random() * rest.length)];
}

/* ------------------------------------------------------------- verdicts --- */

/** How a clue compares with the answer: the green / amber / grey tiles. */
export type Verdict = "match" | "close" | "miss";
/** Where the answer's value lies relative to the guess's. */
export type Direction = "higher" | "lower" | null;

/** Emoji squares for share grids. */
export const VERDICT_SQUARE: Record<Verdict, string> = { match: "🟩", close: "🟨", miss: "⬛" };

/** A numeric clue: exact is a match, within `near` (inclusive) is close, plus which way to go. */
export function compareNumber(guess: number, target: number, near?: number): { verdict: Verdict; direction: Direction } {
	if (guess === target) return { verdict: "match", direction: null };
	return { verdict: near != null && Math.abs(guess - target) <= near ? "close" : "miss", direction: target > guess ? "higher" : "lower" };
}

/* ---------------------------------------------------------------- stats --- */

export type GameStats = {
	played: number;
	won: number;
	streak: number;
	maxStreak: number;
	/** Results per bucket (e.g. index 0 = solved with the first guess); the game decides what a bucket means. */
	distribution: number[];
	/** Day index of the last finished daily puzzle. */
	lastDay: number | null;
};

export const emptyStats = (buckets: number): GameStats => ({ played: 0, won: 0, streak: 0, maxStreak: 0, distribution: Array(buckets).fill(0), lastDay: null });

/**
 * Records a finished daily puzzle (once per day: repeats are ignored). A win extends the
 * streak, anything else ends it; `bucket` (0-based) is counted in the distribution when given.
 */
export function recordResult(stats: GameStats, day: number, won: boolean, bucket?: number | null): GameStats {
	if (stats.lastDay != null && day <= stats.lastDay) return stats;
	const streak = won ? (stats.lastDay === day - 1 ? stats.streak : 0) + 1 : 0;
	const distribution = [...stats.distribution];
	if (bucket != null) distribution[bucket] = (distribution[bucket] ?? 0) + 1;
	return { played: stats.played + 1, won: stats.won + (won ? 1 : 0), streak, maxStreak: Math.max(stats.maxStreak, streak), distribution, lastDay: day };
}

/** The streak still alive today: broken once a whole day is missed. */
export const currentStreak = (stats: GameStats, today: number) => (stats.lastDay != null && stats.lastDay >= today - 1 ? stats.streak : 0);

/** Which of `buckets` equal-width buckets a score in 0..max falls in (for points-based distributions). */
export const scoreBucket = (score: number, max: number, buckets: number) => Math.min(buckets - 1, Math.max(0, Math.floor((score / max) * buckets)));

/* --------------------------------------------------------------- search --- */

export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Items whose name matches every query token (prefix of a word, or anywhere), best first;
 * among equal matches a higher `weight` (e.g. how well known) wins.
 */
export function searchByName<T extends { id: string }>(
	items: readonly T[],
	query: string,
	name: (item: T) => string,
	weight: (item: T) => number = () => 0,
	exclude: ReadonlySet<string> = new Set(),
	limit = 8,
): T[] {
	const q = fold(query.trim());
	if (!q) return [];
	const tokens = q.split(/\s+/);
	const hits: { d: T; s: number }[] = [];
	for (const d of items) {
		if (exclude.has(d.id)) continue;
		const n = fold(name(d));
		const words = n.split(/[\s\-.']+/);
		let s = 0;
		for (const t of tokens) {
			if (words.some((w) => w.startsWith(t))) continue;
			if (n.includes(t)) s += 2;
			else {
				s = -1;
				break;
			}
		}
		if (s < 0) continue;
		if (n.startsWith(q)) s -= 1;
		hits.push({ d, s: s * 10_000 - weight(d) });
	}
	return hits
		.sort((a, b) => a.s - b.s)
		.slice(0, limit)
		.map((h) => h.d);
}

/* -------------------------------------------------------------- storage --- */

/** Synchronous string storage: the browser's localStorage, or what the mobile app provides. */
export type KeyValueStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

let storage: KeyValueStorage | null = null;
/** Where saves go; defaults to localStorage. The mobile app sets its own at startup. */
export function setGameStorage(s: KeyValueStorage) {
	storage = s;
}
const kv = (): KeyValueStorage => storage ?? (globalThis as { localStorage?: KeyValueStorage }).localStorage!;

/** A daily save: the game's own state, tagged with the day it belongs to. */
export type DailySave<T> = { day: number } & T;

/** Saved state for one game, under `pitwall-${game}:`; reads fall back, writes never throw. */
export function gameStore(game: string) {
	const prefix = `pitwall-${game}:`;
	const read = <T>(key: string, fallback: T): T => {
		try {
			const raw = kv().getItem(prefix + key);
			return raw ? (JSON.parse(raw) as T) : fallback;
		} catch {
			return fallback;
		}
	};
	const write = (key: string, value: unknown) => {
		try {
			kv().setItem(prefix + key, JSON.stringify(value));
		} catch {}
		// a daily result was just recorded: note it for the /play hub
		if (key.startsWith("stats")) {
			const day = (value as Partial<GameStats> | null)?.lastDay;
			if (typeof day === "number") logPlay(game, day);
		}
	};
	return {
		read,
		write,
		/** Stats saved under `key`, filled in from empty ones (so old saves gain new fields). */
		readStats: (key: string, buckets: number): GameStats => ({ ...emptyStats(buckets), ...read<Partial<GameStats>>(key, {}) }),
		/** Today's saved progress under `key`, or null if there's none or it's from another day. */
		readDaily: <T extends object>(key: string, today: number): DailySave<T> | null => {
			const save = read<DailySave<T> | null>(key, null);
			return save?.day === today ? save : null;
		},
		/** Saves today's progress as `{ day, ...state }`. */
		writeDaily: <T extends object>(key: string, today: number, state: T) => write(key, { day: today, ...state }),
	};
}
export type GameStore = ReturnType<typeof gameStore>;

/* ------------------------------------------------------------- play log --- */

/** Which daily games were finished on which days, newest first: `[day, gameIds][]`. */
export type PlayLog = [number, string[]][];
const PLAY_LOG = "pitwall-play:log";

export function readPlayLog(): PlayLog {
	try {
		return JSON.parse(kv().getItem(PLAY_LOG) ?? "[]") as PlayLog;
	} catch {
		return [];
	}
}

/** Notes that `game`'s daily puzzle was finished on `day` (the last 400 days are kept). */
export function logPlay(game: string, day: number) {
	const log = readPlayLog();
	const entry = log.find(([d]) => d === day);
	if (entry?.[1].includes(game)) return;
	if (entry) entry[1].push(game);
	else log.push([day, [game]]);
	log.sort((a, b) => b[0] - a[0]);
	try {
		kv().setItem(PLAY_LOG, JSON.stringify(log.slice(0, 400)));
	} catch {}
}

/** Days in a row, up to today, with at least one daily puzzle finished (today may still be to come). */
export function playStreak(log: PlayLog, today: number): number {
	const days = new Set(log.map(([d]) => d));
	let day = days.has(today) ? today : today - 1;
	let streak = 0;
	while (days.has(day)) {
		streak++;
		day--;
	}
	return streak;
}
