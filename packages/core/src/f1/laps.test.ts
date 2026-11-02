import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { driverLapsLed, hasLapData, lapLeaders, LAPS_FROM, type RaceLapFile } from "./laps.ts";
import { dataFile } from "../test-data.ts";

// the web app's folder (apps/web), which holds data/f1.json and data/laps/
const root = new URL("../", dataFile);
const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
const raceAt = (year: number, gp: string) => db.races.find((r) => r.year === year && r.grandPrixId === gp)!;
const lapFile = (raceId: number): RaceLapFile => JSON.parse(readFileSync(new URL(`data/laps/${raceId}.json`, root), "utf8"));

test("Jolpica metadata: dump date and coverage", () => {
	const meta = db.meta.jolpica!;
	assert.ok(meta, "dataset built with the Jolpica dump");
	assert.match(meta.dumpDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
	assert.equal(meta.lapsFrom, LAPS_FROM);
	assert.equal(meta.pitStopsFrom, 2011);
});

test("Spain 1996: Schumacher's lap chart", () => {
	const race = raceAt(1996, "spain");
	assert.ok(hasLapData(db, race.id));
	const f = lapFile(race.id);
	assert.equal(f.drivers![0], "michael-schumacher");
	const pos = f.positions![0];
	assert.equal(pos.length, race.laps);
	assert.equal(pos[pos.length - 1], 1);
	assert.ok(f.times![0].every((t) => t == null || (t > 60000 && t < 400000)));
	assert.deepEqual(lapLeaders(db, race.id)![1], ["michael-schumacher", 12, 65]);
});

test("Australia 2011 has pit stops; 2010 doesn't", () => {
	const f = lapFile(raceAt(2011, "australia").id);
	assert.ok(f.pitStops!.length > 20);
	for (const [driverId, stop, lap, ms] of f.pitStops!) {
		assert.ok(db.drivers.has(driverId));
		assert.ok(stop >= 1 && lap != null && lap >= 1);
		assert.ok(ms == null || ms > 10000);
	}
	assert.equal(lapFile(raceAt(2010, "australia").id).pitStops, undefined);
});

test("career laps led: Hamilton leads, Schumacher counted from 1996 only", () => {
	const ham = driverLapsLed(db, "lewis-hamilton");
	assert.ok(ham.laps > 5000 && ham.races > 150);
	assert.ok(driverLapsLed(db, "michael-schumacher").laps < ham.laps);
	assert.deepEqual(driverLapsLed(db, "ayrton-senna"), { laps: 0, races: 0 });
});

test("race view: laps led and lap data flags, hidden for races a universe changed", async () => {
	const { raceView, driverView } = await import("./views.ts");
	const { applyUniverse } = await import("../universe/apply.ts");
	const race = raceAt(2021, "abu-dhabi");
	const v = raceView(db, 2021, race.round)!;
	assert.equal(v.lapsLed![0].driver.id, "lewis-hamilton");
	assert.equal(v.lapsLed![0].laps, 51);
	assert.deepEqual(v.lapData && { chart: v.lapData.chart, pitStops: v.lapData.pitStops }, { chart: true, pitStops: true });
	assert.equal(raceView(db, 1995, 1)!.lapData, null);
	const order = db.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]];
	const u = applyUniverse(db, { id: "laps-view", updatedAt: 1, changes: [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }] });
	const uv = raceView(u, 2021, race.round, db)!;
	assert.equal(uv.lapData, null);
	assert.equal(uv.lapsLed, null);
	const ham = driverView(db, "lewis-hamilton")!.lapsLed!;
	assert.equal(ham.partial, false);
	assert.equal(driverView(u, "lewis-hamilton", db)!.lapsLed!.laps, ham.laps - 51);
	assert.equal(driverView(db, "michael-schumacher")!.lapsLed!.partial, true);
	assert.equal(driverView(db, "ayrton-senna")!.lapsLed, null);
});
