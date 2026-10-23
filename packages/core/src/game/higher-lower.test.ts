import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { higherLowerFile } from "./higher-lower-data.ts";
import {
	CONSTRUCTOR_ROUNDS,
	DAILY_ROUNDS,
	dailyRounds,
	emptyStats,
	endlessKind,
	gapOf,
	isCorrect,
	nextRound,
	recordResult,
	score,
	shareText,
	unpack,
	value,
	type Choice,
	type Round,
} from "./higher-lower.ts";
import { dataFile } from "../test-data.ts";

const file = higherLowerFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const entities = file.entities.map(unpack);
const byId = (id: string) => entities.find((e) => e.id === id)!;

test("file: recognisable drivers and constructors, small", () => {
	const ham = byId("lewis-hamilton");
	assert.equal(ham.kind, "driver");
	assert.ok(ham.wins >= 100 && ham.lapsLed! > 5000 && ham.context === "Mercedes");
	assert.equal(byId("ayrton-senna").lapsLed, null); // career before lap data
	assert.equal(byId("ferrari").kind, "team");
	assert.ok(entities.filter((e) => e.kind === "driver").every((e) => e.starts >= 30 || e.wins > 0));
	assert.ok(entities.filter((e) => e.kind === "team").every((e) => e.starts >= 50));
	// 1950s Indianapolis-only winners aren't recognisable F1 names
	assert.ok(!entities.some((e) => e.id === "bill-vukovich"));
	assert.equal(new Set(entities.map((e) => e.id)).size, entities.length);
	assert.ok(JSON.stringify(file).length < 250_000);
});

test("answers: ties count either way", () => {
	const r = (a: number, b: number): Round => ({ stat: "wins", left: { ...byId("ferrari"), wins: a }, right: { ...byId("mclaren"), wins: b } });
	assert.ok(isCorrect(r(1, 2), "higher") && !isCorrect(r(1, 2), "lower"));
	assert.ok(isCorrect(r(3, 2), "lower") && !isCorrect(r(3, 2), "higher"));
	assert.ok(isCorrect(r(2, 2), "higher") && isCorrect(r(2, 2), "lower"));
	assert.equal(gapOf(10, 12), "close");
	assert.equal(gapOf(10, 20), "medium");
	assert.equal(gapOf(0, 9), "far");
});

test("daily: ten deterministic rounds that chain, with a run of constructors", () => {
	for (let day = 0; day < 60; day++) {
		const rounds = dailyRounds(entities, day);
		assert.equal(rounds.length, DAILY_ROUNDS);
		assert.deepEqual(rounds.map((r) => r.right.id), dailyRounds([...entities].reverse(), day).map((r) => r.right.id));
		assert.equal(rounds.filter((r) => r.left.kind === "team").length, CONSTRUCTOR_ROUNDS);
		const ids = new Set<string>();
		rounds.forEach((r, i) => {
			const a = value(r.left, r.stat);
			const b = value(r.right, r.stat);
			assert.ok(a != null && b != null && (a > 0 || b > 0), `day ${day} round ${i}: 0 vs 0`);
			assert.equal(r.left.kind, r.right.kind);
			if (i && rounds[i - 1].right.kind === r.left.kind) assert.equal(r.left.id, rounds[i - 1].right.id);
			if (i) assert.notEqual(r.stat, rounds[i - 1].stat);
			assert.ok(!ids.has(r.right.id), `day ${day}: ${r.right.id} twice`);
			ids.add(r.left.id);
			ids.add(r.right.id);
		});
	}
	assert.notDeepEqual(dailyRounds(entities, 0).map((r) => r.right.id), dailyRounds(entities, 1).map((r) => r.right.id));
});

test("gaps are a mix of close and far", () => {
	const gaps = { close: 0, medium: 0, far: 0 };
	for (let day = 0; day < 100; day++) for (const r of dailyRounds(entities, day)) gaps[gapOf(value(r.left, r.stat)!, value(r.right, r.stat)!)]++;
	assert.ok(gaps.close > 150 && gaps.far > 150, JSON.stringify(gaps));
});

test("endless keeps going and mixes in constructors", () => {
	const random = rng(11);
	const rounds: Round[] = [];
	for (let i = 0; i < 300; i++) rounds.push(nextRound(entities, rounds, endlessKind(rounds, random), random));
	const teams = rounds.filter((r) => r.right.kind === "team").length;
	assert.ok(teams > 10 && teams < 150, `${teams}`);
});

test("score, share and stats", () => {
	const rounds = dailyRounds(entities, 5);
	const right = rounds.map((r): Choice => (isCorrect(r, "higher") ? "higher" : "lower"));
	assert.equal(score(rounds, right), 10);
	const wrongThird = right.map((c, i) => (i === 2 ? (c === "higher" ? "lower" : "higher") : c));
	const tie = value(rounds[2].left, rounds[2].stat) === value(rounds[2].right, rounds[2].stat);
	assert.equal(score(rounds, wrongThird), tie ? 10 : 9);
	assert.equal(
		shareText({ marks: [true, true, true, false], label: "#3", tail: "7/10", url: "https://x.test/play/higher-lower" }),
		"Pitwall Higher or lower #3 ✅✅✅❌ 7/10\nhttps://x.test/play/higher-lower",
	);
	let s = recordResult(emptyStats(), 1, 8);
	s = recordResult(s, 2, 3);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak], [2, 1, 0, 1]);
	assert.equal(s.distribution.length, 11);
	assert.equal(s.distribution[8] + s.distribution[3], 2);
});
