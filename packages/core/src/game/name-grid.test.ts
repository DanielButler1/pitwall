import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { rng } from "./daily.ts";
import { raceEntriesFile } from "./race-entries-data.ts";
import { unpackRaceEntries } from "./race-entries.ts";
import { ALIASES, clock, dailyGrid, driverKeys, editDistance, matchHint, tolerance, eligible, gridPool, isWin, matcher, matchName, nameKey, randomGrid, raceSlots, resultBucket, shareText, themeSlots } from "./name-grid.ts";
import { dataFile } from "../test-data.ts";

const data = unpackRaceEntries(raceEntriesFile(indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))))));
const race = (id: string) => data.byId.get(id)!;

test("pool: full grids of mostly known drivers since 1980", () => {
	const pool = gridPool(data.races);
	assert.ok(pool.length > 600 && pool.length < data.races.length, `${pool.length}`);
	assert.ok(pool.every((r) => r.year >= 1980 && r.entries.length >= 18 && r.entries.length <= 26));
	assert.ok(eligible(race("1994-2")));
	assert.ok(!eligible(race("2005-9"))); // six starters at Indianapolis
});

test("daily race is deterministic and doesn't repeat within a cycle", () => {
	const pool = gridPool(data.races);
	assert.equal(dailyGrid(data.races, 5).id, dailyGrid([...data.races].reverse(), 5).id);
	const seen = new Set<string>();
	for (let day = 0; day < pool.length; day++) seen.add(dailyGrid(data.races, day).id);
	assert.equal(seen.size, pool.length);
	const practice = randomGrid(data.races, rng(3), "1994-2");
	assert.ok(eligible(practice) && practice.id !== "1994-2");
});

test("slots: grid labels and team clues", () => {
	const slots = raceSlots(race("1994-2"));
	assert.equal(slots.length, 26);
	assert.deepEqual([slots[0].label, slots[0].clue, slots[0].driver.id], ["P1", "Williams", "ayrton-senna"]);
	assert.equal(slots[1].label, "P2");
	const champs = themeSlots(data.themes[0]);
	assert.deepEqual([champs[0].label, champs[0].clue], ["1", "1950 · 1 title"]);
});

test("keys: accents, spaces, suffixes", () => {
	assert.equal(nameKey("Kimi Räikkönen"), "kimiraikkonen");
	assert.equal(nameKey("Jean-Éric Vergne"), "jeanericvergne");
	const sainz = driverKeys({ id: "carlos-sainz-jr", name: "Carlos Sainz Jr.", first: "Carlos", last: "Sainz Jr.", flag: "ES", starts: 200 });
	assert.ok(sainz.full.includes("carlossainz") && sainz.full.includes("carlossainzjr"));
	assert.deepEqual(sainz.surname.sort(), ["sainz", "sainzjr"]);
});

const fake = (id: string, name: string, first: string, last: string) => ({ driver: { id, name, first, last, flag: null, starts: 1 }, label: id, clue: "" });
const setup = (slots: ReturnType<typeof raceSlots>) => {
	const m = matcher(slots);
	const at = (id: string) => {
		const i = slots.findIndex((s) => s.driver.id === id);
		assert.ok(i >= 0, id);
		return i;
	};
	const named = (...ids: string[]) => new Set(ids.map(at));
	const is = (input: string, id: string, done = new Set<number>(), wait = false) => {
		const r = matchName(m, input, done);
		assert.ok(r.kind === "hit" && r.index === at(id) && r.wait === wait, `${input} → ${JSON.stringify(r)}`);
	};
	const kind = (input: string, k: string, done = new Set<number>()) => assert.equal(matchName(m, input, done).kind, k, input);
	return { m, at, named, is, kind };
};

