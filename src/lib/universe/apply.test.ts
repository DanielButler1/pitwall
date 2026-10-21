import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { applyUniverse, championChanges, type Change } from "./apply.ts";
import { seasonView, driverView, raceView } from "../f1/views.ts";

const base = indexData(hydrate(JSON.parse(readFileSync(new URL("../../../data/f1.json", import.meta.url), "utf8"))));
let n = 0;
const universe = (changes: Change[]) => ({ id: `t${n++}`, updatedAt: 1, changes });
const champion = (db: typeof base, year: number) => db.driverStandings.get(year)?.find((r) => r.champion)?.id;

test("an empty universe is reality", () => {
	const db = applyUniverse(base, universe([]));
	assert.equal(champion(db, 2021), "max-verstappen");
	assert.equal(db.modifiedYears?.size, 0);
});

test("2008 under 2010-18 points keeps Hamilton but changes the margin", () => {
	const db = applyUniverse(base, universe([{ id: "a", kind: "points", fromYear: 2008, toYear: 2008, system: "2010" }]));
	const s = db.driverStandings.get(2008)!;
	assert.equal(s[0].id, "lewis-hamilton");
	assert.ok(s[0].points > 98, `expected rescored total, got ${s[0].points}`);
	assert.ok(db.modifiedYears?.has(2008));
});

test("1988 with all results counting and modern points makes Prost champion", () => {
	// Prost famously outscored Senna in 1988 but lost on dropped scores.
	const db = applyUniverse(base, universe([{ id: "a", kind: "points", fromYear: 1988, toYear: 1988, system: "2010" }]));
	assert.equal(champion(db, 1988), "alain-prost");
	assert.deepEqual(
		championChanges(base, db).map((c) => [c.year, c.real, c.now]),
		[[1988, "ayrton-senna", "alain-prost"]],
	);
});

test("editing a race result flows into standings, careers and race page", () => {
	const race = base.races.find((r) => r.year === 2021 && r.round === 22)!;
	const order = base.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]]; // Hamilton wins Abu Dhabi 2021
	const db = applyUniverse(base, universe([{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }]));
	assert.equal(champion(db, 2021), "lewis-hamilton");
	assert.equal(driverView(db, "lewis-hamilton", base)!.totals.titles, 8);
	assert.equal(driverView(db, "lewis-hamilton", base)!.realTotals!.titles, 7);
	const rv = raceView(db, 2021, 22, base)!;
	assert.ok(rv.modified);
	assert.equal(rv.results[0].driver.id, "lewis-hamilton");
	assert.equal(rv.results[0].realPosition, "2");
	assert.equal(seasonView(db, 2021, base)!.driverStandings[0].realPosition, "2");
});

test("removing a driver promotes everyone behind", () => {
	const db = applyUniverse(base, universe([{ id: "a", kind: "remove-driver", driverId: "michael-schumacher", fromYear: 2000, toYear: 2004 }]));
	for (let y = 2000; y <= 2004; y++) assert.notEqual(champion(db, y), "michael-schumacher");
});

test("simulation is deterministic per seed and differs across seeds", () => {
	const mk = (seed: number) =>
		applyUniverse(base, universe([{ id: "a", kind: "season-sim", year: 1998, fromRound: 1, seed, chaos: 1, reliability: 1 }]));
	const order = (db: typeof base) => db.driverStandings.get(1998)!.slice(0, 6).map((r) => r.id).join();
	assert.equal(order(mk(1)), order(mk(1)));
	const outcomes = new Set([1, 2, 3, 4, 5, 6].map((s) => order(mk(s))));
	assert.ok(outcomes.size > 1);
	// form book still matters: McLaren or Ferrari should win the title in most seeds
	const champs = [1, 2, 3, 4, 5, 6].map((s) => champion(mk(s), 1998));
	assert.ok(champs.filter((c) => ["mika-hakkinen", "michael-schumacher", "david-coulthard", "eddie-irvine"].includes(c!)).length >= 4, champs.join());
});
