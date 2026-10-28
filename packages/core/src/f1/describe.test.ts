import { test } from "node:test";
import assert from "node:assert/strict";
import type { CircuitCard, DriverCard, GrandPrixCard, NationCard, RaceCard, SeasonCard, SupplierCard, TeamCard } from "./cards.ts";
import { describeEntity } from "./describe.ts";

// Made-up cards: the wording is what's tested, not anyone's real record.
const ref = (name: string) => ({ id: name.toLowerCase().replace(/ /g, "-"), name });
const driver = (o: Partial<DriverCard>): DriverCard => ({
	kind: "driver", name: "Ann Example", flag: null, nation: null, nationId: null, born: null, died: null, placeOfBirth: null,
	years: [1990, 1999], teams: [], starts: 150, wins: 0, podiums: 0, poles: 0, points: 0, bestFinish: null, titleYears: [], ...o,
});

test("drivers: champions, winners, podium finishers and the rest", () => {
	assert.equal(
		describeEntity(driver({ titleYears: [1991, 1993], wins: 31, poles: 1, podiums: 70 })),
		"Ann Example, 2-time world champion: 31 wins, 1 pole and 70 podiums from 150 starts, 1990–1999. Every race result, season and team-mate.",
	);
	assert.equal(
		describeEntity(driver({ titleYears: [1995], wins: 1, podiums: 4 })),
		"Ann Example, world champion in 1995: 1 win and 4 podiums from 150 starts, 1990–1999. Every race result, season and team-mate.",
	);
	assert.equal(describeEntity(driver({ podiums: 2 })), "Ann Example: 2 podiums from 150 starts, 1990–1999. Every race result, season and team-mate.");
	assert.equal(describeEntity(driver({ starts: 1, bestFinish: 12, years: [1961, 1961] })), "Ann Example: 1 start, best finish 12th, 1961. Every race result, season and team-mate.");
	assert.equal(describeEntity(driver({ starts: 0, years: null })), "Ann Example: 0 starts. Every race result, season and team-mate.");
	assert.match(describeEntity(driver({ starts: 9, bestFinish: 11 })), /best finish 11th/);
	assert.match(describeEntity(driver({ starts: 9, bestFinish: 2, podiums: 0 })), /best finish 2nd/);
	assert.match(describeEntity(driver({ starts: 1234, bestFinish: 23 })), /1,234 starts, best finish 23rd/);
});

test("teams: titles and wins, or just races", () => {
	const t = (o: Partial<TeamCard>): TeamCard => ({
		kind: "team", name: "Example Racing", fullName: null, flag: null, nation: null, nationId: null, years: [1970, 1985],
		drivers: [], engine: null, starts: 200, wins: 0, podiums: 0, poles: 0, titleYears: [], driverTitles: 0, ...o,
	});
	assert.equal(
		describeEntity(t({ titleYears: [1972, 1978], driverTitles: 1, wins: 40, poles: 33 })),
		"Example Racing: 2 constructors' titles, 1 drivers' title, 40 wins and 33 poles from 200 races, 1970–1985. Every season, race and driver.",
	);
	assert.equal(describeEntity(t({ podiums: 3 })), "Example Racing: 3 podiums from 200 races, 1970–1985. Every season, race and driver.");
	assert.equal(describeEntity(t({ starts: 1, years: [1980, 1980] })), "Example Racing: 1 race, 1980. Every season, race and driver.");
});

test("circuits: layout, history and most wins", () => {
	const c: CircuitCard = {
		kind: "circuit", name: "Example Park", place: "Exampleton", flag: null, nation: null, nationId: null, type: "RACE",
		length: 5.8, turns: 18, races: 40, years: [1960, 2010], topWinner: { ...ref("Ann Example"), wins: 5 }, lastWinner: null,
	};
	assert.equal(describeEntity(c), "Example Park, Exampleton: race circuit, 5.8 km, 18 turns. 40 Grands Prix (1960–2010); most wins: Ann Example (5).");
	assert.equal(
		describeEntity({ ...c, type: "STREET", length: 3.337, races: 1, years: [2001, 2001], topWinner: null, lastWinner: { ...ref("Bo Test"), year: 2001 } }),
		"Example Park, Exampleton: street circuit, 3.337 km, 18 turns. 1 Grand Prix (2001); last winner: Bo Test (2001).",
	);
	assert.equal(describeEntity({ ...c, races: 0, years: null, topWinner: null }), "Example Park, Exampleton: race circuit, 5.8 km, 18 turns.");
});

