// Long-run behaviour of the history simulator. These are the failure modes of
// an earlier version of the engine: dead or 80-year-old drivers winning titles,
// one driver in two cars, ratings inflating and converging, a handful of teams
// winning forever, and non-deterministic runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completedRaces, hydrate, indexData, isStart, type Db } from "../f1/dataset.ts";
import { applyUniverse, type Change, type UniverseDb } from "../universe/apply.ts";
import { constructorView, driverView, homeView, raceView, seasonsView, seasonView } from "../f1/views.ts";
import { simulateHistory, type HistoryOutput } from "./history.ts";
import { ageAt } from "./invariants.ts";
import { buildModifiers } from "./modifiers.ts";
import { deriveRatings } from "./ratings.ts";
import { dataFile } from "../test-data.ts";

const base = indexData(hydrate(JSON.parse(readFileSync(dataFile, "utf8"))));
deriveRatings(base);
const LAST = base.meta.lastCompletedYear;
let n = 0;
const apply = (changes: Omit<Change, "id">[]) => applyUniverse(base, { id: `h${n++}`, updatedAt: 1, changes: changes.map((c, i) => ({ id: `c${i}`, ...c }) as Change) });
const history = (fromYear: number, toYear: number, seed: number, mode: "dynamic" | "real-grids" = "dynamic"): Omit<Change, "id"> =>
	({ kind: "history-sim", fromYear, toYear, seed, chaos: 1, reliability: 1, mode }) as Omit<Change, "id">;
const champion = (db: Db, y: number) => db.driverStandings.get(y)?.find((r) => r.champion)?.id ?? null;
const timed = <T>(label: string, fn: () => T): T => {
	const t = performance.now();
	const out = fn();
	console.log(`  ${label}: ${(performance.now() - t).toFixed(0)} ms`);
	return out;
};

/** Every simulated race in a universe: one car per driver, ages 17–45 (dynamic), nobody racing after their death. */
function auditRaces(db: UniverseDb, years: number[], ages: boolean) {
	const issues: string[] = [];
	let maxAge = 0;
	for (const y of years) {
		// the Indianapolis 500 (1950–60) stays as it really was, shared cars and all
		for (const race of completedRaces(db, y).filter((r) => r.grandPrixId !== "indianapolis")) {
			const seen = new Set<string>();
			for (const r of db.resultsByRace.get(race.id)!) {
				if (seen.has(r.driverId)) issues.push(`${y} ${race.round} ${r.driverId} twice`);
				seen.add(r.driverId);
				const d = db.drivers.get(r.driverId);
				if (!d) {
					issues.push(`${r.driverId} missing from drivers`);
					continue;
				}
				if (isStart(r) && d.dateOfDeath && d.dateOfDeath < race.date) issues.push(`${y} ${r.driverId} after death`);
				if (ages) {
					const a = ageAt(d.dateOfBirth, race.date)!;
					maxAge = Math.max(maxAge, a);
					if (a < 17 || a > 45) issues.push(`${y} ${r.driverId} aged ${a}`);
				}
			}
		}
	}
	return { issues, maxAge };
}

const windows = (out: HistoryOutput, size = 30) => {
	let worst = { share: 0, team: "", from: 0 };
	for (let i = 0; i + size <= out.seasons.length; i++) {
		const counts = new Map<string, number>();
		for (const s of out.seasons.slice(i, i + size)) if (s.championTeam) counts.set(s.championTeam, (counts.get(s.championTeam) ?? 0) + 1);
		for (const [team, c] of counts) if (c / size > worst.share) worst = { share: c / size, team, from: out.seasons[i].year };
	}
	return worst;
};

