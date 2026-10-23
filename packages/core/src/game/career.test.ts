import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { careerFile, initials } from "./career-data.ts";
import {
	dailyTarget,
	eligible,
	emptyStats,
	HINT_AFTER,
	HINTS,
	judge,
	MAX_GUESSES,
	MIN_STINTS,
	randomTarget,
	recordResult,
	revealed,
	searchDrivers,
	shareText,
	span,
	unpackFile,
	type CareerDriver,
} from "./career.ts";
import { dataFile } from "../test-data.ts";

const file = careerFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8")))));
const drivers = unpackFile(file);
const byId = (id: string) => drivers.find((d) => d.id === id)!;
const path = (d: CareerDriver) => d.stints.map((s) => `${s.teamName} ${span(s.from, s.to)}`);

test("career file: stints in order, merged by season, small", () => {
	assert.deepEqual(path(byId("jarno-trulli")), ["Minardi 1997", "Prost 1997–1999", "Jordan 2000–2001", "Renault 2002–2004", "Toyota 2004–2009", "Lotus Racing 2010–2011"]);
	assert.deepEqual(path(byId("ayrton-senna")), ["Toleman 1984", "Lotus 1985–1987", "McLaren 1988–1993", "Williams 1994"]);
	// a return to an old team is its own stint
	assert.deepEqual(byId("fernando-alonso").stints.map((s) => s.team).slice(0, 4), ["minardi", "renault", "mclaren", "renault"]);
	const senna = byId("ayrton-senna");
	assert.equal(senna.stints.reduce((n, s) => n + s.wins, 0), 41);
	assert.equal(senna.stints.reduce((n, s) => n + s.starts, 0), senna.starts);
	assert.equal(senna.flag, "BR");
	assert.equal(senna.initials, "A. S.");
	assert.equal(senna.titles, 3);
	assert.ok(drivers.every((d) => d.stints.length > 0 && d.stints.every((s, i) => s.from <= s.to && (i === 0 || s.from >= d.stints[i - 1].from))));
	assert.ok(JSON.stringify(file).length < 250_000);
	assert.equal(initials("Andrea", "de Cesaris"), "A. C.");
});

test("pools: three or more stints, sized sensibly", () => {
	const modern = drivers.filter((d) => eligible(d, "modern"));
	const all = drivers.filter((d) => eligible(d, "all"));
	assert.ok(modern.length > 60 && all.length > modern.length, `${modern.length} ${all.length}`);
	assert.ok(all.every((d) => d.stints.length >= MIN_STINTS));
	assert.ok(modern.some((d) => d.id === "jarno-trulli"));
	assert.ok(!modern.some((d) => d.id === "juan-manuel-fangio"));
	assert.ok(all.some((d) => d.id === "juan-manuel-fangio"));
	// every stint of the shortest career is showing before the first hint opens
	assert.ok(MIN_STINTS <= HINT_AFTER[0]);
	assert.equal(HINT_AFTER.at(-1), MAX_GUESSES - 1);
});

test("daily target: deterministic, eligible, no repeats in a cycle", () => {
	for (const mode of ["modern", "all"] as const) {
		const size = drivers.filter((d) => eligible(d, mode)).length;
		assert.equal(dailyTarget(drivers, mode, 9).id, dailyTarget([...drivers].reverse(), mode, 9).id);
		const seen = new Set<string>();
		for (let day = 0; day < size; day++) seen.add(dailyTarget(drivers, mode, day).id);
		assert.equal(seen.size, size);
	}
	const p = randomTarget(drivers, "modern", rng(3), "jarno-trulli");
	assert.ok(eligible(p, "modern") && p.id !== "jarno-trulli");
});

test("reveals: a stint per miss, hints after misses 3, 4 and 5 whatever the career length", () => {
	assert.deepEqual([...HINT_AFTER], [3, 4, 5]);
	const senna = byId("ayrton-senna"); // 4 stints
	assert.deepEqual(revealed(senna, 0), { stints: 1, hints: 0 });
	assert.deepEqual(revealed(senna, 2), { stints: 3, hints: 0 });
	assert.deepEqual(revealed(senna, 3), { stints: 4, hints: 1 });
	assert.deepEqual(revealed(senna, 4), { stints: 4, hints: 2 });
	assert.deepEqual(revealed(senna, 5), { stints: 4, hints: 3 });
	assert.deepEqual(revealed(senna, 0, true), { stints: 4, hints: 3 });
	const three = drivers.find((d) => d.stints.length === 3)!;
	assert.deepEqual(revealed(three, 2), { stints: 3, hints: 0 });
	assert.deepEqual(revealed(three, 3), { stints: 3, hints: 1 });
	// a long career (Patrese: 7 stints) still gets every hint by the last guess
	const patrese = byId("riccardo-patrese");
	assert.ok(patrese.stints.length >= 7, String(patrese.stints.length));
	assert.deepEqual(revealed(patrese, 3), { stints: 4, hints: 1 });
	assert.deepEqual(revealed(patrese, 4), { stints: 5, hints: 2 });
	assert.deepEqual(revealed(patrese, 5), { stints: 6, hints: 3 });
	assert.deepEqual(revealed(patrese, 0, true), { stints: patrese.stints.length, hints: 3 });
	// every eligible driver: the last guess has every hint, the initials included
	for (const d of drivers.filter((d) => eligible(d, "all"))) assert.equal(revealed(d, MAX_GUESSES - 1).hints, HINTS.length);
});

test("judge: match, shared team, miss; share text", () => {
	const trulli = byId("jarno-trulli");
	assert.equal(judge(trulli, trulli).verdict, "match");
	const alonso = judge(byId("fernando-alonso"), trulli); // Minardi and Renault
	assert.equal(alonso.verdict, "close");
	assert.deepEqual(alonso.shared.sort(), ["minardi", "renault"]);
	assert.equal(judge(byId("juan-manuel-fangio"), trulli).verdict, "miss");
	const results = [judge(byId("juan-manuel-fangio"), trulli), judge(byId("fernando-alonso"), trulli), judge(trulli, trulli)];
	assert.equal(shareText({ results, won: true, label: "#3", url: "https://x.test/play/career" }), "Pitwall Career path #3 🟥🟨🟩 (3/6)\nhttps://x.test/play/career");
	assert.equal(shareText({ results: results.slice(0, 2), won: false, label: "#3" }), "Pitwall Career path #3 🟥🟨 (X/6)");
});

test("stats and search", () => {
	let s = recordResult(emptyStats(), 4, true, 2);
	s = recordResult(s, 5, false, 6);
	assert.deepEqual([s.played, s.won, s.streak, s.maxStreak], [2, 1, 0, 1]);
	assert.deepEqual(s.distribution, [0, 1, 0, 0, 0, 0]);
	assert.equal(searchDrivers(drivers, "trul")[0].id, "jarno-trulli");
	assert.equal(searchDrivers(drivers, "raikko")[0].id, "kimi-raikkonen");
});
