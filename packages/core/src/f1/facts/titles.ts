// Championship facts: the race that decided a title (who, how early, how young or old, the first
// for their nation or team in a while, titles in a row, records) and changes of championship lead.
// Finished seasons use the decider the records pages use (dropped scores and all); a season still
// being run is decided once the leader is out of reach of the points still to be had.

import type { Db, StandingRow } from "../dataset.ts";
import { ageDaysAt, cached, champions, facts, seasonConstructor, type RaceFacts } from "../records/facts.ts";
import { deciders } from "../records/titles.ts";
import { cDriver, cSeason, cTeam } from "../records/cells.ts";
import { rulesFor, standingsAfter } from "../stats.ts";
import { pointsLeft } from "../views.ts";
import { ordinal } from "../anniversaries.ts";
import { HISTORY, years, aDemonym, cRaceFull, log2, possessive, sentence, type Add } from "./shared.ts";

type Type = "driver" | "constructor";
type Champion = { year: number; id: string };

/** The table's sole leader (null on a tie). */
function soleLeader(rows: StandingRow[]): { id: string; points: number; gap: number } | null {
	const best = new Map<string, number>();
	for (const r of rows) best.set(r.id, Math.max(best.get(r.id) ?? 0, r.points));
	const [a, b] = [...best].sort((x, y) => y[1] - x[1]);
	if (!a || (b && b[1] === a[1])) return null;
	return { id: a[0], points: a[1], gap: a[1] - (b?.[1] ?? 0) };
}

/** Championship leader after race idx (null on a tie). */
export function leaderAfter(db: Db, idx: number, type: Type = "driver") {
	const after = standingsAfter(db, facts(db).races[idx].race);
	return soleLeader(type === "driver" ? after.drivers : after.constructors);
}

/** Who a race made champion, if it decided the season's title. */
export function decidedAt(db: Db, type: Type, f: RaceFacts): string | null {
	const year = f.race.year;
	if (type === "constructor" && !rulesFor(db, year).hasConstructorsChampionship) return null;
	const done = champions(db, type).find((c) => c.year === year);
	if (done) return deciders(db, type).get(year) === f.idx ? done.id : null;
	// still being run: out of reach after this race, and not already after the one before
	const all = db.racesByYear.get(year) ?? [];
	const safe = (idx: number) => {
		const lead = leaderAfter(db, idx, type);
		const left = pointsLeft(db, year, all.filter((r) => r.round > facts(db).races[idx].race.round), type === "constructor");
		return lead && left != null && lead.gap > left ? lead.id : null;
	};
	const season = facts(db).seasons.get(year)!;
	const k = season.indexOf(f.idx);
	const now = safe(f.idx);
	return now && (k === 0 || !safe(season[k - 1])) ? now : null;
}

/** Every title up to and including a season, with the race that decided each. */
function titleHistory(db: Db, type: Type): (Champion & { decider: number })[] {
	return cached(db, `race-facts:titles:${type}`, () => {
		const dec = deciders(db, type);
		return champions(db, type).map((c) => ({ year: c.year, id: c.id, decider: dec.get(c.year)! }));
	});
}