test("matching: surname if unique, full name always, waits for longer names", () => {
	const { m, at, named, is, kind } = setup(raceSlots(race("1997-1"))); // both Schumachers
	is("Villeneuve", "jacques-villeneuve");
	is("  jacques VILLENEUVE ", "jacques-villeneuve");
	assert.deepEqual(matchName(m, "schumacher", new Set()), { kind: "ambiguous", count: 2 });
	is("Ralf Schumacher", "ralf-schumacher");
	is("Michael Schumacher", "michael-schumacher");
	// once one Schumacher is named the surname is unique again, but only on Enter
	assert.deepEqual(matchName(m, "schumacher", named("michael-schumacher")), { kind: "hit", index: at("ralf-schumacher"), wait: true, reason: "other" });
	assert.deepEqual(matchName(m, "schumacher", named("michael-schumacher", "ralf-schumacher")), { kind: "named", index: at("michael-schumacher") });
	assert.deepEqual(matchName(m, "villeneuve", named("jacques-villeneuve")), { kind: "named", index: at("jacques-villeneuve") });
	kind("v", "none");
	kind("villen", "none"); // a prefix isn't a name
	kind("Häkkinen", "hit");
	kind("HAKKINEN", "hit");

	// "Hill" is also the start of "Hillier": fill only on Enter
	const f = matcher([fake("a", "Damon Hill", "Damon", "Hill"), fake("b", "Joe Hillier", "Joe", "Hillier")]);
	assert.deepEqual(matchName(f, "hill", new Set()), { kind: "hit", index: 0, wait: true, reason: "prefix" });
	assert.deepEqual(matchName(f, "hill", new Set([1])), { kind: "hit", index: 0, wait: false });
	assert.deepEqual(matchName(f, "damon hill", new Set()), { kind: "hit", index: 0, wait: false });
});

test("matching: accents, case, punctuation, suffixes and particles", () => {
	const { is } = setup(raceSlots(race("2000-1")));
	is("frentzen", "heinz-harald-frentzen");
	is("Heinz Harald Frentzen", "heinz-harald-frentzen");
	is("heinz-harald frentzen", "heinz-harald-frentzen");
	is("Harald Frentzen", "heinz-harald-frentzen"); // either first name + surname
	is("de la Rosa", "pedro-de-la-rosa");
	is("DelaRosa", "pedro-de-la-rosa");
	is("Pedro Rosa", "pedro-de-la-rosa"); // particles may be left out
	is("Rosa", "pedro-de-la-rosa");
	is("hakkinen", "mika-hakkinen");
	is("Mika Häkkinen.", "mika-hakkinen");
	is("Marc Gené", "marc-gene");
	is("gene", "marc-gene");
	assert.equal(nameKey("O'Connell"), "oconnell");
	assert.equal(nameKey("Kevin Magnussen Jr."), "kevinmagnussenjr");
	assert.equal(nameKey("Bjørn Wirdheim"), "bjornwirdheim");

	const sainz = setup(raceSlots(race(data.races.find((r) => r.entries.some((e) => e.driver.id === "carlos-sainz-jr"))!.id)));
	sainz.is("Sainz", "carlos-sainz-jr");
	sainz.is("Sainz Jr.", "carlos-sainz-jr");
	sainz.is("carlos sainz jr", "carlos-sainz-jr");
	sainz.is("Carlos Sainz", "carlos-sainz-jr");

	// Piquet Sr. and Jr. in the same list: the bare full name is ambiguous, the suffix settles it
	const p = matcher([fake("nelson-piquet", "Nelson Piquet", "Nelson", "Piquet"), fake("nelson-piquet-jr", "Nelson Piquet Jr.", "Nelson", "Piquet Jr.")]);
	assert.deepEqual(matchName(p, "Nelson Piquet", new Set()), { kind: "ambiguous", count: 2 });
	assert.deepEqual(matchName(p, "Piquet", new Set()), { kind: "ambiguous", count: 2 });
	assert.deepEqual(matchName(p, "Piquet Jr", new Set()), { kind: "hit", index: 1, wait: false });
	assert.deepEqual(matchName(p, "nelson piquet jr.", new Set()), { kind: "hit", index: 1, wait: false });
});

