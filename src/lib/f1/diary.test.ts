import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { allDiaryDays, diaryIndexView, diarySlug, diaryView, parseDiarySlug } from "./diary.ts";

const db = indexData(hydrate(JSON.parse(readFileSync("data/f1.json", "utf8"))));

test("diary slugs round-trip, including 29 February", () => {
	assert.equal(allDiaryDays().length, 366);
	for (const d of allDiaryDays()) assert.deepEqual(parseDiarySlug(diarySlug(d.month, d.day)), d);
	assert.equal(parseDiarySlug("30-february"), null);
	assert.equal(parseDiarySlug("nonsense"), null);
});

test("21 October: 2007 Brazil, where Räikkönen won the race and the title", () => {
	const v = diaryView(db, 10, 21);
	const brazil = v.races.find((r) => r.race.year === 2007);
	assert.equal(brazil?.winner?.id, "kimi-raikkonen");
	assert.ok(v.titles.some((t) => t.kind === "driver" && t.driver?.id === "kimi-raikkonen" && t.race.year === 2007));
	assert.equal(v.prev.slug, "20-october");
	assert.equal(v.next.slug, "22-october");
});

test("births, deaths, debuts and first wins land on their dates", () => {
	assert.ok(diaryView(db, 1, 3).births.some((p) => p.driver.id === "michael-schumacher" && p.year === 1969));
	const senna = diaryView(db, 5, 1).deaths.find((p) => p.driver.id === "ayrton-senna");
	assert.equal(senna?.age, 34);
	assert.ok(diaryView(db, 3, 18).debuts.some((d) => d.driver.id === "lewis-hamilton" && d.race.year === 2007));
	assert.ok(diaryView(db, 6, 10).firstWins.some((d) => d.driver.id === "lewis-hamilton" && d.race.year === 2007));
	assert.ok(diaryView(db, 12, 12).titles.some((t) => t.driver?.id === "max-verstappen" && t.race.year === 2021));
});

test("the index counts every race once", () => {
	const v = diaryIndexView(db);
	assert.equal(
		Object.values(v.days).reduce((n, d) => n + d.races, 0),
		db.races.length,
	);
	assert.equal(v.busiest.length, 5);
});
