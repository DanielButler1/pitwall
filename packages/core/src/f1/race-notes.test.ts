// Race notes (hand-entered safety cars, tyres, weather): the stint maths on made-up races, and universe
// safety on the real dataset without assuming which races have notes (the notes grow every weekend).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { neutralText, raceNote, raceStints, tyreColour, type RaceLapFile } from "./laps.ts";
import { raceView } from "./views.ts";
import { dataFile } from "../test-data.ts";

test("stints split at pit stops, with the compounds in order", () => {
	const file: RaceLapFile = {
		raceId: 1,
		drivers: ["a", "b", "c"],
		pitStops: [
			["a", 1, 18, 22000],
			["b", 1, 20, 23000],
			["b", 2, 40, 22500],
		],
		tyres: [
			["a", ["M", "H"]],
			["b", ["S", "?", "S"]],
		],
	};
	const laps = new Map([
		["a", 57],
		["b", 57],
		["c", 12],
	]);
	const [a, b, c] = raceStints(file, laps);
	assert.deepEqual(a.stints, [
		{ from: 1, to: 18, compound: "M" },
		{ from: 19, to: 57, compound: "H" },
	]);
	assert.deepEqual(b.stints.map((s) => [s.from, s.to, s.compound]), [
		[1, 20, "S"],
		[21, 40, null],
		[41, 57, "S"],
	]);
	// no stops and no tyres entered: one stint, compound unknown
	assert.deepEqual(c.stints, [{ from: 1, to: 12, compound: null }]);
});

test("a tyre change under a red flag starts a stint without a stop", () => {
	const file: RaceLapFile = { raceId: 1, drivers: ["a"], pitStops: [["a", 1, 30, 22000]], tyres: [["a", ["I", "I", "S"]]] };
	const [a] = raceStints(file, new Map([["a", 60]]), [
		["SC", 8, 10],
		["RF", 10, 10],
	]);
	assert.deepEqual(a.stints.map((s) => [s.from, s.to, s.compound]), [
		[1, 10, "I"],
		[11, 30, "I"],
		[31, 60, "S"],
	]);
	// as many compounds as stops + 1: the red flag doesn't split anything
	const [b] = raceStints({ ...file, tyres: [["a", ["I", "S"]]] }, new Map([["a", 60]]), [["RF", 10, 10]]);
	assert.equal(b.stints.length, 2);
});

test("stops on a driver's last lap or twice on one lap don't make empty stints", () => {
	const file: RaceLapFile = {
		raceId: 1,
		drivers: ["a"],
		pitStops: [
			["a", 1, 5, 30000],
			["a", 2, 5, 25000],
			["a", 3, 20, 25000],
		],
	};
	const [a] = raceStints(file, new Map([["a", 20]]));
	assert.deepEqual(a.stints.map((s) => [s.from, s.to]), [
		[1, 5],
		[6, 20],
	]);
});

test("labels and colours", () => {
	assert.equal(neutralText(["SC", 14, 20]), "Safety car laps 14–20");
	assert.equal(neutralText(["RF", 33, 33]), "Red flag lap 33");
	// Pirelli moved the colours in 2019: the soft was yellow before, red since
	assert.equal(tyreColour("S", 2018), tyreColour("M", 2019));
	assert.equal(tyreColour("S", 2019), tyreColour("SS", 2018));
	assert.equal(tyreColour("?", 2024), null);
});

test("notes follow the real race and disappear when a universe changes it", () => {
	const real = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
	const noted = [...(real.raceNotes ?? new Map()).keys()].find((id) => raceNote(real, id));
	if (noted == null) return; // a dataset built without notes has nothing to check
	const race = real.raceById.get(noted)!;
	const note = raceNote(real, noted)!;
	const view = raceView(real, race.year, race.round)!;
	if (note.weather || note.neutralised.length) assert.deepEqual(view.notes, { weather: note.weather, neutralised: note.neutralised });

	// swap the first two finishers: the notes no longer describe this race
	const data = hydrate(JSON.parse(readFileSync(dataFile, "utf8")));
	const results = data.results.filter((r) => r.raceId === noted).sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
	[results[0].driverId, results[1].driverId] = [results[1].driverId, results[0].driverId];
	const universe = indexData(data);
	assert.equal(raceNote(universe, noted), null);
	const uv = raceView(universe, race.year, race.round)!;
	assert.equal(uv.notes, null);
	assert.equal(uv.lapData?.tyres ?? false, false);
});
