import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hydrate, indexData, type Db } from "./dataset.ts";
import type { RaceLapFile } from "./laps.ts";

let db: Db | undefined;

/** The real-history Db, loaded once per server process from data/f1.json. */
export function getDb(): Db {
	db ??= indexData(hydrate(JSON.parse(readFileSync(join(process.cwd(), "data", "f1.json"), "utf8"))));
	return db;
}

/** A race's lap chart and pit stops (data/laps/<raceId>.json, from Jolpica), or null when there are none. */
export function getRaceLaps(raceId: number): RaceLapFile | null {
	const file = join(process.cwd(), "data", "laps", `${Math.trunc(raceId)}.json`);
	if (!existsSync(file)) return null;
	return JSON.parse(readFileSync(file, "utf8")) as RaceLapFile;
}