export function titleFacts(db: Db, f: RaceFacts, add: Add) {
	const F = facts(db);
	const settled = f.idx >= HISTORY;
	const year = f.race.year;
	const toGo = (y: number, round: number) => (db.racesByYear.get(y)?.length ?? 0) - round;

	const driver = decidedAt(db, "driver", f);
	if (driver) {
		const before = titleHistory(db, "driver").filter((t) => t.year < year);
		const tag = `driver:${driver}`;
		const n = before.filter((t) => t.id === driver).length + 1;
		add("title", `${tag}:title`, n === 1 ? 10 : 9.5, sentence(cDriver(db, driver), n === 1 ? " became world champion" : ` became world champion for the ${ordinal(n)} time`));

		// records
		const counts = new Map<string, number>();
		for (const t of before) if (t.id !== driver) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
		const best = Math.max(0, ...counts.values());
		const holder = [...before].reverse().find((t) => counts.get(t.id) === best)?.id;
		if (best >= 3 && holder && n === best + 1) add("record", `${tag}:titles`, 10, sentence(...possessive(cDriver(db, driver)), ` ${ordinal(n)} title, breaking `, ...possessive(cDriver(db, holder)), ` record of ${best}`));
		else if (best >= 3 && holder && n === best) add("record", `${tag}:titles`, 9, sentence(...possessive(cDriver(db, driver)), ` ${ordinal(n)} title, equalling the record held by `, cDriver(db, holder)));

		// in a row
		let row = 1;
		while (before.some((t) => t.year === year - row && t.id === driver)) row++;
		if (row >= 2) add("streak", `${tag}:titles`, 3 + row, sentence(...possessive(cDriver(db, driver)), ` ${ordinal(row)} title in a row`));

		// how early
		const left = toGo(year, f.race.round);
		const leftThen = (t: { year: number; decider: number }) => toGo(t.year, F.races[t.decider].race.round);
		const early = [...before].reverse().find((t) => (left > 0 ? leftThen(t) >= left : leftThen(t) === 0));
		if (left > 0 && early && year - early.year >= 3)
			add("title", `${tag}:early`, 3 + log2(year - early.year), sentence(cDriver(db, driver), ` clinched it with ${left} ${left === 1 ? "race" : "races"} to go, the earliest since `, cDriver(db, early.id), " in ", cSeason(early.year)));
		else if (left > 0 && !early && settled) add("title", `${tag}:early`, 8, sentence(cDriver(db, driver), ` clinched it with ${left} races to go, the earliest a title has ever been decided`));
		else if (left === 0 && early && year - early.year >= 3) add("title", `${tag}:final`, 3 + log2(year - early.year), sentence("The first title decided at the final race since ", cSeason(early.year)));

		// ages
		const age = ageDaysAt(db, driver, f.race.date);
		if (age != null) {
			const ageThen = (t: { id: string; decider: number }) => ageDaysAt(db, t.id, F.races[t.decider].race.date);
			for (const young of [true, false]) {
				if (young ? age > years(26) : age < years(33)) continue;
				const prev = [...before].reverse().find((t) => {
					const a = ageThen(t);
					return a != null && (young ? a <= age : a >= age);
				});
				const label = young ? "youngest" : "oldest";
				if (!prev && settled) add("age", `${tag}:${label}`, 9, sentence(cDriver(db, driver), ` is the ${label} world champion ever`));
				else if (prev && year - prev.year >= 10 && prev.id !== driver) add("age", `${tag}:${label}`, 2 + log2(year - prev.year), sentence(cDriver(db, driver), ` is the ${label} world champion since `, cDriver(db, prev.id), " in ", cSeason(prev.year)));
			}
		}

		// for their nation and team
		const nation = db.drivers.get(driver)?.nationality;
		if (nation) {
			const prev = [...before].reverse().find((t) => db.drivers.get(t.id)?.nationality === nation);
			if (!prev && settled) add("first", `nation:${nation}:title`, 8, sentence("The first ", ...aDemonym(db, nation).slice(1), " world champion"));
			else if (prev && year - prev.year >= 5) add("since", `nation:${nation}:title`, 2 + 1.2 * log2(year - prev.year), sentence("The first ", ...aDemonym(db, nation).slice(1), " champion since ", cDriver(db, prev.id), " in ", cSeason(prev.year)));
		}
		const team = seasonConstructor(db, driver, year);
		if (team) {
			const prev = [...before].reverse().find((t) => seasonConstructor(db, t.id, t.year) === team);
			if (!prev && settled) add("first", `constructor:${team}:drivers-title`, 6, sentence(...possessive(cTeam(db, team)), " first drivers' title"));
			else if (prev && year - prev.year >= 5) add("since", `constructor:${team}:drivers-title`, 2 + log2(year - prev.year), sentence(...possessive(cTeam(db, team)), " first drivers' title since ", cDriver(db, prev.id), " in ", cSeason(prev.year)));
		}
	}

	const team = decidedAt(db, "constructor", f);
	if (team) {
		const before = titleHistory(db, "constructor").filter((t) => t.year < year);
		const tag = `constructor:${team}`;
		const mine = before.filter((t) => t.id === team);
		const n = mine.length + 1;
		add("title", `${tag}:title`, n === 1 ? 9 : 7.5, sentence(cTeam(db, team), n === 1 ? " won the constructors' championship for the first time" : ` won the constructors' championship for the ${ordinal(n)} time`));
		const last = mine.at(-1);
		if (last && year - last.year >= 5) add("since", `${tag}:title`, 2 + log2(year - last.year), sentence(...possessive(cTeam(db, team)), " first constructors' title since ", cSeason(last.year)));
		let row = 1;
		while (before.some((t) => t.year === year - row && t.id === team)) row++;
		if (row >= 3) add("streak", `${tag}:titles`, 2 + row / 2, sentence(...possessive(cTeam(db, team)), ` ${ordinal(row)} constructors' title in a row`));
		const counts = new Map<string, number>();
		for (const t of before) if (t.id !== team) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
		const best = Math.max(0, ...counts.values());
		if (best >= 5 && n === best + 1) add("record", `${tag}:titles`, 8, sentence(...possessive(cTeam(db, team)), ` ${ordinal(n)} constructors' title, a record`));
	}

	// changes of championship lead
	const season = F.seasons.get(year)!;
	const k = season.indexOf(f.idx);
	const lead = leaderAfter(db, f.idx);
	if (!lead || lead.id === driver) return;
	const before = k > 0 ? leaderAfter(db, season[k - 1]) : null;
	if (k > 0 && before?.id === lead.id) return;
	// the last time they led after a race
	const theirs = [...new Set((db.resultsByDriver.get(lead.id) ?? []).map((r) => F.byId.get(r.raceId)?.idx).filter((i): i is number => i != null && i < f.idx))];
	const prev = theirs.reverse().find((i) => leaderAfter(db, i)?.id === lead.id);
	const tag = `driver:${lead.id}:lead`;
	if (prev == null && settled) add("lead", tag, k === 0 ? 3.5 : 6, sentence(cDriver(db, lead.id), " leads the championship for the first time"));
	else if (prev != null && f.idx - prev >= 20) add("lead", tag, 2 + 1.5 * log2((f.idx - prev) / 10), sentence(cDriver(db, lead.id), " leads the championship for the first time since the ", cRaceFull(db, F.races[prev].race)));
	else if (prev != null && before) add("lead", tag, 3, sentence(cDriver(db, lead.id), " takes the championship lead from ", cDriver(db, before.id)));
}
