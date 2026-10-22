import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { seasonFile } from "./season-guess-data.ts";
import {
	compareSeasons,
	dailySeason,
	emptyStats,
	MAX_GUESSES,
	ordinal,
	poolSeasons,
	randomSeason,
	recordResult,
	searchSeasons,
	seasonClues,
	seasonShareText,
	unpackSeasons,
} from "./season-guess.ts";

const db = indexData(hydrate(JSON.parse(readFileSync("data/f1.json", "utf8"))));
const file = seasonFile(db);
const { seasons, byId } = unpackSeasons(file);
const y = (year: number) => byId.get(String(year))!;

test("season file: every completed season, small", () => {
	assert.equal(seasons[0].year, 1950);
	const last = seasons.at(-1)!.year;
	assert.ok(last >= 2025);
	// no gaps between 1950 and the last completed season
	assert.equal(seasons.length, last - 1949);
	assert.ok(JSON.stringify(file).length < 60_000);
	for (const s of seasons) {
		assert.ok(s.rounds > 0 && s.winners > 0 && s.winners <= s.rounds, `${s.year}`);
		assert.ok(s.leadFrom >= 1 && s.leadFrom <= s.rounds && s.ledRounds >= 1 && s.ledRounds <= s.rounds, `${s.year} lead`);
		assert.ok(s.champion.points > s.runnerUp.points || s.year === 1950 || s.champion.points >= s.runnerUp.points, `${s.year} margin`);
		assert.equal(s.top[0].driver.id, s.champion.driver.id, `${s.year} top`);
		assert.equal(s.constructors == null, s.year < 1958, `${s.year} constructors`);
		assert.notEqual(s.debut?.driver.id, s.champion.driver.id);
		assert.notEqual(s.farewell?.driver.id, s.champion.driver.id);
	}
});

test("season facts match history", () => {
	const s88 = y(1988);
	assert.equal(s88.rounds, 16);
	assert.equal(s88.champion.driver.id, "ayrton-senna");
	assert.equal(s88.champion.team.id, "mclaren");
	assert.equal(s88.champion.wins, 8);
	assert.equal(s88.champion.title, 1);
	assert.equal(s88.runnerUp.driver.id, "alain-prost");
	assert.equal(s88.constructors?.id, "mclaren");
	assert.equal(s88.winners, 3);
	assert.equal(s88.champion.driver.flag, "BR");
	// Hunt only took the lead at the final round; Prost's fourth title in 1993, his last season
	assert.equal(y(1976).leadFrom, 16);
	assert.equal(y(1993).champion.title, 4);
	assert.equal(y(1984).champion.title, 3);
	assert.equal(y(1984).debut?.driver.id, "ayrton-senna");
	assert.equal(y(2008).newCircuits.map((c) => c.id).sort().join(), "marina-bay,valencia");
	assert.equal(y(2024).sprints, 6);
	assert.equal(y(2019).sprints, 0);
	// 1997: Schumacher excluded, Frentzen runner-up
	assert.equal(y(1997).runnerUp.driver.id, "heinz-harald-frentzen");
	assert.equal(y(1958).constructors?.id, "vanwall");
});

test("pools and the daily pick", () => {
	const modern = poolSeasons(seasons, "modern");
	assert.equal(modern[0].year, 1980);
	assert.equal(poolSeasons(seasons, "all").length, seasons.length);
	for (let day = 0; day < 30; day++) {
		const a = dailySeason(seasons, "modern", day);
		// the same answer whatever order the list comes in
		assert.equal(a.id, dailySeason([...seasons].reverse(), "modern", day).id);
		assert.ok(a.year >= 1980);
	}
	const days = new Set(Array.from({ length: 40 }, (_, d) => dailySeason(seasons, "all", d).id));
	assert.ok(days.size > 25, "varied answers");
	const r = randomSeason(seasons, "modern", () => 0.5, "2000");
	assert.ok(r.year >= 1980 && r.id !== "2000");
});

