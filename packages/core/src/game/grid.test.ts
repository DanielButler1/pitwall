import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { gridFile } from "./grid-data.ts";
import {
	CELL_MAX,
	CELL_MIN,
	cellAnswers,
	cellCategories,
	cellFair,
	dailyGrid,
	emptyStats,
	fits,
	generateGrid,
	gridFromIds,
	gridIds,
	indexGrid,
	MAX_GUESSES,
	playBoard,
	rarity,
	recordResult,
	rng,
	shareText,
	type Attempt,
	type Grid,
} from "./grid.ts";
import { dataFile } from "../test-data.ts";

const file = gridFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const data = indexGrid(file);
const cat = (id: string) => data.byCategoryId.get(id)!.index;
const driver = (id: string) => data.byId.get(id)!;
const inCat = (id: string, c: string) => driver(id).categories.includes(cat(c));

test("grid file: memberships are right", () => {
	assert.ok(data.drivers.length > 700);
	for (const c of ["team:ferrari", "team:mclaren", "team:williams", "nation:italy", "nation:united-kingdom", "decade:1950", "decade:2020", "feat:champion", "feat:pointless", "mate:michael-schumacher"])
		assert.ok(data.byCategoryId.has(c), c);
	assert.equal(data.byCategoryId.get("nation:united-states-of-america")!.label, "United States");
	assert.equal(data.counts[cat("feat:champion")][cat("feat:champion")] >= 34, true);
	// Senna: McLaren, Lotus, Williams, Toleman; won at Monaco and at home
	for (const c of ["team:mclaren", "team:lotus", "team:williams", "nation:brazil", "feat:champion", "feat:monaco", "feat:home-win", "decade:1980", "decade:1990", "feat:starts-100"])
		assert.ok(inCat("ayrton-senna", c), c);
	assert.ok(!inCat("ayrton-senna", "feat:starts-200"));
	assert.ok(!inCat("ayrton-senna", "mate:ayrton-senna"));
	assert.ok(inCat("alain-prost", "mate:ayrton-senna"));
	assert.ok(inCat("rubens-barrichello", "mate:michael-schumacher"));
	assert.ok(inCat("luca-badoer", "feat:pointless") && inCat("luca-badoer", "team:ferrari"));
	assert.ok(!inCat("lewis-hamilton", "feat:pointless"));
	assert.ok(data.drivers.every((d) => d.starts > 0));
	// sorted by id, so daily grids don't depend on build order
	assert.deepEqual(file.drivers.map((d) => d[0]), [...file.drivers.map((d) => d[0])].sort());
});

const checkGrid = (g: Grid) => {
	assert.equal(new Set([...g.rows, ...g.cols]).size, 6);
	for (let i = 0; i < 9; i++) {
		const [a, b] = cellCategories(g, i);
		assert.ok(cellFair(data, a, b));
		const n = cellAnswers(data, g, i).length;
		assert.ok(n >= CELL_MIN && n <= CELL_MAX, `${n}`);
	}
	const kinds = [...g.rows, ...g.cols].map((i) => data.categories[i].kind);
	assert.ok(kinds.filter((k) => k === "nation").length <= 2);
	assert.ok(kinds.filter((k) => k === "team").length <= 4);
};

test("daily grid: deterministic, fair, varied", () => {
	assert.deepEqual(dailyGrid(data, 3), dailyGrid(data, 3));
	assert.notDeepEqual(dailyGrid(data, 3), dailyGrid(data, 4));
	const seen = new Set<string>();
	for (let day = 0; day < 300; day++) {
		const g = dailyGrid(data, day);
		checkGrid(g);
		seen.add(gridIds(data, g).join());
	}
	assert.equal(seen.size, 300);
	for (let s = 0; s < 100; s++) checkGrid(generateGrid(data, rng(s * 7919)));
});

test("grid ids round-trip; unknown ids give null", () => {
	const g = dailyGrid(data, 10);
	assert.deepEqual(gridFromIds(data, gridIds(data, g)), g);
	assert.equal(gridFromIds(data, ["team:nope", ...gridIds(data, g).slice(1)]), null);
	assert.equal(gridFromIds(data, undefined), null);
});

const fixed: Grid = { rows: [cat("team:ferrari"), cat("team:mclaren"), cat("team:williams")], cols: [cat("feat:champion"), cat("nation:brazil"), cat("decade:1980")] };

test("rarity: the most famous answer scores 0, the least known 100", () => {
	const answers = cellAnswers(data, fixed, 0);
	assert.ok(answers.length >= 3);
	assert.ok(answers.every((d) => fits(data, fixed, 0, d)));
	for (let i = 1; i < answers.length; i++) assert.ok(answers[i - 1].fame >= answers[i].fame);
	assert.equal(rarity(answers, answers[0]), 0);
	assert.equal(rarity(answers, answers[answers.length - 1]), 100);
	const mid = rarity(answers, answers[Math.floor(answers.length / 2)]);
	assert.ok(mid > 0 && mid < 100);
	assert.ok(answers.some((d) => d.id === "michael-schumacher"));
});

test("play: correct fills, wrong and repeats use a guess, game ends after nine", () => {
	const attempts: Attempt[] = [
		[0, "michael-schumacher"], // Ferrari champion
		[1, "lewis-hamilton"], // not Brazilian: miss
		[1, "felipe-massa"], // Ferrari, Brazil
		[3, "michael-schumacher"], // never raced for McLaren: miss
		[5, "alain-prost"], // McLaren in the 1980s
		[5, "niki-lauda"], // cell already filled: miss
		[8, "alain-prost"], // driver already used: miss
	];
	const b = playBoard(data, fixed, attempts);
	assert.equal(b.used, 7);
	assert.equal(b.left, 2);
	assert.equal(b.filled, 3);
	assert.equal(b.misses.length, 4);
	assert.equal(b.cells[0]?.driver.id, "michael-schumacher");
	assert.equal(b.cells[1]?.driver.id, "felipe-massa");
	assert.equal(b.cells[3], null);
	assert.equal(b.over, false);
	assert.equal(b.rarity, b.cells.reduce((s, c) => s + (c?.rarity ?? 0), 0));
	const done = playBoard(data, fixed, [...attempts, [2, "gilles-villeneuve"], [4, "ayrton-senna"], [7, "nelson-piquet"]]);
	assert.equal(done.filled, 5);
	assert.equal(done.used, MAX_GUESSES);
	assert.equal(done.over, true);
	const text = shareText({ board: done, label: "#5", url: "https://pitwall.phaseo.app/play/grid" });
	assert.equal(text.split("\n")[1], "🟩🟩🟩");
	assert.match(text, /\d\/9 · rarity \d+/);
	assert.ok(text.endsWith("/play/grid"));
});

test("stats: distribution by cells filled, full grid is a win", () => {
	let s = emptyStats();
	assert.equal(s.distribution.length, 10);
	s = recordResult(s, 4, 9);
	s = recordResult(s, 4, 2);
	s = recordResult(s, 5, 0);
	assert.deepEqual([s.played, s.won, s.distribution[9], s.distribution[0], s.streak, s.maxStreak], [2, 1, 1, 1, 0, 1]);
});
