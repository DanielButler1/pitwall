import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { raceEntriesFile } from "./race-entries-data.ts";
import { percentBucket, raceLabel, shortNames, unpackRaceEntries } from "./race-entries.ts";
import { dataFile } from "../test-data.ts";

const file = raceEntriesFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const data = unpackRaceEntries(file);

test("race entries: small, every race since 1980", () => {
	const size = JSON.stringify(file).length;
	assert.ok(size < 260_000, `${size}`);
	assert.ok(data.races.length > 800);
	assert.ok(data.races.every((r) => r.year >= 1980 && r.entries.length > 0));
	assert.equal(data.races[0].id, "1980-1");
	// in order, unique ids
	assert.equal(data.byId.size, data.races.length);
	assert.ok(data.races.every((r, i) => i === 0 || r.order > data.races[i - 1].order));
});

test("1994 Pacific GP: grid, finish, fastest lap, standings", () => {
	const r = data.byId.get("1994-2")!;
	assert.equal(raceLabel(r), "1994 Pacific GP");
	assert.equal(r.gp.name, "Pacific Grand Prix");
	assert.equal(r.gp.flag, "JP");
	assert.equal(r.rounds, 16);
	assert.equal(r.entries.length, 26);
	assert.equal(r.entries[0].driver.id, "ayrton-senna");
	assert.equal(r.entries[0].team.name, "Williams");
	assert.equal(r.entries[0].grid, 1);
	const winner = r.entries.find((e) => e.finish === 1)!;
	assert.equal(winner.driver.id, "michael-schumacher");
	assert.equal(winner.grid, 2);
	assert.equal(r.fastestLap?.id, "michael-schumacher");
	// after Brazil 1994: Schumacher 10, Hill 6, Alesi 4
	assert.deepEqual(
		r.leaders.map((l) => [l.driver.id, l.points]),
		[
			["michael-schumacher", 10],
			["damon-hill", 6],
			["jean-alesi", 4],
		],
	);
	assert.deepEqual(data.byId.get("1994-1")!.leaders, []);
});

test("grid order: positions ascend, pit-lane starters last", () => {
	for (const r of data.races) {
		const grids = r.entries.map((e) => e.grid);
		const firstPit = grids.indexOf(null);
		if (firstPit >= 0) assert.ok(grids.slice(firstPit).every((g) => g == null), r.id);
		const nums = grids.filter((g): g is number => g != null);
		assert.ok(
			nums.every((g, i) => i === 0 || g >= nums[i - 1]),
			r.id,
		);
	}
});

test("themes: champions and team winners", () => {
	const champs = data.themes.find((t) => t.id === "champions")!;
	assert.equal(champs.items[0].driver.id, "nino-farina");
	const schumi = champs.items.find((i) => i.driver.id === "michael-schumacher")!;
	assert.equal(schumi.clue, "1994–2004 · 7 titles");
	assert.ok(champs.items.length >= 34);
	const ferrari = data.themes.find((t) => t.id === "ferrari-winners")!;
	assert.equal(ferrari.title, "Every Ferrari race winner");
	assert.equal(ferrari.items[0].driver.id, "jose-froilan-gonzalez");
	assert.ok(data.themes.every((t) => new Set(t.items.map((i) => i.driver.id)).size === t.items.length));
});

test("percent buckets", () => {
	assert.equal(percentBucket(0, 26), 0);
	assert.equal(percentBucket(25, 26), 9);
	assert.equal(percentBucket(26, 26), 10);
	assert.equal(percentBucket(13, 26), 5);
	assert.equal(percentBucket(7, 10), 7);
	assert.equal(percentBucket(65, 65), 10);
	assert.equal(percentBucket(64, 65), 9);
});

test("short names tell brothers apart", () => {
	const names = shortNames(data.byId.get("2004-5")!.entries);
	assert.equal(names.get("michael-schumacher"), "M. Schumacher");
	assert.equal(names.get("ralf-schumacher"), "R. Schumacher");
	assert.equal(names.get("fernando-alonso"), "Alonso");
});
