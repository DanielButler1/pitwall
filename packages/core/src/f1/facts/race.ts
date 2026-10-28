// Facts about a race's result: firsts, the first in a while, round numbers, records and the
// all-time lists, runs, wins at the Grand Prix, the winner's grid slot, ages, the top three and the
// season's different winners. Championship facts are in titles.ts.

import type { Db, Result } from "../dataset.ts";
import { ageDaysAt, facts, isPodium, isWin, type RaceFacts } from "../records/facts.ts";
import { cDriver, cGp, cSeason } from "../records/cells.ts";
import { ordinal } from "../anniversaries.ts";
import {
	EVENTS,
	HISTORY,
	P,
	SINCE_MIN,
	STREAK,
	compareRuns,
	countsAt,
	cRaceFull,
	holders,
	isMark,
	keyFor,
	log2,
	madeBy,
	markScore,
	occurrences,
	owned,
	possessive,
	runAt,
	sentence,
	subject,
	upTo,
	type Add,
	years,
	type EventId,
} from "./shared.ts";

export function resultFacts(db: Db, f: RaceFacts, add: Add) {
	const F = facts(db);
	const raceAt = (i: number) => F.races[i].race;
	// in the first seasons everything is a record and a first; "ever" means little until there's some history
	const settled = f.idx >= HISTORY;

	for (const ev of Object.keys(EVENTS) as EventId[]) {
		const def = EVENTS[ev];
		if (def.quiet) continue;
		const rows = def.sprint ? f.sprint : f.results;
		for (const kind of def.kinds) {
			const occ = occurrences(db, kind, ev);
			// gaps are counted in starts of the same kind: Grands Prix, or sprints for sprint results
			const starts = occurrences(db, kind, def.sprint ? "sprintStart" : "start");
			const here = holders(db, f, kind, ev);
			const by = madeBy(kind);

			for (const id of here) {
				const list = occ.get(id)!;
				const n = upTo(list, f.idx);
				const tag = `${kind}:${id}:${ev}`;
				// who made it: a nation's fact that is only one driver's own (every Dutch pole is Verstappen's)
				// is left to the driver, an engine's that is only one team's to the team
				const makers = by ? [...new Set(rows.filter((r) => def.test!(r) && keyFor(db, kind, r) === id).map((r) => keyFor(db, by, r)!))] : [];
				const ownedBy = (i: number) => makers.length === 1 && (def.sprint ? F.races[i].sprint : F.races[i].results).some((r) => def.test!(r) && keyFor(db, kind, r) === id && keyFor(db, by!, r) === makers[0]);
				// a works team winning with its own engine (Ferrari, Mercedes) says it all
				if (kind === "engine" && makers.every((t) => id.startsWith(t))) continue;
				// opportunities since the last time: the subject's starts, or every race for a nation or engine
				const perRace = kind === "nation" || kind === "engine";
				const gap = (prev: number) => (perRace ? f.idx - prev : upTo(starts.get(id) ?? [], f.idx) - upTo(starts.get(id) ?? [], prev));

				// firsts
				if (def.runsOnly || def.noFirst) {
					// only runs (or totals) below
				} else if (n === 1 && ev !== "start" && ev !== "points" && (settled || !perRace)) {
					const tries = kind === "driver" ? upTo(starts.get(id) ?? [], f.idx) : 0;
					const attempt = tries > 1 ? `, at the ${ordinal(tries)} attempt` : "";
					const score = def.minor ? 1.5 + def.weight : (perRace ? 7 : 4) + def.weight * 1.5 + (tries > 100 ? 1 : 0);
					add("first", tag, score, sentence(owned(db, kind, id, `first ${def.one}`), def.minor ? "" : attempt));
				} else if (n === 1 && ev === "points") {
					add("first", tag, kind === "constructor" ? 5 : 3.5, sentence(owned(db, kind, id, "first points")));
				} else if (n === 1 && ev === "start" && kind === "constructor") {
					add("first", tag, 3, sentence(owned(db, kind, id, "first Grand Prix")));
				}

				// the first in a while
				const min = SINCE_MIN[ev];
				if (n > 1 && min) {
					const prev = list[n - 2];
					const g = gap(prev);
					const need = perRace ? min * 2 : min;
					if (g >= need && !ownedBy(prev)) {
						const unit = def.sprint ? "sprints" : kind === "driver" ? "starts" : "races";
						add("since", tag, def.weight * 1.3 * log2(g / (need / 2)), sentence(owned(db, kind, id, `first ${def.one}`), ` in ${g} ${unit}, since the `, cRaceFull(db, raceAt(prev))));
					}
				}

				// round numbers
				const sameAsMaker = kind === "nation" && makers.length === 1 && upTo(occurrences(db, "driver", ev).get(makers[0]) ?? [], f.idx) === n;
				if (n > 1 && isMark(ev, kind, n) && !sameAsMaker && !def.runsOnly && !def.noFirst) {
					const what = ev === "start" ? (kind === "driver" ? "Grand Prix start" : "Grand Prix") : def.one;
					add("nth", tag, markScore(ev, n), sentence(owned(db, kind, id, `${ordinal(n)} ${what}`)));
				}

				// the all-time list
				if (!perRace && ev !== "points" && !def.runsOnly && n > 1 && settled) {
					const others = countsAt(occ, f.idx, id);
					const best = Math.max(0, ...others.map(([, c]) => c));
					// the latest to reach a count
					const holder = (c: number) => others.filter(([, x]) => x === c).sort((a, b) => occ.get(b[0])![c - 1] - occ.get(a[0])![c - 1])[0]?.[0];
					if (best < (ev === "start" ? 50 : 10)) {
						// small numbers: a record of 6 isn't one yet
					} else if (n === best + 1) {
						const prior = holder(best);
						add("record", tag, 5 + def.weight, sentence(owned(db, kind, id, `${ordinal(n)} ${def.one}`), ", breaking ", prior ? [...possessive(subject(db, kind, prior)), " record"] : "the record", ` of ${best}`));
					} else if (n === best) {
						add("record", tag, 4 + def.weight, sentence(owned(db, kind, id, `${ordinal(n)} ${def.one}`), ", equalling the record held by ", subject(db, kind, holder(best)!)));
					} else if (n < best && ev !== "start" && !def.noFirst && !def.minor) {
						const rank = others.filter(([, c]) => c >= n).length + 1;
						const passed = others.filter(([, c]) => c === n - 1).map(([k]) => k);
						const level = others.filter(([, c]) => c === n).map(([k]) => k);
						if (rank <= 10 && passed.length) {
							const who = level.length ? ["level with ", subject(db, kind, level[0])] : ["ahead of ", subject(db, kind, passed[0])];
							add("ranking", tag, 2 + (def.weight * (11 - rank)) / 6, sentence(owned(db, kind, id, `${ordinal(n)} ${def.one}`), `, now ${ordinal(rank)} on the all-time list, `, ...who));
						}
					}
				}

				// runs
				const limits = STREAK[kind]?.[ev];
				if (limits) {
					const L = runAt(db, kind, ev, id, f.idx);
					if (L >= limits[0]) {
						const { longest, since } = compareRuns(db, kind, ev, id, f.idx, L);
						// "the longest since" is news when it reaches further back than last time
						const news = since?.at !== compareRuns(db, kind, ev, id, f.idx, L - 1).since?.at || L % 5 === 0;
						const head = owned(db, kind, id, `${ordinal(L)} ${def.one} in a row`);
						// a record run is news when it's set, and on round numbers after
						if (L > longest && settled && (L === longest + 1 || L % 5 === 0)) add("streak", tag, 5 + def.weight * 1.5, sentence(head, ", the longest run ever"));
						else if (L === longest && since && settled) add("streak", tag, 4 + def.weight, sentence(head, ", equalling the record set by ", subject(db, kind, since.key)));
						else if (since && f.idx - since.at >= 20 && news)
							add("streak", tag, def.weight * log2((f.idx - since.at) / 10), sentence(head, ", the longest run since ", ...possessive(subject(db, kind, since.key)), " in ", cSeason(raceAt(since.at).year)));
						else if (L === limits[0] || L % 5 === 0) add("streak", tag, def.weight * 0.8, sentence(head));
					}
				}
			}

			// runs that ended here
			const limits = STREAK[kind]?.[ev];
			if (!limits) continue;
			for (const [id, s] of starts) {
				const pos = upTo(s, f.idx) - 1;
				if (pos < 1 || s[pos] !== f.idx || here.has(id)) continue;
				const L = runAt(db, kind, ev, id, s[pos - 1]);
				if (L >= limits[1]) add("streak-end", `${kind}:${id}:${ev}`, def.weight * log2(L / limits[1] + 1) * 1.5, sentence(owned(db, kind, id, `run of ${L} ${def.many} in a row`), " came to an end"));
			}
		}
	}

	// most wins at this Grand Prix
	for (const kind of ["driver", "constructor"] as const) {
		const winner = f.winner && keyFor(db, kind, f.winner);
		if (!winner) continue;
		const occ = occurrences(db, kind, "win", true);
		const gp = f.race.grandPrixId;
		const n = upTo(occ.get(`${winner}@${gp}`)!, f.idx);
		if (n < 3) continue;
		const others = [...occ].filter(([k]) => k.endsWith(`@${gp}`) && k !== `${winner}@${gp}`).map(([k, l]) => [k.slice(0, k.lastIndexOf("@")), upTo(l, f.idx)] as const);
		const best = Math.max(0, ...others.map(([, c]) => c));
		if (n < best) continue;
		const head = [...possessive(subject(db, kind, winner)), ` ${ordinal(n)} win at the `, cGp(db, gp)];
		if (n === best) add("venue", `${kind}:${winner}:gp`, 3.5, sentence(head, ", level with ", subject(db, kind, others.find(([, c]) => c === best)![0]), " for the most"));
		else if (n === best + 1) add("venue", `${kind}:${winner}:gp`, 4 + n / 3, sentence(head, `, the most by any ${kind === "driver" ? "driver" : "team"}`));
		// extending a record they already hold is only worth a round number
		else if (n % 5 === 0) add("venue", `${kind}:${winner}:gp`, 2 + n / 6, sentence(head, ", extending the record"));
	}

	// the winner's grid slot
	const w = f.winner;
	if (w?.grid && w.grid >= 5) {
		let prev = f.idx - 1;
		while (prev >= 0 && !((F.races[prev].winner?.grid ?? 0) >= w.grid)) prev--;
		const g = f.idx - prev;
		if (prev < 0 && settled) add("grid", `driver:${w.driverId}`, 9, sentence(cDriver(db, w.driverId), ` won from ${P(w.grid)}, the lowest grid slot a Grand Prix has ever been won from`));
		else if (prev >= 0 && g >= 15) {
			const pw = F.races[prev].winner!;
			add("grid", `driver:${w.driverId}`, 3 * log2(g / 8), sentence(cDriver(db, w.driverId), ` won from ${P(w.grid)}, the lowest grid slot for a winner since `, cDriver(db, pw.driverId), ` (${P(pw.grid!)}) at the `, cRaceFull(db, raceAt(prev))));
		}
	}

	// youngest and oldest
	const latestAged = (test: (r: Result) => boolean, ok: (age: number) => boolean, from: number) => {
		for (let prev = from; prev >= 0; prev--) {
			const pf = F.races[prev];
			const who = pf.results.find((x) => {
				if (!test(x)) return false;
				const a = ageDaysAt(db, x.driverId, pf.race.date);
				return a != null && ok(a);
			});
			if (who) return { prev, who };
		}
		return { prev: -1, who: undefined };
	};
	const AGES: [EventId, string, (r: Result) => boolean][] = [
		["win", "race winner", isWin],
		["pole", "polesitter", (r) => r.pole],
		["podium", "podium finisher", isPodium],
	];
	for (const [ev, noun, test] of AGES) {
		const seen = new Set<string>();
		for (const r of f.results.filter(test)) {
			if (seen.has(r.driverId)) continue;
			seen.add(r.driverId);
			const age = ageDaysAt(db, r.driverId, f.race.date);
			if (age == null) continue;
			// the driver's previous time, to tell "oldest since X" apart from the same news again
			let last = f.idx - 1;
			while (last >= 0 && !F.races[last].results.some((x) => x.driverId === r.driverId && test(x))) last--;
			for (const young of [true, false]) {
				if (young ? age > years(23) : age < years(35)) continue;
				const { prev, who } = latestAged(test, (a) => (young ? a <= age : a >= age), f.idx - 1);
				if (last >= 0 && who) {
					const age0 = ageDaysAt(db, r.driverId, F.races[last].race.date)!;
					if (latestAged(test, (a) => (young ? a <= age0 : a >= age0), last - 1).prev === prev) continue;
				}
				const g = f.idx - prev;
				const label = `${young ? "youngest" : "oldest"} ${noun}`;
				const key = `driver:${r.driverId}:${ev}:${young}`;
				if (!who) {
					if (settled) add("age", key, 6 + EVENTS[ev].weight, sentence(cDriver(db, r.driverId), ` became the ${label} ever`));
				} else if (g >= 25 && who.driverId !== r.driverId)
					add("age", key, EVENTS[ev].weight * log2(g / 12), sentence(cDriver(db, r.driverId), ` became the ${label} since `, cDriver(db, who.driverId), " at the ", cRaceFull(db, raceAt(prev))));
			}
		}
	}

	// the same top three as before
	const podium = (rf: RaceFacts) => [1, 2, 3].map((p) => rf.results.find((r) => r.position === p)?.driverId ?? "").join(",");
	const top = podium(f);
	if (!top.includes(",,") && !top.endsWith(",")) {
		let prev = f.idx - 1;
		while (prev >= 0 && podium(F.races[prev]) !== top) prev--;
		if (prev >= 0 && f.idx - prev >= 30) add("podium", top, 2 + log2((f.idx - prev) / 30), sentence("The same top three, in the same order, as the ", cRaceFull(db, raceAt(prev))));
	}

	// different winners this season
	for (const kind of ["driver", "constructor"] as const) {
		if (!f.winner) break;
		const id = keyFor(db, kind, f.winner)!;
		const winnersOf = (idxs: number[]) => new Set(idxs.map((i) => F.races[i].winner).filter((x) => x != null).map((x) => keyFor(db, kind, x)));
		const season = F.seasons.get(f.race.year)!.filter((i) => i <= f.idx);
		const n = winnersOf(season).size;
		if (winnersOf(season.slice(0, -1)).has(id) || n < (kind === "driver" ? 5 : 4)) continue;
		let year = f.race.year - 1;
		while (year >= 1950 && winnersOf(F.seasons.get(year) ?? []).size < n) year--;
		const head = sentence(subject(db, kind, id), ` is the ${ordinal(n)} different ${kind === "driver" ? "winner" : "team to win"} in `, cSeason(f.race.year));
		const gapYears = f.race.year - year;
		if (year < 1950 && settled) add("season", `${kind}:${f.race.year}`, 8, sentence(head, ", a record for a season"));
		else if (year >= 1950 && gapYears >= 3) add("season", `${kind}:${f.race.year}`, 2 + log2(gapYears), sentence(head, ", the most since ", cSeason(year)));
	}
}
