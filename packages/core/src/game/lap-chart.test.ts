import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { lapChartFile } from "./lap-chart-data.ts";
import {
	canTakeHint,
	compareLapGuess,
	dailyLapRace,
	decadeOf,
	driverLetter,
	LAP_CHART_FROM,
	LAP_HINTS,
	LAP_TILES,
	lapOver,
	lapReveal,
	lapShareText,
	MIN_MOVEMENT,
	movement,
	randomLapRace,
	roundsPerYear,
	slotsUsed,
	unpackLapChart,
} from "./lap-chart.ts";
import { raceGuessFile } from "./race-guess-data.ts";
import { continentOf, unpackRaces } from "./race-guess.ts";
import { dataFile } from "../test-data.ts";

const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
// the per-race lap files sit beside the dataset (apps/web/data/laps/)
const lapFile = (id: number) => new URL(`laps/${id}.json`, dataFile);
const readLaps = (id: number) => (existsSync(lapFile(id)) ? JSON.parse(readFileSync(lapFile(id), "utf8")) : null);
const file = lapChartFile(db, readLaps);
const { races, byId } = unpackLapChart(file);

test("movement: processions score low, shuffles and lead changes high", () => {
	const still = movement([
		[1, 1, 1, 1],
		[2, 2, 2, 2],
		[3, 3, 3, 3],
	]);
	assert.deepEqual(still, { leadChanges: 0, movesPerLap: 0, score: 0 });
	const busy = movement([
		[1, 2, 1, 2],
		[2, 1, 2, 1],
		[3, 3, 3, 3],
	]);
	assert.equal(busy.leadChanges, 3);
	assert.equal(busy.movesPerLap, 2);
	assert.ok(busy.score > still.score);
	// nulls (retired) don't count as moves
	assert.equal(movement([[1, 1, null], [2, 2, 1]]).leadChanges, 1);
});

test("pool: 1996 on, lively charts only, entries in lap-file order", () => {
	assert.ok(races.length > 250, `${races.length}`);
	assert.ok(races.every((r) => r.score >= MIN_MOVEMENT && db.raceById.get(r.id)!.year >= LAP_CHART_FROM));
	const first = races[0];
	const laps = readLaps(first.id);
	assert.deepEqual(
		first.entries.map((e) => e.driver.id),
		laps.drivers,
	);
	// a classic: 2011 Canada (rain, many lead changes) is in, its winner first
	const canada = db.races.find((r) => r.year === 2011 && r.grandPrixId === "canada")!;
	const c = byId.get(canada.id);
	assert.ok(c);
	assert.equal(c.entries[0].driver.id, "jenson-button");
	assert.equal(c.entries[0].team.id, "mclaren");
	// a dull one is out
	const belgium21 = db.races.find((r) => r.year === 2021 && r.grandPrixId === "belgium")!;
	assert.ok(!byId.has(belgium21.id));
});

test("daily pick is deterministic and cycles through the pool", () => {
	assert.equal(dailyLapRace(races, 5).id, dailyLapRace([...races].reverse(), 5).id);
	const seen = new Set<number>();
	for (let d = 0; d < races.length; d++) seen.add(dailyLapRace(races, d).id);
	assert.equal(seen.size, races.length);
	const r = randomLapRace(races, rng(1), races[0].id);
	assert.notEqual(r.id, races[0].id);
});
test("hints: any order, each uses a try, the last try is never a hint", () => {
	assert.deepEqual(lapReveal([], false), { round: false, continent: false, decade: false, team: false, winner: false, drivers: false });
	assert.deepEqual(lapReveal(["winner", "round"], false), { round: true, continent: false, decade: false, team: false, winner: true, drivers: false });
	assert.ok(Object.values(lapReveal([], true)).every(Boolean));
	assert.equal(slotsUsed(2, 3), 5);
	assert.ok(canTakeHint(0, 0));
	assert.ok(canTakeHint(0, 4)); // a fifth hint still leaves one try
	assert.ok(!canTakeHint(0, 5));
	assert.ok(!canTakeHint(3, 2));
	assert.ok(!lapOver(1, 4, false));
	assert.ok(lapOver(2, 4, false));
	assert.ok(lapOver(1, 2, true));
	assert.equal(new Set(LAP_HINTS.map((h) => h.key)).size, LAP_HINTS.length);
	assert.deepEqual([0, 1, 25, 26, 27].map(driverLetter), ["A", "B", "Z", "AA", "AB"]);
	assert.equal(decadeOf(2005), "2000s");
	assert.equal(decadeOf(1996), "1990s");
});

const catalog = unpackRaces(raceGuessFile(db));
const find = (label: string) => catalog.races.find((r) => r.label === label)!;

test("coarse tiles: year only earlier/later, Grand Prix and winner match or miss", () => {
	const target = find("2011 Canadian Grand Prix"); // Button, McLaren
	const self = compareLapGuess(target, target);
	assert.ok(self.correct && self.tiles.every((t) => t.verdict === "match"));
	assert.deepEqual(
		LAP_TILES.map((c) => c.key),
		self.tiles.map((t) => t.key),
	);
	const [year, gp, winner] = compareLapGuess(find("2010 Canadian Grand Prix"), target).tiles; // Hamilton, McLaren
	assert.deepEqual([year.verdict, year.direction, year.far], ["miss", "higher", false]);
	assert.equal(gp.verdict, "match");
	assert.equal(winner.verdict, "miss"); // same team, but no amber for it
	const [y2, gp2, w2] = compareLapGuess(find("2012 Monaco Grand Prix"), target).tiles; // Webber
	assert.deepEqual([y2.verdict, y2.direction], ["miss", "lower"]);
	assert.equal(gp2.verdict, "miss");
	assert.equal(w2.verdict, "miss");
	assert.equal(compareLapGuess(find("2011 Hungarian Grand Prix"), target).tiles[2].verdict, "match"); // Button again
	assert.ok(compareLapGuess(find("2011 Hungarian Grand Prix"), target).tiles.every((t) => t.verdict !== "close"));
	// every pool race has a continent and a round count for its hints
	const rounds = roundsPerYear(catalog.races);
	assert.equal(rounds.get(2011), 19);
	for (const r of races) {
		const race = catalog.byId.get(r.id)!;
		assert.ok(continentOf(race.circuit.country), race.label);
		assert.ok(rounds.get(race.year)! >= race.round);
	}
});

test("share text counts tries with hints and names them", () => {
	const target = find("2011 Canadian Grand Prix");
	const rows = [compareLapGuess(find("2010 Canadian Grand Prix"), target), compareLapGuess(target, target)];
	assert.equal(
		lapShareText({ rows, hints: ["decade", "team"], won: true, label: "#12", url: "x/play/lap-chart" }),
		"Pitwall: Lap chart mystery #12 4/6 (2 hints)\n💡 Decade, Winner's team\n⬛🟩⬛\n🟩🟩🟩\nx/play/lap-chart",
	);
	assert.equal(lapShareText({ rows: rows.slice(0, 1), hints: [], won: false, label: "practice" }), "Pitwall: Lap chart mystery practice X/6 (no hints)\n⬛🟩⬛");
});
