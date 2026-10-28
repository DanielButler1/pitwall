// Race facts on the real dataset, without assuming what happened in any race (the data grows every
// weekend): facts only look backwards, come out ranked and capped, and say true things.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData, resultsSig, type Db } from "./dataset.ts";
import { raceNote } from "./laps.ts";
import { stewardsOf } from "./stewards.ts";
import { pointsAt, pointsAwards } from "./facts/stewards.ts";
import { factIndex, factText, packFacts, raceFacts, seasonFacts, subjectFacts, unpackFacts, upcomingFacts, venueFacts } from "./race-facts.ts";
import { champions } from "./records/facts.ts";
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
	// an early round, so its season is still open either way
	const race = done.slice(Math.floor(done.length * 0.8)).find((r) => r.round === 3)!;
	const data = raw();
	// forget every result after this race (the calendar stays, as it would have been at the time)
	const later = new Set(data.races.filter((r) => r.year > race.year || (r.year === race.year && r.round > race.round)).map((r) => r.id));
	data.results = data.results.filter((r) => !later.has(r.raceId));
	data.sprintResults = data.sprintResults.filter((r) => !later.has(r.raceId));
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

test("every finished season has one race that made its champion", () => {
	for (const { year, id } of champions(real, "driver").slice(-12)) {
		const races = done.filter((r) => r.year === year);
		const titled = races.flatMap((r) => raceFacts(real, r.id, 20).filter((f) => f.key.startsWith("title:driver:") && f.key.endsWith(":title")));
		assert.equal(titled.length, 1, String(year));
		assert.equal(titled[0].key, `title:driver:${id}:title`);
	}
});

test("what's at stake next comes capped and readable", () => {
	const next = upcomingFacts(real, 8);
	if (!next) return; // between seasons with no calendar yet
	assert.ok(!real.resultsByRace.has(next.race.id));
	assert.ok(next.facts.length <= 8);
	for (const f of next.facts) assert.doesNotMatch(factText(f.cells), /undefined|null|NaN/);
	const kinds = new Map<string, number>();
	for (const f of next.facts) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
	for (const n of kinds.values()) assert.ok(n <= 3);
});

test("a race with sprint results is a sprint weekend", () => {
	for (const id of new Set(real.sprintResults.map((r) => r.raceId))) assert.ok(real.raceById.get(id)!.hasSprint, String(id));
});

test("an all-nation podium is three drivers of that nation", () => {
	for (const race of done.slice(-400)) {
		for (const f of raceFacts(real, race.id, 40)) {
			const m = /^podium:nation:([^:]+):podium$/.exec(f.key);
			if (!m) continue;
			const top = [1, 2, 3].map((p) => real.resultsByRace.get(race.id)!.find((r) => r.position === p)!);
			for (const r of top) assert.equal(real.drivers.get(r.driverId)!.nationality, m[1]);
		}
	}
});

test("weather and red-flag facts come from the race's notes", () => {
	let checked = 0;
	for (const race of done.slice(-500)) {
		for (const f of raceFacts(real, race.id, 40)) {
			const note = raceNote(real, race.id);
			if (f.kind === "weather") {
				assert.ok(note?.weather === "wet" || note?.weather === "mixed", factText(f.cells));
				checked++;
			}
			if (/^neutral:(race:red|gp:[^:]+:red$)/.test(f.key)) {
				assert.ok(note?.neutralised.some((n) => n[0] === "RF"), factText(f.cells));
				checked++;
			}
		}
	}
	// without notes in the data there's nothing to check
	if (real.raceNotes?.size) assert.ok(checked > 0);
});

