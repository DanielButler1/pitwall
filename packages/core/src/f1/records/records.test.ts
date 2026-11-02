import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData, type Db } from "../dataset.ts";
import { applyUniverse, type Change } from "../../universe/apply.ts";
import { findRecord, fullCatalogue, recordIndex, recordPageView, recordRows } from "./index.ts";
import { lapLeaders, lapsLedIn } from "../laps.ts";
import type { Cell, RecordRow } from "./types.ts";
import { dataFile } from "../../test-data.ts";

const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));

const subjectId = (c: Cell) => ("ref" in c ? ("id" in c.ref ? c.ref.id : "") : c.t === "number" ? c.number : c.t === "season" ? String(c.year) : "");
const rows = (id: string, d: Db = db): RecordRow[] => {
	const r = recordRows(d, id);
	assert.ok(r, `category ${id} should be computable`);
	return r!;
};
const top = (id: string, d: Db = db) => rows(id, d)[0];
const idOf = (r: RecordRow) => subjectId(r.subject[0]);

test("every catalogue category has a unique id", () => {
	const index = fullCatalogue();
	assert.ok(index.length > 500);
	assert.equal(new Set(index.map((m) => m.id)).size, index.length);
	for (const m of index) if (!m.available) assert.ok(m.unavailableReason, `${m.id} needs a reason`);
});

test("categories the data can't support are left out of the site", () => {
	const id = "grands-prix/misc/finished-under-safety-car";
	assert.equal(fullCatalogue().find((m) => m.id === id)?.available, false);
	assert.equal(findRecord(id), undefined);
	assert.ok(!recordIndex().some((m) => m.id === id));
	assert.ok(recordIndex().every((m) => m.available));
});

test("a universe changes a record and shows the real value", () => {
	// Hamilton wins Abu Dhabi 2021.
	const race = db.races.find((r) => r.year === 2021 && r.round === 22)!;
	const order = db.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]];
	const changes: Change[] = [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }];
	const u = applyUniverse(db, { id: "records-test", updatedAt: 1, changes });
	const view = recordPageView(u, "drivers/titles/by-number", db)!;
	assert.ok(view.modified);
});

const MAY_BE_EMPTY = new Set(["drivers/wins/without-leading"]);

test("every available category computes on the real Db", () => {
	const times: [string, number][] = [];
	const t0 = performance.now();
	for (const m of recordIndex()) {
		if (!m.available) continue;
		const s = performance.now();
		const r = recordRows(db, m.id);
		times.push([m.id, performance.now() - s]);
		assert.ok(Array.isArray(r), m.id);
		// nobody has won without leading a lap since lap data begins (1996)
		if (!MAY_BE_EMPTY.has(m.id)) assert.ok(r!.length > 0, `${m.id} has rows`);
		for (const row of r!.slice(0, 3)) {
			assert.ok(Number.isFinite(row.value), `${m.id} value`);
			assert.ok(typeof row.display === "string" && row.display.length > 0, `${m.id} display`);
		}
	}
	const total = performance.now() - t0;
	times.sort((a, b) => b[1] - a[1]);
	console.log(`computed ${times.length} categories in ${total.toFixed(0)} ms; slowest: ${times.slice(0, 8).map(([id, ms]) => `${id} ${ms.toFixed(0)}ms`).join(", ")}`);
});

/* ------------------------------------------------------------ laps led --- */

const raceAt = (year: number, gp: string, d: Db = db) => d.races.find((r) => r.year === year && r.grandPrixId === gp)!;

test("laps led records cover 1996 onwards", () => {
	const r = top("drivers/laps-led/laps");
	assert.ok(r.value > 5000);
	const m = findRecord("drivers/laps-led/laps")!;
	assert.equal(m.coverage?.label, "Since 1996");
	assert.ok(m.coverage?.note.includes("1996"));
});

