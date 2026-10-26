import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { sharedRaces } from "../f1/teammates.ts";
import { chainFile } from "./chain-data.ts";
import {
	bucketLabel,
	canHint,
	classify,
	dailyPair,
	distances,
	emptyStats,
	fullChain,
	GIVE_UP,
	HINT,
	linkCount,
	linkLabel,
	linkOf,
	MAX_STRIKES,
	newGame,
	overPar,
	pairOf,
	pairPool,
	randomPair,
	recognisable,
	recordResult,
	replay,
	rng,
	scoreBucket,
	searchDrivers,
	shareText,
	shortestChain,
	step,
	strikesUsed,
	UNDO,
	unpack,
	type Pair,
} from "./chain.ts";
import { dataFile } from "../test-data.ts";

const db = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
const file = chainFile(db);
const g = unpack(file);
const at = (id: string) => g.byId.get(id)!.i;
const label = (a: string, b: string) => linkLabel(g, linkOf(g, at(a), at(b))!);

test("chain file: valid indexes, explained links", () => {
	assert.ok(file.drivers.length > 800);
	assert.deepEqual(
		file.drivers.map((d) => d[0]),
		[...file.drivers.map((d) => d[0])].sort(),
	);
	for (const [a, b, ...rest] of file.edges) {
		assert.ok(a < b && b < file.drivers.length);
		assert.ok(rest.length > 0 && rest.length % 3 === 0);
		for (let k = 0; k < rest.length; k += 3) assert.ok(rest[k] < file.teams.length && rest[k + 1] <= rest[k + 2]);
	}
	assert.equal(label("ayrton-senna", "alain-prost"), "McLaren, 1988–1989");
	assert.equal(label("lewis-hamilton", "nico-rosberg"), "Mercedes, 2013–2016");
	assert.equal(label("alain-prost", "ayrton-senna"), label("ayrton-senna", "alain-prost"));
	assert.equal(linkOf(g, at("ayrton-senna"), at("lewis-hamilton")), null);
	const senna = g.byId.get("ayrton-senna")!;
	assert.deepEqual([senna.lastName, senna.flag, senna.first, senna.last, senna.wins, senna.titles], ["Senna", "BR", 1984, 1994, 41, 3]);
});

test("team-mates match the head-to-head definition", () => {
	for (const [a, b] of [
		["ayrton-senna", "alain-prost"],
		["michael-schumacher", "rubens-barrichello"],
		["fernando-alonso", "lewis-hamilton"],
	]) {
		const years = new Set(sharedRaces(db, a, b).map((r) => r.race.year));
		const stints = linkOf(g, at(a), at(b))!;
		const fromGraph = new Set(stints.flatMap((s) => Array.from({ length: s.to - s.from + 1 }, (_, k) => s.from + k)));
		assert.deepEqual([...fromGraph].sort(), [...years].sort());
	}
	// gaps in the seasons together show as separate runs
	const multi = file.edges.find((e) => e.length > 5)!;
	assert.ok(multi);
});

test("distances and shortest chains", () => {
	assert.equal(distances(g, at("ayrton-senna"))[at("lewis-hamilton")], 4);
	assert.equal(distances(g, at("ayrton-senna"))[at("alain-prost")], 1);
	const chain = shortestChain(g, at("ayrton-senna"), at("lewis-hamilton"))!;
	assert.equal(chain.length, 5);
	assert.equal(chain[0], at("ayrton-senna"));
	assert.equal(chain[4], at("lewis-hamilton"));
	for (let k = 1; k < chain.length; k++) assert.ok(linkOf(g, chain[k - 1], chain[k]));
});

test("puzzle pools: in range, a champion end, sorted; daily picks deterministic", () => {
	for (const d of ["classic", "hard"] as const) {
		const pool = pairPool(g, d);
		const [lo, hi] = d === "classic" ? [3, 4] : [5, 6];
		assert.ok(pool.length > 300, `${d} ${pool.length}`);
		for (const p of pool.slice(0, 400)) {
			const a = g.drivers[p.a];
			const b = g.drivers[p.b];
			assert.ok(p.par >= lo && p.par <= hi);
			assert.equal(distances(g, p.a)[p.b], p.par);
			assert.ok(recognisable(a) && recognisable(b) && (a.titles > 0 || b.titles > 0));
			assert.ok(a.first <= b.first);
		}
		assert.deepEqual(
			pool.map((p) => p.id),
			[...pool.map((p) => p.id)].sort(),
		);
		assert.equal(new Set(pool.map((p) => p.id)).size, pool.length);
		// the same day gives the same pair, also from a freshly unpacked graph
		assert.equal(dailyPair(g, d, 9).id, dailyPair(unpack(file), d, 9).id);
		const seen = new Set<string>();
		for (let day = 0; day < 60; day++) seen.add(dailyPair(g, d, day).id);
		assert.equal(seen.size, 60);
		const r = randomPair(g, d, rng(3), pool[0].id);
		assert.notEqual(r.id, pool[0].id);
	}
	assert.notEqual(dailyPair(g, "classic", 0).id, dailyPair(g, "hard", 0).id);
	assert.equal(pairOf(g, "ayrton-senna", "lewis-hamilton")!.par, 4);
	assert.equal(pairOf(g, "ayrton-senna", "nobody"), null);
});

const senna = (): Pair => pairOf(g, "ayrton-senna", "lewis-hamilton")!;