test("matching: short forms only when unique", () => {
	const champs = setup(themeSlots(data.themes.find((t) => t.id === "champions")!));
	champs.is("Ayrton", "ayrton-senna");
	champs.is("Nigel", "nigel-mansell");
	champs.is("Schumi", "michael-schumacher");
	champs.is("Seb", "sebastian-vettel");
	champs.is("Mika", "mika-hakkinen");
	champs.kind("Michael", "none"); // first names aren't accepted in general
	champs.kind("Graham", "none");
	// three Hills, two Rosbergs, two Villeneuves? (only Jacques is a champion)
	assert.deepEqual(matchName(champs.m, "Hill", new Set()), { kind: "ambiguous", count: 3 });
	champs.is("Damon Hill", "damon-hill");
	champs.is("Graham Hill", "graham-hill");
	champs.kind("Hill", "ambiguous", champs.named("damon-hill"));
	champs.is("Hill", "phil-hill", champs.named("damon-hill", "graham-hill"), true);
	champs.kind("Rosberg", "ambiguous");
	champs.is("Keke", "keke-rosberg");
	champs.is("Villeneuve", "jacques-villeneuve");

	// Mika Häkkinen and Mika Salo: "Mika" names neither
	const r2000 = setup(raceSlots(race("2000-1")));
	r2000.kind("Mika", "none");
	r2000.is("Mika", "mika-hakkinen", r2000.named("mika-salo"));
	r2000.is("Schumi", "michael-schumacher");
	r2000.is("Salo", "mika-salo");

	// two Kimis
	const kimis = matcher([fake("kimi-raikkonen", "Kimi Räikkönen", "Kimi", "Räikkönen"), fake("kimi-antonelli", "Kimi Antonelli", "Kimi", "Antonelli")]);
	assert.deepEqual(matchName(kimis, "kimi", new Set()), { kind: "ambiguous", count: 2 });
	assert.deepEqual(matchName(kimis, "kimi", new Set([1])), { kind: "hit", index: 0, wait: true, reason: "other" });

	// every alias points at a real driver
	const ids = new Set([...data.races.flatMap((r) => r.entries.map((e) => e.driver.id)), ...data.themes.flatMap((t) => t.items.map((it) => it.driver.id))]);
	for (const id of Object.keys(ALIASES)) assert.ok(ids.has(id), id);
});

test("matching: small typos, unique and not closer to a named driver", () => {
	assert.deepEqual([tolerance(4), tolerance(5), tolerance(7), tolerance(8), tolerance(14)], [0, 1, 1, 2, 2]);
	assert.equal(editDistance("barichello", "barrichello", 2), 1);
	assert.equal(editDistance("hakinnen", "hakkinen", 2), 2);
	assert.equal(editDistance("sennna", "senna", 1), 1);
	assert.equal(editDistance("alesi", "alise", 1), 2);
	assert.equal(editDistance("abcdef", "uvwxyz", 2), 3);
	assert.equal(editDistance("prots", "prost", 1), 1); // a swap is one edit

	const { m, at, named, is, kind } = setup(raceSlots(race("2000-1")));
	is("Barichello", "rubens-barrichello", new Set(), true); // 11 letters: up to 2 typos, on Enter
	is("Fisichela", "giancarlo-fisichella", new Set(), true);
	is("Coulthart", "david-coulthard", new Set(), true);
	is("Hakinnen", "mika-hakkinen", new Set(), true);
	is("Trully", "jarno-trulli", new Set(), true); // 6 letters: 1 typo
	is("Alessi", "jean-alesi", new Set(), true);
	is("Micheal Schumacher", "michael-schumacher", new Set(), true);
	assert.deepEqual(matchName(m, "Barichello", new Set()), { kind: "hit", index: at("rubens-barrichello"), wait: true, reason: "fuzzy" });
	kind("Trulyy", "none"); // 2 typos on a 6-letter name
	kind("Alise", "none"); // 5 letters: one typo only (this is two)
	kind("Zonte", "hit"); // Zonta, 5 letters
	kind("Gena", "none"); // under 5 letters: exact only
	kind("Wurtz", "none"); // Wurz has 4 letters: exact only
	is("Alexander Wurtz", "alexander-wurz", new Set(), true);
	// "Shumacher" is one typo from both Schumachers
	kind("Shumacher", "ambiguous");
	// ... and still not Ralf once Michael is named: it's as close to Michael
	assert.deepEqual(matchName(m, "Shumacher", named("michael-schumacher")), { kind: "named", index: at("michael-schumacher") });
	is("Ralf Shumacher", "ralf-schumacher", named("michael-schumacher"), true);
	// a typo of a named driver says so rather than picking someone else
	assert.deepEqual(matchName(m, "Barichelo", named("rubens-barrichello")), { kind: "named", index: at("rubens-barrichello") });
	kind("Verstapen", "hit"); // only Jos in this race
});

