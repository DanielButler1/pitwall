// Cell builders and ranking helpers shared by every record computation.

import type { Db, Race } from "../dataset.ts";
import { circuitRef, driverRef, engineRef, grandPrixRef, nationRef, raceRef, teamRef } from "../views.ts";
import type { Kind } from "./facts.ts";
import type { Cell, RecordRow } from "./types.ts";

export const cDriver = (db: Db, id: string): Cell => ({ t: "driver", ref: driverRef(db, id) });
export const cTeam = (db: Db, id: string): Cell => ({ t: "team", ref: teamRef(db, id) });
export const cEngine = (db: Db, id: string): Cell => ({ t: "engine", ref: engineRef(db, id) });
export const cNation = (db: Db, id: string): Cell => ({ t: "nation", ref: nationRef(db, id) });
export const cGp = (db: Db, id: string): Cell => ({ t: "gp", ref: grandPrixRef(db, id) });
export const cCircuit = (db: Db, id: string): Cell => ({ t: "circuit", ref: circuitRef(db, id) });
export const cRace = (db: Db, race: Race): Cell => ({ t: "race", ref: raceRef(db, race) });
export const cSeason = (year: number): Cell => ({ t: "season", year });
export const cText = (text: string): Cell => ({ t: "text", text });
export const cDate = (iso: string): Cell => ({ t: "date", iso });

export function cEntity(db: Db, kind: Kind, id: string): Cell {
	switch (kind) {
		case "driver":
			return cDriver(db, id);
		case "constructor":
			return cTeam(db, id);
		case "engine":
			return cEngine(db, id);
		case "nation":
			return cNation(db, id);
		case "number":
			return { t: "number", number: id };
	}
}

export const fmt = (n: number, decimals = 2) =>
	Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "");

export const fmtDate = (iso: string) =>
	new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const plural = (n: number, noun: [string, string]) => `${fmt(n)} ${n === 1 ? noun[0] : noun[1]}`;

export function daysText(days: number): string {
	const y = Math.floor(days / 365.25);
	const d = Math.round(days - y * 365.25);
	return y ? `${y}y ${d}d` : `${d}d`;
}

export type Draft = Omit<RecordRow, "rank"> & { tie?: number };

export const MAX_ROWS = 500;

/**
 * Sort and rank rows. Equal values share a rank (1, 2, 2, 4); `tie` orders
 * equal values (lower first), e.g. who got there first.
 */
export function ranked(rows: Draft[], dir: "desc" | "asc" = "desc", limit = MAX_ROWS): RecordRow[] {
	const sign = dir === "desc" ? -1 : 1;
	rows.sort((a, b) => sign * (a.value - b.value) || (a.tie ?? 0) - (b.tie ?? 0));
	const out: RecordRow[] = [];
	for (let i = 0; i < rows.length && i < limit; i++) {
		const { tie: _tie, ...r } = rows[i];
		void _tie;
		const rank = i > 0 && rows[i - 1].value === r.value ? out[i - 1].rank : i + 1;
		out.push({ rank, ...r });
	}
	return out;
}

/** Rows already in order (chronologies): rank is the position, shared when `value` repeats. */
export function sequence(rows: Draft[], limit = MAX_ROWS): RecordRow[] {
	return ranked(rows.map((r, i) => ({ ...r, tie: i })), "asc", limit);
}

/** Re-rank rows after filtering. */
export function rerank(rows: RecordRow[]): RecordRow[] {
	return rows.map((r, i) => ({ ...r, rank: i }))
		.map((r, i, all) => {
			let j = i;
			while (j > 0 && all[j - 1].value === r.value) j--;
			return { ...r, rank: j + 1 };
		});
}

export const ordinal = (n: number) => {
	const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
	return `${n}${s}`;
};
