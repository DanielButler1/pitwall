import { test } from "node:test";
import assert from "node:assert/strict";
import { compareNumber, currentStreak, dailyPick, emptyStats, playStreak, randomPick, recordResult, scoreBucket, searchByName, shuffle, hash } from "./daily.ts";

const pool = Array.from({ length: 30 }, (_, i) => ({ id: `x${String(i).padStart(2, "0")}` }));

test("dailyPick: deterministic, no repeats within a cycle, independent per game", () => {
	assert.equal(dailyPick(pool, "a", 5), dailyPick(pool, "a", 5));
	assert.equal(new Set(Array.from({ length: 30 }, (_, d) => dailyPick(pool, "a", d).id)).size, 30);
	const a = Array.from({ length: 30 }, (_, d) => dailyPick(pool, "a", d).id).join();
	const b = Array.from({ length: 30 }, (_, d) => dailyPick(pool, "b", d).id).join();
	assert.notEqual(a, b);
	// the seed is pitwall-<game>:<cycle>, which keeps guess's picks where they were
	assert.equal(dailyPick(pool, "guess:modern", 31), shuffle(pool, hash("pitwall-guess:modern:1"))[1]);
	assert.throws(() => dailyPick([], "a", 0));
});

test("randomPick avoids the excluded item", () => {
	for (let i = 0; i < 50; i++) assert.notEqual(randomPick(pool.slice(0, 2), Math.random, "x00").id, "x00");
	assert.equal(randomPick(pool.slice(0, 1), Math.random, "x00").id, "x00");
});

test("stats: buckets, losses, streaks", () => {
	let s = emptyStats(5);
	s = recordResult(s, 1, true, 4);
	s = recordResult(s, 2, false, 0); // a points game can bucket losses too
	s = recordResult(s, 3, false);
	assert.deepEqual(s.distribution, [1, 0, 0, 0, 1]);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak, s.lastDay], [3, 1, 0, 1, 3]);
	assert.equal(recordResult(s, 3, true, 1), s);
	s = recordResult(s, 4, true, 7); // past the end grows the distribution
	assert.equal(s.distribution[7], 1);
	assert.equal(currentStreak(s, 5), 1);
	assert.equal(currentStreak(s, 6), 0);
});

test("scoreBucket and compareNumber", () => {
	assert.deepEqual([0, 9, 10, 99, 100, 150, -5].map((p) => scoreBucket(p, 100, 10)), [0, 0, 1, 9, 9, 9, 0]);
	assert.deepEqual(compareNumber(3, 3), { verdict: "match", direction: null });
	assert.deepEqual(compareNumber(3, 5, 2), { verdict: "close", direction: "higher" });
	assert.deepEqual(compareNumber(9, 5, 2), { verdict: "miss", direction: "lower" });
});

test("searchByName: accents, prefixes, weight", () => {
	const items = [
		{ id: "a", name: "Kimi Räikkönen", w: 1 },
		{ id: "b", name: "Kimi Antonelli", w: 5 },
	];
	const ids = (q: string) => searchByName(items, q, (i) => i.name, (i) => i.w).map((i) => i.id);
	assert.deepEqual(ids("kimi"), ["b", "a"]);
	assert.deepEqual(ids("raik"), ["a"]);
	assert.deepEqual(ids(""), []);
});

test("playStreak counts days in a row, allowing today to be still to come", () => {
	const log: [number, string[]][] = [[10, ["guess"]], [9, ["grid", "guess"]], [8, ["chain"]], [6, ["guess"]]];
	assert.equal(playStreak(log, 10), 3);
	assert.equal(playStreak(log, 11), 3);
	assert.equal(playStreak(log, 12), 0);
	assert.equal(playStreak([], 5), 0);
});
