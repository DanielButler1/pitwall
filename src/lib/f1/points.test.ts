import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completedRaces, hydrate, indexData, type Result } from "./dataset.ts";
import {
	CUSTOM_SYSTEM,
	MAX_POSITIONS,
	decodePointsSystem,
	describeSystem,
	encodePointsSystem,
	pointsSystem,
	pointsSystemProblem,
	sanitizePointsSystem,
	scoreRace,
	systemRules,
} from "./points.ts";
import { pointsCompareView, rescoreSeason, withCustomSystem } from "./points-compare.ts";
import { applyUniverse, describeChange, type Change } from "../universe/apply.ts";

const db = indexData(hydrate(JSON.parse(readFileSync("data/f1.json", "utf8"))));
const preset2010 = pointsSystem("2010")!;
const custom2010 = sanitizePointsSystem({ name: "Mine", race: [...preset2010.race] })!;
const champion = (u: typeof db, year: number) => u.driverStandings.get(year)?.find((r) => r.champion)?.id;

test("sanitising clamps, cleans and rejects bad systems", () => {
	assert.equal(sanitizePointsSystem(null), null);
	assert.equal(sanitizePointsSystem({ race: [] }), null);
	assert.equal(sanitizePointsSystem({ race: "25-18" }), null);
	const s = sanitizePointsSystem({
		id: "evil",
		name: "  " + "x".repeat(100),
		race: [25, -3, Infinity, "7", 1.234, ...new Array(40).fill(1)],
		sprint: [0, 0],
		fastestLap: { points: 1, withinTop: 99.4 },
		pole: -1,
		finishing: 0.5,
		bestResults: 0,
		doubleFinal: "yes",
	})!;
	assert.equal(s.id, CUSTOM_SYSTEM);
	assert.equal(s.name.length, 60);
	assert.equal(s.race.length, MAX_POSITIONS);
	assert.deepEqual(s.race.slice(0, 5), [25, 0, 0, 0, 1.23]);
	assert.equal(s.sprint, undefined, "an all-zero sprint table is no sprint points");
	assert.deepEqual(s.fastestLap, { points: 1, withinTop: MAX_POSITIONS });
	assert.equal(s.pole, undefined);
	assert.equal(s.finishing, 0.5);
	assert.equal(s.bestResults, undefined);
	assert.equal(s.doubleFinal, undefined);
	assert.equal(sanitizePointsSystem({ race: [1e9] })!.race[0], 1000);
	assert.equal(sanitizePointsSystem({ race: [1] })!.name, "Custom");
	assert.equal(pointsSystemProblem({ race: [0, 0] }), "Nobody scores anything under this system.");
	assert.equal(pointsSystemProblem({ race: [0], pole: 1 }), null);
});

test("summary string and URL codec", () => {
	const s = sanitizePointsSystem({ name: "Mine ✓", race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0], sprint: [3, 2, 1], fastestLap: { points: 1, withinTop: 10 }, pole: 2, finishing: 0.5, bestResults: 12, doubleFinal: true })!;
	assert.equal(s.description, "25-18-15-12-10-8-6-4-2-1, sprint 3-2-1, +1 FL in top 10, +2 pole, +0.5 per finish, best 12 results count, double points finale");
	assert.equal(describeSystem(sanitizePointsSystem({ race: [50, 40, 35, 32, 30, 28, 26, 24, 22, 20, 19, 18] })!), "50-40-35-32-30-…-18");
	const param = encodePointsSystem(s);
	assert.match(param, /^[A-Za-z0-9_-]+$/);
	assert.deepEqual(decodePointsSystem(param), s);
	assert.equal(decodePointsSystem("not-json"), null);
	assert.equal(decodePointsSystem(""), null);
});

test("pole and finishing bonuses go to the right cars; sprints get neither", () => {
	const race = completedRaces(db, 2023)[0];
	const results = db.resultsByRace.get(race.id)!;
	const sys = sanitizePointsSystem({ race: [10], pole: 3, finishing: 1 })!;
	const scored = scoreRace(results, sys);
	const pole = results.find((r) => r.pole)!;
	const expect = (r: Result) => (r.position === 1 ? 10 : 0) + (r.pole ? 3 : 0) + (r.position != null ? 1 : 0);
	for (const [i, r] of results.entries()) assert.equal(scored[i].points, expect(r), r.driverId);
	assert.ok(scored.find((r) => r.driverId === pole.driverId)!.points >= 4);
	assert.ok(scored.some((r) => r.position == null && r.points === 0 && !r.pole), "retirements get no finishing point");
	assert.deepEqual(
		scoreRace(results, sys, { sprint: true }).map((r) => r.points),
		results.map(() => 0),
	);
	assert.deepEqual(
		scoreRace(results, sys, { half: true }).map((r) => r.points),
		results.map((r) => expect(r) / 2),
	);
});

