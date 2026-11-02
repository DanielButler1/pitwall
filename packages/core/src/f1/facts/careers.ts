// Facts about careers and rivalries: a winner's first win for a new team (and how many teams
// they've won for), rivals finishing first and second again, a team's best result in years, a new
// team or nation on the grid, women racing, disqualifications, both cars out, and the best starts to
// a season.

import type { Db, Result } from "../dataset.ts";
import { isStart } from "../dataset.ts";
import { cached, facts, isClassified, isPodium, type RaceFacts } from "../records/facts.ts";
import { cDriver, cSeason, cTeam } from "../records/cells.ts";
import { ordinal } from "../anniversaries.ts";
import { HISTORY, P, aDemonym, cRaceFull, log2, occurrences, possessive, sentence, upTo, type Add } from "./shared.ts";

/** Per driver, the race (index) at which they'd won for 1, 2, 3... different teams. */
function teamsWonFor(db: Db): Map<string, { idx: number; team: string }[]> {
	return cached(db, "race-facts:teams-won-for", () => {
		const out = new Map<string, { idx: number; team: string }[]>();
		for (const f of facts(db).races) {
			const w = f.winner;
			if (!w) continue;
			const list = out.get(w.driverId) ?? [];
			if (!list.some((x) => x.team === w.constructorId)) list.push({ idx: f.idx, team: w.constructorId });
			out.set(w.driverId, list);
		}
		return out;
	});
}

/** Per pair of drivers ("a|b", sorted), the races (indexes) where they finished first and second. */
function oneTwoPairs(db: Db): Map<string, number[]> {
	return cached(db, "race-facts:pairs", () => {
		const out = new Map<string, number[]>();
		for (const f of facts(db).races) {
			const [a, b] = [f.results.find((r) => r.position === 1), f.results.find((r) => r.position === 2)];
			if (!a || !b) continue;
			const key = [a.driverId, b.driverId].sort().join("|");
			out.set(key, [...(out.get(key) ?? []), f.idx]);
		}
		return out;
	});
}

/** Per nation (and per gender), the first race (index) one of its drivers started, scored or won. */
function firstsBy(db: Db, key: (r: Result) => string | null, test: (r: Result) => boolean, name: string): Map<string, number[]> {
	return cached(db, `race-facts:firsts-by:${name}`, () => {
		const out = new Map<string, number[]>();
		for (const f of facts(db).races)
			for (const k of new Set(f.results.filter(test).map(key))) {
				if (k == null) continue;
				out.set(k, [...(out.get(k) ?? []), f.idx]);
			}
		return out;
	});
}

