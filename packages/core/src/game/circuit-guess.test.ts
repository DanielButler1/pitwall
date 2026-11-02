import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { compassPoint } from "./clue.ts";
import { circuitFile } from "./circuit-guess-data.ts";
import { compare, dailyTarget, eligible, MAX_GUESSES, randomTarget, shareText, unpack, type GuessCircuit } from "./circuit-guess.ts";
import { dataFile } from "../test-data.ts";

const file = circuitFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const circuits = file.circuits.map(unpack);
const byId = (id: string) => circuits.find((c) => c.id === id)!;

test("circuit file: layout, history, aliases", () => {
	const monza = byId("monza");
	assert.equal(monza.flag, "IT");
	assert.equal(monza.type, "RACE");
	assert.ok(monza.clockwise);
	assert.equal(monza.first, 1950);
	assert.ok(monza.races >= 75);
	assert.equal(monza.races, monza.grandsPrix.reduce((n, g) => n + g.count, 0));
	assert.ok(monza.winners[0].wins >= 5);
	assert.equal(file.grandsPrix.italy, "Italian Grand Prix");
	assert.equal(byId("interlagos").alias, "Interlagos");
	assert.equal(byId("silverstone").alias, null);
	assert.equal(byId("monaco").type, "STREET");
	assert.ok(circuits.every((c) => c.races > 0 && c.length > 0 && c.turns > 0));
});

test("pools sized sensibly", () => {
	const modern = circuits.filter((c) => eligible(c, "modern"));
	const all = circuits.filter((c) => eligible(c, "all"));
	assert.ok(modern.length > 30, `${modern.length}`);
	assert.ok(all.length > modern.length);
	assert.ok(modern.every((c) => c.last >= 1990 && c.races >= 3));
	assert.ok(!modern.some((c) => c.id === "reims") && all.some((c) => c.id === "reims"));
	assert.ok(!all.some((c) => c.id === "pescara")); // a single Grand Prix
});

test("daily target is deterministic, eligible and doesn't repeat within a cycle", () => {
	for (const mode of ["modern", "all"] as const) {
		const pool = circuits.filter((c) => eligible(c, mode));
		assert.equal(dailyTarget(circuits, mode, 9).id, dailyTarget([...circuits].reverse(), mode, 9).id);
		const seen = new Set<string>();
		for (let day = 0; day < pool.length; day++) seen.add(dailyTarget(circuits, mode, day).id);
		assert.equal(seen.size, pool.length);
	}
	assert.notEqual(dailyTarget(circuits, "modern", 0).id + dailyTarget(circuits, "modern", 1).id, dailyTarget(circuits, "all", 0).id + dailyTarget(circuits, "all", 1).id);
	const practice = randomTarget(circuits, "all", rng(1), "monza");
	assert.ok(eligible(practice, "all") && practice.id !== "monza");
});

test("compare: country, distance and compass on the real map", () => {
	const self = compare(byId("suzuka"), byId("suzuka"));
	assert.ok(self.correct && self.tiles.every((t) => t.verdict === "match"));
	assert.equal(self.tiles[0].km, 0);
	// guessing Silverstone when it's Monza: ~1,000 km south-east, another country in Europe
	const [country, type, length, turns, first] = compare(byId("silverstone"), byId("monza")).tiles;
	assert.equal(country.verdict, "close");
	assert.ok(country.km > 900 && country.km < 1100, `${country.km}`);
	assert.equal(compassPoint(country.bearing), "south-east");
	assert.equal(type.verdict, "match");
	assert.equal(length.verdict, "close");
	assert.equal(length.direction, "lower");
	assert.equal(turns.direction, "lower");
	assert.deepEqual(first, { key: "first", verdict: "match", direction: null });
	assert.equal(compare(byId("silverstone"), byId("brands-hatch")).tiles[0].verdict, "match");
	assert.equal(compare(byId("monaco"), byId("suzuka")).tiles[0].verdict, "miss");
	assert.equal(compassPoint(compare(byId("monaco"), byId("suzuka")).tiles[0].bearing), "north-east"); // great circle over Russia
	assert.equal(compare(byId("monaco"), byId("silverstone")).tiles[1].verdict, "miss");
});

test("compare tiles in detail", () => {
	const make = (over: Partial<GuessCircuit>): GuessCircuit => ({
		id: "x",
		name: "X",
		alias: null,
		fullName: "X",
		place: "X",
		flag: null,
		countryId: "france",
		country: "France",
		lat: 0,
		lng: 0,
		type: "RACE",
		clockwise: true,
		length: 5,
		turns: 15,
		first: 1980,
		last: 2000,
		races: 20,
		grandsPrix: [],
		winners: [],
		...over,
	});
	const target = make({ id: "t" });
	const [country, type, length, turns, first, races, last] = compare(make({ lat: 1, length: 5.5, turns: 18, first: 1974, races: 25, last: 2000, type: "STREET" }), target).tiles;
	assert.equal(country.verdict, "match");
	assert.equal(compassPoint(country.bearing), "south");
	assert.ok(country.km > 100 && country.km < 120);
	assert.equal(type.verdict, "miss");
	assert.deepEqual(length, { key: "length", verdict: "close", direction: "lower" });
	assert.deepEqual(turns, { key: "turns", verdict: "miss", direction: "lower" });
	assert.deepEqual(first, { key: "first", verdict: "miss", direction: "higher" });
	assert.deepEqual(races, { key: "races", verdict: "close", direction: "lower" });
	assert.equal(last.verdict, "match");
});

test("share text", () => {
	const rows = [compare(byId("silverstone"), byId("monza")), compare(byId("monza"), byId("monza"))];
	const lines = shareText({ rows, won: true, label: "#7 (All time)" }).split("\n");
	assert.equal(lines[0], `Pitwall: Guess the circuit #7 (All time) 2/${MAX_GUESSES}`);
	assert.equal(lines[2], "🟩🟩🟩🟩🟩🟩🟩");
	assert.equal(lines.length, 3);
});