test("a custom copy of the 2010 preset scores exactly like the preset", () => {
	for (const year of [1964, 1988, 2008, 2021]) {
		assert.deepEqual(rescoreSeason(db, year, systemRules(year, custom2010)), rescoreSeason(db, year, systemRules(year, preset2010)), String(year));
	}
	const view = pointsCompareView(db);
	const withCustom = withCustomSystem(view, db, custom2010);
	for (const s of withCustom.seasons) assert.deepEqual(s.bySystem[CUSTOM_SYSTEM], s.bySystem["2010"], String(s.year));
	assert.deepEqual(withCustom.summaries[CUSTOM_SYSTEM].driverFlips, view.summaries["2010"].driverFlips);
	assert.equal(withCustom.systems.at(-1)!.name, "Mine");
	assert.equal(view.systems.some((s) => s.id === CUSTOM_SYSTEM), false, "the server view is left alone");
});

test("finishing points and best-N results change the totals as expected", () => {
	const year = 2019;
	const races = completedRaces(db, year);
	const plain = rescoreSeason(db, year, systemRules(year, custom2010));
	const finishing = rescoreSeason(db, year, systemRules(year, { ...custom2010, finishing: 2 }));
	const finishes = (id: string) => races.filter((r) => db.resultsByRace.get(r.id)!.some((x) => x.driverId === id && x.position != null)).length;
	for (const id of ["lewis-hamilton", "max-verstappen", "george-russell"]) {
		const before = plain.drivers.find((r) => r.id === id)!.points;
		assert.equal(finishing.drivers.find((r) => r.id === id)!.points, before + 2 * finishes(id), id);
	}
	const best5 = rescoreSeason(db, year, systemRules(year, { ...custom2010, bestResults: 5 }));
	const ham = races.map((r) => db.resultsByRace.get(r.id)!.find((x) => x.driverId === "lewis-hamilton")?.position ?? null);
	const perRace = ham.map((p) => (p == null ? 0 : (preset2010.race[p - 1] ?? 0))).sort((a, b) => b - a);
	assert.equal(best5.drivers.find((r) => r.id === "lewis-hamilton")!.points, perRace.slice(0, 5).reduce((a, b) => a + b, 0));
	assert.ok(best5.drivers[0].points <= 125);
});

test("pole bonus and double points finale through a universe change", () => {
	const custom = sanitizePointsSystem({ name: "Pole power", race: [...preset2010.race], pole: 5, doubleFinal: true })!;
	const changes: Change[] = [{ id: "c", kind: "points", fromYear: 2022, toYear: 2022, system: CUSTOM_SYSTEM, custom }];
	const u = applyUniverse(db, { id: "pts-custom", updatedAt: 1, changes });
	const ref = applyUniverse(db, { id: "pts-2010", updatedAt: 1, changes: [{ id: "c", kind: "points", fromYear: 2022, toYear: 2022, system: "2010" }] });
	const races = completedRaces(db, 2022);
	const last = races[races.length - 1];
	const poles = (id: string) => races.filter((r) => db.resultsByRace.get(r.id)!.some((x) => x.driverId === id && x.pole)).length;
	const lastPoints = (id: string) => ref.resultsByRace.get(last.id)!.find((x) => x.driverId === id)!.points;
	const lastPole = db.resultsByRace.get(last.id)!.find((x) => x.pole)!.driverId;
	for (const id of ["max-verstappen", "charles-leclerc"]) {
		const before = ref.driverStandings.get(2022)!.find((r) => r.id === id)!.points;
		const after = u.driverStandings.get(2022)!.find((r) => r.id === id)!.points;
		assert.equal(after, before + 5 * poles(id) + lastPoints(id) + (lastPole === id ? 5 : 0), id);
	}
	assert.equal(u.rulesOverride?.get(2022)?.system.name, "Pole power");
	assert.deepEqual(describeChange(db, changes[0]), { title: "Points: Pole power", detail: "2022 · 25-18-15-12-10-8-6-4-2-1, +5 pole, double points finale" });
});

test("old preset changes still apply, and a broken custom system is ignored rather than crashing", () => {
	const u = applyUniverse(db, { id: "pts-old", updatedAt: 1, changes: [{ id: "a", kind: "points", fromYear: 1988, toYear: 1988, system: "2010" }] });
	assert.equal(champion(u, 1988), "alain-prost");
	assert.deepEqual(describeChange(db, { id: "a", kind: "points", fromYear: 1950, toYear: 2025, system: "2010" }), { title: "Points: 2010–2018", detail: "1950–2025" });
	const broken = { id: "b", kind: "points", fromYear: 1988, toYear: 1988, system: CUSTOM_SYSTEM, custom: { race: "nope" } } as unknown as Change;
	const v = applyUniverse(db, { id: "pts-broken", updatedAt: 1, changes: [broken] });
	assert.equal(champion(v, 1988), "ayrton-senna");
});