export function careerFacts(db: Db, f: RaceFacts, add: Add) {
	const F = facts(db);
	const race = f.race;
	const settled = f.idx >= HISTORY;
	const since = (i: number) => cRaceFull(db, F.races[i].race);
	const w = f.winner;

	// ---- a winner's teams
	if (w) {
		const list = teamsWonFor(db).get(w.driverId) ?? [];
		const n = list.findIndex((x) => x.idx === f.idx) + 1;
		if (n >= 2) {
			const head = sentence(...possessive(cDriver(db, w.driverId)), " first win for ", cTeam(db, w.constructorId));
			if (n === 2) add("team", `driver:${w.driverId}:new-team`, 4, head);
			else {
				// the latest other driver to have won for as many teams
				let prev: { id: string; at: number } | null = null;
				for (const [id, l] of teamsWonFor(db)) if (id !== w.driverId && l.length >= n && l[n - 1].idx < f.idx && (!prev || l[n - 1].idx > prev.at)) prev = { id, at: l[n - 1].idx };
				if (!prev && settled) add("team", `driver:${w.driverId}:new-team`, 8, sentence(head, `: the first driver to win for ${n} different teams`));
				else if (prev) add("team", `driver:${w.driverId}:new-team`, 4 + log2((f.idx - prev.at) / 50 + 1) * 2, sentence(head, `, the first driver to win for ${n} different teams since `, cDriver(db, prev.id), " in ", cSeason(F.races[prev.at].race.year)));
			}
		}
	}

	// ---- rivals: the same two finishing first and second
	const [first, second] = [f.results.find((r) => r.position === 1), f.results.find((r) => r.position === 2)];
	if (first && second && settled) {
		const pairs = oneTwoPairs(db);
		const key = [first.driverId, second.driverId].sort().join("|");
		const n = upTo(pairs.get(key) ?? [], f.idx);
		let best = 0;
		let holder = "";
		for (const [k, l] of pairs) {
			if (k === key) continue;
			const c = upTo(l, f.idx);
			if (c > best) [best, holder] = [c, k];
		}
		const head = sentence(cDriver(db, first.driverId), " and ", cDriver(db, second.driverId), ` finished first and second for the ${ordinal(n)} time`);
		const pair = (k: string) => k.split("|").flatMap((id, i) => (i ? [" and ", cDriver(db, id)] : [cDriver(db, id)]));
		const tag = `driver:${first.driverId}:rival:${second.driverId}`;
		if (n >= 10 && n === best + 1) add("rival", tag, 6, sentence(head, ", the most of any pair, passing ", ...pair(holder)));
		else if (n >= 10 && n > best + 1 && n % 5 === 0) add("rival", tag, 3.5, sentence(head, ", extending the record for a pair"));
		else if (n >= 10 && n === best) add("rival", tag, 5, sentence(head, ", level with ", ...pair(holder), " for the most of any pair"));
		else if (n >= 10 && n % 10 === 0) add("rival", tag, 3, head);
	}

	// ---- a team's best result in a long time (wins and podiums have their own facts)
	const byTeam = new Map<string, number>();
	for (const r of f.results) if (r.position && r.position <= 8) byTeam.set(r.constructorId, Math.min(byTeam.get(r.constructorId) ?? 99, r.position));
	for (const [team, pos] of byTeam) {
		if (pos === 1) continue;
		const starts = occurrences(db, "constructor", "start").get(team) ?? [];
		const mine = upTo(starts, f.idx);
		let prev = -1;
		for (let k = mine - 2; k >= 0 && prev < 0; k--) if (F.races[starts[k]].results.some((r) => r.constructorId === team && r.position != null && r.position <= pos)) prev = k;
		const gap = mine - 1 - prev;
		// a podium's own "first since" already says it when it reaches back to the same race
		if (pos <= 3 && prev >= 0 && F.races[starts[prev]].results.some((r) => r.constructorId === team && isPodium(r))) {
			let k = mine - 2;
			while (k >= 0 && !F.races[starts[k]].results.some((r) => r.constructorId === team && isPodium(r))) k--;
			if (k === prev) continue;
		}
		if (prev < 0 && mine >= 50 && pos > 3) add("team", `constructor:${team}:best`, 4, sentence(cTeam(db, team), ` finished ${P(pos)}, the team's best result yet`));
		else if (prev >= 0 && gap >= 40) add("team", `constructor:${team}:best`, 1.5 + 1.5 * log2(gap / 20), sentence(cTeam(db, team), ` finished ${P(pos)}, the team's best result since the `, since(starts[prev])));
	}

	// ---- new teams: points or a podium first time out
	for (const [label, test, score] of [
		["won", (r: Result) => r.position === 1, 10],
		["finished on the podium", isPodium, 8],
		["scored points", (r: Result) => r.points > 0, 5],
	] as const) {
		const debut = (rf: RaceFacts) => rf.results.filter((r) => occurrences(db, "constructor", "start").get(r.constructorId)?.[0] === rf.idx);
		const r = debut(f).find(test);
		if (!r || !settled) continue;
		let prev = f.idx - 1;
		while (prev >= 0 && !debut(F.races[prev]).some(test)) prev--;
		if (prev < 0) add("team", `constructor:${r.constructorId}:debut`, score + 1, sentence(cTeam(db, r.constructorId), ` ${label} in its first race, the first team ever to`));
		else if (f.idx - prev >= 30) add("team", `constructor:${r.constructorId}:debut`, score - 2 + log2((f.idx - prev) / 30), sentence(cTeam(db, r.constructorId), ` ${label} in its first race, the first new team to since `, cTeam(db, debut(F.races[prev]).find(test)!.constructorId), " at the ", since(prev)));
		break;
	}

	// ---- nations: the first driver from a country to start, or score
	const nationality = (r: Result) => db.drivers.get(r.driverId)?.nationality ?? null;
	if (settled) {
		for (const [what, test, score] of [
			["start a Grand Prix", isStart, 5],
			["score points", (r: Result) => r.points > 0, 4.5],
		] as const) {
			const by = firstsBy(db, nationality, test, what);
			for (const r of f.results.filter(test)) {
				const nat = nationality(r);
				if (!nat || by.get(nat)?.[0] !== f.idx) continue;
				add("nation", `nation:${nat}:${what}`, score, sentence(cDriver(db, r.driverId), " is the first ", ...aDemonym(db, nat).slice(1), ` driver to ${what}`));
				break;
			}
		}
	}

	// ---- women
	const woman = (r: Result) => (db.drivers.get(r.driverId)?.gender === "F" ? "F" : null);
	for (const [what, test] of [
		["start a Grand Prix", isStart],
		["score points", (r: Result) => r.points > 0],
	] as const) {
		const r = f.results.find((x) => test(x) && woman(x));
		if (!r) continue;
		const list = firstsBy(db, woman, test, `woman:${what}`).get("F") ?? [];
		const n = upTo(list, f.idx);
		if (n === 1) add("nation", `driver:${r.driverId}:woman:${what}`, 8, sentence(cDriver(db, r.driverId), ` is the first woman to ${what}`));
		else {
			const prev = list[n - 2];
			const who = F.races[prev].results.find((x) => test(x) && woman(x))!;
			if (who.driverId !== r.driverId) add("nation", `driver:${r.driverId}:woman:${what}`, 5 + log2((race.year - F.races[prev].race.year) / 5 + 1), sentence(cDriver(db, r.driverId), ` is the first woman to ${what} since `, cDriver(db, who.driverId), " in ", cSeason(F.races[prev].race.year)));
		}
	}

	// ---- disqualifications
	const dsq = (rf: RaceFacts) => rf.results.filter((r) => r.positionText === "DSQ");
	const out = dsq(f);
	if (out.length && settled) {
		let prev = f.idx - 1;
		while (prev >= 0 && dsq(F.races[prev]).length < out.length) prev--;
		const who = out.length === 1 ? sentence(cDriver(db, out[0].driverId), " was disqualified") : sentence(`${out.length} drivers were disqualified`);
		const what = out.length === 1 ? "the first disqualification since the " : `the most in a race since the `;
		if (prev >= 0 && f.idx - prev >= 30) add("shape", "race:dsq", 2 * log2((f.idx - prev) / 15), sentence(who, `, ${what}`, since(prev)));
	}

	// ---- both cars out, for a team used to the podium
	const teams = new Map<string, Result[]>();
	for (const r of f.results) if (isStart(r)) teams.set(r.constructorId, [...(teams.get(r.constructorId) ?? []), r]);
	for (const [team, rs] of teams) {
		if (rs.length !== 2 || rs.some(isClassified)) continue;
		const starts = occurrences(db, "constructor", "start").get(team) ?? [];
		const mine = upTo(starts, f.idx) - 1;
		const recent = starts.slice(Math.max(0, mine - 5), mine);
		if (!recent.some((i) => F.races[i].results.some((r) => r.constructorId === team && isPodium(r)))) continue;
		const bothOut = (i: number) => {
			const t = F.races[i].results.filter((r) => r.constructorId === team && isStart(r));
			return t.length === 2 && !t.some(isClassified);
		};
		let k = mine - 1;
		while (k >= 0 && !bothOut(starts[k])) k--;
		const gap = mine - k;
		if (k >= 0 && gap >= 30) add("team", `constructor:${team}:double-out`, 1.5 + 1.5 * log2(gap / 15), sentence("Neither ", cTeam(db, team), " finished, the first time since the ", since(starts[k])));
	}

	// ---- the best starts to a season
	if (w) {
		const season = F.seasons.get(race.year)!;
		const m = season.indexOf(f.idx) + 1;
		const winsBy = (idxs: number[], id: string) => idxs.filter((i) => F.races[i].winner?.driverId === id).length;
		const n = winsBy(season.slice(0, m), w.driverId);
		// the latest season someone had won at least n of its first m races
		const latest = (n: number, m: number) => {
			for (let y = race.year - 1; y >= 1950; y--) {
				const s = (F.seasons.get(y) ?? []).slice(0, m);
				if (s.length < m) continue;
				const counts = new Map<string, number>();
				for (const i of s) if (F.races[i].winner) counts.set(F.races[i].winner!.driverId, (counts.get(F.races[i].winner!.driverId) ?? 0) + 1);
				const top = [...counts].find(([, c]) => c >= n);
				if (top) return { year: y, id: top[0] };
			}
			return null;
		};
		if (m >= 4 && n >= m - 2 && n / m >= 0.6) {
			const now = latest(n, m);
			// news when it reaches further back than after the last race
			const before = latest(n - 1, m - 1);
			const head = sentence(cDriver(db, w.driverId), ` has won ${n} of the first ${m} races of `, cSeason(race.year));
			if (!now && settled) add("season", `driver:${w.driverId}:start`, 7, sentence(head, ", the best start to a season ever"));
			else if (now && race.year - now.year >= 5 && now.year !== before?.year) add("season", `driver:${w.driverId}:start`, 2 + log2(race.year - now.year), sentence(head, ", the best start to a season since ", cDriver(db, now.id), " in ", cSeason(now.year)));
		}
	}
}
