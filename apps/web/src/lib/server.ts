import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { entityCard, type CardKind } from "@pitwall/core/f1/cards";
import { hydrate, indexData, type Db } from "@pitwall/core/f1/dataset";
import { describeEntity } from "@pitwall/core/f1/describe";
import type { RaceLapFile } from "@pitwall/core/f1/laps";
import { factIndex, unpackFacts, type FactIndex, type PackedFacts } from "@pitwall/core/f1/race-facts";

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

let index: FactIndex | undefined;

/** Every race's facts (data/facts.json, from the data build), worked out here only if the file is missing or stale. */
export function getFactIndex(): FactIndex {
	if (index) return index;
	const file = join(process.cwd(), "data", "facts.json");
	index = (existsSync(file) ? unpackFacts(getDb(), JSON.parse(readFileSync(file, "utf8")) as PackedFacts) : null) ?? factIndex(getDb());
	return index;
}

/** A page's meta description from its entity's card, or undefined (the site-wide one) when there is none. */
export function describe(kind: CardKind, id: string): string | undefined {
	const card = entityCard(getDb(), kind, id);
	return card ? describeEntity(card) : undefined;
}
