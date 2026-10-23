// "Name the grid": one race a day (the same for everyone), its starting grid shown team by
// team with the drivers hidden; name as many starters as you can in three minutes. Pure, so
// the page and the tests share it; the races come from public/data/race-entries.json.

import { dailyPick, fold, randomPick } from "./daily.ts";
import { percentBucket, raceLabel, type RaceDriver, type RaceEntry, type Theme } from "./race-entries.ts";

export { PERCENT_BUCKETS, percentBucketLabel, percentBucketSrLabel } from "./race-entries.ts";

/** Three minutes for a race's grid; themed lists are longer, so they get five. */
export const RACE_TIME = 180_000;
export const THEME_TIME = 300_000;
export const MIN_STARTERS = 18;
export const MAX_STARTERS = 26;
/** Drivers with fewer career starts than this count as obscure; races with more than MAX_OBSCURE of them aren't picked. */
export const OBSCURE_STARTS = 25;
export const MAX_OBSCURE = 3;

/** Races worth a daily puzzle: a full-sized grid of mostly recognisable drivers. */
export function eligible(r: RaceEntry): boolean {
	const n = r.entries.length;
	return r.year >= 1980 && n >= MIN_STARTERS && n <= MAX_STARTERS && r.entries.filter((e) => e.driver.starts < OBSCURE_STARTS).length <= MAX_OBSCURE;
}

export const gridPool = (races: readonly RaceEntry[]) => races.filter(eligible).sort((a, b) => a.order - b.order);
export const dailyGrid = (races: readonly RaceEntry[], day: number) => dailyPick(gridPool(races), "name-the-grid", day);
export const randomGrid = (races: readonly RaceEntry[], random = Math.random, exclude?: string) => randomPick(races.filter(eligible), random, exclude);

/* ---------------------------------------------------------------- slots --- */

/** Something to name: the driver, a short label (grid position) and the clue shown in its place (team). */
export type Slot = { driver: RaceDriver; label: string; clue: string; teamId?: string };

export const raceSlots = (r: RaceEntry): Slot[] =>
	r.entries.map((e) => ({ driver: e.driver, label: e.grid ? `P${e.grid}` : "PL", clue: e.team.name, teamId: e.team.id }));
export const themeSlots = (t: Theme): Slot[] => t.items.map((it, i) => ({ driver: it.driver, label: `${i + 1}`, clue: it.clue }));

/* ------------------------------------------------------------- matching --- */

/** A name reduced to letters and digits: accents, case, spaces, hyphens, apostrophes and dots don't matter. */
export const nameKey = (s: string) =>
	fold(s)
		.replace(/ø/g, "o")
		.replace(/ß/g, "ss")
		.replace(/æ/g, "ae")
		.replace(/œ/g, "oe")
		.replace(/ł/g, "l")
		.replace(/đ/g, "d")
		.replace(/[^a-z0-9]/g, "");
const SUFFIX = /\s+(jr\.?|sr\.?|ii|iii)$/i;
/** Leading surname particles that people often leave out ("de Cesaris" → "Cesaris"). */
const PARTICLES = new Set(["de", "da", "di", "do", "dos", "du", "la", "le", "van", "von", "der", "den", "zu"]);

/**
 * Well-known short forms, by driver id: an iconic first name or a nickname used on its own.
 * Only accepted while no other unnamed driver in the puzzle shares it (as a short form or as
 * their first name), so "Kimi" stays ambiguous while Räikkönen and Antonelli are both unnamed.
 */
export const ALIASES: Readonly<Record<string, readonly string[]>> = {
	"ayrton-senna": ["ayrton"],
	"kimi-raikkonen": ["kimi"],
	"kimi-antonelli": ["kimi"],
	"nigel-mansell": ["nigel"],
	"alain-prost": ["alain"],
	"niki-lauda": ["niki"],
	"lewis-hamilton": ["lewis"],
	"fernando-alonso": ["fernando", "nando"],
	"sebastian-vettel": ["seb"],
	"michael-schumacher": ["schumi"],
	"sergio-perez": ["checo"],
	"lando-norris": ["lando"],
	"keke-rosberg": ["keke"],
	"gilles-villeneuve": ["gilles"],
	"jochen-rindt": ["jochen"],
	"jackie-stewart": ["jackie"],
	"mika-hakkinen": ["mika"],
	"rubens-barrichello": ["rubens", "rubinho"],
	"jenson-button": ["jenson"],
	"valtteri-bottas": ["valtteri"],
	"emerson-fittipaldi": ["emerson"],
	"juan-pablo-montoya": ["jpm"],
	"nico-hulkenberg": ["hulk"],
	"kevin-magnussen": ["kmag"],
};