test("hints never give away a driver still to name", () => {
	const slots = themeSlots(data.themes.find((t) => t.id === "champions")!);
	const m = matcher(slots);
	const hill = matchHint(matchName(m, "Hill", new Set()), "Hill", slots)!;
	assert.match(hill, /Which one\? 3 drivers/);
	assert.ok(!/Damon|Graham|Phil/.test(hill));
	assert.equal(matchHint(matchName(m, "Barichello", new Set()), "x", slots), null); // not a champion
	assert.equal(matchHint(matchName(m, "Senna", new Set()), "Senna", slots), null);
	assert.match(matchHint(matchName(m, "Raikonen", new Set()), "Raikonen", slots)!, /Enter/);
	const named = new Set([slots.findIndex((s) => s.driver.id === "ayrton-senna")]);
	assert.equal(matchHint(matchName(m, "senna", named), "senna", slots), "Ayrton Senna is already named.");
});

test("a surname (or a one-typo surname) never names someone else", () => {
	const lists = [...gridPool(data.races).map(raceSlots), ...data.themes.map(themeSlots)];
	for (const slots of lists) {
		const m = matcher(slots);
		slots.forEach((s, i) => {
			const last = s.driver.last;
			const typo = last.length >= 5 ? last.slice(0, 2) + last[3] + last[2] + last.slice(4) : last; // swap two letters
			for (const q of [last, typo]) {
				const r = matchName(m, q, new Set());
				assert.ok(r.kind !== "hit" || r.index === i || nameKey(slots[r.index].driver.last) === nameKey(q), `${s.driver.name}: "${q}" → ${JSON.stringify(r)}`);
			}
		});
	}
});

test("every starter in the pool can be named by full name", () => {
	for (const r of gridPool(data.races)) {
		const slots = raceSlots(r);
		const m = matcher(slots);
		slots.forEach((s, i) => {
			const res = matchName(m, s.driver.name, new Set());
			assert.ok(res.kind === "hit" && res.index === i, `${r.id} ${s.driver.name}`);
		});
	}
});

test("clock, share text, stats", () => {
	assert.equal(clock(161_000), "2:41");
	assert.equal(clock(180_000), "3:00");
	assert.equal(clock(400), "0:01");
	assert.equal(clock(-5), "0:00");
	assert.equal(
		shareText({ label: "#3", title: "1994 Pacific GP", named: 21, total: 26, ms: 161_000, url: "https://pitwall.phaseo.app/play/name-the-grid" }),
		"Pitwall Name the grid #3 · 1994 Pacific GP · 21/26 in 2:41\nhttps://pitwall.phaseo.app/play/name-the-grid",
	);
	assert.ok(isWin(13, 26) && !isWin(12, 26));
	assert.equal(resultBucket(26, 26), 10);
	assert.equal(resultBucket(21, 26), 8);
});
