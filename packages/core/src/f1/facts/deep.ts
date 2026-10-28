// The buried facts: the shape of the race (how many finished, how close it was, how close pole
// was, the polesitter's luck, a run of different winners, who led), who was on the podium (one
// nation, no champions, one team), and the people (places gained, points from the back, birthdays,
// home wins, debuts, parents and children, team-mate battles, the same Grand Prix year after year).
//
// Most are "the first time since": something is true of this race, so look back for the last race
// it was true of. Lap and qualifying-time facts only go back as far as that data does, so they
// never claim "ever".

import type { Db, Result } from "../dataset.ts";
import { isStart } from "../dataset.ts";
import { ageDaysAt, cached, facts, isClassified, isPodium, isWin, type RaceFacts } from "../records/facts.ts";
import { cDriver, cGp, cSeason, cTeam } from "../records/cells.ts";
import { lapLeaders, LAPS_FROM } from "../laps.ts";
import { sharedRaces } from "../teammates.ts";
import { ageOn } from "../stats.ts";
import { ordinal } from "../anniversaries.ts";
import { deciders } from "../records/titles.ts";
import { champions } from "../records/facts.ts";
import { HISTORY, P, cDemonym, cRaceFull, log2, occurrences, possessive, sentence, upTo, years, type Add } from "./shared.ts";

/* ------------------------------------------------------------- helpers --- */

