import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { guessFile } from "./guess-data.ts";
import {
	compare,
	currentStreak,
	dailyTarget,
	dayIndex,
	eligible,
	emptyStats,
	MAX_GUESSES,
	msToNextPuzzle,
	randomTarget,
	recordResult,
	rng,
	searchDrivers,
	shareText,
	unpack,
	type GuessDriver,
} from "./guess.ts";
import { dataFile } from "../test-data.ts";

const file = guessFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const drivers = file.drivers.map(unpack);
const byId = (id: string) => drivers.find((d) => d.id === id)!;

test("guess file: career teams, titles", () => {
	const senna = byId("ayrton-senna");
	assert.deepEqual(senna.teams, ["toleman", "lotus", "mclaren", "williams"]);
	assert.equal(senna.titles, 3);
	assert.equal(senna.wins, 41);
	assert.equal(senna.flag, "BR");
	assert.equal(file.teams.mclaren, "McLaren");
	assert.ok(drivers.every((d) => d.starts > 0));
});

test("pools are guessable and sized sensibly", () => {
	const modern = drivers.filter((d) => eligible(d, "modern"));
	const all = drivers.filter((d) => eligible(d, "all"));
	assert.ok(modern.length > 80, `${modern.length}`);
	assert.ok(all.length > modern.length);
	assert.ok(modern.every((d) => d.last >= 1980));
	assert.ok(modern.some((d) => d.id === "lewis-hamilton"));
	assert.ok(!modern.some((d) => d.id === "juan-manuel-fangio"));
	assert.ok(all.some((d) => d.id === "juan-manuel-fangio"));
});

test("days follow the UTC date", () => {
	assert.equal(dayIndex(Date.UTC(2026, 9, 21, 0, 0)), 0);
	assert.equal(dayIndex(Date.UTC(2026, 9, 21, 23, 59)), 0);
	assert.equal(dayIndex(Date.UTC(2026, 9, 22, 0, 0)), 1);
	assert.equal(dayIndex(Date.UTC(2026, 9, 20, 12)), -1);
	assert.equal(msToNextPuzzle(Date.UTC(2026, 9, 21, 23, 0)), 3_600_000);
	assert.equal(msToNextPuzzle(Date.UTC(2026, 9, 21)), 86_400_000);
});

test("daily target is deterministic, eligible and doesn't repeat within a cycle", () => {
	for (const mode of ["modern", "all"] as const) {
		const pool = drivers.filter((d) => eligible(d, mode));
		// input order must not matter
		assert.equal(dailyTarget(drivers, mode, 42).id, dailyTarget([...drivers].reverse(), mode, 42).id);
		const seen = new Set<string>();
		for (let day = 0; day < pool.length; day++) {
			const t = dailyTarget(drivers, mode, day);
			assert.ok(eligible(t, mode));
			seen.add(t.id);
		}
		assert.equal(seen.size, pool.length);
	}
	assert.notEqual(dailyTarget(drivers, "modern", 0).id + dailyTarget(drivers, "modern", 1).id, dailyTarget(drivers, "all", 0).id + dailyTarget(drivers, "all", 1).id);
	const practice = randomTarget(drivers, "modern", rng(7), "lewis-hamilton");
	assert.ok(eligible(practice, "modern") && practice.id !== "lewis-hamilton");
});

test("compare: matches, arrows, close and partial", () => {
	const senna = byId("ayrton-senna");
	const prost = byId("alain-prost");
	const hamilton = byId("lewis-hamilton");
	const self = compare(senna, senna);
	assert.ok(self.correct);
	assert.ok(self.tiles.every((t) => t.verdict === "match" && t.direction === null));

	// guessing Prost when the answer is Senna
	const prostTiles = compare(prost, senna);
	assert.ok(!prostTiles.correct);
	const [nation, first, last, teams, , wins, titles] = prostTiles.tiles;
	assert.equal(nation.verdict, "miss"); // France vs Brazil
	assert.deepEqual(first, { key: "first", verdict: "close", direction: "higher" }); // 1980 -> 1984
	assert.deepEqual(last, { key: "last", verdict: "close", direction: "higher" }); // 1993 -> 1994
	assert.equal(teams.verdict, "close");
	assert.deepEqual("shared" in teams && teams.shared, ["mclaren", "williams"]);
	assert.equal(wins.direction, "lower");
	assert.equal(titles.direction, "lower");
	assert.equal(compare(hamilton, senna).tiles[0].verdict, "miss");
	assert.equal(compare(byId("nigel-mansell"), hamilton).tiles[0].verdict, "match");
});