test("play: picks attach to whichever end they connect to", () => {
	let s = newGame(senna());
	assert.equal(classify(g, s, at("alain-prost")), "top");
	s = step(g, s, "alain-prost");
	assert.deepEqual(s.top, [at("ayrton-senna"), at("alain-prost")]);
	assert.equal(classify(g, s, at("nico-rosberg")), "bottom");
	s = step(g, s, "nico-rosberg");
	assert.deepEqual(s.bottom, [at("lewis-hamilton"), at("nico-rosberg")]);
	assert.equal(linkCount(s), 2);
	assert.equal(classify(g, s, at("alain-prost")), "repeat");
	assert.equal(step(g, s, "alain-prost"), s);
	assert.equal(step(g, s, "no-such-driver"), s);
	assert.ok(!s.solved);
	s = step(g, s, "michael-schumacher"); // Mercedes with Rosberg
	assert.equal(s.placed.at(-1), "bottom");
	s = step(g, s, "riccardo-patrese"); // Benetton with Schumacher; never with Prost
	assert.equal(s.placed.at(-1), "bottom");
	s = step(g, s, "nigel-mansell"); // Ferrari with Prost (top), Williams with Patrese: connected
	assert.ok(s.solved && s.over);
	assert.equal(linkCount(s), 6);
	assert.equal(overPar(s), 2);
	assert.equal(scoreBucket(s), 2);
	const chain = fullChain(s);
	assert.equal(chain.length, 7);
	assert.equal(chain[0], at("ayrton-senna"));
	assert.equal(chain.at(-1), at("lewis-hamilton"));
	for (let k = 1; k < chain.length; k++) assert.ok(linkOf(g, chain[k - 1], chain[k]), `${k}`);
	assert.equal(step(g, s, "jenson-button"), s);
});

test("play: strikes, repeats, undo, hints and giving up", () => {
	let s = newGame(senna());
	s = step(g, s, "max-verstappen"); // never with Senna or Hamilton
	assert.equal(s.strikes.length, 1);
	assert.equal(step(g, s, "max-verstappen"), s); // already ruled out against the same ends
	s = step(g, s, "alain-prost");
	s = step(g, s, UNDO);
	assert.deepEqual(s.top, [at("ayrton-senna")]);
	assert.equal(step(g, s, UNDO), s); // nothing to undo
	assert.equal(strikesUsed(s), 1);

	assert.ok(canHint(s));
	s = step(g, s, HINT);
	assert.ok(s.hint && s.hints.length === 1 && strikesUsed(s) === 2);
	assert.ok(!canHint(s)); // one hint per position, and never the last strike
	const hint = s.hint!;
	const end = hint.end === "top" ? "ayrton-senna" : "lewis-hamilton";
	assert.equal(g.drivers[hint.from].id, end);
	assert.equal(distances(g, hint.to)[hint.end === "top" ? at("lewis-hamilton") : at("ayrton-senna")], 3);
	s = step(g, s, g.drivers[hint.to].id);
	assert.equal(s.hint, null);
	assert.ok(!canHint(s)); // two strikes used

	s = step(g, s, "kimi-antonelli");
	assert.ok(s.over && !s.solved);
	assert.equal(strikesUsed(s), MAX_STRIKES);

	const quit = step(g, newGame(senna()), GIVE_UP);
	assert.ok(quit.over && quit.gaveUp && !quit.solved);
	// replaying saved actions rebuilds the same game
	const actions = ["max-verstappen", "alain-prost", UNDO, HINT];
	assert.deepEqual(replay(g, senna(), actions), actions.reduce((x, a) => step(g, x, a), newGame(senna())));
});

test("share text: ends and score only", () => {
	const s = replay(g, senna(), ["alain-prost", "max-verstappen", "nico-rosberg", "michael-schumacher", "riccardo-patrese", "nigel-mansell"]);
	const text = shareText(g, s, { label: "#3", url: "https://example.test/play/chain" });
	assert.equal(text, "Pitwall Teammate chain #3\nSenna → … → Hamilton\n🔗🔗🔗🔗🔗🔗 par 4 ✓ (1 strike)\nhttps://example.test/play/chain");
	assert.ok(!/Prost|Rosberg|Mansell/.test(text));
	const lost = step(g, newGame(senna()), GIVE_UP);
	assert.match(shareText(g, lost, { label: "practice" }), /❌ par 4, not connected$/);
});

test("stats: wins by links over par", () => {
	const par = replay(g, senna(), shortestChain(g, at("ayrton-senna"), at("lewis-hamilton"))!.slice(1, -1).map((i) => g.drivers[i].id));
	assert.ok(par.solved);
	assert.equal(overPar(par), 0);
	let st = recordResult(emptyStats(), 1, par);
	st = recordResult(st, 2, step(g, newGame(senna()), GIVE_UP));
	assert.deepEqual(st.distribution, [1, 0, 0, 0]);
	assert.deepEqual([st.played, st.won, st.streak], [2, 1, 0]);
	assert.deepEqual([0, 1, 2, 3].map(bucketLabel), ["Par", "+1", "+2", "+3+"]);
});

test("search", () => {
	assert.equal(searchDrivers(g, "senna")[0].id, "ayrton-senna");
	assert.equal(searchDrivers(g, "schumacher")[0].id, "michael-schumacher");
	assert.equal(searchDrivers(g, "raikko")[0].id, "kimi-raikkonen");
});
