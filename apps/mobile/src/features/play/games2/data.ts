// The game files the website downloads (/data/grid.json, chain.json, higher-lower.json,
// race-entries.json), built on the phone from the dataset with the same core builders the
// website's build script uses, then unpacked the way the website does (kit/data.ts runs them once
// per Db).
//
// Fantasy is the exception: its prices need the simulator's ratings (deriveRatings), which take
// too long on a phone, so the app downloads the website's fantasy.json instead.

import type { Db } from "@pitwall/core/f1/dataset";
import { chainFile } from "@pitwall/core/game/chain-data";
import { unpack as unpackChain, type Graph } from "@pitwall/core/game/chain";
import { makePool, unpackFantasy, type FantasyFile, type Pool } from "@pitwall/core/game/fantasy";
import { gridFile } from "@pitwall/core/game/grid-data";
import { indexGrid, type GridData } from "@pitwall/core/game/grid";
import { higherLowerFile } from "@pitwall/core/game/higher-lower-data";
import { unpack as unpackEntity, type Entity } from "@pitwall/core/game/higher-lower";
import { raceEntriesFile } from "@pitwall/core/game/race-entries-data";
import { unpackRaceEntries, type RaceData } from "@pitwall/core/game/race-entries";
import { dbLoader, useDataFile } from "@/features/play/kit";

/** Logs how long a build took in development, to keep an eye on the slow ones. */
const timed =
	<T,>(label: string, build: (db: Db) => T) =>
	(db: Db): T => {
		const start = Date.now();
		const v = build(db);
		if (__DEV__) console.log(`[games2] ${label} built in ${Date.now() - start} ms`);
		return v;
	};

export const gridLoader = dbLoader(timed("grid", (db): GridData => indexGrid(gridFile(db))));
export const chainLoader = dbLoader(timed("chain", (db): Graph => unpackChain(chainFile(db))));
export type HigherLowerData = { entities: Entity[]; lapsFrom: number };
export const higherLowerLoader = dbLoader(
	timed("higher-lower", (db): HigherLowerData => {
		const f = higherLowerFile(db);
		return { entities: f.entities.map(unpackEntity), lapsFrom: f.lapsFrom };
	}),
);
export const raceLoader = dbLoader(timed("race-entries", (db): RaceData => unpackRaceEntries(raceEntriesFile(db))));

const toPool = (f: FantasyFile): Pool => makePool(unpackFantasy(f));
/** The fantasy pool, from the website's file (see the note at the top). */
export const useFantasyPool = () => useDataFile("fantasy.json", toPool);
