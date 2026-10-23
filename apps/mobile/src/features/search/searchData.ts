// The app's global search: the website's index (@pitwall/core searchIndex: drivers, constructors,
// Grands Prix, circuits, engines, tyres, nations, seasons), plus every race and every record list,
// matched the way the website's search box matches (apps/web/src/components/site-search.tsx).

import type { Db } from "@pitwall/core/f1/dataset";
import { ENTITY_LABELS, recordIndex } from "@pitwall/core/f1/records";
import { raceRef, searchIndex, type SearchKind } from "@pitwall/core/f1/views";

export type ResultKind = SearchKind | "race" | "record";

/**
 * One thing to find: what it is, its name, a flag (ISO alpha-2), more words it answers to (`extra`),
 * the short detail shown beside it, and where it opens.
 */
export type SearchItem = { kind: ResultKind; id: string; label: string; flag: string; extra: string; detail: string; path: string };

export const GROUPS: { kind: ResultKind; heading: string }[] = [
	{ kind: "driver", heading: "Drivers" },
	{ kind: "constructor", heading: "Constructors" },
	{ kind: "season", heading: "Seasons" },
	{ kind: "grandPrix", heading: "Grands Prix" },
	{ kind: "race", heading: "Races" },
	{ kind: "circuit", heading: "Circuits" },
	{ kind: "record", heading: "Records" },
	{ kind: "engine", heading: "Engines" },
	{ kind: "tyre", heading: "Tyres" },
	{ kind: "nation", heading: "Nations" },
];

const PATHS: Record<SearchKind, string> = {
	driver: "/drivers/",
	constructor: "/constructors/",
	grandPrix: "/grands-prix/",
	circuit: "/circuits/",
	engine: "/engines/",
	tyre: "/tyres/",
	nation: "/nations/",
	season: "/seasons/",
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Prepared = { item: SearchItem; label: string; words: string[]; order: number };

const prepare = (item: SearchItem, order: number): Prepared => ({
	item,
	label: fold(item.label),
	words: fold(`${item.label} ${item.extra}`).split(/[\s\-.,'()]+/).filter(Boolean),
	order,
});

/** "1984–1994" (the index writes years with a hyphen). */
const dashYears = (s: string) => s.replace(/(d{4})-(d{4})/g, "$1–$2");

/** What a core index entry shows beside its name: years for people and makers, the town for a circuit. */
function detailOf(db: Db, kind: SearchKind, id: string, extra: string): string {
	switch (kind) {
		case "driver":
		case "engine":
		case "tyre":
			return dashYears(extra);
		case "constructor":
			return dashYears(extra.match(/d{4}(-d{4})?$/)?.[0] ?? "");
		case "circuit":
			return db.circuits.get(id)?.place ?? "";
		default:
			return "";
	}
}

const built = new WeakMap<Db, Prepared[]>();

/** Everything searchable, built once per dataset (a few hundred ms on a mid-range phone, so the sheet warms it). */
export function preparedIndex(db: Db): Prepared[] {
	let list = built.get(db);
	if (list) return list;
	const items: SearchItem[] = searchIndex(db).map(([kind, id, label, flag, extra]) => ({ kind, id, label, flag, extra, detail: detailOf(db, kind, id, extra), path: PATHS[kind] + id }));
	// newest races first, so "Monaco" shows the latest editions
	for (let i = db.races.length - 1; i >= 0; i--) {
		const race = db.races[i]!;
		if (!db.resultsByRace.has(race.id)) continue;
		const ref = raceRef(db, race);
		const circuit = db.circuits.get(race.circuitId);
		items.push({ kind: "race", id: String(race.id), label: `${race.year} ${ref.name}`, flag: ref.country?.toLowerCase() ?? "", extra: circuit ? `${circuit.name} ${circuit.place}` : "", detail: circuit ? (circuit.name === circuit.place ? circuit.name : `${circuit.name}, ${circuit.place}`) : "", path: `/races/${race.year}/${race.round}` });
	}
	for (const r of recordIndex()) {
		items.push({ kind: "record", id: r.id, label: `${r.family}: ${r.title.charAt(0).toLowerCase()}${r.title.slice(1)}`, flag: "", extra: ENTITY_LABELS[r.entity], detail: ENTITY_LABELS[r.entity], path: `/records/${r.id}` });
	}
	list = items.map(prepare);
	built.set(db, list);
	return list;
}

/** Lower is better; null = no match. Every query token must prefix a word or appear in the name. */
function score(p: Prepared, tokens: string[], whole: string): number | null {
	let total = 0;
	for (const t of tokens) {
		if (p.words.some((w) => w.startsWith(t))) continue;
		if (p.label.includes(t)) {
			total += 2;
			continue;
		}
		return null;
	}
	if (p.label === whole) return -2;
	if (p.label.startsWith(whole)) return -1;
	return total;
}

/** Every match in a group, best first (the sheet shows the first few and the rest on request). */
export type ResultGroup = { kind: ResultKind; heading: string; items: SearchItem[] };

/** Results for a query, grouped by kind, groups ordered by their best match. */
export function search(index: Prepared[], query: string): ResultGroup[] {
	const q = fold(query.trim());
	if (!q) return [];
	const tokens = q.split(/\s+/).filter(Boolean);
	const hits = new Map<ResultKind, { p: Prepared; s: number }[]>();
	for (const p of index) {
		const s = score(p, tokens, q);
		if (s == null) continue;
		let list = hits.get(p.item.kind);
		if (!list) hits.set(p.item.kind, (list = []));
		list.push({ p, s });
	}
	return GROUPS.filter((g) => hits.has(g.kind))
		.map((g) => {
			const list = hits.get(g.kind)!.sort((a, b) => a.s - b.s || a.p.order - b.p.order);
			return { ...g, best: list[0]!.s, items: list.map((h) => h.p.item) };
		})
		.sort((a, b) => a.best - b.best)
		.map(({ best: _best, ...g }) => g);
}
