import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { compareQuery, compareView, parseCompareIds } from "./compare.ts";
import { driverCareers } from "./stats.ts";

const db = indexData(hydrate(JSON.parse(readFileSync("data/f1.json", "utf8"))));

test("query ids are trimmed, deduped and capped at four", () => {
	assert.deepEqual(parseCompareIds(" a, b,a,,c,d,e "), ["a", "b", "c", "d"]);
	assert.deepEqual(parseCompareIds(["a,b", "c"]), ["a", "b", "c"]);
	assert.deepEqual(parseCompareIds(undefined), []);
	assert.deepEqual(compareQuery({ t: "ferrari,mclaren" }), { kind: "team", ids: ["ferrari", "mclaren"] });
	assert.deepEqual(compareQuery(new URLSearchParams("d=a,b&t=x")), { kind: "driver", ids: ["a", "b"] });
	assert.deepEqual(compareQuery(new URLSearchParams("t=")), { kind: "team", ids: [] });
	assert.deepEqual(compareQuery({}), { kind: "driver", ids: [] });
});

test("career totals match the career aggregates; unknown ids are reported", () => {
	const v = compareView(db, "driver", ["lewis-hamilton", "max-verstappen", "nobody"]);
	assert.deepEqual(v.unknown, ["nobody"]);
	for (const e of v.entities) {
		const c = driverCareers(db).get(e.id)!;
		assert.equal(e.totals.wins, c.wins);
		assert.equal(e.totals.titles, e.titleYears.length);
		const last = e.progress.at(-1)!;
		assert.equal(last.n, c.starts);
		assert.equal(last.wins, c.wins);
		assert.equal(last.podiums, c.podiums);
		assert.equal(last.points, c.points);
	}
});

test("same age and same starts snapshots never exceed the careers", () => {
	const v = compareView(db, "driver", ["ayrton-senna", "alain-prost"]);
	const minStarts = Math.min(...v.entities.map((e) => e.totals.starts));
	assert.equal(v.afterStarts!.n, minStarts);
	for (const [i, e] of v.entities.entries()) {
		assert.equal(v.afterStarts!.rows[i].starts, minStarts);
		assert.ok(v.sameAge!.rows[i].wins <= e.totals.wins);
		assert.ok(v.sameAge!.rows[i].titles <= e.totals.titles);
	}
	// Senna died at 34; Prost had started racing at 25, so both have a snapshot
	assert.ok(v.sameAge!.rows.every((r) => r.starts > 0));
});

test("head-to-head: Senna and Prost shared many races, 32 of them as team-mates", () => {
	const v = compareView(db, "driver", ["ayrton-senna", "alain-prost"]);
	const h = v.h2h[0];
	assert.equal(h.teammateRaces, 32);
	assert.ok(h.races > 100 && h.aAhead + h.bAhead <= h.races);
	assert.equal(compareView(db, "driver", ["juan-manuel-fangio", "max-verstappen"]).h2h.length, 0);
});

test("constructors compare on official points and races entered", () => {
	const v = compareView(db, "team", ["ferrari", "mclaren"]);
	assert.equal(v.entities.length, 2);
	assert.equal(v.sameAge, null);
	for (const e of v.entities) assert.equal(e.progress.at(-1)!.points, e.totals.points);
	assert.ok(v.h2h[0].races > 500);
});