test("tyre facts read the stints entered for a race", () => {
	const race = done.at(-1)!;
	const data = raw();
	const winner = data.results.find((r) => r.raceId === race.id && r.position === 1)!;
	const tag = `tyres:driver:${winner.driverId}:one-compound`;
	assert.ok(!raceFacts(indexData(data), race.id, 40).some((f) => f.key === tag));
	const notes = data.raceNotes ?? new Map();
	const note = notes.get(race.id);
	notes.set(race.id, { raceId: race.id, weather: note?.weather ?? null, neutralised: [], tyres: true, stints: new Map([[winner.driverId, ["H", "H"]]]) });
	data.raceNotes = notes;
	// the notes belong to these results (laps.ts raceNote checks)
	data.raceNotesSig = new Map([...(data.raceNotesSig ?? []), [race.id, resultsSig(data.results.filter((r) => r.raceId === race.id))]]);
	assert.ok(raceFacts(indexData(data), race.id, 40).some((f) => f.key === tag));
});

test("a first hat-trick or a new circuit really is the first", () => {
	for (const race of done.slice(-300)) {
		const at = done.indexOf(race);
		for (const f of raceFacts(real, race.id, 40)) {
			let m = /^first:driver:(.+):hatTrick$/.exec(f.key);
			if (m) {
				const id = m[1];
				const before = done.slice(0, at).some((r) => real.resultsByRace.get(r.id)!.some((x) => x.driverId === id && x.pole && x.position === 1 && x.fastestLap));
				assert.ok(!before, factText(f.cells));
			}
			m = /^circuit:circuit:(.+):first$/.exec(f.key);
			if (m) assert.ok(!done.slice(0, at).some((r) => r.circuitId === m![1]), factText(f.cells));
		}
	}
});

test("stewards' facts only come from races with the FIA's documents", () => {
	for (const race of done.slice(-150)) {
		const s = stewardsOf(real, race.id);
		for (const f of raceFacts(real, race.id, 40)) if (f.kind === "stewards") assert.ok(s, factText(f.cells));
	}
	// penalty points only count the twelve months before
	for (const [id, awards] of pointsAwards(real)) {
		const [lastAt] = awards.at(-1)!;
		const later = new Date(lastAt + 400 * 86_400_000).toISOString().slice(0, 10);
		assert.equal(pointsAt(real, id, later), 0);
	}
});

test("season, career and venue facts are about them, from their races", () => {
	const index = factIndex(real);
	const year = done.at(-1)!.year - 1;
	for (const e of seasonFacts(real, index, year)) assert.equal(real.raceById.get(e.raceId)!.year, year);
	const winner = done.at(-1)!;
	const id = real.resultsByRace.get(winner.id)!.find((r) => r.position === 1)!.driverId;
	const mine = subjectFacts(real, index, "driver", id);
	assert.ok(mine.length > 0);
	for (const e of mine) assert.equal(e.fact.key.split(":").slice(1, 3).join(":"), `driver:${id}`);
	for (const e of venueFacts(real, index, { grandPrixId: winner.grandPrixId })) assert.equal(real.raceById.get(e.raceId)!.grandPrixId, winner.grandPrixId);
	// facts.json only fits the dataset it was made from
	const packed = packFacts(real, index);
	assert.ok(unpackFacts(real, packed));
	assert.equal(unpackFacts(real, { ...packed, generatedAt: "another" }), null);
});

test("venue pages keep to the place, and old facts on them are big ones", () => {
	const index = factIndex(real);
	const latest = done.at(-1)!.year;
	const venue = new Set(["venue", "home", "weather", "neutral", "circuit", "title"]);
	for (const gp of new Set(done.slice(-50).map((r) => r.grandPrixId)))
		for (const e of venueFacts(real, index, { grandPrixId: gp })) {
			const subject = e.fact.key.split(":")[1];
			assert.ok((venue.has(e.fact.kind) && !e.fact.key.startsWith("title:constructor:")) || subject === "gp" || subject === "circuit", factText(e.fact.cells));
		}
	const team = real.resultsByRace.get(done.at(-1)!.id)![0].constructorId;
	for (const e of subjectFacts(real, index, "constructor", team)) {
		const old = latest - real.raceById.get(e.raceId)!.year > 20;
		if (old) assert.ok(["title", "record", "first"].includes(e.fact.kind) || e.fact.score >= 9, factText(e.fact.cells));
	}
});
