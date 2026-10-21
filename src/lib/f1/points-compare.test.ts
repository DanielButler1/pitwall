import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { COMPARE_SYSTEMS, ERA_SYSTEM, pointsCompareView } from "./points-compare.ts";
import { applyUniverse } from "../universe/apply.ts";

const db = indexData(hydrate(JSON.parse(readFileSync("data/f1.json", "utf8"))));
const view = pointsCompareView(db);
const season = (year: number) => view.seasons.find((s) => s.year === year)!;
const champ = (year: number, system: string) => season(year).bySystem[system].driver?.id;

test("every completed season has the official champions and a column per system", () => {
	assert.equal(view.firstYear, 1950);
	assert.equal(season(2021).driver?.id, "max-verstappen");
	assert.equal(season(1957).team, null);
	assert.equal(season(1958).team?.id, "vanwall");
	for (const s of view.seasons) assert.deepEqual(Object.keys(s.bySystem).sort(), COMPARE_SYSTEMS.map((c) => c.id).sort());
});

test("without dropped scores, Hill wins 1964 and Prost wins 1988; nothing else changes", () => {
	assert.equal(champ(1964, ERA_SYSTEM), "graham-hill");
	assert.equal(champ(1988, ERA_SYSTEM), "alain-prost");
	assert.deepEqual(
		view.summaries[ERA_SYSTEM].driverFlips.map((f) => f.year),
		[1964, 1988],
	);
	// the era column keeps real points, so 1984's half-points Monaco still leaves Lauda half a point ahead
	assert.equal(champ(1984, ERA_SYSTEM), "niki-lauda");
	assert.equal(season(1984).bySystem[ERA_SYSTEM].driver?.margin, 0.5);
});

test("winner-takes-all hands Massa 2008 and Verstappen 2025; seasons without drops match reality under their own system", () => {
	assert.equal(champ(2008, "winner"), "felipe-massa");
	assert.equal(champ(2016, "winner"), "lewis-hamilton");
	assert.equal(champ(2025, "winner"), "max-verstappen");
	for (let y = 2010; y <= 2018; y++) assert.equal(champ(y, "2010"), season(y).driver?.id, String(y));
	for (let y = 2003; y <= 2009; y++) assert.equal(champ(y, "2003"), season(y).driver?.id, String(y));
});

test("title totals and flips agree with the matrix", () => {
	for (const sys of COMPARE_SYSTEMS) {
		const sum = view.summaries[sys.id];
		const flips = view.seasons.filter((s) => s.driver && s.bySystem[sys.id].driver && s.driver.id !== s.bySystem[sys.id].driver!.id);
		assert.equal(sum.driverFlips.length, flips.length, sys.id);
		assert.equal(
			sum.drivers.reduce((n, d) => n + d.titles, 0),
			view.seasons.filter((s) => s.bySystem[sys.id].driver).length,
		);
		for (const id of sum.driverFlips.flatMap((f) => [f.from, f.to.id])) assert.ok(view.drivers[id], id);
	}
	assert.equal(view.drivers["graham-hill"].short, "G. Hill");
	assert.equal(view.drivers["damon-hill"].short, "D. Hill");
	assert.equal(view.drivers["lewis-hamilton"].short, "Hamilton");
});

test("champions match the Lab's points universe for the same system", () => {
	for (const system of ["2010", "winner"]) {
		const u = applyUniverse(db, { id: `pc-${system}`, updatedAt: 1, changes: [{ id: "p", kind: "points", fromYear: view.firstYear, toYear: view.lastYear, system }] });
		for (const s of view.seasons) {
			assert.equal(s.bySystem[system].driver?.id, u.driverStandings.get(s.year)?.find((r) => r.champion)?.id, `${system} ${s.year} drivers`);
			if (s.team) assert.equal(s.bySystem[system].team?.id, u.constructorStandings.get(s.year)?.find((r) => r.champion)?.id, `${system} ${s.year} constructors`);
		}
	}
});

test("half-points races stay half points when re-scored", () => {
	// 1984 under its own 9-6-4-3-2-1 with every result counting is just 1984: Lauda by half a point
	const u = applyUniverse(db, { id: "pc-half", updatedAt: 1, changes: [{ id: "p", kind: "points", fromYear: 1984, toYear: 1984, system: "1961" }] });
	const top = u.driverStandings.get(1984)!;
	assert.equal(top[0].id, "niki-lauda");
	assert.equal(top[0].points - top[1].points, 0.5);
	assert.equal(champ(1984, "1961"), "niki-lauda");
});

test("inside a universe, reality's champion is reported where it differs", () => {
	const u = applyUniverse(db, { id: "pc-u", updatedAt: 1, changes: [{ id: "p", kind: "points", fromYear: 1988, toYear: 1988, system: "2010" }] });
	const v = pointsCompareView(u, db);
	const s1988 = v.seasons.find((s) => s.year === 1988)!;
	assert.equal(s1988.driver?.id, "alain-prost");
	assert.equal(s1988.realityDriver, "ayrton-senna");
	assert.equal(v.seasons.find((s) => s.year === 1989)!.realityDriver, undefined);
});
