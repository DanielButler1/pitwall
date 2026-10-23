// Shared types for the records engine. Everything here is plain serialisable
// data so server pages can hand rows to client components, and the universe
// renderer can compute the same rows in the browser.

import type { Db } from "../dataset.ts";
import type { CircuitRef, DriverRef, EngineRef, GrandPrixRef, NationRef, RaceRef, TeamRef, TyreRef } from "../views.ts";

export type EntityKind = "driver" | "constructor" | "engine" | "nation" | "grandprix" | "number";

export const ENTITY_LABELS: Record<EntityKind, string> = {
	driver: "Drivers",
	constructor: "Constructors",
	engine: "Engines",
	nation: "Nations",
	grandprix: "Grands Prix",
	number: "Car numbers",
};

/** One piece of a table cell: an entity link or plain text. */
export type Cell =
	| { t: "driver"; ref: DriverRef }
	| { t: "team"; ref: TeamRef }
	| { t: "engine"; ref: EngineRef }
	| { t: "tyre"; ref: TyreRef }
	| { t: "nation"; ref: NationRef }
	| { t: "gp"; ref: GrandPrixRef }
	| { t: "race"; ref: RaceRef }
	| { t: "circuit"; ref: CircuitRef }
	| { t: "season"; year: number }
	/** ISO date, linking to that day in the diary. */
	| { t: "date"; iso: string }
	| { t: "number"; number: string }
	| { t: "text"; text: string };

export type RecordRow = {
	rank: number;
	/** Stable identity used to match the same row between a universe and reality. */
	key: string;
	/** What holds the record: usually one entity, sometimes a pair or a race. */
	subject: Cell[];
	value: number;
	display: string;
	/** Set when `display` is this ISO date, so it can link to the diary. */
	date?: string;
	/** Context: years, races, ages, other entities. */
	detail?: Cell[];
};

export type Columns = { subject: string; value: string; detail?: string };

export type RecordMeta = {
	/** Stable slug, e.g. "driver/wins/consecutive". */
	id: string;
	entity: EntityKind;
	family: string;
	title: string;
	description: string;
	available: boolean;
	unavailableReason?: string;
	/** Limited data coverage (e.g. laps led only since 1996): a short badge label and an explanatory note. */
	coverage?: { label: string; note: string };
	columns: Columns;
};

export type RecordCategory = RecordMeta & { compute?: (db: Db) => RecordRow[] };

export type RecordPageView = {
	meta: RecordMeta;
	rows: (RecordRow & { real?: string | null })[];
	total: number;
	modified: boolean;
	/** Races left out because this universe changed them and their lap data no longer applies. */
	excludedRaces?: number;
};