test("compare tiles in detail", () => {
	const make = (over: Partial<GuessDriver>): GuessDriver => ({
		id: "x",
		name: "X",
		flag: null,
		nationId: "france",
		nation: "France",
		first: 1980,
		last: 1990,
		starts: 100,
		wins: 10,
		podiums: 20,
		poles: 5,
		titles: 1,
		teams: ["a", "b"],
		...over,
	});
	const target = make({ id: "t" });
	const [nation, first, last, teams, starts, wins, titles] = compare(make({ nationId: "germany", first: 1975, last: 1996, teams: ["b", "c"], starts: 130, wins: 10, titles: 3 }), target).tiles;
	assert.deepEqual(nation, { key: "nation", verdict: "close", direction: null });
	assert.deepEqual(first, { key: "first", verdict: "close", direction: "higher" });
	assert.deepEqual(last, { key: "last", verdict: "miss", direction: "lower" });
	assert.equal(teams.verdict, "close");
	assert.deepEqual("shared" in teams && teams.shared, ["b"]);
	assert.deepEqual(starts, { key: "starts", verdict: "miss", direction: "lower" });
	assert.equal(wins.verdict, "match");
	assert.deepEqual(titles, { key: "titles", verdict: "miss", direction: "lower" });
	const far = compare(make({ nationId: "brazil", teams: ["z"], titles: 0 }), target).tiles;
	assert.equal(far[0].verdict, "miss");
	assert.equal(far[3].verdict, "miss");
	// titles have no "close": one off is still a miss, with an arrow
	assert.deepEqual(far[6], { key: "titles", verdict: "miss", direction: "higher" });
	assert.equal(compare(make({ teams: ["b", "a"] }), target).tiles[3].verdict, "match");
	assert.equal(compare(make({ teams: ["a"] }), target).tiles[3].verdict, "close");
});

test("share text is an emoji grid with the score", () => {
	const senna = byId("ayrton-senna");
	const rows = [compare(byId("alain-prost"), senna), compare(senna, senna)];
	const text = shareText({ rows, won: true, label: "#5", url: "https://example.test/play/guess" });
	const lines = text.split("\n");
	assert.equal(lines[0], `Pitwall: Guess the driver #5 2/${MAX_GUESSES}`);
	assert.equal(lines[2], "🟩🟩🟩🟩🟩🟩🟩");
	assert.equal([...lines[1]].length, 7);
	assert.equal(lines[3], "https://example.test/play/guess");
	assert.match(shareText({ rows, won: false, label: "#5" }), /X\/8\n/);
});

test("stats: streaks, distribution, once per day", () => {
	let s = emptyStats();
	s = recordResult(s, 10, true, 3);
	s = recordResult(s, 11, true, 1);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak], [2, 2, 2, 2]);
	assert.equal(recordResult(s, 11, false, 8), s);
	assert.equal(currentStreak(s, 12), 2);
	assert.equal(currentStreak(s, 13), 0);
	s = recordResult(s, 13, true, 3); // missed day 12
	assert.equal(s.streak, 1);
	s = recordResult(s, 14, false, 8);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak], [4, 3, 0, 2]);
	assert.deepEqual(s.distribution, [1, 0, 2, 0, 0, 0, 0, 0]);
});

test("search: accents, prefixes, best known first, excludes", () => {
	assert.equal(searchDrivers(drivers, "raikko")[0].id, "kimi-raikkonen");
	assert.equal(searchDrivers(drivers, "räikkönen")[0].id, "kimi-raikkonen");
	assert.equal(searchDrivers(drivers, "schumacher")[0].id, "michael-schumacher");
	assert.equal(searchDrivers(drivers, "ham")[0].id, "lewis-hamilton");
	assert.ok(!searchDrivers(drivers, "senna", new Set(["ayrton-senna"])).some((d) => d.id === "ayrton-senna"));
	assert.deepEqual(searchDrivers(drivers, "  "), []);
	assert.ok(searchDrivers(drivers, "a", undefined, 5).length === 5);
});
