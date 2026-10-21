import { test } from "node:test";
import assert from "node:assert/strict";
import type { Change } from "./apply.ts";
import { changesHash, decodeUniverse, encodeUniverse, fromBase64Url, sharedId, toBase64Url } from "./share.ts";

const changes: Change[] = [
	{ id: "a1", kind: "points", fromYear: 1950, toYear: 2025, system: "2010" },
	{ id: "b2", kind: "race-edit", raceId: 1057, order: ["lewis-hamilton", "max-verstappen"], retired: [] },
	{ id: "c3", kind: "history-sim", mode: "dynamic", fromYear: 1990, toYear: 2075, seed: 2075, chaos: 1, reliability: 1 },
];
const universe = { name: "Hamilton’s eighth 🏆", description: "Abu Dhabi, reversed", changes };

test("base64url round-trips arbitrary bytes", () => {
	const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
	const s = toBase64Url(bytes);
	assert.match(s, /^[A-Za-z0-9_-]+$/);
	assert.deepEqual(fromBase64Url(s), bytes);
});

test("a universe round-trips through a compressed, URL-safe string", async () => {
	const data = await encodeUniverse(universe);
	assert.match(data, /^1\.[A-Za-z0-9_-]+$/);
	const back = await decodeUniverse(data);
	assert.equal(back.name, universe.name);
	assert.equal(back.description, universe.description);
	assert.deepEqual(
		back.changes.map(({ id: _id, ...c }) => c),
		changes.map(({ id: _id, ...c }) => c),
	);
	assert.deepEqual(new Set(back.changes.map((c) => c.id)).size, changes.length);
	assert.equal(await decodeUniverse("#" + data).then((u) => u.name), universe.name);
});

test("links compress well", async () => {
	const order = Array.from({ length: 20 }, (_, i) => `some-driver-number-${i}`);
	const many: Change[] = Array.from({ length: 40 }, (_, i) => ({ id: String(i), kind: "race-edit", raceId: 1000 + i, order, retired: [] }));
	const data = await encodeUniverse({ name: "Lots", changes: many });
	assert.ok(data.length < JSON.stringify(many).length / 5, `${data.length}`);
});

test("damaged or foreign links are rejected with a readable error", async () => {
	const data = await encodeUniverse(universe);
	await assert.rejects(decodeUniverse(data.slice(0, data.length / 2)), /damaged/);
	await assert.rejects(decodeUniverse("hello"), /Not a Pitwall share link/);
	await assert.rejects(decodeUniverse("0." + toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, c: [{ kind: "teleport" }] })))), /doesn't understand/);
	const plain = "0." + toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, n: "Plain", c: [{ kind: "points", fromYear: 1, toYear: 2, system: "2010" }] })));
	assert.equal((await decodeUniverse(plain)).name, "Plain");
});

test("content hash ignores ids and key order; shared ids are deterministic", () => {
	const shuffled = changes.map((c, i) => Object.fromEntries(Object.entries({ ...c, id: `x${i}` }).reverse()) as Change);
	assert.equal(changesHash(shuffled), changesHash(changes));
	assert.notEqual(changesHash(changes.slice(1)), changesHash(changes));
	assert.equal(sharedId(universe), sharedId({ ...universe, changes: shuffled }));
	assert.notEqual(sharedId(universe), sharedId({ ...universe, name: "Other" }));
	assert.match(sharedId(universe), /^s-[a-z0-9]{12}$/);
});

test("custom points systems survive a share link, sanitised on the way in", async () => {
	const custom = { id: "custom", name: "Mine", description: "", race: [25, 18, 15], pole: 1, finishing: 0.5, bestResults: 10, doubleFinal: true };
	const shared = { name: "Custom points", changes: [{ id: "x", kind: "points", fromYear: 1950, toYear: 2025, system: "custom", custom } as Change] };
	const back = (await decodeUniverse(await encodeUniverse(shared))).changes[0];
	assert.equal(back.kind, "points");
	if (back.kind !== "points") return;
	assert.deepEqual(back.custom, { ...custom, description: "25-18-15, +1 pole, +0.5 per finish, best 10 results count, double points finale" });
	const evil = (c: unknown) => "0." + toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, n: "Evil", c: [c] })));
	const tampered = await decodeUniverse(evil({ kind: "points", fromYear: 1950, toYear: 2025, system: "custom", custom: { race: [1e12, -1, NaN], pole: "x" }, extra: 1 }));
	assert.deepEqual(tampered.changes[0], { id: "s1", kind: "points", fromYear: 1950, toYear: 2025, system: "custom", custom: { id: "custom", name: "Custom", description: "1000", race: [1000, 0, 0] } });
	await assert.rejects(decodeUniverse(evil({ kind: "points", fromYear: 1950, toYear: 2025, system: "custom", custom: { race: [] } })), /points system/);
	await assert.rejects(decodeUniverse(evil({ kind: "points", fromYear: "1950", toYear: 2025, system: "2010" })), /damaged/);
});
