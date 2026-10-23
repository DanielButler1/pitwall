import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { raceGuessFile } from "./race-guess-data.ts";
import {
	compareRaces,
	continentOf,
	dailyRace,
	emptyStats,
	MAX_GUESSES,
	raceClues,
	raceEligible,
	raceShareText,
	randomRace,
	recordResult,
	searchRaces,
	unpackRaces,
	type RgRace,
} from "./race-guess.ts";
import { dataFile } from "../test-data.ts";

const file = raceGuessFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const { races, byId } = unpackRaces(file);
const find = (label: string) => {
	const r = races.find((x) => x.label === label);
	assert.ok(r, label);
	return r;
};

test("race file: every race with results, labels, podium, clues, small", () => {
	assert.ok(races.length > 1100);
	assert.ok(JSON.stringify(file).length < 250_000);
	const suzuka = find("2005 Japanese Grand Prix");
	assert.equal(suzuka.circuit.name, "Suzuka");
	assert.equal(suzuka.circuit.flag, "JP");
	assert.equal(suzuka.round, 18);
	assert.deepEqual(
		suzuka.top.slice(0, 3).map((e) => e.driver.id),
		["kimi-raikkonen", "giancarlo-fisichella", "fernando-alonso"],
	);
	assert.equal(suzuka.top[0].team.name, "McLaren");
	assert.equal(suzuka.pole?.driver.id, "ralf-schumacher");
	assert.equal(suzuka.fastest?.driver.id, "kimi-raikkonen");
	assert.equal(suzuka.laps, 53);
	assert.ok(suzuka.notes.includes("The winner started from P17"));
	assert.ok(races.every((r) => r.top.length > 0 && r.grandPrix.country && r.circuit.country));
	// European GP takes its circuit's country
	assert.equal(find("1997 European Grand Prix").grandPrix.country, "spain");
	assert.equal(byId.get(suzuka.id), suzuka);
});

test("search: year tokens, circuit names, accents, recency", () => {
	const first = (q: string) => searchRaces(races, q)[0]?.label;
	assert.equal(first("2005 jap"), "2005 Japanese Grand Prix");
	assert.equal(first("suzuka 05"), "2005 Japanese Grand Prix");
	assert.equal(first("monaco 1988"), "1988 Monaco Grand Prix");
	assert.equal(first("'88 monaco"), "1988 Monaco Grand Prix");
	assert.equal(first("Monaco 88"), "1988 Monaco Grand Prix");
	assert.equal(first("nurburgring 1957"), "1957 German Grand Prix");
	assert.equal(first("nürburgring 1957"), "1957 German Grand Prix");
	assert.equal(searchRaces(races, "interlagos 2008")[0].circuit.id, "interlagos");
	assert.equal(searchRaces(races, "usa 2005")[0].label, "2005 United States Grand Prix");
	// "199" is the 1990s
	const nineties = searchRaces(races, "199 hungar", undefined, 20);
	assert.ok(nineties.length === 10 && nineties.every((r) => r.year >= 1990 && r.year <= 1999));
	// recent first among equals
	const monaco = searchRaces(races, "monaco", undefined, 3);
	assert.ok(monaco[0].year > monaco[1].year && monaco[1].year > monaco[2].year);
	assert.deepEqual(searchRaces(races, "  "), []);
	assert.deepEqual(searchRaces(races, "zzzz"), []);
	const id = find("1988 Monaco Grand Prix").id;
	assert.ok(!searchRaces(races, "monaco 1988", new Set([id])).some((r) => r.id === id));
});

