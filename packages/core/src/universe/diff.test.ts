import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { applyUniverse } from "./apply.ts";
import { recordChange, recordDiffIds, universeDiff } from "./diff.ts";
import { dataFile } from "../test-data.ts";

const base = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
const race = base.races.find((r) => r.year === 2021 && r.round === 22)!;
const order = base.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
[order[0], order[1]] = [order[1], order[0]]; // Hamilton wins Abu Dhabi 2021
const db = applyUniverse(base, { id: "diff", updatedAt: 1, changes: [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }] });

test("reality compared with itself has no changes", () => {
	const d = universeDiff(base, base);
	assert.equal(d.driverTitles.length, 0);
	assert.equal(d.winners.total, 0);
	assert.equal(d.drivers.wins.changed, 0);
	assert.equal(recordChange(base, base, "drivers/titles/by-number"), null);
});

test("Abu Dhabi 2021 reversed: title, winner and career movers", () => {
	const d = universeDiff(db, base);
	assert.equal(d.seasonsAffected, 1);
	assert.deepEqual(
		d.driverTitles.map((t) => [t.year, t.real?.id, t.now?.id]),
		[[2021, "max-verstappen", "lewis-hamilton"]],
	);
	assert.equal(d.winners.total, 1);
	assert.equal(d.winners.races[0].race.year, 2021);
	assert.equal(d.winners.races[0].real?.id, "max-verstappen");
	assert.equal(d.winners.races[0].now?.id, "lewis-hamilton");
	assert.equal(d.newRaces, 0);
	assert.equal(d.removedRaces, 0);

	assert.equal(d.drivers.titles.gains[0].ref.id, "lewis-hamilton");
	assert.equal(d.drivers.titles.losses[0].ref.id, "max-verstappen");
	assert.equal(d.drivers.wins.gains[0].ref.id, "lewis-hamilton");
	assert.equal(d.drivers.wins.losses[0].ref.id, "max-verstappen");
	assert.equal(d.drivers.wins.changed, 2);
	assert.ok(d.drivers.points.gains[0].delta > 0);
	assert.equal(universeDiff(db, base), d, "memoised per pair");
});

test("the titles record gets a sole holder", () => {
	const c = recordChange(db, base, "drivers/titles/by-number")!;
	assert.equal(c.kind, "holder");
	assert.ok(recordDiffIds().includes("drivers/titles/by-number"));
	assert.ok(recordDiffIds(true).length > recordDiffIds().length);
});
