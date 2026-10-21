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