export type DriverKeys = { full: string[]; surname: string[]; alias: string[]; first: string };

/**
 * A driver's accepted keys: full names (with and without "Jr.", each of several first names +
 * surname, the surname with and without particles), which count whenever they're unique; and
 * the short ones (surnames, aliases), which count only when unique among the drivers still to name.
 */
export function driverKeys(d: RaceDriver): DriverKeys {
	const last = d.last || d.name.split(" ").slice(-1)[0];
	const bare = last.replace(SUFFIX, "");
	const words = bare.split(/[\s-]+/).filter(Boolean);
	let p = 0;
	while (p < words.length - 1 && PARTICLES.has(nameKey(words[p]))) p++;
	const core = words.slice(p).join(" ");
	const firsts = d.first ? [d.first, ...d.first.split(/[\s-]+/)] : [];
	const full = new Set([nameKey(d.name), nameKey(d.name.replace(SUFFIX, "")), ...firsts.flatMap((f) => [nameKey(`${f} ${last}`), nameKey(`${f} ${bare}`), nameKey(`${f} ${core}`)])]);
	const surname = new Set([nameKey(last), nameKey(bare), nameKey(core)]);
	full.delete("");
	surname.delete("");
	for (const s of surname) full.delete(s); // mononyms: the name is the surname
	return { full: [...full], surname: [...surname], alias: [...(ALIASES[d.id] ?? [])], first: nameKey(d.first ?? "") };
}

export type Matcher = { slots: DriverKeys[] };

export const matcher = (slots: readonly Slot[]): Matcher => ({ slots: slots.map((s) => driverKeys(s.driver)) });

export type MatchResult =
	/**
	 * Names exactly one starter not yet named. `wait` means fill only on Enter, because the input
	 * is also the start of another unnamed starter's name ("prefix"), it's a close but misspelt
	 * match ("fuzzy"), or the surname also belongs to a driver already named ("other").
	 */
	| { kind: "hit"; index: number; wait: boolean; reason?: "prefix" | "fuzzy" | "other" }
	/** Fits several starters still to name: needs more of the name. */
	| { kind: "ambiguous"; count: number }
	/** Names a starter who's already been named. */
	| { kind: "named"; index: number }
	| { kind: "none" };

/** How many typos a key of this length tolerates: none under 5 letters, 1 up to 7, 2 from 8. */
export const tolerance = (len: number) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

/** Optimal-string-alignment distance (swapping two neighbours is one edit); anything over `max` comes back as max + 1. */
export function editDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev2: number[] = [];
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		let low = i;
		for (let j = 1; j <= b.length; j++) {
			let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
			cur.push(v);
			if (v < low) low = v;
		}
		if (low > max) return max + 1;
		prev2 = prev;
		prev = cur;
	}
	return Math.min(prev[b.length], max + 1);
}

