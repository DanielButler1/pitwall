// Every race's facts, for the season, driver, team, Grand Prix and circuit screens: the website's
// /data/facts.json (worked out when the data is built, ~2 MB, ~0.2 MB gzipped), kept in the app's documents
// beside the dataset. When the site's copy is for another dataset (the site is behind, or the phone is
// offline with a newer dataset), they're worked out on the phone a few races at a time, out of the way.
// A universe has no index of its own: its screens show race facts only.

import { File, Paths } from "expo-file-system";
import { useEffect, useMemo, useState } from "react";
import type { Db } from "@pitwall/core/f1/dataset";
import { facts } from "@pitwall/core/f1/records/facts";
import { packFacts, raceFacts, unpackFacts, type FactEntry, type FactIndex, type PackedFacts, type RaceFact } from "@pitwall/core/f1/race-facts";
import { dataUrl } from "@/lib/config";
import { useDb, useRealDb } from "./dataset";

const file = () => new File(Paths.document, "facts.json");
/** As packages/core/src/f1/facts/collections.ts keeps per race. */
const PER_RACE = 12;

const indexes = new WeakMap<Db, Promise<FactIndex>>();

async function saved(db: Db): Promise<FactIndex | null> {
	try {
		const f = file();
		return f.exists ? unpackFacts(db, JSON.parse(await f.text()) as PackedFacts) : null;
	} catch {
		return null;
	}
}

async function fromSite(db: Db): Promise<FactIndex | null> {
	try {
		const res = await fetch(dataUrl("facts.json"));
		if (!res.ok) return null;
		const text = await res.text();
		const index = unpackFacts(db, JSON.parse(text) as PackedFacts);
		if (index) await file().write(text);
		return index;
	} catch {
		return null;
	}
}

/** Works the index out on the phone, a few races per turn so screens stay responsive. */
async function onPhone(db: Db): Promise<FactIndex> {
	const index: FactIndex = new Map();
	const races = facts(db).races;
	for (let i = 0; i < races.length; i += 15) {
		await new Promise<void>((r) => setTimeout(r, 16));
		for (const f of races.slice(i, i + 15)) index.set(f.race.id, raceFacts(db, f.race.id, PER_RACE));
	}
	try {
		await file().write(JSON.stringify(packFacts(db, index)));
	} catch {
		// not saved: worked out again next launch
	}
	return index;
}

function load(db: Db): Promise<FactIndex> {
	let p = indexes.get(db);
	if (!p) {
		p = (async () => (await saved(db)) ?? (await fromSite(db)) ?? (await onPhone(db)))();
		indexes.set(db, p);
	}
	return p;
}

/** The fact index for real history, once it's loaded; null while it loads, and in a universe. */
export function useFactIndex(): FactIndex | null {
	const real = useRealDb();
	const shown = useDb();
	const [state, setState] = useState<{ db: Db; index: FactIndex } | null>(null);
	useEffect(() => {
		let live = true;
		void load(real).then((index) => live && setState({ db: real, index }));
		return () => {
			live = false;
		};
	}, [real]);
	return shown === real && state?.db === real ? state.index : null;
}

/** Facts picked from the index for a screen (seasonFacts, subjectFacts, venueFacts); null until it's loaded. */
export function useFactEntries(select: (db: Db, index: FactIndex) => FactEntry[], deps: readonly unknown[]): FactEntry[] | null {
	const index = useFactIndex();
	const db = useRealDb();
	// the caller's deps are the point, as useView
	// eslint-disable-next-line react-hooks/exhaustive-deps
	return useMemo(() => (index ? select(db, index) : null), [index, db, ...deps]);
}

export type { FactIndex, RaceFact };
