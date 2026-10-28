// "Random race / driver / constructor / season", picked on the device: the website's /random/[kind]
// route, with the same rules (drivers and constructors with a handful of starts, races that were run).

import { completedRaces, isStart, type Db } from "@pitwall/core/f1/dataset";
import { constructorCareers, driverCareers } from "@pitwall/core/f1/stats";

export type RandomKind = "race" | "driver" | "constructor" | "season";

const cache = new WeakMap<Db, Map<RandomKind, string[]>>();

function paths(db: Db, kind: RandomKind): string[] {
	let byKind = cache.get(db);
	if (!byKind) cache.set(db, (byKind = new Map()));
	let list = byKind.get(kind);
	if (!list) {
		switch (kind) {
			case "race":
				list = db.races.filter((r) => db.resultsByRace.get(r.id)?.some(isStart)).map((r) => `/races/${r.year}/${r.round}`);
				break;
			case "driver":
				list = [...driverCareers(db).values()].filter((c) => c.starts >= 5).map((c) => `/drivers/${c.id}`);
				break;
			case "constructor":
				list = [...constructorCareers(db).values()].filter((c) => c.starts >= 5).map((c) => `/constructors/${c.id}`);
				break;
			case "season":
				list = db.years.filter((y) => completedRaces(db, y).length).map((y) => `/seasons/${y}`);
				break;
		}
		byKind.set(kind, list);
	}
	return list;
}

/** A random page of that kind, or null when there's nothing to pick from. */
export function randomPath(db: Db, kind: RandomKind): string | null {
	const list = paths(db, kind);
	return list.length ? list[Math.floor(Math.random() * list.length)]! : null;
}

export const isRandomKind = (k: string): k is RandomKind => k === "race" || k === "driver" || k === "constructor" || k === "season";