test("comparison tiles", () => {
	const same = compareSeasons(y(1988), y(1988));
	assert.ok(same.correct);
	assert.ok(same.tiles.every((t) => t.verdict === "match"));

	// 1990 vs 1988: year close (target earlier), same champion, constructors' match
	const c = compareSeasons(y(1990), y(1988));
	assert.equal(c.correct, false);
	assert.deepEqual([c.tiles[0].verdict, c.tiles[0].direction, c.tiles[0].far], ["close", "lower", false]);
	assert.equal(c.tiles[1].verdict, "match");
	assert.equal(c.tiles[3].verdict, "match");

	// 1989 (Prost, McLaren) vs 1988 (Senna, McLaren): champion close
	assert.equal(compareSeasons(y(1989), y(1988)).tiles[1].verdict, "close");
	// far: 10+ years
	const far = compareSeasons(y(1978), y(1988));
	assert.deepEqual([far.tiles[0].verdict, far.tiles[0].direction, far.tiles[0].far], ["miss", "higher", true]);
	assert.equal(compareSeasons(y(1979), y(1988)).tiles[0].far, false);
	// rounds: 1988 had 16, 2024 had 24
	const rounds = compareSeasons(y(2024), y(1988)).tiles[2];
	assert.deepEqual([rounds.verdict, rounds.direction], ["miss", "lower"]);
	assert.equal(compareSeasons(y(1987), y(1988)).tiles[2].verdict, "match");
	// before 1958 neither had a constructors' champion
	assert.equal(compareSeasons(y(1952), y(1955)).tiles[3].verdict, "match");
	assert.equal(compareSeasons(y(1952), y(1988)).tiles[3].verdict, "miss");
});

test("year search", () => {
	const ys = (q: string) => searchSeasons(seasons, q).map((s) => s.year);
	assert.equal(ys("1988")[0], 1988);
	assert.equal(ys("88")[0], 1988);
	assert.equal(ys("'05")[0], 2005);
	assert.deepEqual(ys("198").sort(), [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989]);
	assert.equal(ys("").length, seasons.length);
	assert.equal(ys("")[0], seasons.at(-1)!.year);
	assert.deepEqual(ys("1888"), []);
	assert.ok(!searchSeasons(seasons, "88", new Set(["1988"])).some((s) => s.year === 1988));
});

test("clues go vague to specific and never name the year", () => {
	for (const s of seasons) {
		const clues = seasonClues(s);
		assert.equal(clues.length, MAX_GUESSES);
		assert.equal(clues[0].kind, "calendar");
		assert.equal(clues.at(-1)!.kind, "champion");
		assert.ok(!JSON.stringify(clues).includes(`"${s.year}"`));
	}
	const n = seasonClues(y(2021))[2];
	assert.ok(n.kind === "numbers" && n.margin === 8);
	assert.equal(ordinal(1), "1st");
	assert.equal(ordinal(2), "2nd");
	assert.equal(ordinal(3), "3rd");
	assert.equal(ordinal(4), "4th");
	assert.equal(ordinal(11), "11th");
	assert.equal(ordinal(22), "22nd");
});

test("share text and stats", () => {
	const rows = [compareSeasons(y(1978), y(1988)), compareSeasons(y(1988), y(1988))];
	const text = seasonShareText({ rows, won: true, label: "#3", url: "https://x/play/season" });
	const lines = text.split("\n");
	assert.equal(lines[0], "Pitwall: Guess the season #3 2/6");
	assert.equal(lines[2], "🟩🟩🟩🟩");
	assert.equal(lines.at(-1), "https://x/play/season");
	assert.match(seasonShareText({ rows, won: false, label: "practice" }), /X\/6/);
	let st = recordResult(emptyStats(), 5, true, 2);
	assert.equal(st.distribution[1], 1);
	st = recordResult(st, 6, false, 6);
	assert.equal(st.played, 2);
	assert.equal(st.won, 1);
	assert.equal(st.streak, 0);
});
