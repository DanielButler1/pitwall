// Race facts on the real dataset, without assuming what happened in any race (the data grows every
// weekend): facts only look backwards, come out ranked and capped, and say true things.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData, type Db } from "./dataset.ts";
import { factText, raceFacts } from "./race-facts.ts";
import { dataFile } from "../test-data.ts";

const raw = () => hydrate(JSON.parse(readFileSync(dataFile, "utf8")));
const real = indexData(raw());
const done = real.races.filter((r) => real.resultsByRace.has(r.id)).sort((a, b) => a.year - b.year || a.round - b.round);
// a spread of races across the eras, plus the latest
const sample = [...done.filter((_, i) => i % 97 === 50), done.at(-1)!];

test("facts come ranked, capped and readable", () => {
	for (const race of sample) {
		const list = raceFacts(real, race.id, 5);
		assert.ok(list.length <= 5);
		assert.equal(new Set(list.map((f) => f.key)).size, list.length);
		for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
		for (const f of list) {
			assert.ok(f.score >= 0 && f.score <= 10);
			const text = factText(f.cells);
			assert.match(text, /^\S/, text);
			assert.doesNotMatch(text, /undefined|null|NaN/, text);
		}
	}
});

test("a race's facts don't depend on the races after it", () => {
	const race = done[Math.floor(done.length * 0.8)];
	const data = raw();
	// forget everything after this race
	const later = new Set(data.races.filter((r) => r.year > race.year || (r.year === race.year && r.round > race.round)).map((r) => r.id));
	data.results = data.results.filter((r) => !later.has(r.raceId));
	data.races = data.races.filter((r) => !later.has(r.id));
	const cut: Db = indexData(data);
	assert.deepEqual(raceFacts(cut, race.id, 20), raceFacts(real, race.id, 20));
});

test("a driver's first win really is their first", () => {
	let checked = 0;
	for (const race of done.slice(-150)) {
		for (const f of raceFacts(real, race.id, 20)) {
			if (f.kind !== "first" || !f.key.startsWith("first:driver:") || !f.key.endsWith(":win")) continue;
			const id = f.key.split(":")[2];
			const wins = real.resultsByDriver.get(id)!.filter((r) => r.position === 1);
			assert.equal(wins[0].raceId, race.id);
			checked++;
		}
	}
	// every recent stretch of 150 races has had a first-time winner
	assert.ok(checked > 0);
});

test("a universe's history makes its own facts", () => {
	const race = done.at(-1)!;
	const data = raw();
	const results = data.results.filter((r) => r.raceId === race.id).sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
	// hand the win to the last classified finisher: it's news of some sort in the universe, not in reality
	const last = results.filter((r) => r.position != null).at(-1)!;
	[results[0].driverId, last.driverId] = [last.driverId, results[0].driverId];
	[results[0].constructorId, last.constructorId] = [last.constructorId, results[0].constructorId];
	const universe = indexData(data);
	assert.notDeepEqual(raceFacts(universe, race.id, 20), raceFacts(real, race.id, 20));
});
