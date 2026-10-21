import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completedRaces, hydrate, indexData, type Db } from "./dataset.ts";
import { constructorCareers, driverCareers, seasonStandings } from "./stats.ts";
import { activeGrid, anniversaryEvents, milestonesView, nextMark, recentRates, type Subject } from "./milestones.ts";
import { isRoundAnniversary, upcomingAnniversaries, type AnniversaryEvent } from "./anniversaries.ts";
import { seasonProgression } from "./progression.ts";

const data = hydrate(JSON.parse(readFileSync("data/f1.json", "utf8")));
const db = indexData(data);

/** History as it stood at the end of `year`. */
function upTo(year: number): Db {
	const races = data.races.filter((r) => r.year <= year);
	const ids = new Set(races.map((r) => r.id));
	const keep = <T,>(m: Map<number, T>) => new Map([...m].filter(([y]) => y <= year));
	return indexData({
		...data,
		meta: { ...data.meta, lastCompletedYear: year },
		races,
		results: data.results.filter((r) => ids.has(r.raceId)),
		sprintResults: data.sprintResults.filter((r) => ids.has(r.raceId)),
		qualifying: data.qualifying.filter((r) => ids.has(r.raceId)),
		fastestLaps: data.fastestLaps.filter((r) => ids.has(r.raceId)),
		driverStandings: keep(data.driverStandings),
		constructorStandings: keep(data.constructorStandings),
		upcomingEntrants: [],
	});
}

const idOf = (s: Subject) => (s.kind === "driver" ? s.driver.id : s.team.id);

test("round-number marks", () => {
	assert.equal(nextMark("starts", false, 297), 300);
	assert.equal(nextMark("starts", false, 300), 350);
	assert.equal(nextMark("starts", false, 12), 50);
	assert.equal(nextMark("wins", false, 3), 10);
	assert.equal(nextMark("wins", false, 49), 50);
	assert.equal(nextMark("wins", false, 51), 75);
	assert.equal(nextMark("podiums", false, 99), 100);
	assert.equal(nextMark("podiums", false, 101), 150);
	assert.equal(nextMark("starts", true, 999), 1000);
	assert.equal(nextMark("points", true, 1200), 2000);
	assert.equal(nextMark("titles", false, 3), null);
});

test("every chase targets the next value up on the all-time list", () => {
	const v = milestonesView(db)!;
	const grid = activeGrid(db)!;
	assert.ok(v.chases.length > 0);
	for (const c of v.chases) {
		const team = c.subject.kind === "team";
		const id = idOf(c.subject);
		assert.ok((team ? grid.teams : grid.drivers).has(id), `${id} is on the grid`);
		const careers = [...(team ? constructorCareers(db) : driverCareers(db)).values()].filter((o) => o.id !== id);
		const me = (team ? constructorCareers(db) : driverCareers(db)).get(id)!;
		assert.equal(c.current, me[c.stat]);
		const above = careers.map((o) => o[c.stat]).filter((x) => x > c.current);
		assert.equal(c.target.value, Math.min(...above));
		assert.equal(c.rank, above.length + 1);
		assert.ok(c.newRank < c.rank);
		assert.equal(c.needed, c.stat === "points" ? Math.round((c.target.value - c.current) * 100) / 100 : c.target.value - c.current + 1);
		for (const t of c.target.subjects) assert.equal((team ? constructorCareers(db) : driverCareers(db)).get(idOf(t))![c.stat], c.target.value);
	}
});

test("milestones are the next round number, soonest first", () => {
	const v = milestonesView(db)!;
	for (const m of v.milestones) {
		assert.equal(m.target, nextMark(m.stat, m.subject.kind === "team", m.current));
		assert.ok(m.needed > 0 && m.eta != null && m.eta <= 24);
	}
	for (let i = 1; i < v.milestones.length; i++) assert.ok((v.milestones[i - 1].eta ?? 99) <= (v.milestones[i].eta ?? 99));
});

test("at the end of 2019, Hamilton was chasing Schumacher's win record", () => {
	const old = upTo(2019);
	const careers = driverCareers(old);
	const ham = careers.get("lewis-hamilton")!;
	const msc = careers.get("michael-schumacher")!;
	assert.ok(msc.wins > ham.wins);
	const chase = milestonesView(old)!.chases.find((c) => c.stat === "wins" && idOf(c.subject) === "lewis-hamilton");
	assert.ok(chase);
	assert.deepEqual(chase.target.subjects.map(idOf), ["michael-schumacher"]);
	assert.equal(chase.needed, msc.wins - ham.wins + 1);
	assert.equal(chase.rank, 2);
	assert.equal(chase.newRank, 1);
	// and a year later the record was his: no wins chase left
	assert.equal(milestonesView(upTo(2020))!.chases.find((c) => c.stat === "wins" && idOf(c.subject) === "lewis-hamilton"), undefined);
});

