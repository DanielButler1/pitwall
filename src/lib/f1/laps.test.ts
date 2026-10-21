import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { driverLapsLed, hasLapData, lapCoverage, lapLeaders, LAPS_FROM, type RaceLapFile } from "./laps.ts";

const root = new URL("../../../", import.meta.url);
const db = indexData(hydrate(JSON.parse(readFileSync(new URL("data/f1.json", root), "utf8"))));
const raceAt = (year: number, gp: string) => db.races.find((r) => r.year === year && r.grandPrixId === gp)!;
const lapFile = (raceId: number): RaceLapFile => JSON.parse(readFileSync(new URL(`data/laps/${raceId}.json`, root), "utf8"));

test("Jolpica metadata: dump date and coverage", () => {
	const meta = db.meta.jolpica!;
	assert.ok(meta, "dataset built with the Jolpica dump");
	assert.match(meta.dumpDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
	assert.equal(meta.lapsFrom, LAPS_FROM);
	assert.equal(meta.pitStopsFrom, 2011);
	assert.equal(lapCoverage(db).excluded, 0);
});

test("every race since 1996 up to the dump's last race has lap leaders and a lap file", () => {
	const last = db.raceById.get(db.meta.jolpica!.lastLapRaceId!)!;
	const due = db.races.filter(
		(r) => r.year >= LAPS_FROM && db.resultsByRace.has(r.id) && (r.year < last.year || (r.year === last.year && r.round <= last.round)),
	);
	assert.ok(due.length > 550);
	for (const r of due) {
		const spans = lapLeaders(db, r.id);
		assert.ok(spans?.length, `${r.year} ${r.grandPrixId} has lap leaders`);
		// every lap has exactly one leader, laps 1..N without gaps
		let next = 1;
		for (const [, a, b] of spans!) {
			assert.equal(a, next, `${r.year} ${r.grandPrixId} lap ${next}`);
			next = b + 1;
		}
		const winner = db.resultsByRace.get(r.id)!.find((x) => x.position === 1);
		if (winner?.laps) assert.equal(next - 1, winner.laps, `${r.year} ${r.grandPrixId} laps`);
		assert.ok(existsSync(new URL(`data/laps/${r.id}.json`, root)), `${r.year} ${r.grandPrixId} lap file`);
		// lap leaders are mapped to F1DB drivers of that race
		const ids = new Set(db.resultsByRace.get(r.id)!.map((x) => x.driverId));
		for (const [d] of spans!) assert.ok(ids.has(d), `${d} raced ${r.year} ${r.grandPrixId}`);
	}
	assert.equal(lapLeaders(db, raceAt(1995, "australia").id), null, "no lap leaders before 1996");
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
