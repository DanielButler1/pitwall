import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { bearing, clueShareText, compareCountry, compassPoint, continentOf, distanceKm } from "./clue.ts";
import { constructorFile } from "./constructor-guess-data.ts";
import {
	compare,
	compareEngines,
	dailyTarget,
	eligible,
	emptyStats,
	MAX_GUESSES,
	randomTarget,
	recordResult,
	shareText,
	unpack,
	type GuessConstructor,
} from "./constructor-guess.ts";
import { dataFile } from "../test-data.ts";

const file = constructorFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const teams = file.constructors.map(unpack);
const byId = (id: string) => teams.find((c) => c.id === id)!;

test("constructor file: careers, engines, drivers, small", () => {
	const ferrari = byId("ferrari");
	assert.equal(ferrari.first, 1950);
	assert.equal(ferrari.flag, "IT");
	assert.deepEqual(ferrari.engines, ["ferrari"]); // the 1950 one-off Jaguar engine is dropped
	assert.equal(ferrari.drivers[0], "michael-schumacher");
	assert.ok(ferrari.titles >= 16 && ferrari.wins >= 240);
	const mclaren = byId("mclaren");
	assert.equal(mclaren.engines[0], "mercedes");
	assert.ok(mclaren.engines.includes("honda") && mclaren.engines.includes("tag"));
	assert.equal(file.engines.mercedes, "Mercedes");
	assert.equal(file.drivers["ayrton-senna"], "Ayrton Senna");
	assert.ok(teams.every((c) => c.starts > 0 && c.engines.length > 0 && c.drivers.length > 0));
	assert.ok(teams.length > 150);
	assert.ok(JSON.stringify(file).length < 80_000);
});

test("pools: recognisable teams, no Indy 500-only cars", () => {
	const modern = teams.filter((c) => eligible(c, "modern"));
	const all = teams.filter((c) => eligible(c, "all"));
	assert.ok(modern.length > 40 && modern.length < 90, `${modern.length}`);
	assert.ok(all.length > modern.length);
	assert.ok(modern.every((c) => c.last >= 1980));
	assert.ok(modern.some((c) => c.id === "minardi"));
	assert.ok(!modern.some((c) => c.id === "vanwall") && all.some((c) => c.id === "vanwall"));
	assert.ok(byId("kurtis-kraft").indyOnly && !all.some((c) => c.id === "kurtis-kraft"));
	assert.ok(!byId("maserati").indyOnly && all.some((c) => c.id === "maserati"));
});

test("daily target is deterministic, eligible and doesn't repeat within a cycle", () => {
	for (const mode of ["modern", "all"] as const) {
		const pool = teams.filter((c) => eligible(c, mode));
		assert.equal(dailyTarget(teams, mode, 42).id, dailyTarget([...teams].reverse(), mode, 42).id);
		const seen = new Set<string>();
		for (let day = 0; day < pool.length; day++) {
			const t = dailyTarget(teams, mode, day);
			assert.ok(eligible(t, mode));
			seen.add(t.id);
		}
		assert.equal(seen.size, pool.length);
	}
	const practice = randomTarget(teams, "modern", rng(3), "ferrari");
	assert.ok(eligible(practice, "modern") && practice.id !== "ferrari");
});

test("engines: same main engine matches, any in common is close", () => {
	assert.deepEqual(compareEngines(["mercedes", "honda"], ["mercedes"]), { verdict: "match", shared: ["mercedes"] });
	assert.deepEqual(compareEngines(["honda", "mercedes"], ["mercedes", "renault"]), { verdict: "close", shared: ["mercedes"] });
	assert.deepEqual(compareEngines(["ford"], ["ferrari"]), { verdict: "miss", shared: [] });
	assert.equal(compare(byId("red-bull"), byId("toro-rosso")).tiles[3].verdict, "close"); // Renault vs Ferrari mains, Honda shared
});

