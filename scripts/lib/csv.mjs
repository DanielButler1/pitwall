// Minimal RFC 4180 CSV reader (quoted fields, escaped quotes, commas and
// newlines inside quotes). Enough for the Jolpica dump; no dependency needed.

import { readFileSync } from "node:fs";

/** Parse CSV text into rows of string fields. */
export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let i = 0;
	const n = text.length;
	if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
	while (i < n) {
		const c = text[i];
		if (c === '"') {
			// quoted field
			i++;
			let start = i;
			let buf = "";
			for (;;) {
				const q = text.indexOf('"', i);
				if (q === -1) throw new Error("Unterminated quoted CSV field");
				if (text[q + 1] === '"') {
					buf += text.slice(start, q + 1);
					i = q + 2;
					start = i;
					continue;
				}
				buf += text.slice(start, q);
				i = q + 1;
				break;
			}
			field = buf;
			continue;
		}
		if (c === ",") {
			row.push(field);
			field = "";
			i++;
			continue;
		}
		if (c === "\n" || c === "\r") {
			row.push(field);
			field = "";
			rows.push(row);
			row = [];
			if (c === "\r" && text[i + 1] === "\n") i++;
			i++;
			continue;
		}
		// unquoted run up to the next delimiter
		let j = i;
		while (j < n) {
			const d = text.charCodeAt(j);
			if (d === 44 || d === 10 || d === 13) break;
			j++;
		}
		field += text.slice(i, j);
		i = j;
	}
	if (field !== "" || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/**
 * Read a CSV file as a table addressed by header names:
 *   const t = readTable(file); for (const r of t.rows) t.get(r, "id")
 */
export function readTable(file) {
	const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
	const index = new Map(header.map((h, i) => [h.trim(), i]));
	const col = (name) => {
		const i = index.get(name);
		if (i === undefined) throw new Error(`${file}: no column "${name}" (have ${header.join(", ")})`);
		return i;
	};
	return {
		header,
		rows: rows.filter((r) => r.length > 1 || r[0] !== ""),
		col,
		/** Map rows to objects with only the named columns. */
		pick(...names) {
			const idx = names.map(col);
			return this.rows.map((r) => Object.fromEntries(names.map((nm, k) => [nm, r[idx[k]] ?? ""])));
		},
	};
}
