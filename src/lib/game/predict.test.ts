import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { raceEntriesFile } from "./race-entries-data.ts";
import { unpackRaceEntries } from "./race-entries.ts";
import { complete, dailyRace, eligible, isWin, MAX_POINTS, place, podium, predictPool, randomRace, resultBucket, score, shareText, swap, toggle } from "./predict.ts";

const data = unpackRaceEntries(raceEntriesFile(indexData(hydrate(JSON.parse(readFileSync("data/f1.json", "utf8"))))));
const race = (id: string) => data.byId.get(id)!;

test("pool: races since 1980 with a full top six", () => {
	const pool = predictPool(data.races);
	assert.ok(pool.length > 800, `${pool.length}`);
	assert.ok(pool.every((r) => podium(r).length === 6 && r.fastestLap));
	assert.ok(eligible(race("2005-9"))); // six finishers is enough
});

test("daily race is deterministic and doesn't repeat within a cycle", () => {
	const pool = predictPool(data.races);
	assert.equal(dailyRace(data.races, 9).id, dailyRace([...data.races].reverse(), 9).id);
	const seen = new Set<string>();
	for (let day = 0; day < pool.length; day++) seen.add(dailyRace(data.races, day).id);
	assert.equal(seen.size, pool.length);
	const practice = randomRace(data.races, rng(1), "1997-10");
	assert.ok(eligible(practice) && practice.id !== "1997-10");
});

test("scoring: exact 10, off by one 5, top six 2, fastest lap 5", () => {
	const r = race("1994-2");
	const top = podium(r).map((e) => e.driver.id);
	assert.deepEqual(top.slice(0, 3), ["michael-schumacher", "gerhard-berger", "rubens-barrichello"]);
	assert.equal(MAX_POINTS, 65);

	const perfect = score(r, top, "michael-schumacher");
	assert.equal(perfect.total, 65);
	assert.ok(perfect.slots.every((s) => s.verdict === "match"));

	// swap P1/P2 (off by one), P3 to P6 rotated (anywhere in the top six), and a non-finisher
	const off = score(r, [top[1], top[0], top[5], top[2], top[3], "ayrton-senna"], "gerhard-berger");
	assert.deepEqual(
		off.slots.map((s) => [s.points, s.verdict]),
		[
			[5, "close"],
			[5, "close"],
			[2, "miss"],
			[5, "close"],
			[5, "close"],
			[0, "miss"],
		],
	);
	assert.equal(off.bonus.points, 0);
	assert.equal(off.bonus.actual, "michael-schumacher");
	assert.equal(off.total, 22);

	// seventh place predicted sixth is off by one; empty slots score nothing
	const seventh = r.entries.find((e) => e.finish === 7)!.driver.id;
	const s = score(r, [null, null, null, null, null, seventh], null);
	assert.deepEqual([s.slots[5].points, s.slots[5].verdict, s.slots[0].points, s.total], [5, "close", 0, 5]);
});

test("picking: toggle, swap, place, complete", () => {
	let p = toggle([], "a");
	p = toggle(p, "b");
	p = toggle(p, "c");
	assert.deepEqual(p, ["a", "b", "c", null, null, null]);
	p = toggle(p, "b");
	assert.deepEqual(p, ["a", null, "c", null, null, null]);
	p = toggle(p, "d");
	assert.deepEqual(p, ["a", "d", "c", null, null, null]);
	assert.deepEqual(swap(p, 0, 2), ["c", "d", "a", null, null, null]);
	assert.deepEqual(place(p, "a", 5), [null, "d", "c", null, null, "a"]);
	assert.ok(!complete(p));
	for (const id of ["e", "f", "g", "h"]) p = toggle(p, id);
	assert.deepEqual(p, ["a", "d", "c", "e", "f", "g"]);
	assert.ok(complete(p));
});

test("share text and stats", () => {
	const r = race("1997-10");
	const top = podium(r).map((e) => e.driver.id);
	const result = score(r, [top[0], top[2], "nobody", top[3], top[5], top[4]], r.fastestLap!.id);
	assert.equal(
		shareText({ label: "#3", race: r, result, url: "https://pitwall.phaseo.app/play/predict" }),
		`Pitwall Prediction #3 · 1997 ${r.gp.short} · ${result.total}/65 🟩🟨⬛🟩🟨🟨\nhttps://pitwall.phaseo.app/play/predict`,
	);
	assert.ok(isWin(30) && !isWin(29));
	assert.equal(resultBucket(65), 10);
	assert.equal(resultBucket(34), 5);
});