/** "+7.335" or "+1:02.345" in ms, or laps behind for "+2 laps". */
function parseGap(gap: string | null): { ms: number } | { laps: number } | null {
	if (!gap) return null;
	const laps = /^\+(\d+) laps?$/.exec(gap);
	if (laps) return { laps: Number(laps[1]) };
	const t = /^\+(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(gap);
	return t ? { ms: Math.round((Number(t[1] ?? 0) * 60 + Number(t[2])) * 1000) } : null;
}
/** "1:23.456" in ms. */
function parseLap(time: string | null): number | null {
	const t = time && /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(time);
	return t ? Math.round((Number(t[1] ?? 0) * 60 + Number(t[2])) * 1000) : null;
}
const secs = (ms: number) => `${(ms / 1000).toFixed(3)}s`;

/** Winner's margin over second: ms, or Infinity when second was a lap or more down. */
function margin(f: RaceFacts): number | null {
	const second = f.results.find((r) => r.position === 2);
	const g = parseGap(second?.gap ?? null);
	if (!g) return null;
	return "laps" in g ? Infinity : g.ms;
}

/** How far ahead pole was, from the last qualifying session both front-row men set a time in. */
function poleMargin(db: Db, f: RaceFacts): number | null {
	const rows = db.qualifyingByRace.get(f.race.id) ?? [];
	const [a, b] = [rows.find((q) => q.position === 1), rows.find((q) => q.position === 2)];
	if (!a || !b) return null;
	for (const s of ["q3", "q2", "q1", "time"] as const) {
		const [x, y] = [parseLap(a[s]), parseLap(b[s])];
		if (x != null && y != null) return y >= x ? y - x : null;
	}
	return null;
}

/** The latest race before `from` that `test` holds for, or -1. */
function lastWhere(F: { races: RaceFacts[] }, from: number, test: (rf: RaceFacts) => boolean, stop = 0): number {
	for (let i = from - 1; i >= stop; i--) if (test(F.races[i])) return i;
	return -1;
}

/** Champions crowned before a race (by the race that decided each title). */
function championsBefore(db: Db, idx: number): Set<string> {
	const dec = deciders(db, "driver");
	return new Set(champions(db, "driver").filter((c) => (dec.get(c.year) ?? Infinity) < idx).map((c) => c.id));
}

/** Results of drivers making their first start, per race. */
function debuts(db: Db): Map<number, Result[]> {
	return cached(db, "race-facts:debuts", () => {
		const out = new Map<number, Result[]>();
		const starts = occurrences(db, "driver", "start");
		for (const f of facts(db).races)
			for (const r of f.results) {
				if (!isStart(r) || starts.get(r.driverId)?.[0] !== f.idx) continue;
				const list = out.get(f.idx) ?? [];
				list.push(r);
				out.set(f.idx, list);
			}
		return out;
	});
}

const md = (iso: string) => iso.slice(5, 10);

/* --------------------------------------------------------------- facts --- */

export function deepFacts(db: Db, f: RaceFacts, add: Add) {
	const F = facts(db);
	const settled = f.idx >= HISTORY;
	const race = f.race;
	const raceAt = (i: number) => F.races[i].race;
	const since = (i: number) => cRaceFull(db, raceAt(i));
	const gapScore = (gap: number, base = 30, w = 2) => w * log2(gap / (base / 2));
	const w = f.winner;

	// ---- the shape of the race

	// how many were classified
	const started = f.results.filter(isStart);
	const classified = f.results.filter(isClassified).length;
	if (started.length >= 10) {
		if (classified <= started.length / 2) {
			const prev = lastWhere(F, f.idx, (rf) => rf.results.filter(isClassified).length <= classified && rf.results.filter(isStart).length >= 10);
			if (prev >= 0 && f.idx - prev >= 30) add("shape", "race:finishers", gapScore(f.idx - prev), sentence(`Only ${classified} of the ${started.length} starters were classified, the fewest since the `, since(prev)));
		} else if (classified === started.length) {
			const prev = lastWhere(F, f.idx, (rf) => {
				const s = rf.results.filter(isStart).length;
				return s >= 10 && rf.results.filter(isClassified).length === s;
			});
			if (prev >= 0 && f.idx - prev >= 20) add("shape", "race:finishers", gapScore(f.idx - prev, 20), sentence(`All ${started.length} starters were classified, for the first time since the `, since(prev)));
		}
	}

	// how close it was
	const m = margin(f);
	if (w && m != null) {
		if (m === Infinity) {
			const prev = lastWhere(F, f.idx, (rf) => margin(rf) === Infinity);
			if (prev >= 0 && f.idx - prev >= 30) add("margin", "race:margin", gapScore(f.idx - prev, 30, 2.5), sentence(cDriver(db, w.driverId), " won by a lap or more, the first time since the ", since(prev)));
		} else if (m <= 500) {
			const prev = lastWhere(F, f.idx, (rf) => (margin(rf) ?? Infinity) <= m);
			if (prev >= 0 && f.idx - prev >= 30) add("margin", "race:margin", gapScore(f.idx - prev, 30, 2.5), sentence(cDriver(db, w.driverId), ` won by ${secs(m)}, the closest finish since the `, since(prev)));
		} else if (m >= 20_000) {
			const prev = lastWhere(F, f.idx, (rf) => (margin(rf) ?? 0) >= m);
			if (prev >= 0 && f.idx - prev >= 30) add("margin", "race:margin", gapScore(f.idx - prev, 30, 2), sentence(cDriver(db, w.driverId), ` won by ${secs(m)}, the biggest winning margin since the `, since(prev)));
		}
	}

	// how close pole was
	const pm = poleMargin(db, f);
	const pole = f.results.find((r) => r.pole);
	if (pm != null && pole) {
		if (pm <= 30) {
			const prev = lastWhere(F, f.idx, (rf) => (poleMargin(db, rf) ?? Infinity) <= pm);
			if (prev >= 0 && f.idx - prev >= 30) add("quali", "race:pole-margin", gapScore(f.idx - prev, 30, 2), sentence(cDriver(db, pole.driverId), ` took pole by ${secs(pm)}, the closest since the `, since(prev)));
		} else if (pm >= 500) {
			const prev = lastWhere(F, f.idx, (rf) => (poleMargin(db, rf) ?? 0) >= pm);
			if (prev >= 0 && f.idx - prev >= 30) add("quali", "race:pole-margin", gapScore(f.idx - prev, 30, 2), sentence(cDriver(db, pole.driverId), ` took pole by ${secs(pm)}, the biggest margin since the `, since(prev)));
		}
	}

	// the polesitter's luck: a run of races won (or not) from pole
	const fromPole = (rf: RaceFacts) => (rf.winner ? rf.winner.pole : null);
	if (w && fromPole(f) != null) {
		const now = fromPole(f)!;
		let L = 0;
		for (let i = f.idx; i >= 0 && fromPole(F.races[i]) === now; i--) L++;
		const need = now ? 6 : 8;
		if (L >= need && (L === need || L % 5 === 0)) {
			// the last run at least this long
			let prev = -1;
			for (let i = f.idx - L, run = 0; i >= 0; i--) {
				run = fromPole(F.races[i]) === now ? run + 1 : 0;
				if (run >= L) {
					prev = i + L - 1;
					break;
				}
			}
			const text = now ? `The ${ordinal(L)} race in a row won from pole` : `The polesitter hasn't won for ${L} races`;
			if (prev < 0 && settled) add("shape", "race:pole-run", 7, sentence(text, ", the longest run ever"));
			else if (prev >= 0 && f.idx - prev >= 30) add("shape", "race:pole-run", gapScore(f.idx - prev), sentence(text, ", the longest run since the ", since(prev)));
		}
	}

	// different winners in a row
	if (w) {
		const seen = new Set<string>();
		let K = 0;
		for (let i = f.idx; i >= 0; i--) {
			const id = F.races[i].winner?.driverId;
			if (!id || seen.has(id)) break;
			seen.add(id);
			K++;
		}
		if (K >= 6) {
			let prev = -1;
			for (let i = f.idx - 1; i >= K - 1 && prev < 0; i--) {
				const ids = new Set<string>();
				for (let j = i; j > i - K; j--) ids.add(F.races[j].winner?.driverId ?? `-${j}`);
				if (ids.size === K) prev = i;
			}
			if (prev < 0 && settled) add("shape", "race:winners", 8, sentence(`${K} different winners in ${K} races, the longest run ever`));
			else if (prev >= 0 && f.idx - prev >= 30) add("shape", "race:winners", gapScore(f.idx - prev), sentence(`${K} different winners in the last ${K} races, the first time since the `, since(prev)));
		}
	}

	// who led (lap charts)
	const spans = lapLeaders(db, race.id);
	if (spans?.length && w) {
		const lastLap = spans[spans.length - 1][2];
		const lapsOf = (sp: typeof spans, id: string) => sp.filter(([d]) => d === id);
		const mine = lapsOf(spans, w.driverId);
		const onlyLast = (sp: typeof spans, id: string) => {
			const s = lapsOf(sp, id);
			const end = sp[sp.length - 1][2];
			// a race barely run (2021 Belgium) doesn't count
			return end >= 10 && s.length === 1 && s[0][1] === end && s[0][2] === end;
		};
		const lapRaces = (test: (rf: RaceFacts, sp: NonNullable<typeof spans>) => boolean) => lastWhere(F, f.idx, (rf) => {
			const sp = lapLeaders(db, rf.race.id);
			return !!sp?.length && !!rf.winner && test(rf, sp);
		});
		if (onlyLast(spans, w.driverId)) {
			const prev = lapRaces((rf, sp) => onlyLast(sp, rf.winner!.driverId));
			add("laps", "race:last-lap", prev < 0 ? 8 : 4 + log2((f.idx - prev) / 10), sentence(cDriver(db, w.driverId), " won having led only the last lap", prev < 0 ? `, the first time in the lap charts (from ${LAPS_FROM})` : [", the first time since the ", since(prev)]));
		}
		const leaders = new Set(spans.map(([d]) => d)).size;
		if (leaders >= 5) {
			const prev = lapRaces((_, sp) => new Set(sp.map(([d]) => d)).size >= leaders);
			if (prev < 0 || f.idx - prev >= 30) add("laps", "race:leaders", prev < 0 ? 7 : gapScore(f.idx - prev), sentence(`${leaders} different drivers led the race, the most `, prev < 0 ? `in the lap charts (from ${LAPS_FROM})` : ["since the ", since(prev)]));
		}
	}

	// grand slams: pole, win, fastest lap and every lap led
	const slam = f.results.find((r) => r.grandSlam);
	if (slam) {
		const n = upTo(occurrencesOf(db, "slam", (r) => r.grandSlam).get(slam.driverId) ?? [], f.idx);
		const prev = lastWhere(F, f.idx, (rf) => rf.results.some((r) => r.grandSlam));
		const head = sentence(...possessive(cDriver(db, slam.driverId)), ` ${n === 1 ? "first" : ordinal(n)} grand slam (pole, win, fastest lap and every lap led)`);
		add("laps", `driver:${slam.driverId}:slam`, prev >= 0 && f.idx - prev >= 20 ? 3 + log2((f.idx - prev) / 5) : 3 + (n === 1 ? 2 : 0), prev >= 0 && f.idx - prev >= 20 ? sentence(head, ", the first by anyone since the ", since(prev)) : head);
	}

	// ---- the podium
	const podium = [1, 2, 3].map((p) => f.results.find((r) => r.position === p));
	if (podium.every(Boolean)) {
		const top = podium as Result[];
		// one nation
		const nations = top.map((r) => db.drivers.get(r.driverId)?.nationality);
		if (nations[0] && nations.every((n) => n === nations[0])) {
			const nat = nations[0];
			const prev = lastWhere(F, f.idx, (rf) => {
				const p = [1, 2, 3].map((x) => rf.results.find((r) => r.position === x));
				return p.every((r) => r && db.drivers.get(r.driverId)?.nationality === nat);
			});
			if (prev < 0 && settled) add("podium", `nation:${nat}:podium`, 8, sentence("The first all-", cDemonym(db, nat), " podium"));
			else if (prev >= 0 && f.idx - prev >= 20) add("podium", `nation:${nat}:podium`, gapScore(f.idx - prev, 20, 2.2), sentence("An all-", cDemonym(db, nat), " podium, the first since the ", since(prev)));
		}
		// one team
		const team = top[0].constructorId;
		if (top.every((r) => r.constructorId === team)) {
			const prev = lastWhere(F, f.idx, (rf) => {
				const p = [1, 2, 3].map((x) => rf.results.find((r) => r.position === x));
				return p.every((r) => r && r.constructorId === p[0]!.constructorId);
			});
			if (prev >= 0 && f.idx - prev >= 30) add("podium", `constructor:${team}:lockout`, gapScore(f.idx - prev, 30, 2.4), sentence(cTeam(db, team), " filled the podium, the first team to since the ", since(prev)));
		}
		// champions on it
		if (race.year >= 1953) {
			const champs = championsBefore(db, f.idx);
			const count = (rf: RaceFacts) => [1, 2, 3].filter((x) => champs.has(rf.results.find((r) => r.position === x)?.driverId ?? "")).length;
			const n = count(f);
			if (n === 0 || n === 3) {
				const prev = lastWhere(F, f.idx, (rf) => {
					const c = championsBefore(db, rf.idx);
					const k = [1, 2, 3].filter((x) => c.has(rf.results.find((r) => r.position === x)?.driverId ?? "")).length;
					return k === n;
				});
				const text = n === 0 ? "No world champion on the podium" : "Three world champions on the podium";
				if (prev >= 0 && f.idx - prev >= 20) add("podium", `race:champions`, gapScore(f.idx - prev, 20, 2), sentence(text, ", for the first time since the ", since(prev)));
			}
		}
		// a young podium
		const ages = top.map((r) => ageDaysAt(db, r.driverId, race.date));
		if (ages.every((a) => a != null)) {
			const avg = ages.reduce((a, b) => a! + b!, 0)! / 3;
			if (avg < years(24.5)) {
				const prev = lastWhere(F, f.idx, (rf) => {
					const p = [1, 2, 3].map((x) => rf.results.find((r) => r.position === x));
					const a = p.map((r) => (r ? ageDaysAt(db, r.driverId, rf.race.date) : null));
					return a.every((x) => x != null) && a.reduce((s, x) => s! + x!, 0)! / 3 <= avg;
				});
				if (prev < 0 && settled) add("podium", "race:young", 8, sentence("The youngest podium ever, averaging ", ageText(avg)));
				else if (prev >= 0 && f.idx - prev >= 30) add("podium", "race:young", gapScore(f.idx - prev), sentence("The youngest podium since the ", since(prev), ", averaging ", ageText(avg)));
			}
		}
	}

	// ---- the people

	// places gained
	const maxGrid = Math.max(0, ...f.results.map((r) => r.grid ?? 0));
	for (const r of f.results) {
		if (!r.grid || !r.position || isWin(r)) continue;
		if (isPodium(r) && r.grid >= 10) {
			const prev = lastWhere(F, f.idx, (rf) => rf.results.some((x) => isPodium(x) && (x.grid ?? 0) >= r.grid!));
			if (prev >= 0 && f.idx - prev >= 25) add("grid", `driver:${r.driverId}:podium-grid`, gapScore(f.idx - prev, 25, 2), sentence(cDriver(db, r.driverId), ` finished ${ordinal(r.position)} from ${P(r.grid)}, the lowest grid slot for a podium since the `, since(prev)));
		}
		if (r.points > 0 && r.grid === maxGrid && maxGrid >= 18) {
			const lastOnGrid = (rf: RaceFacts) => {
				const mg = Math.max(0, ...rf.results.map((x) => x.grid ?? 0));
				return mg >= 18 && rf.results.some((x) => x.grid === mg && x.points > 0);
			};
			const prev = lastWhere(F, f.idx, lastOnGrid);
			if (prev >= 0 && f.idx - prev >= 15) add("grid", `driver:${r.driverId}:from-last`, gapScore(f.idx - prev, 15, 2), sentence(cDriver(db, r.driverId), ` scored points from last on the grid (${P(r.grid)}), the first driver to since the `, since(prev)));
		}
	}

	// birthdays
	const birthday = (r: Result, date: string) => md(db.drivers.get(r.driverId)?.dateOfBirth ?? "--------") === md(date);
	for (const [label, noun, test] of [
		["won", "win", isWin],
		["finished on the podium", "podium", isPodium],
	] as const) {
		const r = f.results.find((x) => test(x) && birthday(x, race.date));
		if (!r) continue;
		const prev = lastWhere(F, f.idx, (rf) => rf.results.some((x) => test(x) && birthday(x, rf.race.date)));
		const age = ageOn(db.drivers.get(r.driverId)!.dateOfBirth!, race.date);
		const head = sentence(cDriver(db, r.driverId), ` ${label} on the day of turning ${age}`);
		const score = (noun === "win" ? 6 : 4) + (prev < 0 || f.idx - prev > 100 ? 1 : 0);
		if (prev < 0) add("birthday", `driver:${r.driverId}:birthday`, score, settled ? sentence(head, `, the first birthday ${noun} in a Grand Prix`) : head);
		else {
			const who = F.races[prev].results.find((x) => test(x) && birthday(x, F.races[prev].race.date))!;
			add("birthday", `driver:${r.driverId}:birthday`, score, sentence(head, `, the first birthday ${noun} since `, cDriver(db, who.driverId), " at the ", since(prev)));
		}
		break;
	}

	// home wins: a driver winning their own nation's Grand Prix
	const gp = db.grandsPrix.get(race.grandPrixId);
	if (w && gp && db.drivers.get(w.driverId)?.nationality === gp.country) {
		const nat = gp.country;
		const prev = lastWhere(F, f.idx, (rf) => rf.race.grandPrixId === race.grandPrixId && !!rf.winner && db.drivers.get(rf.winner.driverId)?.nationality === nat);
		const years = prev >= 0 ? race.year - raceAt(prev).year : 0;
		if (prev < 0 && settled) add("home", `nation:${nat}:home`, 7, sentence(cDriver(db, w.driverId), " is the first ", cDemonym(db, nat), " driver to win the ", cGp(db, gp.id)));
		else if (prev >= 0 && years >= 5) add("home", `nation:${nat}:home`, 2 + 1.5 * log2(years), sentence("The first home win at the ", cGp(db, gp.id), " since ", cDriver(db, F.races[prev].winner!.driverId), " in ", cSeason(raceAt(prev).year)));
	}

	// a team's first win at this Grand Prix in years
	if (w) {
		const list = occurrences(db, "constructor", "win", true).get(`${w.constructorId}@${race.grandPrixId}`) ?? [];
		const n = upTo(list, f.idx);
		if (n > 1) {
			const gap = race.year - raceAt(list[n - 2]).year;
			if (gap >= 10) add("venue", `constructor:${w.constructorId}:gp-since`, 2 + 1.5 * log2(gap / 5), sentence(...possessive(cTeam(db, w.constructorId)), " first win at the ", cGp(db, race.grandPrixId), " since ", cSeason(raceAt(list[n - 2]).year)));
		}
	}

	// the same Grand Prix, year after year
	if (w) {
		const editions = F.races.slice(0, f.idx + 1).filter((rf) => rf.race.grandPrixId === race.grandPrixId);
		for (const [kind, key] of [["driver", (r: Result) => r.driverId], ["constructor", (r: Result) => r.constructorId]] as const) {
			const id = key(w);
			let L = 0;
			for (let i = editions.length - 1; i >= 0 && editions[i].winner && key(editions[i].winner!) === id; i--) L++;
			if (L >= (kind === "driver" ? 3 : 4)) {
				const who = kind === "driver" ? cDriver(db, id) : cTeam(db, id);
				add("venue", `${kind}:${id}:gp-row`, 2 + L * 0.8, sentence(...possessive(who), ` ${ordinal(L)} win in a row at the `, cGp(db, race.grandPrixId)));
			}
		}
	}

	// debuts
	const firstTimers = debuts(db).get(f.idx) ?? [];
	for (const [label, test, score] of [
		["won", isWin, 9],
		["finished on the podium", isPodium, 7],
		["scored points", (r: Result) => r.points > 0, 4],
	] as const) {
		const r = firstTimers.find(test);
		if (!r || !settled) continue;
		const prev = lastWhere(F, f.idx, (rf) => (debuts(db).get(rf.idx) ?? []).some(test));
		if (prev < 0) add("debut", `driver:${r.driverId}:debut`, score + 1, sentence(cDriver(db, r.driverId), ` ${label} on debut, the first driver ever to`));
		else if (f.idx - prev >= 15) add("debut", `driver:${r.driverId}:debut`, score - 2 + log2((f.idx - prev) / 15), sentence(cDriver(db, r.driverId), ` ${label} on debut, the first driver to since `, cDriver(db, (debuts(db).get(prev) ?? []).find(test)!.driverId), " at the ", since(prev)));
		break;
	}

	// parents and children
	for (const [label, ev, test] of [
		["win a Grand Prix", "win", isWin],
		["finish on the podium", "podium", isPodium],
	] as const) {
		for (const r of f.results.filter(test)) {
			const occ = occurrences(db, "driver", ev);
			if (occ.get(r.driverId)?.[0] !== f.idx) continue;
			const parents = db.families.filter((l) => l.driverId === r.driverId && l.type === "CHILD").map((l) => l.relatedId);
			const parent = parents.find((p) => (occ.get(p)?.[0] ?? Infinity) < f.idx);
			if (!parent) continue;
			// pairs where both had done it by now
			const pairs = db.families.filter((l) => l.type === "CHILD" && Math.max(occ.get(l.driverId)?.[0] ?? Infinity, occ.get(l.relatedId)?.[0] ?? Infinity) <= f.idx).length;
			add("family", `driver:${r.driverId}:family`, ev === "win" ? 8 : 5, sentence(cDriver(db, r.driverId), " and ", cDriver(db, parent), ` are the ${pairs === 1 ? "first" : ordinal(pairs)} parent and child to both ${label}`));
		}
	}

	// team-mates: a run of finishing (or qualifying) ahead
	const teams = new Map<string, string[]>();
	for (const r of started) if (!r.sharedCar) teams.set(r.constructorId, [...new Set([...(teams.get(r.constructorId) ?? []), r.driverId])]);
	for (const [, pair] of teams) {
		if (pair.length !== 2) continue;
		const [a, b] = pair;
		const rows = sharedRaces(db, a, b).filter((s) => (F.byId.get(s.race.id)?.idx ?? Infinity) <= f.idx);
		for (const [what, field] of [["finished ahead of", "finish"], ["out-qualified", "quali"]] as const) {
			const decided = rows.filter((s) => s[field] != null);
			const last = decided.at(-1);
			if (!last || last.race.id !== race.id) continue;
			const winner = last[field]!;
			let L = 0;
			for (let i = decided.length - 1; i >= 0 && decided[i][field] === winner; i--) L++;
			const [x, y] = winner === "a" ? [a, b] : [b, a];
			// the run this one ended
			let before = 0;
			for (let i = decided.length - 1 - L; i >= 0 && decided[i][field] !== winner; i--) before++;
			const tag = `driver:${x}:mate-${field}`;
			if (L === 1 && before >= 10) add("teammate", tag, 2 + log2(before / 4), sentence(cDriver(db, x), ` ${what} `, cDriver(db, y), ` for the first time in ${before} races together`));
			else if (L >= 10 && L % (L >= 20 ? 10 : 5) === 0) add("teammate", tag, 1.5 + log2(L / 5), sentence(cDriver(db, x), ` has ${what} `, cDriver(db, y), ` ${L} races in a row`));
		}
	}
}

/** Races (by index) where each driver had a result passing `test`. */
function occurrencesOf(db: Db, name: string, test: (r: Result) => boolean): Map<string, number[]> {
	return cached(db, `race-facts:of:${name}`, () => {
		const out = new Map<string, number[]>();
		for (const f of facts(db).races)
			for (const id of new Set(f.results.filter(test).map((r) => r.driverId))) {
				const list = out.get(id) ?? [];
				list.push(f.idx);
				out.set(id, list);
			}
		return out;
	});
}

/** "23y 140d" from days. */
function ageText(days: number): string {
	const y = Math.floor(days / 365.25);
	return `${y}y ${Math.round(days - y * 365.25)}d`;
}