test("Abu Dhabi 2021: Verstappen took the lead on the last lap", () => {
	const race = raceAt(2021, "abu-dhabi");
	const spans = lapLeaders(db, race.id)!;
	assert.deepEqual(spans[spans.length - 1], ["max-verstappen", 58, 58]);
	assert.equal(spans[spans.length - 2][0], "lewis-hamilton");
	assert.equal(spans[spans.length - 2][2], 57);
	// Hamilton led 51 laps (Perez led 15-20 during the stops), Verstappen only the 58th
	const led = lapsLedIn(spans);
	assert.equal(led.get("lewis-hamilton"), 51);
	assert.equal(led.get("max-verstappen"), 1);
	const ver = rows("drivers/wins/lead-taken-on-last-lap").find((x) => idOf(x) === "max-verstappen")!;
	assert.ok(ver.detail?.some((c) => c.t === "race" && c.ref.year === 2021 && c.ref.round === race.round));
});

test("first across the line without winning: Vettel (Canada 2019), Russell (Belgium 2024)", () => {
	const ids = rows("drivers/misc/first-across-line-not-winner").map(idOf);
	assert.ok(ids.includes("sebastian-vettel"));
	assert.ok(ids.includes("george-russell"));
});

test("Grands Prix by number of leaders and laps-led families compute", () => {
	assert.ok(top("grands-prix/laps-led/most").value >= 6);
	assert.equal(top("grands-prix/laps-led/least").value, 1);
	assert.ok(top("drivers/sprint/laps-led").value > 0);
});

test("a universe that changes a race drops its lap data from laps-led records", () => {
	const race = raceAt(2021, "abu-dhabi");
	const order = db.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]];
	const u = applyUniverse(db, { id: "laps-test", updatedAt: 1, changes: [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }] });
	assert.equal(lapLeaders(u, race.id), null, "changed race has no lap data");
	assert.ok(lapLeaders(u, raceAt(2021, "saudi-arabia", u).id), "other races keep theirs");
	const ham = (d: Db) => rows("drivers/laps-led/laps", d).find((x) => idOf(x) === "lewis-hamilton")!.value;
	assert.equal(ham(db) - ham(u), 51);
	const view = recordPageView(u, "drivers/laps-led/laps", db)!;
	assert.equal(view.excludedRaces, 1);
	const last = rows("drivers/wins/lead-taken-on-last-lap", u).find((x) => idOf(x) === "max-verstappen");
	assert.ok(!last?.detail?.some((c) => c.t === "race" && c.ref.year === 2021));
});

test("constructors' title deciders apply dropped scores (Lotus 1965 at the German GP)", () => {
	const r = rows("grands-prix/deciders/constructors-chronology").find((x) => x.key.includes("1965"))!;
	const race = r.subject[0];
	assert.ok(race.t === "race" && race.ref.year === 1965 && race.ref.name.includes("German"));
});

/* ------------------------------------------------ definitions checked --- */

test("constructor points follow the official constructors' scoring (official totals)", () => {
	const pts = new Map(rows("constructors/points/by-number").map((r) => [idOf(r), r.value]));
	// best car only in 1958-1978, no points before 1958; teams long gone so the totals are stable
	assert.equal(pts.get("cooper"), 342);
	assert.equal(pts.get("brabham"), 864);
	assert.equal(pts.get("tyrrell"), 621);
	assert.equal(pts.get("march"), 173.5);
});

test("car number titles are counted at the deciding race", () => {
	const r = top("numbers/titles/by-number");
	assert.ok(r.value >= 18);
});

test("driver constructor titles need points for the team (Senna: 4, not 1994)", () => {
	const senna = rows("drivers/titles/constructor-titles").find((r) => idOf(r) === "ayrton-senna")!;
	assert.equal(senna.value, 4);
});

test("third driver only lists Friday drivers who never entered a race", () => {
	const r = rows("drivers/misc/third-driver-only");
	assert.ok(r.length > 30);
	for (const x of r) assert.ok(!db.resultsByDriver.has(idOf(x)));
});
