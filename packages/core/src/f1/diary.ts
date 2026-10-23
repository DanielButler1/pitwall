// "On this day": everything that happened on a calendar date across every season
// (races, birthdays, deaths, debuts, maiden wins and titles decided).
// Works on any Db, so universes get their own diary.

import { isStart, type Db } from "./dataset.ts";
import { ageOn, driverCareers, poleOf, winnerOf } from "./stats.ts";
import { circuitRef, driverRef, raceRef, teamRef, type CircuitRef, type DriverRef, type RaceRef, type TeamRef } from "./views.ts";
import { facts } from "./records/facts.ts";
import { deciders } from "./records/titles.ts";
import { MONTHS, allDiaryDays, diarySlug } from "./diary-dates.ts";
import { anniversaryEvents } from "./milestones.ts";
import type { AnniversaryEvent } from "./anniversaries.ts";

export { MONTHS, allDiaryDays, diarySlug, parseDiarySlug } from "./diary-dates.ts";

const mmdd = (iso: string | null | undefined) => iso?.slice(5, 10) ?? "";
const key = (month: number, day: number) => `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Per-driver firsts, dated by race: first start and first win. */
function firsts(db: Db) {
	const debut = new Map<string, number>();
	const firstWin = new Map<string, number>();
	const races = [...db.races].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
	for (const race of races) {
		for (const r of db.resultsByRace.get(race.id) ?? []) {
			if (isStart(r) && !debut.has(r.driverId)) debut.set(r.driverId, race.id);
			if (r.position === 1 && !firstWin.has(r.driverId)) firstWin.set(r.driverId, race.id);
		}
	}
	return { debut, firstWin };
}

/* --------------------------------------------------------------- a date --- */

export type DiaryPerson = {
	driver: DriverRef;
	year: number;
	/** Age at death (deaths) or the date of death (births), when known. */
	age: number | null;
	died: string | null;
	starts: number;
	wins: number;
	titles: number;
	firstYear: number;
	lastYear: number;
};

export type DiaryView = {
	month: number;
	day: number;
	label: string;
	prev: { slug: string; label: string };
	next: { slug: string; label: string };
	races: { race: RaceRef; circuit: CircuitRef; winner: DriverRef | null; winnerTeam: TeamRef | null; pole: DriverRef | null; upcoming: boolean }[];
	births: DiaryPerson[];
	deaths: DiaryPerson[];
	debuts: { driver: DriverRef; race: RaceRef; age: number | null }[];
	firstWins: { driver: DriverRef; race: RaceRef; age: number | null }[];
	titles: { kind: "driver" | "constructor"; driver: DriverRef | null; team: TeamRef | null; race: RaceRef }[];
};

export function diaryView(db: Db, month: number, day: number): DiaryView {
	const k = key(month, day);
	const careers = driverCareers(db);
	const person = (id: string, year: number, age: number | null, died: string | null): DiaryPerson | null => {
		const c = careers.get(id);
		if (!c) return null;
		return { driver: driverRef(db, id), year, age, died, starts: c.starts, wins: c.wins, titles: c.titles, firstYear: c.firstYear, lastYear: c.lastYear };
	};

	const races = db.races
		.filter((r) => mmdd(r.date) === k)
		.sort((a, b) => b.year - a.year)
		.map((race) => {
			const w = winnerOf(db, race.id);
			const p = poleOf(db, race.id);
			return {
				race: raceRef(db, race),
				circuit: circuitRef(db, race.circuitId),
				winner: w ? driverRef(db, w.driverId) : null,
				winnerTeam: w ? teamRef(db, w.constructorId) : null,
				pole: p ? driverRef(db, p.driverId) : null,
				upcoming: !db.resultsByRace.has(race.id),
			};
		});

	const births: DiaryPerson[] = [];
	const deaths: DiaryPerson[] = [];
	for (const d of db.drivers.values()) {
		if (mmdd(d.dateOfBirth) === k) {
			const p = person(d.id, Number(d.dateOfBirth!.slice(0, 4)), d.dateOfDeath ? ageOn(d.dateOfBirth, d.dateOfDeath) : null, d.dateOfDeath);
			if (p) births.push(p);
		}
		if (mmdd(d.dateOfDeath) === k) {
			const p = person(d.id, Number(d.dateOfDeath!.slice(0, 4)), ageOn(d.dateOfBirth, d.dateOfDeath!), d.dateOfDeath);
			if (p) deaths.push(p);
		}
	}
	births.sort((a, b) => a.year - b.year);
	deaths.sort((a, b) => a.year - b.year);

	const { debut, firstWin } = cachedFirsts(db);
	const dated = (m: Map<string, number>) =>
		[...m]
			.map(([id, raceId]) => ({ id, race: db.raceById.get(raceId)! }))
			.filter((x) => mmdd(x.race.date) === k)
			.sort((a, b) => a.race.year - b.race.year)
			.map((x) => ({ driver: driverRef(db, x.id), race: raceRef(db, x.race), age: ageOn(db.drivers.get(x.id)?.dateOfBirth ?? null, x.race.date) }));

	const f = facts(db);
	const titles: DiaryView["titles"] = [];
	for (const kind of ["driver", "constructor"] as const) {
		for (const [year, idx] of deciders(db, kind)) {
			const race = f.races[idx]?.race;
			if (!race || mmdd(race.date) !== k) continue;
			const id = (kind === "driver" ? db.driverStandings : db.constructorStandings).get(year)?.find((s) => s.champion)?.id;
			if (!id) continue;
			titles.push({ kind, driver: kind === "driver" ? driverRef(db, id) : null, team: kind === "constructor" ? teamRef(db, id) : null, race: raceRef(db, race) });
		}
	}
	titles.sort((a, b) => a.race.year - b.race.year || (a.kind === "driver" ? -1 : 1));

	const days = allDiaryDays();
	const i = days.findIndex((d) => d.month === month && d.day === day);
	const around = (d: { month: number; day: number }) => ({ slug: diarySlug(d.month, d.day), label: `${d.day} ${MONTHS[d.month - 1]}` });
	return {
		month,
		day,
		label: `${day} ${MONTHS[month - 1]}`,
		prev: around(days[(i - 1 + days.length) % days.length]),
		next: around(days[(i + 1) % days.length]),
		races,
		births,
		deaths,
		debuts: dated(debut),
		firstWins: dated(firstWin),
		titles,
	};
}

const firstsMemo = new WeakMap<Db, ReturnType<typeof firsts>>();
function cachedFirsts(db: Db) {
	let v = firstsMemo.get(db);
	if (!v) firstsMemo.set(db, (v = firsts(db)));
	return v;
}

/* ------------------------------------------------------------ the index --- */

export type DiaryDaySummary = {
	races: number;
	births: number;
	deaths: number;
	debuts: number;
	firstWins: number;
	titles: number;
	/** The most recent race held on the date. */
	latest: RaceRef | null;
};

export type DiaryIndexView = {
	/** Per "MM-DD": races held, drivers born and died on that date. */
	days: Record<string, DiaryDaySummary>;
	busiest: { slug: string; label: string; races: number }[];
	/** Notable events, for the "upcoming anniversaries" strip (filtered by date in the browser). */
	anniversaries: AnniversaryEvent[];
};

export function diaryIndexView(db: Db): DiaryIndexView {
	const days: DiaryIndexView["days"] = {};
	const at = (k: string) => (days[k] ??= { races: 0, births: 0, deaths: 0, debuts: 0, firstWins: 0, titles: 0, latest: null });
	for (const r of db.races) {
		const day = at(mmdd(r.date));
		day.races++;
		if (!day.latest || r.year > day.latest.year) day.latest = raceRef(db, r);
	}
	const { debut, firstWin } = cachedFirsts(db);
	for (const raceId of debut.values()) at(mmdd(db.raceById.get(raceId)!.date)).debuts++;
	for (const raceId of firstWin.values()) at(mmdd(db.raceById.get(raceId)!.date)).firstWins++;
	const f = facts(db);
	for (const kind of ["driver", "constructor"] as const)
		for (const idx of deciders(db, kind).values()) {
			const race = f.races[idx]?.race;
			if (race) at(mmdd(race.date)).titles++;
		}
	const careers = driverCareers(db);
	for (const d of db.drivers.values()) {
		if (!careers.has(d.id)) continue;
		if (d.dateOfBirth) at(mmdd(d.dateOfBirth)).births++;
		if (d.dateOfDeath) at(mmdd(d.dateOfDeath)).deaths++;
	}
	const busiest = Object.entries(days)
		.sort((a, b) => b[1].races - a[1].races || a[0].localeCompare(b[0]))
		.slice(0, 5)
		.map(([k, v]) => {
			const [m, d] = k.split("-").map(Number);
			return { slug: diarySlug(m, d), label: `${d} ${MONTHS[m - 1]}`, races: v.races };
		});
	return { days, busiest, anniversaries: anniversaryEvents(db) };
}

export { key as diaryKey };

/* ---------------------------------------------------------- home teaser --- */

export type OnThisDayItem =
	| { kind: "race"; year: number; race: RaceRef; winner: DriverRef | null; winnerTeam: TeamRef | null }
	| { kind: "title"; year: number; race: RaceRef; driver: DriverRef | null; team: TeamRef | null }
	| { kind: "firstWin"; year: number; race: RaceRef; driver: DriverRef }
	| { kind: "debut"; year: number; race: RaceRef; driver: DriverRef; wins: number; titles: number; starts: number }
	| { kind: "birth"; year: number; driver: DriverRef; wins: number; titles: number; starts: number };

export type OnThisDayView = { slug: string; label: string; items: OnThisDayItem[] };

/**
 * A few highlights of a date for the home page, picked in this order: titles decided, maiden
 * wins, notable debuts and birthdays, then the races held on it; shown newest first.
 */
export function onThisDayView(db: Db, month: number, day: number, n = 6): OnThisDayView {
	const v = diaryView(db, month, day);
	const careers = driverCareers(db);
	const notable = (p: DiaryPerson) => p.titles * 1000 + p.wins * 10 + Math.min(p.starts, 9);
	const picks: OnThisDayItem[] = [
		...v.titles.filter((t) => t.kind === "driver").map((t) => ({ kind: "title" as const, year: t.race.year, race: t.race, driver: t.driver, team: t.team })),
		...v.firstWins.map((w) => ({ kind: "firstWin" as const, year: w.race.year, race: w.race, driver: w.driver })),
		...[...v.births]
			.filter((p) => p.starts > 0)
			.sort((a, b) => notable(b) - notable(a))
			.slice(0, 2)
			.map((p) => ({ kind: "birth" as const, year: p.year, driver: p.driver, wins: p.wins, titles: p.titles, starts: p.starts })),
		...v.debuts
			.map((d) => ({ d, c: careers.get(d.driver.id) }))
			.filter(({ c }) => c && (c.wins > 0 || c.podiums >= 5))
			.sort((a, b) => b.c!.titles * 1000 + b.c!.wins - (a.c!.titles * 1000 + a.c!.wins))
			.slice(0, 2)
			.map(({ d, c }) => ({ kind: "debut" as const, year: d.race.year, race: d.race, driver: d.driver, wins: c!.wins, titles: c!.titles, starts: c!.starts })),
		...v.races
			.filter((r) => !r.upcoming)
			.slice(0, n)
			.map((r) => ({ kind: "race" as const, year: r.race.year, race: r.race, winner: r.winner, winnerTeam: r.winnerTeam })),
	];
	// a title decided at a race already says who won it
	const titleRaces = new Set(picks.filter((p) => p.kind === "title").map((p) => `${p.year}`));
	const items = picks.filter((p) => !(p.kind === "race" && titleRaces.has(`${p.year}`)));
	const shown = items.slice(0, n).sort((a, b) => b.year - a.year);
	return { slug: diarySlug(month, day), label: v.label, items: shown };
}
