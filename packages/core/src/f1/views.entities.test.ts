import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { applyUniverse } from "../universe/apply.ts";
import {
	constructorView,
	driverView,
	engineView,
	enginesView,
	grandPrixView,
	grandsPrixView,
	nationView,
	nationsView,
	raceView,
	searchIndex,
	seasonView,
	tyreView,
	tyresView,
} from "./views.ts";
import { dataFile } from "../test-data.ts";

const base = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));

test("Monaco GP: races, circuits and editions", () => {
	const v = grandPrixView(base, "monaco")!;
	assert.ok(v.totals.races >= 70);
	assert.ok(v.circuits.some((c) => c.circuit.id === "monaco"));
	const edition = v.editions.find((e) => e.race.year === 1988)!;
	assert.equal(edition.winner?.id, "alain-prost");
	assert.equal(edition.pole?.id, "ayrton-senna");
});

test("Grands Prix index lists every GP with a most successful driver", () => {
	const v = grandsPrixView(base);
	const monaco = v.rows.find((r) => r.gp.id === "monaco")!;
	assert.equal(monaco.nation.id, "monaco");
	assert.ok(v.rows.length >= 50);
});

test("Ferrari engine has won drivers' and constructors' titles", () => {
	const v = engineView(base, "ferrari")!;
	assert.ok(v.totals.driversTitles >= 15, `drivers' titles ${v.totals.driversTitles}`);
	assert.ok(v.totals.constructorsTitles >= 16, `constructors' titles ${v.totals.constructorsTitles}`);
	assert.ok(v.titles.some((t) => t.year === 2004 && t.kind === "drivers" && t.driver?.id === "michael-schumacher"));
	assert.ok(v.seasons.find((s) => s.year === 2004)!.teams.some((t) => t.id === "ferrari"));
	assert.equal(v.nation.id, "italy");
});

test("Honda engine has more than 80 wins and powers Red Bull's 2021 title", () => {
	const v = engineView(base, "honda")!;
	assert.ok(v.totals.wins > 80, `Honda wins ${v.totals.wins}`);
	assert.equal(v.wins.length, v.totals.wins);
	// 2021 Verstappen title is credited to Honda (F1DB's engine for Red Bull that year).
	assert.ok(v.titles.some((t) => t.year === 2021 && t.kind === "drivers" && t.driver?.id === "max-verstappen"));
	const engines = enginesView(base);
	assert.ok(engines.rows.find((r) => r.supplier.id === "honda")!.wins > 80);
});

test("tyres: Goodyear and Pirelli wins and titles", () => {
	const rows = tyresView(base).rows;
	assert.ok(rows.find((r) => r.supplier.id === "goodyear")!.wins > 350);
	const v = tyreView(base, "pirelli")!;
	assert.ok(v.totals.wins > 300);
	assert.ok(v.totals.driversTitles > 10);
});

test("Brazil: 3 drivers' champions with 8 titles", () => {
	const v = nationView(base, "brazil")!;
	assert.equal(v.totals.champions, 3);
	assert.equal(v.totals.titles, 8);
	assert.deepEqual(
		[...new Set(v.champions.map((c) => c.driver.id))].sort(),
		["ayrton-senna", "emerson-fittipaldi", "nelson-piquet"],
	);
	assert.equal(v.champions.length, 8);
	assert.ok(v.grandsPrix.some((g) => g.gp.id === "brazil"));
	assert.ok(v.circuits.some((c) => c.circuit.id === "interlagos"));
	const row = nationsView(base).rows.find((r) => r.nation.id === "brazil")!;
	assert.equal(row.titles, 8);
});

test("entity references on existing pages", () => {
	const race = raceView(base, 1988, 3)!;
	assert.equal(race.grandPrix.id, "monaco");
	assert.equal(race.nation?.id, "monaco");
	assert.ok(race.results[0].engine?.id);
	assert.ok(race.tyres.length > 0);
	const season = seasonView(base, 2023)!;
	assert.equal(season.constructorStandings[0].engine?.id, "honda-rbpt");
	assert.equal(driverView(base, "ayrton-senna")!.nation.id, "brazil");
	assert.ok(driverView(base, "bruno-senna")!.relatives.some((r) => r.driver.id === "ayrton-senna" && r.relation === "Nephew of"));
	assert.ok(constructorView(base, "mclaren")!.seasons.find((s) => s.year === 1988)!.engines.some((e) => e.id === "honda"));
});

test("entity views work on a universe Db", () => {
	const race = base.races.find((r) => r.year === 2021 && r.round === 22)!;
	const order = base.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]]; // Hamilton wins Abu Dhabi 2021
	const db = applyUniverse(base, { id: "entities", updatedAt: 1, changes: [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }] });
	const merc = engineView(db, "mercedes", base)!;
	const realMerc = engineView(base, "mercedes")!;
	assert.equal(merc.totals.driversTitles, realMerc.totals.driversTitles + 1);
	assert.ok(merc.realTotals);
	assert.equal(nationView(db, "united-kingdom")!.totals.titles, nationView(base, "united-kingdom")!.totals.titles + 1);
	assert.equal(nationView(db, "netherlands")!.totals.titles, nationView(base, "netherlands")!.totals.titles - 1);
	assert.equal(grandPrixView(db, "abu-dhabi")!.editions.find((e) => e.race.year === 2021)!.winner?.id, "lewis-hamilton");
});

test("search index includes drivers and nations", () => {
	const idx = searchIndex(base);
	assert.ok(idx.some((e) => e[0] === "driver" && e[1] === "ayrton-senna"));
	assert.ok(idx.some((e) => e[0] === "nation" && e[1] === "brazil"));
});