test("races: the podium and pole, or when it will be run", () => {
	const r: RaceCard = {
		kind: "race", name: "Example Grand Prix", year: 1999, round: 3, rounds: 16, date: "1999-04-11", flag: null,
		circuit: { ...ref("Example Park"), place: "Exampleton" }, laps: 60, distance: 300, upcoming: false,
		podium: [
			{ driver: ref("Ann Example"), team: ref("Example Racing"), time: null },
			{ driver: ref("Bo Test"), team: ref("Test Team"), time: null },
			{ driver: ref("Cy Sample"), team: ref("Test Team"), time: null },
		],
		pole: ref("Bo Test"), fastestLap: null, sprintWinner: null,
	};
	assert.equal(
		describeEntity(r),
		"The 1999 Example Grand Prix at Example Park, Exampleton: won by Ann Example (Example Racing) ahead of Bo Test and Cy Sample. Pole: Bo Test. Full results.",
	);
	// a name's own full stop ends the sentence; a circuit named after its town doesn't repeat it
	const jr = { ...r, podium: [r.podium[0], r.podium[1], { ...r.podium[2], driver: ref("Cy Sample Jr.") }], pole: null, circuit: { ...ref("Exampleton"), place: "Exampleton" } };
	assert.equal(describeEntity(jr), "The 1999 Example Grand Prix at Exampleton: won by Ann Example (Example Racing) ahead of Bo Test and Cy Sample Jr. Full results.");
	assert.equal(describeEntity({ ...r, upcoming: true, podium: [], pole: null }), "The 1999 Example Grand Prix, round 3 of 16, at Example Park, Exampleton, on 1999-04-11.");
});

test("seasons: champion, or the leader while it runs", () => {
	const s: SeasonCard = {
		kind: "season", year: 1999, rounds: 16, completed: 16, inProgress: false, start: null, end: null,
		champion: { ...ref("Ann Example"), points: 76 }, championTeam: ref("Example Racing"), constructorsChampion: ref("Test Team"),
		mostWins: null, winners: 6,
	};
	assert.equal(describeEntity(s), "The 1999 Formula 1 season: Ann Example won the title with Example Racing, Test Team the constructors'. 16 races, 6 different winners. Results and standings.");
	assert.equal(describeEntity({ ...s, year: 1955, constructorsChampion: null }), "The 1955 Formula 1 season: Ann Example won the title with Example Racing. 16 races, 6 different winners. Results and standings.");
	assert.equal(
		describeEntity({ ...s, inProgress: true, completed: 5, champion: { ...ref("Bo Test"), points: 1012 } }),
		"The 1999 Formula 1 season, 5 of 16 rounds run: Bo Test leads the championship on 1,012 points. Results, standings and the title fight.",
	);
});

test("engines, tyres, Grands Prix and nations", () => {
	const e: SupplierCard = {
		kind: "engine", name: "Examplex", flag: null, nation: null, nationId: null, years: [1980, 1990], races: 150, wins: 20,
		podiums: 50, poles: 10, titleYears: [1985], constructorsTitles: 2, teams: [], teamCount: 4, topDriver: null,
	};
	assert.equal(describeEntity(e), "Examplex engines in Formula 1: 20 wins, 1 drivers' title and 2 constructors' titles from 150 races with 4 teams, 1980–1990.");
	assert.equal(
		describeEntity({ ...e, kind: "tyre", wins: 0, titleYears: [], constructorsTitles: 0, teamCount: 1, years: [1981, 1981], races: 3 }),
		"Examplex tyres in Formula 1: 3 races with 1 team, 1981.",
	);

	const gp: GrandPrixCard = {
		kind: "grandPrix", name: "Example Grand Prix", flag: null, nation: null, nationId: null, years: [1950, 2000], races: 51,
		circuits: [{ ...ref("Example Park"), n: 51 }], circuitCount: 1, winners: 30, topDriver: { ...ref("Ann Example"), n: 6 },
		topTeam: { ...ref("Example Racing"), n: 12 }, lastWinner: null,
	};
	assert.equal(describeEntity(gp), "The Example Grand Prix: held 51 times (1950–2000) at Example Park. Most wins: Ann Example (6) and Example Racing (12).");
	assert.equal(describeEntity({ ...gp, circuitCount: 3, topDriver: null, topTeam: null }), "The Example Grand Prix: held 51 times (1950–2000) at 3 circuits.");

	const n: NationCard = {
		kind: "nation", name: "Exampleland", flag: null, demonym: null, drivers: 12, winners: 2, wins: 3, titles: 1, champions: [],
		constructorTitles: 0, racesHosted: 20, circuits: 2, grandsPrix: 1, topDriver: null,
	};
	assert.equal(describeEntity(n), "Exampleland in Formula 1: 12 drivers, 3 wins and 1 drivers' title; 20 Grands Prix hosted.");
	assert.equal(describeEntity({ ...n, drivers: 0, wins: 0, titles: 0, racesHosted: 0 }), "Exampleland in Formula 1.");
});