test("real grids 1950→last season: every real race re-run with its real entry list", () => {
	const db = timed(`real-grids 1950-${LAST}`, () => apply([history(1950, LAST, 11, "real-grids")]));
	assert.deepEqual(db.sim!.violations, []);
	assert.equal(db.sim!.years.length, LAST - 1950 + 1);
	for (const y of [1950, 1976, 2003, LAST]) {
		for (const race of completedRaces(base, y)) {
			const real = new Set(base.resultsByRace.get(race.id)!.map((r) => r.driverId));
			const sim = new Set(db.resultsByRace.get(race.id)!.map((r) => r.driverId));
			assert.deepEqual([...sim].sort(), [...real].sort(), `${y} R${race.round} entry list`);
		}
	}
	assert.equal(auditRaces(db, db.sim!.years, false).issues.length, 0);
	const changed = db.sim!.years.filter((y) => y < LAST && champion(db, y) !== champion(base, y)).length;
	assert.ok(changed > 10, `${changed} champions changed`);
});

test("dynamic 1990→last season: careers simulated from real 1989", () => {
	const db = timed(`dynamic 1990-${LAST}`, () => apply([history(1990, LAST, 5)]));
	assert.deepEqual(db.sim!.violations, []);
	const { issues } = auditRaces(db, db.sim!.years, true);
	assert.deepEqual(issues, []);
	// real pre-history is untouched
	assert.equal(champion(db, 1989), champion(base, 1989));
	// real drivers who debuted later still turn up as prospects
	const later = ["michael-schumacher", "fernando-alonso", "lewis-hamilton", "max-verstappen", "kimi-raikkonen", "sebastian-vettel"];
	assert.ok(later.filter((d) => db.resultsByDriver.get(d)?.some((r) => db.raceById.get(r.raceId)!.year >= 1990)).length >= 4);
	// Senna died in May 1994: he never races after that
	assert.ok(!(db.resultsByDriver.get("ayrton-senna") ?? []).some((r) => isStart(r) && db.raceById.get(r.raceId)!.date > "1994-05-01"));
});

test("dynamic 1950→2075: no ghosts, no 80-year-olds, one car each, stable world", () => {
	const db = timed("dynamic 1950-2075", () => apply([history(1950, 2075, 42)]));
	assert.deepEqual(db.sim!.violations, []);
	const { issues, maxAge } = auditRaces(db, db.sim!.years, true);
	assert.deepEqual(issues.slice(0, 5), []);
	assert.ok(maxAge <= 45, `oldest driver ${maxAge}`);
	// the site sees the future
	assert.equal(db.meta.lastCompletedYear, 2075);
	assert.equal(completedRaces(db, 2075).length, completedRaces(db, 2075).length && (db.racesByYear.get(2075)?.length ?? 0));
	assert.ok(champion(db, 2075));
	const ids = new Set(base.races.map((r) => r.id));
	for (const r of db.races.filter((r) => r.year > LAST)) {
		assert.ok(!ids.has(r.id), `race id ${r.id} collides with reality`);
		assert.equal(r.date.slice(0, 4), String(r.year));
	}
	// generated people and teams are real entities with pages
	const generated = [...db.drivers.keys()].filter((id) => id.startsWith("sim-42-"));
	assert.ok(generated.length > 30);
	const fictionalChamp = [...db.driverStandings].filter(([y]) => y > LAST).map(([, rows]) => rows.find((r) => r.champion)!.id).find((id) => id.startsWith("sim-"));
	if (fictionalChamp) assert.ok(driverView(db, fictionalChamp, base));
	const team = db.resultsByRace.get(db.racesByYear.get(2075)![0].id)![0].constructorId;
	assert.ok(constructorView(db, team, base));
	assert.ok(homeView(db).champion);
	assert.equal(seasonsView(db, base).rows[0].year, 2075);
	assert.ok(seasonView(db, 2075, base)!.completed);
	assert.ok(raceView(db, 2075, 1, base)!.results.length >= 20);
	// grid sizes stay put after the real data ends
	const grids = db.sim!.seasons.filter((s) => s.year > LAST).map((s) => s.grid);
	assert.ok(Math.min(...grids) >= 20 && Math.max(...grids) <= 24, `future grids ${Math.min(...grids)}–${Math.max(...grids)}`);
});

