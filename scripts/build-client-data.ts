// Writes the header search's index (public/data/search-index.json) and the link
// hover cards (public/data/cards.json, race-cards.json, more-cards.json) as plain static files, instant even under
// `next dev`, where a route would first have to compile. Run by build-data.mjs and
// before `next dev`; the /search-index route stays as a fallback.
//
//   node --experimental-strip-types scripts/build-client-data.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hydrate, indexData } from "../src/lib/f1/dataset.ts";
import { searchIndex } from "../src/lib/f1/views.ts";
import { allCards, allMoreCards, allRaceCards } from "../src/lib/f1/cards.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = indexData(hydrate(JSON.parse(readFileSync(join(root, "data", "f1.json"), "utf8"))));
const dir = join(root, "public", "data");
mkdirSync(dir, { recursive: true });
for (const [file, data] of [
	["search-index.json", searchIndex(db)],
	["cards.json", allCards(db)],
	["race-cards.json", allRaceCards(db)],
	["more-cards.json", allMoreCards(db)],
] as const) {
	const json = JSON.stringify(data);
	writeFileSync(join(dir, file), json);
	console.log(`${file}: ${(json.length / 1024).toFixed(0)} KB`);
}

// --- Guess the driver game (/play/guess): every driver with their career teams ---
{
	const { guessFile } = await import("../src/lib/game/guess-data.ts");
	const json = JSON.stringify(guessFile(db));
	writeFileSync(join(dir, "guess.json"), json);
	console.log(`guess.json: ${(json.length / 1024).toFixed(0)} KB`);
}

// --- Fantasy: Through the Eras (/play/fantasy): priced driver- and constructor-seasons with their races ---
{
	const { buildFantasyData, packFantasy } = await import("../src/lib/game/fantasy.ts");
	const { carFor, deriveRatings, dnfAt, skillAt } = await import("../src/lib/sim/ratings.ts");
	const ratings = deriveRatings(db);
	const data = buildFantasyData(db, (driverId, teamId, year) => ({ skill: skillAt(ratings, db, driverId, year), car: carFor(ratings, teamId, driverId, year), dnf: dnfAt(ratings, teamId, year) }));
	const json = JSON.stringify(packFantasy(data));
	writeFileSync(join(dir, "fantasy.json"), json);
	console.log(`fantasy.json: ${(json.length / 1024).toFixed(0)} KB`);
}

// --- Career path (/play/career) and Higher or lower (/play/higher-lower): team stints; career counts ---
{
	const { careerFile } = await import("../src/lib/game/career-data.ts");
	const { higherLowerFile } = await import("../src/lib/game/higher-lower-data.ts");
	for (const [file, data] of [
		["career.json", careerFile(db)],
		["higher-lower.json", higherLowerFile(db)],
	] as const) {
		const json = JSON.stringify(data);
		writeFileSync(join(dir, file), json);
		console.log(`${file}: ${(json.length / 1024).toFixed(0)} KB`);
	}
}

// --- Guess the constructor (/play/constructor) and Guess the circuit (/play/circuit) ---
{
	const { constructorFile } = await import("../src/lib/game/constructor-guess-data.ts");
	const { circuitFile } = await import("../src/lib/game/circuit-guess-data.ts");
	for (const [file, data] of [
		["constructor-guess.json", constructorFile(db)],
		["circuit-guess.json", circuitFile(db)],
	] as const) {
		const json = JSON.stringify(data);
		writeFileSync(join(dir, file), json);
		console.log(`${file}: ${(json.length / 1024).toFixed(0)} KB`);
	}
}

// --- Teammate chain (/play/chain): the team-mate graph with the teams and seasons of each link ---
{
	const { chainFile } = await import("../src/lib/game/chain-data.ts");
	const json = JSON.stringify(chainFile(db));
	writeFileSync(join(dir, "chain.json"), json);
	console.log(`chain.json: ${(json.length / 1024).toFixed(0)} KB`);
}

// --- Grid of nine (/play/grid): the categories and every driver's memberships ---
{
	const { gridFile } = await import("../src/lib/game/grid-data.ts");
	const json = JSON.stringify(gridFile(db));
	writeFileSync(join(dir, "grid.json"), json);
	console.log(`grid.json: ${(json.length / 1024).toFixed(0)} KB`);
}

// --- Name the grid (/play/name-the-grid) and Race prediction (/play/predict): every race since 1980 with its grid and result ---
{
	const { raceEntriesFile } = await import("../src/lib/game/race-entries-data.ts");
	const json = JSON.stringify(raceEntriesFile(db));
	writeFileSync(join(dir, "race-entries.json"), json);
	console.log(`race-entries.json: ${(json.length / 1024).toFixed(0)} KB`);
}

// --- Guess the race (/play/race) and Lap chart mystery (/play/lap-chart): every race with its clues, and the lively lap charts ---
{
	const { raceGuessFile } = await import("../src/lib/game/race-guess-data.ts");
	const { lapChartFile } = await import("../src/lib/game/lap-chart-data.ts");
	const { existsSync } = await import("node:fs");
	const lapFile = (id: number) => join(root, "data", "laps", `${id}.json`);
	for (const [file, data] of [
		["race-guess.json", raceGuessFile(db)],
		["lap-chart.json", lapChartFile(db, (id) => (existsSync(lapFile(id)) ? JSON.parse(readFileSync(lapFile(id), "utf8")) : null))],
	] as const) {
		const json = JSON.stringify(data);
		writeFileSync(join(dir, file), json);
		console.log(`${file}: ${(json.length / 1024).toFixed(0)} KB`);
	}
}

// --- Guess the season (/play/season): every completed season with its clues and top of the standings ---
{
	const { seasonFile } = await import("../src/lib/game/season-guess-data.ts");
	const json = JSON.stringify(seasonFile(db));
	writeFileSync(join(dir, "season-guess.json"), json);
	console.log(`season-guess.json: ${(json.length / 1024).toFixed(0)} KB`);
}