test("compare: the real teams", () => {
	const self = compare(byId("williams"), byId("williams"));
	assert.ok(self.correct && self.tiles.every((t) => t.verdict === "match" && t.direction === null));
	const [nation, first, last, , starts, wins, titles] = compare(byId("mclaren"), byId("williams")).tiles;
	assert.equal(nation.verdict, "match"); // both British
	assert.deepEqual(first, { key: "first", verdict: "miss", direction: "higher" }); // 1966 -> 1978
	assert.equal(last.verdict, "match");
	assert.equal(starts.direction, "lower");
	assert.equal(wins.direction, "lower");
	assert.equal(titles.direction, "lower");
	assert.equal(compare(byId("ferrari"), byId("renault")).tiles[0].verdict, "close"); // Italy vs France
	assert.equal(compare(byId("ferrari"), byId("haas")).tiles[0].verdict, "miss");
});

test("compare tiles in detail", () => {
	const make = (over: Partial<GuessConstructor>): GuessConstructor => ({
		id: "x",
		name: "X",
		flag: null,
		nationId: "france",
		nation: "France",
		first: 1980,
		last: 1990,
		entries: 200,
		starts: 200,
		wins: 10,
		podiums: 30,
		poles: 5,
		titles: 1,
		engines: ["a", "b"],
		drivers: [],
		indyOnly: false,
		...over,
	});
	const target = make({ id: "t" });
	const [nation, first, last, engines, starts, wins, titles] = compare(make({ nationId: "germany", first: 1975, last: 1996, engines: ["b"], starts: 250, wins: 16, titles: 0 }), target).tiles;
	assert.equal(nation.verdict, "close");
	assert.deepEqual(first, { key: "first", verdict: "close", direction: "higher" });
	assert.deepEqual(last, { key: "last", verdict: "miss", direction: "lower" });
	assert.deepEqual(engines, { key: "engines", verdict: "close", direction: null, shared: ["b"] });
	assert.deepEqual(starts, { key: "starts", verdict: "close", direction: "lower" });
	assert.deepEqual(wins, { key: "wins", verdict: "miss", direction: "lower" });
	assert.deepEqual(titles, { key: "titles", verdict: "miss", direction: "higher" });
});

test("continents, distances and compass", () => {
	assert.equal(continentOf("hong-kong"), "asia");
	assert.equal(continentOf("atlantis"), null);
	assert.equal(compareCountry("italy", "italy"), "match");
	assert.equal(compareCountry("italy", "monaco"), "close");
	assert.equal(compareCountry("atlantis", "lemuria"), "miss");
	const london = { lat: 51.5074, lng: -0.1278 };
	const paris = { lat: 48.8566, lng: 2.3522 };
	assert.ok(Math.abs(distanceKm(london, paris) - 344) < 3);
	assert.equal(distanceKm(paris, paris), 0);
	assert.equal(compassPoint(bearing(london, paris)), "south-east");
	assert.equal(compassPoint(bearing(paris, london)), "north-west");
	assert.equal(compassPoint(359), "north");
	assert.equal(compassPoint(90), "east");
});

test("share text and stats", () => {
	const rows = [compare(byId("mclaren"), byId("williams")), compare(byId("williams"), byId("williams"))];
	const lines = shareText({ rows, won: true, label: "#3", url: "https://example.test/play/constructor" }).split("\n");
	assert.equal(lines[0], `Pitwall: Guess the constructor #3 2/${MAX_GUESSES}`);
	assert.equal([...lines[1]].length, 7);
	assert.equal(lines[2], "🟩🟩🟩🟩🟩🟩🟩");
	assert.equal(lines[3], "https://example.test/play/constructor");
	assert.match(clueShareText({ title: "T", rows, won: false, label: "practice" }), /^Pitwall: T practice X\/8\n/);
	let s = emptyStats();
	s = recordResult(s, 4, true, 3);
	s = recordResult(s, 5, false, 8);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak], [2, 1, 0, 1]);
	assert.deepEqual(s.distribution, [0, 0, 1, 0, 0, 0, 0, 0]);
});
