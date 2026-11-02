import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "./dataset.ts";
import { applyUniverse } from "../universe/apply.ts";
import { allCards, allMoreCards, allRaceCards, circuitCard, driverCard, entityCard, grandPrixCard, nationCard, raceCard, seasonCard, supplierCard, teamCard } from "./cards.ts";
import { expandRaceCard } from "./cards-expand.ts";
import { dataFile } from "../test-data.ts";

const base = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));

test("driver and team cards", () => {
	const senna = driverCard(base, "ayrton-senna")!;
	assert.deepEqual(senna.titleYears, [1988, 1990, 1991]);
	assert.equal(senna.wins, 41);
	assert.equal(senna.died, "1994-05-01");
	assert.deepEqual(senna.teams.map((t) => t.id), ["williams"]);

	const ferrari = teamCard(base, "ferrari")!;
	assert.ok(ferrari.titleYears.includes(2008));
	assert.ok(ferrari.driverTitles >= 15);
});

test("cards file covers every driver who raced", () => {
	const cards = allCards(base);
	assert.ok(Object.keys(cards.d).length > 750);
});

test("cards follow a universe's results", () => {
	const race = base.races.find((r) => r.year === 2021 && r.round === 22)!;
	const order = base.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]]; // Hamilton wins Abu Dhabi 2021
	const db = applyUniverse(base, { id: "cards", updatedAt: 1, changes: [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }] });
	assert.ok(driverCard(db, "lewis-hamilton")!.titleYears.includes(2021));
	assert.ok(!driverCard(db, "max-verstappen")!.titleYears.includes(2021));
	assert.equal(circuitCard(db, "yas-marina")!.lastWinner?.year, circuitCard(base, "yas-marina")!.lastWinner?.year);
});

test("race cards pack and unpack to the full card", () => {
	const packed = allRaceCards(base);
	assert.equal(Object.keys(packed).length, base.races.length);
	const cards = allCards(base);
	for (const key of ["2007-17", "2021-22", "1950-1"]) assert.deepEqual(expandRaceCard(key, packed[key], cards), raceCard(base, key));
	const brazil = raceCard(base, "2007-17")!;
	assert.deepEqual(brazil.podium.map((p) => p.driver.id), ["kimi-raikkonen", "felipe-massa", "fernando-alonso"]);
	assert.equal(brazil.pole?.id, "felipe-massa");
});

test("engine and tyre cards", () => {
	const more = allMoreCards(base);
	const engines = Object.values(more.e);
	const ferrari = supplierCard(base, "engine", "ferrari")!;
	assert.equal(ferrari.years?.[0], 1950);
	assert.ok(ferrari.titleYears.includes(2007) && ferrari.constructorsTitles >= 16);
	assert.ok(ferrari.teamCount > ferrari.teams.length);
	// a supplier's teams are its winning teams, most wins first
	for (const e of engines) for (let i = 1; i < e.teams.length; i++) assert.ok(e.teams[i - 1].n >= e.teams[i].n);
	assert.ok(Object.values(more.y).some((t) => t.name === "Pirelli" && t.titleYears.includes(2021)));
});

test("Grand Prix cards", () => {
	const gb = grandPrixCard(base, "great-britain")!;
	assert.equal(gb.name, "British Grand Prix");
	const held = base.races.filter((r) => r.grandPrixId === "great-britain" && base.resultsByRace.has(r.id)).map((r) => r.year);
	assert.ok(gb.circuits.some((c) => c.id === "brands-hatch"));
	assert.equal(gb.lastWinner?.year, held[held.length - 1]);
});

test("nation cards", () => {
	const more = allMoreCards(base);
	const nations = Object.entries(more.n);
	const uk = nationCard(base, "united-kingdom")!;
	assert.equal(uk.flag, "GB");
	assert.equal(uk.champions.reduce((a, c) => a + c.years.length, 0), uk.titles);
	assert.ok(uk.champions.some((c) => c.id === "jim-clark" && c.years.join() === "1963,1965"));
	assert.ok(uk.racesHosted >= 77 && uk.grandsPrix >= 2);
	// every driver who raced belongs to a nation card
	assert.equal(nations.reduce((a, [, n]) => a + n.drivers, 0), Object.keys(allCards(base).d).length);
});

test("season cards", () => {
	const s2021 = seasonCard(base, "2021")!;
	assert.equal(s2021.champion?.id, "max-verstappen");
	assert.equal(s2021.championTeam?.id, "red-bull");
	assert.equal(s2021.constructorsChampion?.id, "mercedes");
	assert.equal(s2021.rounds, 22);
	assert.equal(s2021.mostWins?.id, "max-verstappen");
	assert.equal(s2021.start, "2021-03-28");
	assert.equal(seasonCard(base, "1949"), null);
	assert.equal(Object.keys(allMoreCards(base).s).length, base.years.length);
});

test("more cards follow a universe", () => {
	const race = base.races.find((r) => r.year === 2021 && r.round === 22)!;
	const order = base.resultsByRace.get(race.id)!.filter((r) => r.position != null).map((r) => r.driverId);
	[order[0], order[1]] = [order[1], order[0]];
	const db = applyUniverse(base, { id: "more", updatedAt: 1, changes: [{ id: "a", kind: "race-edit", raceId: race.id, order, retired: [] }] });
	assert.equal((entityCard(db, "season", "2021") as ReturnType<typeof seasonCard>)?.champion?.id, "lewis-hamilton");
	const uk = entityCard(db, "nation", "united-kingdom") as ReturnType<typeof nationCard>;
	assert.equal(uk?.titles, nationCard(base, "united-kingdom")!.titles + 1);
	assert.equal(entityCard(db, "grandPrix", "abu-dhabi")?.kind, "grandPrix");
	assert.equal(entityCard(db, "engine", "mercedes")?.kind, "engine");
});
