// What's at stake at the next race: round numbers and records one result away (for drivers and
// teams who've been getting those results lately), droughts, first wins still waited for, runs on
// the line, records at the Grand Prix and whether the title can be decided there.

import type { Db, Race } from "../dataset.ts";
import { completedRaces } from "../dataset.ts";
import { facts } from "../records/facts.ts";
import { cGp } from "../records/cells.ts";
import { standingsAfter } from "../stats.ts";
import { activeGrid, latestSeason, recentRates } from "../milestones.ts";
import { pointsLeft } from "../views.ts";
import { ordinal } from "../anniversaries.ts";
import { leaderAfter } from "./titles.ts";
import {
	EVENTS,
	STREAK,
	collector,
	compareRuns,
	countsAt,
	cRaceFull,
	isMark,
	log2,
	markScore,
	occurrences,
	owned,
	pick,
	runAt,
	sentence,
	subject,
	upTo,
	type RaceFact,
	type SubjectKind,
} from "./shared.ts";

/** The next race to be run: the rest of the latest season, then the first of the next. */
export function nextRace(db: Db): Race | null {
	const year = latestSeason(db);
	if (year == null) return null;
	const ran = new Set(completedRaces(db, year).map((r) => r.id));
	return (db.racesByYear.get(year) ?? []).find((r) => !ran.has(r.id)) ?? db.racesByYear.get(year + 1)?.[0] ?? null;
}

/** "a 50th", "an 80th". */
const aNth = (n: number) => `${/^8/.test(String(n)) || n === 11 || n === 18 ? "an" : "a"} ${ordinal(n)}`;

const RATE = { win: "wins", pole: "poles", podium: "podiums" } as const;