test("deterministic per seed, different across seeds (ids included)", () => {
	const run = (seed: number) => simulateHistory(base, { fromYear: 1980, toYear: 2060, seed, chaos: 1, reliability: 1, mode: "dynamic" }, buildModifiers([]));
	const sig = (o: HistoryOutput) => JSON.stringify([o.seasons.map((s) => [s.champion, s.constructorChampion]), o.drivers.map((d) => [d.id, d.name, d.dateOfBirth]), [...o.results.values()].slice(-3)]);
	const a = run(9);
	// a fresh run (bypassing the memo) produces the same world
	const b = simulateHistory(base, { fromYear: 1980, toYear: 2060, seed: 9, chaos: 1, reliability: 1, mode: "dynamic", anchor: 0.35 }, buildModifiers([]));
	assert.notEqual(a, b);
	assert.equal(sig(a), sig(b));
	assert.notEqual(sig(a), sig(run(10)));
	assert.ok(a.drivers.every((d) => /^sim-9-\d+$/.test(d.id)));
});

test("champions stay spread out over 125 years, ratings don't drift or collapse", () => {
	const stats = [];
	for (const seed of [1, 2, 3, 4, 5, 6]) {
		const out = simulateHistory(base, { fromYear: 1950, toYear: 2075, seed, chaos: 1, reliability: 1, mode: "dynamic" }, buildModifiers([]));
		assert.deepEqual(out.violations, []);
		const titles = new Map<string, number>();
		for (const s of out.seasons) if (s.champion) titles.set(s.champion, (titles.get(s.champion) ?? 0) + 1);
		const maxTitles = Math.max(...titles.values());
		const worst = windows(out);
		const decade = (from: number, to: number, key: "skillMean" | "skillSd") => {
			const xs = out.seasons.filter((s) => s.year >= from && s.year < to).map((s) => s[key]);
			return xs.reduce((a, b) => a + b, 0) / xs.length;
		};
		const realMean = decade(1990, 2020, "skillMean");
		const realSd = decade(1990, 2020, "skillSd");
		const future = [2030, 2040, 2050, 2060].map((d) => ({ mean: decade(d, d + 10, "skillMean"), sd: decade(d, d + 10, "skillSd") }));
		stats.push({ seed, maxTitles, worst: `${worst.team}@${worst.from} ${(worst.share * 100).toFixed(0)}%`, realSd: realSd.toFixed(1), futureSd: future.map((f) => f.sd.toFixed(1)).join("/") });
		assert.ok(maxTitles <= 10, `seed ${seed}: one driver won ${maxTitles} titles`);
		assert.ok(worst.share <= 0.4, `seed ${seed}: ${worst.team} won ${(worst.share * 100).toFixed(0)}% of titles from ${worst.from}`);
		for (const f of future) {
			assert.ok(Math.abs(f.mean - realMean) < 7, `seed ${seed}: skill mean drifted ${realMean.toFixed(1)} -> ${f.mean.toFixed(1)}`);
			assert.ok(f.sd > realSd * 0.55 && f.sd < realSd * 1.5, `seed ${seed}: skill spread ${realSd.toFixed(1)} -> ${f.sd.toFixed(1)}`);
		}
		// distinct champions keep coming
		const lateChamps = new Set(out.seasons.filter((s) => s.year > 2035).map((s) => s.champion));
		assert.ok(lateChamps.size >= 8, `seed ${seed}: only ${lateChamps.size} champions after 2035`);
	}
	console.table(stats);
});

