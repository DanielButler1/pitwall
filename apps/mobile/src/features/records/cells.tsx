// Record table cells (driver, team, race, date...) as plain text and website paths: a phone row shows
// them as one line of names and taps through to the first thing it links to.

import type { Cell } from "@pitwall/core/f1/records";
import { diarySlug } from "@pitwall/core/f1/diary";
import { fmtDate } from "@/lib/format";
import { href } from "@/lib/links";

export function cellText(cell: Cell): string {
	switch (cell.t) {
		case "race":
			return `${cell.ref.year} ${cell.ref.name}`;
		case "season":
			return String(cell.year);
		case "date":
			return fmtDate(cell.iso);
		case "number":
			return `#${cell.number}`;
		case "text":
			return cell.text;
		default:
			return cell.ref.name;
	}
}

export function cellPath(cell: Cell): string | null {
	switch (cell.t) {
		case "driver":
			return href.driver(cell.ref.id);
		case "team":
			return href.team(cell.ref.id);
		case "engine":
			return href.engine(cell.ref.id);
		case "tyre":
			return href.tyre(cell.ref.id);
		case "nation":
			return href.nation(cell.ref.id);
		case "gp":
			return href.grandPrix(cell.ref.id);
		case "race":
			return href.race(cell.ref);
		case "circuit":
			return href.circuit(cell.ref.id);
		case "season":
			return href.season(cell.year);
		case "date":
			return href.diary(isoDiarySlug(cell.iso));
		default:
			return null;
	}
}

/** The country of a cell's entity, for its flag. */
export function cellCountry(cell: Cell): string | null {
	return "ref" in cell ? cell.ref.country : null;
}

export const cellsText = (cells: Cell[] | undefined, sep = " · ") => (cells ?? []).map(cellText).filter(Boolean).join(sep);

/** Where a record row leads: its subject, or failing that the first thing its detail names. */
export function rowPath(subject: Cell[], detail?: Cell[]): string | null {
	for (const c of [...subject, ...(detail ?? [])]) {
		const p = cellPath(c);
		if (p) return p;
	}
	return null;
}

export const isoDiarySlug = (iso: string) => diarySlug(Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
