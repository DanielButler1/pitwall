// Short names for narrow places (chart labels, the results grid), as the website does on phones.

import type { DriverRef } from "@pitwall/core/f1/views";

const PARTICLES = new Set(["de", "da", "di", "del", "della", "dos", "du", "la", "le", "van", "von", "der", "den"]);

/** Surname from a full name ("de la Rosa", "Sainz Jr."). */
export function surname(name: string) {
	const w = name.split(" ");
	let i = w.length - 1;
	if (i > 1 && /^(jr\.?|sr\.?|ii|iii)$/i.test(w[i]!)) i--;
	while (i > 1 && PARTICLES.has(w[i - 1]!.toLowerCase())) i--;
	return i > 0 ? w.slice(i).join(" ") : name;
}

/** Surnames, with an initial where two drivers share one (the Schumachers). */
export function shortNamer(drivers: DriverRef[]) {
	const sur = new Map(drivers.map((d) => [d.id, surname(d.name)]));
	const count = new Map<string, number>();
	for (const s of sur.values()) count.set(s, (count.get(s) ?? 0) + 1);
	return (d: DriverRef) => {
		const s = sur.get(d.id) ?? surname(d.name);
		return (count.get(s) ?? 0) > 1 ? `${d.name[0]}. ${s}` : s;
	};
}

/** What a classification means, for screen readers and the grid's legend. */
export const RESULT_TEXT: Record<string, string> = {
	DNF: "Retired",
	DNS: "Did not start",
	DNQ: "Did not qualify",
	DNPQ: "Did not pre-qualify",
	DSQ: "Disqualified",
	NC: "Not classified",
	EX: "Excluded",
	DNP: "Did not practise",
};

/** "1:23.456" from milliseconds. */
export const lapTime = (ms: number | null | undefined) => {
	if (ms == null) return "";
	const m = Math.floor(ms / 60000);
	const s = ((ms % 60000) / 1000).toFixed(3);
	return m ? `${m}:${s.padStart(6, "0")}` : s;
};

/** "−12" for points behind the leader. */
export const behind = (n: number) => (n === 0 ? "0" : `−${Math.round(-n * 100) / 100}`);
