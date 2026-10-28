// What's at stake at the next race: round numbers and records one result away (for drivers and
// teams who've been getting those results lately), droughts, first wins still waited for, runs on
// the line, records at the Grand Prix and whether the title can be decided there.

import type { Db, Race, Result } from "../dataset.ts";
import { completedRaces } from "../dataset.ts";
import { ageDaysAt, facts } from "../records/facts.ts";
import { cGp, cSeason } from "../records/cells.ts";
import { sharedRaces } from "../teammates.ts";
import { venueNews } from "./venue.ts";
import { safetyCarEvery } from "./notes.ts";
import { pointsAt, POINTS_BAN } from "./stewards.ts";
import { standingsAfter } from "../stats.ts";
import { activeGrid, latestSeason, recentRates } from "../milestones.ts";
import { pointsLeft } from "../views.ts";
import { ordinal } from "../anniversaries.ts";
import { leaderAfter } from "./titles.ts";
import {
	EVENTS,
	STREAK,
	cDemonym,
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
	possessive,
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
			if (EVENTS[ev].sprint && !race.hasSprint) continue;
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

	// the venue: a new circuit, one back after years away, a round-number running
	for (const [key, score, cells] of venueNews(db, race, F.races, true)) add("circuit", key, score, sentence(cells, " is up next"));
	const sc = safetyCarEvery(db, race.grandPrixId, last);
	if (sc >= 5) add("neutral", `gp:${race.grandPrixId}:sc-every`, 3 + log2(sc / 5), sentence("There has been a safety car at every running of the ", cGp(db, race.grandPrixId), ` (${sc})`));

	// first races: a season's rookies and new teams, from its entry list
	if (race.round === 1) {
		const entrants = db.upcomingEntrants.filter((e) => e.year === race.year);
		const drivers = occurrences(db, "driver", "start");
		const teams = occurrences(db, "constructor", "start");
		for (const id of new Set(entrants.map((e) => e.driverId))) if (!drivers.has(id) && db.drivers.has(id)) add("debut", `driver:${id}:debut`, 3, sentence(...possessive(subject(db, "driver", id)), " first Grand Prix is up next"));
		for (const id of new Set(entrants.map((e) => e.constructorId))) if (!teams.has(id) && db.constructors.has(id)) add("debut", `constructor:${id}:debut`, 5, sentence(...possessive(subject(db, "constructor", id)), " first Grand Prix is up next"));
	}

	// home drivers, and how long their country has waited for a home win
	const gp = db.grandsPrix.get(race.grandPrixId);
	const editions = F.races.filter((rf) => rf.race.grandPrixId === race.grandPrixId);
	if (gp && editions.length >= 5) {
		const home = [...grid.drivers].filter((id) => db.drivers.get(id)?.nationality === gp.country);
		if (home.length) {
			const won = editions.filter((rf) => rf.winner && db.drivers.get(rf.winner.driverId)?.nationality === gp.country).at(-1);
			const who = home.length === 1 ? sentence(subject(db, "driver", home[0]), " races at home") : sentence(`${home.length} `, cDemonym(db, gp.country), " drivers race at home");
			if (!won) add("home", `nation:${gp.country}:home`, 3 + log2(editions.length / 10), sentence(who, ": no ", cDemonym(db, gp.country), " driver has won the ", cGp(db, gp.id), ` in ${editions.length} runnings`));
			else if (race.year - won.race.year >= 10) add("home", `nation:${gp.country}:home`, 2 + log2((race.year - won.race.year) / 5), sentence(who, ": the last ", cDemonym(db, gp.country), " winner here was ", subject(db, "driver", won.winner!.driverId), " in ", cSeason(won.race.year)));
		}
	}

	// a winning run at this Grand Prix, on the line
	const holder = editions.at(-1)?.winner?.driverId;
	if (holder && grid.drivers.has(holder)) {
		let L = 0;
		for (let i = editions.length - 1; i >= 0 && editions[i].winner?.driverId === holder; i--) L++;
		// the longest run of wins in a row at this Grand Prix by anyone
		let best = 0;
		for (let i = 0, run = 0; i < editions.length - L; i++) {
			const prev = editions[i - 1]?.winner?.driverId;
			run = editions[i].winner && editions[i].winner!.driverId === prev ? run + 1 : 1;
			best = Math.max(best, run);
		}
		const q = Math.min(1, 0.4 + recentRates(db, holder, false).wins * 2);
		const head = sentence(subject(db, "driver", holder), " has won the ", cGp(db, race.grandPrixId), ` ${L} times in a row`);
		if (L >= 2 && L + 1 > best) add("venue", `driver:${holder}:gp-row`, (4 + L * 0.5) * q, sentence(head, ": no one has won it more times in a row"));
		else if (L >= 3) add("venue", `driver:${holder}:gp-row`, (2.5 + L * 0.5) * q, head);
	}

	// the youngest ever, within reach
	for (const [ev, noun, test] of [
		["win", "winner", (r: Result) => r.position === 1],
		["pole", "polesitter", (r: Result) => r.pole],
	] as const) {
		let young = Infinity;
		for (const rf of F.races) for (const r of rf.results) if (test(r)) young = Math.min(young, ageDaysAt(db, r.driverId, rf.race.date) ?? Infinity);
		for (const id of grid.drivers) {
			const age = ageDaysAt(db, id, race.date);
			const rate = recentRates(db, id, false)[ev === "win" ? "wins" : "poles"];
			if (age != null && age < young && rate > 0) add("chance", `driver:${id}:young-${ev}`, 6 * Math.min(1, 0.4 + rate * 2), sentence(subject(db, "driver", id), ` would be the youngest ${noun} ever`));
		}
	}

	// team-mates: a run of finishing or qualifying ahead, on the line
	for (const team of grid.teams) {
		const pair = [...new Set(F.races[last].results.filter((r) => r.constructorId === team && !r.sharedCar).map((r) => r.driverId))];
		if (pair.length !== 2 || !pair.every((d) => grid.drivers.has(d))) continue;
		const rows = sharedRaces(db, pair[0], pair[1]);
		for (const [what, field] of [["finished ahead of", "finish"], ["out-qualified", "quali"]] as const) {
			const decided = rows.filter((s) => s[field] != null);
			const top = decided.at(-1)?.[field];
			if (!top) continue;
			let L = 0;
			for (let i = decided.length - 1; i >= 0 && decided[i][field] === top; i--) L++;
			const [x, y] = top === "a" ? pair : [pair[1], pair[0]];
			if (L >= 10) add("teammate", `driver:${x}:mate-${field}`, 1.5 + log2(L / 5), sentence(subject(db, "driver", x), ` has ${what} `, subject(db, "driver", y), ` in each of their last ${L} races together`));
		}
	}

	// penalty points: closing on a race ban
	for (const id of grid.drivers) {
		const pts = pointsAt(db, id, race.date);
		if (pts >= 8) add("stewards", `driver:${id}:points`, 3 + (pts - 8) * 0.8, sentence(subject(db, "driver", id), ` is on ${pts} penalty points over twelve months; ${POINTS_BAN} mean a race ban`));
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