test("anniversaries: round numbers only, soonest first, leap days and new year handled", () => {
	const e = (kind: AnniversaryEvent["kind"], date: string, died?: boolean): AnniversaryEvent => ({ kind, date, driver: null, team: null, race: null, died });
	assert.ok(isRoundAnniversary(e("title", "1976-10-24"), 50));
	assert.ok(isRoundAnniversary(e("title", "1951-10-28"), 75));
	assert.ok(!isRoundAnniversary(e("title", "1983-10-15"), 43));
	assert.ok(isRoundAnniversary(e("birth", "1946-11-06"), 80));
	assert.ok(!isRoundAnniversary(e("birth", "1946-11-06", true), 80));
	assert.ok(isRoundAnniversary(e("birth", "1926-11-06", true), 100));
	const events = [e("title", "1976-12-30"), e("title", "1976-10-24"), e("title", "1980-02-29"), e("first-race", "1950-05-13")];
	const up = upcomingAnniversaries(events, "2026-10-21", 30);
	assert.deepEqual(up.map((a) => [a.on, a.years, a.inDays]), [["2026-10-24", 50, 3]]);
	assert.deepEqual(upcomingAnniversaries(events, "2026-12-20", 30).map((a) => a.on), ["2026-12-30"]);
	assert.deepEqual(upcomingAnniversaries(events, "2040-02-20", 30).map((a) => a.on), ["2040-02-29"]);
	assert.deepEqual(upcomingAnniversaries(events, "2050-05-01", 30).map((a) => a.years), [100]);
});

test("anniversary events include every title, dated by the deciding race", () => {
	const events = anniversaryEvents(db);
	const titles = events.filter((x) => x.kind === "title");
	const champions = [...db.driverStandings.values()].filter((rows) => rows.some((r) => r.champion)).length;
	assert.equal(titles.length, champions);
	for (const t of titles) assert.equal(t.date, t.race!.date);
	assert.equal(events.filter((x) => x.kind === "first-race").length, 1);
});

test("points progression ends on the official tables, dropped scores included", () => {
	for (const year of [1988, 2008, 2021]) {
		const p = seasonProgression(db, year)!;
		const rounds = completedRaces(db, year).length;
		assert.equal(p.rounds.length, rounds);
		const official = seasonStandings(db, year);
		for (const s of p.drivers.series) {
			assert.equal(s.points.length, rounds);
			assert.equal(s.points[rounds - 1], Math.round(official.drivers.find((r) => r.id === s.key)!.points * 100) / 100);
		}
		assert.equal(p.drivers.leader[rounds - 1], p.drivers.series[0].points[rounds - 1]);
		assert.ok(p.constructors && p.constructors.series.length > 0);
	}
	// 1988: only the best 11 results counted, so Prost's tally is below the points he scored
	const prost = seasonProgression(db, 1988)!.drivers.series.find((s) => s.key === "alain-prost")!;
	const gross = db.results.filter((r) => r.driverId === "alain-prost" && db.raceById.get(r.raceId)!.year === 1988).reduce((n, r) => n + r.points, 0);
	assert.ok(prost.points.at(-1)! < gross);
	// cumulative totals never fall in a season without dropped scores
	for (const s of seasonProgression(db, 2021)!.drivers.series)
		for (let i = 1; i < s.points.length; i++) assert.ok((s.points[i] ?? 0) >= (s.points[i - 1] ?? 0));
	// no constructors' championship before 1958
	assert.equal(seasonProgression(db, 1955)!.constructors, null);
});

test("a chase on someone still racing uses the rate they are being caught at", () => {
	const v = milestonesView(db)!;
	const grid = activeGrid(db)!;
	let moving = 0;
	for (const c of v.chases) {
		const stat = c.stat;
		if (stat === "titles") continue;
		const team = c.subject.kind === "team";
		const active = c.target.subjects.filter((t) => (team ? grid.teams : grid.drivers).has(idOf(t)));
		const theirs = Math.max(0, ...active.map((t) => recentRates(db, idOf(t), team)[stat]));
		const closing = recentRates(db, idOf(c.subject), team)[stat] - theirs;
		assert.ok(closing > 0, `${idOf(c.subject)} is catching ${c.target.subjects.map(idOf)} on ${c.stat}`);
		assert.equal(c.eta, Math.max(1, Math.ceil(c.needed / closing - 1e-9)));
		if (active.length) moving++;
	}
	assert.ok(moving > 0);
});
