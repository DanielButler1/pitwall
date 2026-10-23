import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { driverTeammatesView, finishedAhead, sharedRaces, teammatePairView } from "./teammates.ts";
import { dataFile } from "../test-data.ts";

const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));

test("finished ahead: classified beats unclassified, neither classified doesn't count", () => {
	assert.equal(finishedAhead({ position: 3, started: true }, { position: 5, started: true }), "a");
	assert.equal(finishedAhead({ position: null, started: true }, { position: 12, started: true }), "b");
	assert.equal(finishedAhead({ position: null, started: true }, { position: null, started: true }), null);
	assert.equal(finishedAhead({ position: 1, started: true }, { position: null, started: false }), null);
});

test("Hamilton and Rosberg: Mercedes team-mates 2013–2016, every round", () => {
	const v = teammatePairView(db, "lewis-hamilton", "nico-rosberg")!;
	assert.equal(v.firstYear, 2013);
	assert.equal(v.lastYear, 2016);
	assert.deepEqual(v.teams.map((t) => t.id), ["mercedes"]);
	assert.equal(v.totals.races, 19 + 19 + 19 + 21);
	assert.deepEqual(v.seasons.map((s) => s.races), [19, 19, 19, 21]);
	// a duel per race at most, and points add up to the season tables' share
	assert.ok(v.totals.quali.a + v.totals.quali.b <= v.totals.races);
	assert.ok(v.totals.race.a + v.totals.race.b <= v.totals.races);
	assert.equal(v.totals.wins.a + v.totals.wins.b, 54);
});

test("Senna and Prost at McLaren, 1988–1989, from either side", () => {
	const v = teammatePairView(db, "ayrton-senna", "alain-prost")!;
	assert.deepEqual(v.teams.map((t) => t.id), ["mclaren"]);
	assert.deepEqual(v.seasons.map((s) => s.year), [1988, 1989]);
	assert.equal(v.totals.races, 32);
	assert.equal(v.totals.wins.a + v.totals.wins.b, 15 + 10);
	const flipped = teammatePairView(db, "alain-prost", "ayrton-senna")!;
	assert.deepEqual(flipped.totals.quali, { a: v.totals.quali.b, b: v.totals.quali.a });
	assert.deepEqual(flipped.totals.race, { a: v.totals.race.b, b: v.totals.race.a });
});

test("non-team-mates have no pairing", () => {
	assert.equal(sharedRaces(db, "ayrton-senna", "max-verstappen").length, 0);
	assert.equal(teammatePairView(db, "ayrton-senna", "max-verstappen"), null);
	assert.equal(teammatePairView(db, "ayrton-senna", "ayrton-senna"), null);
});

test("a driver's team-mates are ranked by races together and match the pairing", () => {
	const v = driverTeammatesView(db, "lewis-hamilton")!;
	const rosberg = v.rows.find((r) => r.driver.id === "nico-rosberg")!;
	assert.equal(rosberg.races, 78);
	assert.ok(v.rows.every((r, i) => i === 0 || v.rows[i - 1].races >= r.races));
	assert.equal(v.totals.races, v.rows.reduce((a, r) => a + r.races, 0));
	assert.equal(driverTeammatesView(db, "no-such-driver"), null);
});