test("performance changes reach every simulated race", () => {
	// Minardi 2001 given a car 50 points (half the field) faster
	const year = 2001;
	const plain = apply([history(year, year, 3, "real-grids")]);
	const boosted = apply([history(year, year, 3, "real-grids"), { kind: "team-performance", constructorId: "minardi", fromYear: year, toYear: year, delta: 50 } as Omit<Change, "id">]);
	const podiums = (db: Db, team: string) =>
		completedRaces(db, year).reduce((a, r) => a + db.resultsByRace.get(r.id)!.filter((x) => x.constructorId === team && x.position != null && x.position <= 3).length, 0);
	assert.equal(podiums(plain, "minardi"), 0);
	// the car becomes the fastest on the grid, but Alonso (19) and Marques still aren't Schumacher
	const pts = (db: Db) => db.constructorStandings.get(year)!.find((r) => r.id === "minardi")!.points;
	assert.ok(podiums(boosted, "minardi") >= 2 && pts(boosted) >= 15, `minardi ${podiums(boosted, "minardi")} podiums, ${pts(boosted)} pts`);
	// a driver boost works in race-sim and season-sim alike
	const heidfeld = { kind: "driver-performance", driverId: "nick-heidfeld", fromYear: year, toYear: year, delta: 30 } as Omit<Change, "id">;
	const race = completedRaces(base, year)[3];
	const grid = (db: Db) => db.resultsByRace.get(race.id)!.find((r) => r.driverId === "nick-heidfeld")!.grid!;
	const sim = { kind: "race-sim", raceId: race.id, seed: 1, chaos: 1, reliability: 0 } as Omit<Change, "id">;
	assert.ok(grid(apply([sim, heidfeld])) < grid(apply([sim])) - 5, "boosted Heidfeld qualifies much higher");
	const season = { kind: "season-sim", year, fromRound: 1, seed: 1, chaos: 1, reliability: 1 } as Omit<Change, "id">;
	const points = (db: Db) => db.driverStandings.get(year)!.find((r) => r.id === "nick-heidfeld")!.points;
	assert.ok(points(apply([season, heidfeld])) > points(apply([season])) + 10);
});

test("seat swaps: real grids put the driver in the other car", () => {
	const db = apply([{ kind: "driver-swap", year: 1988, driverA: "ayrton-senna", driverB: "philippe-streiff" } as Omit<Change, "id">]);
	const teams = (id: string) => new Set(completedRaces(db, 1988).flatMap((r) => db.resultsByRace.get(r.id)!.filter((x) => x.driverId === id).map((x) => x.constructorId)));
	assert.deepEqual([...teams("ayrton-senna")], ["ags"]);
	assert.deepEqual([...teams("philippe-streiff")], ["mclaren"]);
	assert.ok(db.modifiedYears!.has(1988));
	assert.notEqual(champion(db, 1988), "ayrton-senna");
});

test("seats & careers shape the dynamic world", () => {
	const db = apply([
		history(2000, 2010, 4),
		{ kind: "driver-move", driverId: "fernando-alonso", constructorId: "ferrari", fromYear: 2002, toYear: 2004 } as Omit<Change, "id">,
		{ kind: "career", driverId: "michael-schumacher", retireAfter: 2002 } as Omit<Change, "id">,
		{ kind: "remove-driver", driverId: "kimi-raikkonen", fromYear: 2000, toYear: 2010 } as Omit<Change, "id">,
	]);
	const teamsIn = (id: string, y: number) => new Set(completedRaces(db, y).flatMap((r) => db.resultsByRace.get(r.id)!.filter((x) => x.driverId === id).map((x) => x.constructorId)));
	for (const y of [2002, 2003, 2004]) assert.deepEqual([...teamsIn("fernando-alonso", y)], ["ferrari"]);
	for (const y of [2003, 2005, 2008]) assert.equal(teamsIn("michael-schumacher", y).size, 0);
	assert.ok(!(db.resultsByDriver.get("kimi-raikkonen") ?? []).some((r) => db.raceById.get(r.raceId)!.year <= 2010));
	assert.deepEqual(db.sim!.violations, []);
	// Fangio can't be forced into a 2005 car at 94
	const old = apply([history(2000, 2006, 4), { kind: "driver-move", driverId: "juan-manuel-fangio", constructorId: "ferrari", fromYear: 2005, toYear: 2005 } as Omit<Change, "id">]);
	assert.deepEqual(old.sim!.violations, []);
	assert.ok(!(old.resultsByDriver.get("juan-manuel-fangio") ?? []).some((r) => old.raceById.get(r.raceId)!.year === 2005));
});
