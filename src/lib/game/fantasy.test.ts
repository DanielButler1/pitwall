import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydrate, indexData } from "../f1/dataset.ts";
import { carFor, deriveRatings, dnfAt, skillAt } from "../sim/ratings.ts";
import {
	addBlocker,
	buildFantasyData,
	challengeCatalogue,
	dailyChallenge,
	DNF,
	DRIVER_PRICE,
	driverScore,
	EMPTY_TEAM,
	FASTEST,
	FREE_PLAY,
	makePool,
	packFantasy,
	percentile,
	POLE,
	randomTeamScores,
	scoreDriverRace,
	scoreTeam,
	scoreTeamRace,
	simulateDream,
	DREAM_DEFAULTS,
	TEAMMATE,
	teamIssues,
	TOP_CAR,
	unpackFantasy,
	type Team,
} from "./fantasy.ts";

const db = indexData(hydrate(JSON.parse(readFileSync(new URL("../../../data/f1.json", import.meta.url), "utf8"))));
const R = deriveRatings(db);
const data = buildFantasyData(db, (d, t, y) => ({ skill: skillAt(R, db, d, y), car: carFor(R, t, d, y), dnf: dnfAt(R, t, y) }));
const pool = makePool(data);
const ds = (id: string) => pool.ds.get(id)!;

test("race scoring applies one table to every era", () => {
	// win from pole with fastest lap, best car of the team, from P1: 25 + 5 + 3 + 3
	assert.equal(scoreDriverRace([1, 1, 1, POLE | FASTEST | TEAMMATE | TOP_CAR]).total, 36);
	// P5 from P15: 10 + 10 gained (capped)
	assert.equal(scoreDriverRace([1, 5, 22, TEAMMATE]).total, 20);
	// P10 from P2: 1 - 5 (loss capped)
	assert.equal(scoreDriverRace([1, 10, 2, 0]).total, -4);
	assert.equal(scoreDriverRace([1, DNF, 3, 0]).total, -10);
	assert.equal(scoreTeamRace([1, 1, 2, POLE]).total, 25 + 18 + 5);
	assert.equal(scoreTeamRace([1, 3, DNF, 0]).total, 15 - 10);
});

test("seasons are normalised per race, so dominant seasons of every era score alike", () => {
	const ascari = driverScore(data, ds("alberto-ascari@1952"));
	const max = driverScore(data, ds("max-verstappen@2023"));
	assert.equal(ascari.rounds, 7, "the Indianapolis 500 is not a scored round");
	assert.ok(max.rounds >= 22);
	assert.ok(Math.abs(ascari.total - max.total) < 150, `${ascari.total} vs ${max.total}`);
	assert.ok(ascari.total > 450 && max.total > 450);
});

test("prices follow the season's standing, across eras", () => {
	for (const s of data.ds) assert.ok(s.p >= DRIVER_PRICE.min && s.p <= DRIVER_PRICE.max && (s.p * 2) % 1 === 0, s.id);
	for (const id of ["alberto-ascari@1952", "jim-clark@1963", "max-verstappen@2023"]) assert.ok(ds(id).p >= 30, `${id} ${ds(id).p}`);
	assert.ok(ds("sergio-perez@2023").p < ds("max-verstappen@2023").p);
	assert.ok(ds("logan-sargeant@2023").p <= 6);
	assert.ok(pool.cs.get("red-bull@2023")!.p >= 25);
	// one season per driver per year, completed seasons only
	assert.equal(new Set(data.ds.map((s) => s.id)).size, data.ds.length);
	assert.ok(data.to < 2026 || !db.racesByYear.get(data.to)!.some((r) => !db.resultsByRace.has(r.id)));
});

test("the packed file round-trips", () => {
	const file = JSON.parse(JSON.stringify(packFantasy(data)));
	assert.deepEqual(unpackFantasy(file), data);
});