export function upcomingFacts(db: Db, limit = 8): { race: Race; facts: RaceFact[] } | null {
	const race = nextRace(db);
	const grid = activeGrid(db);
	const F = facts(db);
	if (!race || !grid || !F.races.length) return null;
	const last = F.races.length - 1;
	const { out, add } = collector();
	const next = cRaceFull(db, race);

	const subjects: [SubjectKind, string][] = [...[...grid.drivers].map((id) => ["driver", id] as [SubjectKind, string]), ...[...grid.teams].map((id) => ["constructor", id] as [SubjectKind, string])];
	for (const [kind, id] of subjects) {
		const team = kind === "constructor";
		const rates = recentRates(db, id, team);
		const starts = upTo(occurrences(db, kind, "start").get(id) ?? [], last);
		const S = subject(db, kind, id);

		// round-number starts
		if (isMark("start", kind, starts + 1)) add("nth", `${kind}:${id}:start`, markScore("start", starts + 1), sentence(owned(db, kind, id, `${ordinal(starts + 1)} Grand Prix${team ? "" : " start"}`), " is up next"));

		for (const ev of ["win", "pole", "podium"] as const) {
			const def = EVENTS[ev];
			const occ = occurrences(db, kind, ev);
			const list = occ.get(id) ?? [];
			const c = upTo(list, last);
			const rate = rates[RATE[ev]];
			// how likely it is, roughly: a result they've been getting lately
			const q = Math.min(1, 0.4 + rate * 2);
			const tag = `${kind}:${id}:${ev}`;

			if (rate > 0) {
				if (isMark(ev, kind, c + 1)) add("chance", tag, markScore(ev, c + 1) * q, sentence(S, ` is one ${def.one} away from ${aNth(c + 1)}`));
				const others = countsAt(occ, last, id);
				const best = Math.max(0, ...others.map(([, n]) => n));
				const holder = others.filter(([, n]) => n === best).sort((a, b) => occ.get(b[0])![best - 1] - occ.get(a[0])![best - 1])[0]?.[0];
				if (best >= 10 && holder && c + 1 === best) add("chance", `${tag}:record`, (4 + def.weight) * q, sentence(`One more ${def.one} would put `, S, " level with ", subject(db, kind, holder), `'s record of ${best}`));
				else if (best >= 10 && holder && c === best) add("chance", `${tag}:record`, (5 + def.weight) * q, sentence(`One more ${def.one} would give `, S, " the record outright, ahead of ", subject(db, kind, holder)));
			}

			// waiting
			if (c >= 1) {
				const prev = list[c - 1];
				const g = team ? last - prev : starts - upTo(occurrences(db, kind, "start").get(id) ?? [], prev);
				const need = ev === "podium" ? 25 : 20;
				if (g >= need) add("drought", tag, Math.min(7, def.weight * 0.6 * log2(g / 10)), sentence(S, ` has gone ${g} ${team ? "races" : "starts"} without ${ev === "win" ? "a win" : ev === "pole" ? "a pole position" : "a podium"}, since the `, cRaceFull(db, F.races[prev].race)));
			} else if (ev !== "pole" && starts >= (team ? 100 : 50)) {
				add("drought", tag, (ev === "win" ? 3 : 2.5) + log2(starts / (team ? 100 : 50)), sentence(S, ` is still looking for a first ${def.one}, after ${starts} ${team ? "races" : "starts"}`));
			}
		}

		// runs on the line
		for (const [ev, limits] of Object.entries(STREAK[kind] ?? {}) as [keyof typeof EVENTS, [number, number]][]) {
			const L = runAt(db, kind, ev, id, last);
			if (L < limits[0]) continue;
			const def = EVENTS[ev];
			const { longest } = compareRuns(db, kind, ev, id, last, L + 1);
			const head = sentence(S, " goes into the ", next, ` on ${L} ${def.many} in a row`);
			if (L + 1 > longest) add("streak", `${kind}:${id}:${ev}`, 5 + def.weight, sentence(head, ", one more would be a record"));
			else if (L + 1 === longest) add("streak", `${kind}:${id}:${ev}`, 4 + def.weight, sentence(head, ", one more would equal the record"));
			else add("streak", `${kind}:${id}:${ev}`, def.weight * (0.6 + L / (limits[0] * 4)), head);
		}

		// the record at this Grand Prix
		if (rates.wins > 0) {
			const occ = occurrences(db, kind, "win", true);
			const gp = race.grandPrixId;
			const c = upTo(occ.get(`${id}@${gp}`) ?? [], last);
			const others = [...occ].filter(([k]) => k.endsWith(`@${gp}`) && k !== `${id}@${gp}`).map(([k, l]) => [k.slice(0, k.lastIndexOf("@")), upTo(l, last)] as const);
			const best = Math.max(0, ...others.map(([, n]) => n));
			const rival = others.find(([, n]) => n === best)?.[0];
			const q = Math.min(1, 0.4 + rates.wins * 2);
			if (c >= 2 && rival && c + 1 === best) add("venue", `${kind}:${id}:gp`, 4 * q, sentence("A win would put ", S, " level with ", subject(db, kind, rival), ` for the most wins at the `, cGp(db, gp), ` (${best})`));
			else if (c >= 2 && rival && c === best) add("venue", `${kind}:${id}:gp`, 5 * q, sentence("A win would give ", S, " the most wins at the ", cGp(db, gp), ` outright (${c + 1})`));
		}
	}

	// a birthday on race day
	for (const id of grid.drivers) {
		const dob = db.drivers.get(id)?.dateOfBirth;
		if (dob && dob.slice(5, 10) === race.date.slice(5, 10)) add("birthday", `driver:${id}:birthday`, 4, sentence(subject(db, "driver", id), ` turns ${race.year - Number(dob.slice(0, 4))} on race day`));
	}

	// can the title be decided here?
	if (race.year === F.races[last].race.year) {
		const toRun = (db.racesByYear.get(race.year) ?? []).filter((r) => r.round >= race.round);
		for (const type of ["driver", "constructor"] as const) {
			const team = type === "constructor";
			const left = pointsLeft(db, race.year, toRun, team);
			const nextLeft = pointsLeft(db, race.year, toRun.slice(0, 1), team);
			const lead = leaderAfter(db, last, type);
			if (left == null || nextLeft == null || !lead || toRun.length < 2) continue;
			const after = standingsAfter(db, F.races[last].race);
			const second = [...(team ? after.constructors : after.drivers)].filter((r) => r.id !== lead.id).sort((a, b) => b.points - a.points)[0];
			// after this race the runner-up could still score everything that remains
			const need = left - nextLeft - lead.gap + 1;
			if (!second || need > nextLeft) continue;
			const L = subject(db, type, lead.id);
			const R = subject(db, type, second.id);
			const title = team ? "the constructors' title" : "the title";
			const pts = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;
			const head = sentence(L, ` can clinch ${title} at the `, next);
			add(
				"title",
				`${type}:${lead.id}:clinch`,
				team ? 8 : 9.5,
				need > 0
					? sentence(head, " by outscoring ", R, ` by ${pts(need)} or more`)
					: sentence(head, ": ", R, " must outscore ", L, need === 0 ? "" : ` by ${pts(1 - need)} or more`, " to keep it open"),
			);
		}
	}

	// a grid full of droughts and near-misses reads as a list; keep a few of each
	return { race, facts: pick(out, limit, 3) };
}