export function matchName(m: Matcher, input: string, named: ReadonlySet<number>): MatchResult {
	const q = nameKey(input);
	if (q.length < 2) return { kind: "none" };
	const s = m.slots;
	const all = s.map((_, i) => i);
	const open = all.filter((i) => !named.has(i));
	const done = all.filter((i) => named.has(i));
	// a short form counts only if no other unnamed driver has it as a short form or first name
	const aliasOk = (i: number, a: string) => !open.some((j) => j !== i && (s[j].alias.includes(a) || s[j].first === a));
	const shortKeys = (i: number) => [...s[i].surname, ...s[i].alias.filter((a) => aliasOk(i, a))];
	const anyKeys = (i: number) => [...s[i].full, ...s[i].surname, ...s[i].alias];
	const hit = (index: number): MatchResult =>
		open.some((i) => i !== index && anyKeys(i).some((k) => k.length > q.length && k.startsWith(q)))
			? { kind: "hit", index, wait: true, reason: "prefix" }
			: { kind: "hit", index, wait: false };

	// 1. a full name
	const fullOpen = open.filter((i) => s[i].full.includes(q));
	if (fullOpen.length === 1) return hit(fullOpen[0]);
	if (fullOpen.length > 1) return { kind: "ambiguous", count: fullOpen.length };
	const fullNamed = done.find((i) => s[i].full.includes(q));
	if (fullNamed != null) return { kind: "named", index: fullNamed };

	// 2. a surname or short form, unique among the drivers still to name
	const shortOpen = open.filter((i) => shortKeys(i).includes(q));
	const shortNamed = done.filter((i) => s[i].surname.includes(q) || s[i].alias.includes(q));
	if (shortOpen.length === 1) return shortNamed.length ? { kind: "hit", index: shortOpen[0], wait: true, reason: "other" } : hit(shortOpen[0]);
	if (shortOpen.length > 1) return { kind: "ambiguous", count: shortOpen.length };
	const aliasShared = open.filter((i) => s[i].alias.includes(q)).length;
	if (aliasShared > 1) return { kind: "ambiguous", count: aliasShared };
	if (shortNamed.length) return { kind: "named", index: shortNamed[0] };

	// 3. a small typo: exactly one unnamed driver that close, and no named driver as close
	if (q.length < 5) return { kind: "none" };
	const dist = (keys: string[]) => {
		let best = Infinity;
		for (const k of keys) {
			const tol = tolerance(k.length);
			if (!tol) continue;
			const d = editDistance(q, k, tol);
			if (d <= tol && d < best) best = d;
		}
		return best;
	};
	const near = open.map((i) => ({ i, d: dist([...s[i].full, ...shortKeys(i)]) })).filter((x) => x.d < Infinity);
	if (near.length > 1) return { kind: "ambiguous", count: near.length };
	const limit = near[0]?.d ?? Number.MAX_SAFE_INTEGER; // nobody unnamed is close: any close named driver
	const closerNamed = done.find((i) => dist(anyKeys(i)) <= limit);
	if (near.length === 0) return closerNamed != null ? { kind: "named", index: closerNamed } : { kind: "none" };
	if (closerNamed != null) return { kind: "named", index: closerNamed };
	return { kind: "hit", index: near[0].i, wait: true, reason: "fuzzy" };
}

/** The line under the input for a match result. Never names a driver who's still to be found. */
export function matchHint(res: MatchResult, input: string, slots: readonly Slot[]): string | null {
	if (res.kind === "ambiguous") return `Which one? ${res.count} drivers still to name fit “${input.trim()}”: add more of the name.`;
	if (res.kind === "named") return `${slots[res.index].driver.name} is already named.`;
	if (res.kind === "hit" && res.wait) {
		if (res.reason === "fuzzy") return "Close enough: press Enter to name them.";
		if (res.reason === "other") return "Already named one of those: press Enter for the other.";
		return "Press Enter to name them.";
	}
	return null;
}

/* ---------------------------------------------------------------- clock --- */

/** "2:41" */
export const clock = (ms: number) => {
	const s = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/* -------------------------------------------------------------- sharing --- */

/** "Pitwall Name the grid #3 · 1994 Pacific GP · 21/26 in 2:41" and the link. */
export function shareText({ label, title, named, total, ms, url }: { label: string; title: string; named: number; total: number; ms: number; url?: string }) {
	return [`Pitwall Name the grid ${label} · ${title} · ${named}/${total} in ${clock(ms)}`, ...(url ? [url] : [])].join("\n");
}
export const shareTitle = (r: RaceEntry) => raceLabel(r);

/* ---------------------------------------------------------------- stats --- */

/** A daily counts as won when at least half the grid is named; the distribution is by percentage named. */
export const isWin = (named: number, total: number) => total > 0 && named * 2 >= total;
export const resultBucket = (named: number, total: number) => percentBucket(named, total);
