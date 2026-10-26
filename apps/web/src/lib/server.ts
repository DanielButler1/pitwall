import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { entityCard, type CardKind } from "@pitwall/core/f1/cards";
import { hydrate, indexData, type Db } from "@pitwall/core/f1/dataset";
import { describeEntity } from "@pitwall/core/f1/describe";
import type { RaceLapFile } from "@pitwall/core/f1/laps";

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

/** A page's meta description from its entity's card, or undefined (the site-wide one) when there is none. */
export function describe(kind: CardKind, id: string): string | undefined {
	const card = entityCard(getDb(), kind, id);
	return card ? describeEntity(card) : undefined;
}