test("team rules: budget, one season per driver, constraints", () => {
	const team: Team = { drivers: ["max-verstappen@2023", "jim-clark@1963", "sergio-perez@2023"], constructor: null, captain: null };
	assert.match(addBlocker(pool, team, FREE_PLAY, ds("ayrton-senna@1988")) ?? "", /budget/);
	assert.match(addBlocker(pool, team, FREE_PLAY, ds("max-verstappen@2022")) ?? "", /Already/);
	const decades = { ...FREE_PLAY, constraints: [{ kind: "decades" as const }] };
	assert.match(addBlocker(pool, { ...EMPTY_TEAM, drivers: ["jim-clark@1963"] }, decades, ds("graham-hill@1962")) ?? "", /1960s/);
	const seventies = { ...FREE_PLAY, constraints: [{ kind: "years" as const, from: 1970, to: 1979 }] };
	assert.ok(addBlocker(pool, EMPTY_TEAM, seventies, ds("max-verstappen@2023")));
	assert.deepEqual(teamIssues(pool, team, FREE_PLAY), ["Pick 2 more drivers", "Pick a constructor"]);
});

test("team score: drivers, captain double, constructor", () => {
	const team: Team = { drivers: ["max-verstappen@2023", "logan-sargeant@2023"], constructor: "red-bull@2023", captain: "max-verstappen@2023" };
	const res = scoreTeam(pool, team);
	const max = driverScore(data, ds("max-verstappen@2023")).total;
	assert.equal(res.drivers[0].points, max * 2);
	assert.equal(res.total, res.drivers.reduce((a, d) => a + d.points, 0) + res.constructor!.score.total);
});

test("random benchmark is deterministic and gives sensible percentiles", () => {
	const a = randomTeamScores(pool, FREE_PLAY, 7, 400);
	assert.deepEqual(a, randomTeamScores(pool, FREE_PLAY, 7, 400));
	assert.equal(a.length, 400);
	assert.equal(percentile(a, -1e9), 0);
	assert.equal(percentile(a, 1e9), 100);
	assert.ok(percentile(a, a[200]) > 40 && percentile(a, a[200]) < 60);
	// every daily challenge has valid random teams
	for (const c of challengeCatalogue(data)) assert.ok(randomTeamScores(pool, c.rules, 1, 30).length === 30, c.id);
});

test("daily challenge is the same all day and changes the next", () => {
	const a = dailyChallenge(data, "2026-10-21");
	assert.deepEqual(a, dailyChallenge(data, "2026-10-21"));
	assert.notEqual(a.title, dailyChallenge(data, "2026-10-22").title);
	assert.equal(a.id, "daily-2026-10-21");
});

test("dream race is deterministic and full", () => {
	const team: Team = { drivers: ["max-verstappen@2023", "jim-clark@1963", "ayrton-senna@1988", "logan-sargeant@2023", "nino-farina@1950"], constructor: "mercedes@2014", captain: null };
	const a = simulateDream(pool, team, { ...DREAM_DEFAULTS, seed: 3 });
	assert.deepEqual(a, simulateDream(pool, team, { ...DREAM_DEFAULTS, seed: 3 }));
	assert.equal(a.standings.length, 5 + DREAM_DEFAULTS.rivals);
	assert.equal(a.races.length, DREAM_DEFAULTS.races);
	assert.equal(a.standings.filter((s) => s.mine).length, 5);
	// a backmarker in equal cars still trails the greats on average
	const eq = simulateDream(pool, team, { ...DREAM_DEFAULTS, cars: "equal", seed: 3 });
	const rank = (id: string) => eq.standings.findIndex((s) => s.id === id);
	assert.ok(rank("logan-sargeant@2023") > rank("ayrton-senna@1988"));
});

test("picks always leave enough budget to finish the team", () => {
	const team: Team = { drivers: ["ayrton-senna@1988", "alain-prost@1986", "nelson-piquet@1986"], constructor: null, captain: null };
	const cheap = data.ds.find((s) => s.p === 8.5 && !s.id.startsWith("ayrton") && s.d !== "alain-prost" && s.d !== "nelson-piquet")!;
	assert.match(addBlocker(pool, team, FREE_PLAY, cheap) ?? "", /too little/);
});
