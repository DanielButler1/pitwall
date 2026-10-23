// Public API of the records engine.
//
//   recordIndex()                      metadata of every category the data supports, for /records
//   fullCatalogue()                    every catalogued category, including ones the data can't support (tests)
//   findRecord(id)                     one category's metadata
//   recordRows(db, id)                 computed rows, memoised per Db
//   recordPageView(db, id, base?)      rows + "real" values for universes

import type { Db } from "../dataset.ts";
import { buildCatalogue } from "./catalogue.ts";
import { cached } from "./facts.ts";
import { lapCoverage } from "../laps.ts";
import { ENTITY_LABELS, type EntityKind, type RecordCategory, type RecordMeta, type RecordPageView, type RecordRow } from "./types.ts";

export type { Cell, RecordMeta, RecordPageView, RecordRow, EntityKind, Columns } from "./types.ts";
export { ENTITY_LABELS } from "./types.ts";

let catalogue: RecordCategory[] | undefined;
let byId: Map<string, RecordCategory> | undefined;

function all(): RecordCategory[] {
	if (!catalogue) {
		catalogue = buildCatalogue();
		byId = new Map(catalogue.map((c) => [c.id, c]));
	}
	return catalogue;
}

const metaOf = ({ compute: _c, ...meta }: RecordCategory): RecordMeta => (void _c, meta);

export function fullCatalogue(): RecordMeta[] {
	return all().map(metaOf);
}

/** Categories the data supports; the rest are left out of the site entirely. */
export function recordIndex(): RecordMeta[] {
	return all()
		.filter((c) => c.available)
		.map(metaOf);
}

export function findRecord(id: string): RecordMeta | undefined {
	all();
	const c = byId!.get(id);
	return c?.available ? metaOf(c) : undefined;
}

export const ENTITY_ORDER: EntityKind[] = ["driver", "constructor", "engine", "nation", "grandprix", "number"];

export type RecordIndexSection = { entity: EntityKind; label: string; slug: string; families: { family: string; records: RecordMeta[] }[] };

/** Catalogue grouped by entity type then family, in catalogue order. */
export function recordSections(): RecordIndexSection[] {
	const metas = recordIndex();
	return ENTITY_ORDER.map((entity) => {
		const list = metas.filter((m) => m.entity === entity);
		const families: RecordIndexSection["families"] = [];
		for (const m of list) {
			let f = families.find((x) => x.family === m.family);
			if (!f) families.push((f = { family: m.family, records: [] }));
			f.records.push(m);
		}
		return { entity, label: ENTITY_LABELS[entity], slug: list[0]?.id.split("/")[0] ?? entity, families };
	});
}

/** Computed rows of a category for a Db (memoised per Db). */
export function recordRows(db: Db, id: string): RecordRow[] | null {
	all();
	const c = byId!.get(id);
	if (!c?.compute) return null;
	return cached(db, `record:${id}`, () => c.compute!(db));
}

export function recordPageView(db: Db, id: string, base?: Db, limit = 500): RecordPageView | null {
	const meta = findRecord(id);
	if (!meta) return null;
	const rows = recordRows(db, id) ?? [];
	let realByKey: Map<string, RecordRow> | null = null;
	const modified = !!base && base !== db;
	if (modified) realByKey = new Map((recordRows(base!, id) ?? []).map((r) => [r.key, r]));
	return {
		meta,
		total: rows.length,
		modified,
		...(meta.coverage ? { excludedRaces: excludedFor(db, meta) } : {}),
		rows: rows.slice(0, limit).map((r) => {
			if (!realByKey) return r;
			const real = realByKey.get(r.key);
			if (!real) return { ...r, real: "none" };
			return real.display === r.display ? r : { ...r, real: real.display };
		}),
	};
}

/** Races a universe changed that a lap-data category leaves out (0 for reality). */
function excludedFor(db: Db, meta: RecordMeta): number {
	const c = lapCoverage(db);
	return meta.id.includes("/sprint/") ? c.sprintExcluded : c.excluded;
}

/** Headline leaderboards shown at the top of /records. */
export const HIGHLIGHTS = [
	"drivers/titles/by-number",
	"drivers/wins/by-number",
	"drivers/poles/by-number",
	"drivers/podiums/by-number",
	"drivers/fastest-laps/by-number",
	"drivers/grands-prix/by-number",
	"constructors/titles/by-number",
	"constructors/wins/by-number",
];

export type RecordsIndexView = {
	sections: RecordIndexSection[];
	highlights: RecordPageView[];
};

export function recordsIndexView(db: Db, base?: Db): RecordsIndexView {
	return {
		sections: recordSections(),
		highlights: HIGHLIGHTS.map((id) => recordPageView(db, id, base, 5)!).filter(Boolean),
	};
}

export type RecordCategoryView = RecordPageView & { entityLabel: string; siblings: RecordMeta[] };

/** Everything the category page needs: rows, real-vs-universe values and the sibling categories. */
export function recordCategoryView(db: Db, id: string, base?: Db): RecordCategoryView | null {
	const view = recordPageView(db, id, base);
	if (!view) return null;
	return {
		...view,
		entityLabel: ENTITY_LABELS[view.meta.entity],
		siblings: recordIndex().filter((m) => m.entity === view.meta.entity && m.family === view.meta.family),
	};
}