test("compare: year, Grand Prix, circuit, round, winner", () => {
	const target = find("2005 Japanese Grand Prix");
	const self = compareRaces(target, target);
	assert.ok(self.correct && self.tiles.every((t) => t.verdict === "match"));

	const [year, gp, circuit, round, winner] = compareRaces(find("2007 Japanese Grand Prix"), target).tiles; // Fuji, Hamilton/McLaren, round 15
	assert.deepEqual(year, { key: "year", verdict: "close", direction: "lower", far: false });
	assert.equal(gp.verdict, "match");
	assert.equal(circuit.verdict, "close"); // Fuji: same country
	assert.equal(round.verdict, "miss");
	assert.equal(round.direction, "higher");
	assert.equal(winner.verdict, "close"); // McLaren won both

	const far = compareRaces(find("1988 Monaco Grand Prix"), target).tiles;
	assert.deepEqual(far[0], { key: "year", verdict: "miss", direction: "higher", far: true });
	assert.equal(far[1].verdict, "miss"); // Europe vs Asia
	assert.equal(far[2].verdict, "miss");
	const mid = compareRaces(find("1998 Japanese Grand Prix"), target).tiles[0];
	assert.deepEqual(mid, { key: "year", verdict: "miss", direction: "higher", far: false }); // 7 years: single arrow, grey
	const asia = compareRaces(find("2005 Chinese Grand Prix"), target).tiles;
	assert.equal(asia[1].verdict, "close");
	assert.equal(asia[3].verdict, "close"); // round 19 vs 18
	assert.equal(asia[3].direction, "lower");
	assert.equal(continentOf("monaco"), "europe");
	// same winner
	assert.equal(compareRaces(find("2005 Belgian Grand Prix"), target).tiles[4].verdict, "match");
});

test("pools: recognisable podiums, deterministic daily pick, no repeats per cycle", () => {
	const modern = races.filter((r) => raceEligible(r, "modern"));
	const all = races.filter((r) => raceEligible(r, "all"));
	assert.ok(modern.length > 300 && all.length > modern.length);
	assert.ok(modern.every((r) => r.year >= 1990));
	assert.ok(all.some((r) => r.year < 1970));
	for (const pool of ["modern", "all"] as const) {
		const list = pool === "modern" ? modern : all;
		assert.equal(dailyRace(races, pool, 3).id, dailyRace([...races].reverse(), pool, 3).id);
		const seen = new Set<number>();
		for (let day = 0; day < list.length; day++) seen.add(dailyRace(races, pool, day).id);
		assert.equal(seen.size, list.length);
	}
	const r = randomRace(races, "modern", rng(3), modern[0].id);
	assert.ok(raceEligible(r, "modern") && r.id !== modern[0].id);
});

test("clues: in order, skipping missing data", () => {
	const kinds = (r: RgRace) => raceClues(r).map((c) => c.kind);
	assert.deepEqual(kinds(find("2005 Japanese Grand Prix")), ["pole", "fastest", "laps", "top6", "notes", "country"]);
	const bare: RgRace = { ...find("2005 Japanese Grand Prix"), pole: null, fastest: null, notes: [], top: find("2005 Japanese Grand Prix").top.slice(0, 3) };
	assert.deepEqual(kinds(bare), ["laps", "country"]);
	assert.ok(races.every((r) => raceClues(r).length >= 2 && raceClues(r).length <= MAX_GUESSES));
});

test("share text and stats", () => {
	const target = find("2005 Japanese Grand Prix");
	const rows = [compareRaces(find("1988 Monaco Grand Prix"), target), compareRaces(target, target)];
	const lines = raceShareText({ title: "Guess the race", rows, won: true, label: "#3", url: "https://x.test/play/race" }).split("\n");
	assert.equal(lines[0], "Pitwall: Guess the race #3 2/6");
	assert.equal(lines[1], "⬛⬛⬛");
	assert.equal(lines[2], "🟩🟩🟩");
	assert.equal(lines[3], "https://x.test/play/race");
	assert.match(raceShareText({ title: "T", rows, won: false, label: "#1" }), /X\/6/);
	let s = recordResult(emptyStats(), 1, true, 2);
	s = recordResult(s, 2, false, 6);
	assert.deepEqual(s.distribution, [0, 1, 0, 0, 0, 0]);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak], [2, 1, 0, 1]);
});
