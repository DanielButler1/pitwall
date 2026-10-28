// Tyre stints from timing data (OpenF1, or FastF1's exports) as race-notes compounds, shared by the imports.
//
// Timing data splits one set of tyres into several stints at times: the field led through the pit lane
// behind the safety car, a red flag. So a stint on tyres as old as an earlier set's would be by then is that
// set, and "stops" on the same compound a lap apart are passes through the pit lane, the first included.

/** Timing data's compound names as race-notes codes (2018's hypersoft to superhard included). */
export const COMPOUND = {
	HYPERSOFT: "HS",
	ULTRASOFT: "US",
	SUPERSOFT: "SS",
	SOFT: "S",
	MEDIUM: "M",
	HARD: "H",
	SUPERHARD: "SH",
	INTERMEDIATE: "I",
	WET: "W",
};

/**
 * One driver's sets of tyres, in order, as codes.
 * @param {{ compound: string, lapStart: number | null, lapEnd: number | null, age: number }[]} stints
 *   in stint order; `age` is laps already on the tyres when the stint began
 */
export function setsOf(stints) {
	const sets = [];
	for (const s of stints) {
		const code = COMPOUND[s.compound] ?? "?";
		if (s.lapStart != null && s.age > 0) {
			// the earliest set it continues, with only the same compound since
			let j = Math.max(0, sets.length - 1);
			while (j > 0 && sets[j - 1].code === code && sets.slice(j - 1).every((x) => x.code === code)) j--;
			for (; j < sets.length; j++) {
				const set = sets[j];
				if (set.code === code && set.start != null && s.age >= set.age + (s.lapStart - set.start) - 1) break;
			}
			if (j < sets.length) {
				sets.length = j + 1;
				sets[j].end = Math.max(sets[j].end ?? 0, s.lapEnd ?? 0);
				sets[j].last = s.lapStart;
				continue;
			}
		}
		const prev = sets.at(-1);
		if (prev && prev.code === code && s.lapStart != null && prev.last != null && s.lapStart - prev.last <= 1) {
			prev.end = Math.max(prev.end ?? 0, s.lapEnd ?? 0);
			prev.last = s.lapStart;
			// the run's first "stop" was a pass through the pit lane too
			const before = sets.at(-2);
			if (before && before.code === code && prev.start - (before.last ?? before.start) > 1) {
				before.end = prev.end;
				before.last = prev.last;
				sets.pop();
			}
			continue;
		}
		sets.push({ code, start: s.lapStart, end: s.lapEnd, age: s.age ?? 0, last: s.lapStart });
	}
	return sets.map((x) => x.code);
}

/** dry / wet / mixed from the tyres the field used: wet tyres all race, for some of it, or not at all. */
export function weatherFromStints(stints) {
	let wet = 0;
	let all = 0;
	for (const s of stints) {
		if (s.lapStart == null || s.lapEnd == null) continue;
		const laps = s.lapEnd - s.lapStart + 1;
		all += laps;
		if (s.compound === "INTERMEDIATE" || s.compound === "WET") wet += laps;
	}
	if (!all) return null;
	if (wet === 0) return "dry";
	return wet / all >= 0.9 ? "wet" : "mixed";
}
