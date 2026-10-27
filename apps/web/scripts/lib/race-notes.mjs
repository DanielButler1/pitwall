// Race notes: what neither F1DB nor Jolpica records, entered by hand in data/race-notes/<year>.json
// (see data/race-notes/README.md): safety car, virtual safety car and red flag laps, each driver's tyre
// compounds stint by stint, the compounds Pirelli brought, and the weather.
//
// Everything is checked against F1DB (and Jolpica's pit stops where there are some) and the build fails
// on anything that can't be right, so a typo never reaches the site. Notes come out in two places:
//   - f1.json, small and always loaded: [raceId, weather, [[type, fromLap, toLap], ...], hasTyres]
//   - the race's file in data/laps/: tyres and compounds, fetched with the race's pit stops

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const NEUTRAL_TYPES = ["SC", "VSC", "RF"];
/** Pirelli's names since 2011 (hypersoft to superhard), Bridgestone's soft/hard era, intermediates and wets. */
export const TYRE_CODES = ["HS", "US", "SS", "S", "M", "H", "SH", "I", "W", "?"];
export const WEATHER = ["dry", "wet", "mixed"];
const RACE_KEYS = ["weather", "neutralised", "compounds", "tyres", "sources", "note"];

/**
 * @param {string} dir data/race-notes
 * @param {{ races: any[], drivers: any[], raceResults: any[] }} f1db
 * @param {Map<number, any>} [lapFiles] Jolpica's per-race files (for pit stops), when there are some
 * @returns {{ rows: any[], files: Map<number, object>, errors: string[], warnings: string[], count: { races: number, neutralised: number, tyres: number } }}
 */
export function buildRaceNotes(dir, f1db, lapFiles) {
	const errors = [];
	const warnings = [];
	const rows = [];
	const files = new Map();
	const count = { races: 0, neutralised: 0, tyres: 0 };
	if (!existsSync(dir)) return { rows, files, errors, warnings, count };

	const raceByKey = new Map(f1db.races.map((r) => [`${r.year}|${r.round}`, r]));
	const driverById = new Map(f1db.drivers.map((d) => [d.id, d]));
	const resultsByRace = new Map();
	for (const r of f1db.raceResults) (resultsByRace.get(r.raceId) ?? resultsByRace.set(r.raceId, []).get(r.raceId)).push(r);

	for (const name of readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort()) {
		const year = Number(name.slice(0, 4));
		let notes;
		try {
			notes = JSON.parse(readFileSync(join(dir, name), "utf8"));
		} catch (e) {
			errors.push(`${name}: not valid JSON (${e.message})`);
			continue;
		}
		for (const [roundKey, note] of Object.entries(notes)) {
			if (roundKey.startsWith("$")) continue;
			const at = `${name} round ${roundKey}`;
			const race = raceByKey.get(`${year}|${Number(roundKey)}`);
			if (!race || !/^\d+$/.test(roundKey)) {
				errors.push(`${at}: there's no round ${roundKey} in ${year}`);
				continue;
			}
			const results = resultsByRace.get(race.id);
			if (!results?.length) {
				errors.push(`${at}: the race has no results yet`);
				continue;
			}
			for (const k of Object.keys(note)) if (!RACE_KEYS.includes(k)) errors.push(`${at}: unknown field "${k}" (expected ${RACE_KEYS.join(", ")})`);
			const raceLaps = Math.max(race.laps ?? 0, ...results.map((r) => r.laps ?? 0));
			const lap = (v, what) => {
				if (!Number.isInteger(v) || v < 1 || v > raceLaps) {
					errors.push(`${at}: ${what} ${JSON.stringify(v)} isn't a lap of the race (1-${raceLaps})`);
					return null;
				}
				return v;
			};

			// weather
			let weather = null;
			if (note.weather != null) {
				if (WEATHER.includes(note.weather)) weather = note.weather;
				else errors.push(`${at}: weather "${note.weather}" should be one of ${WEATHER.join(", ")}`);
			}

			// safety cars, virtual safety cars, red flags
			const neutralised = [];
			for (const [i, n] of (note.neutralised ?? []).entries()) {
				const what = `neutralised[${i}]`;
				if (!NEUTRAL_TYPES.includes(n?.type)) {
					errors.push(`${at}: ${what} type "${n?.type}" should be one of ${NEUTRAL_TYPES.join(", ")}`);
					continue;
				}
				if (n.type === "VSC" && year < 2015) errors.push(`${at}: ${what} is a VSC, which F1 only used from 2015`);
				const from = lap(n.type === "RF" ? (n.lap ?? n.from) : n.from, `${what} from`);
				const to = n.type === "RF" ? from : lap(n.to, `${what} to`);
				if (from == null || to == null) continue;
				if (to < from) {
					errors.push(`${at}: ${what} ends (lap ${to}) before it starts (lap ${from})`);
					continue;
				}
				neutralised.push([n.type, from, to]);
			}
			neutralised.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
			for (let i = 1; i < neutralised.length; i++) {
				const [pt, , pTo] = neutralised[i - 1];
				const [t, from] = neutralised[i];
				// a red flag usually follows a safety car on the same lap; two cars out at once can't happen
				if (from < pTo && t !== "RF" && pt !== "RF") errors.push(`${at}: ${pt} to lap ${pTo} overlaps ${t} from lap ${from}`);
			}

			// compounds Pirelli brought: { "H": "C1", "M": "C2", "S": "C3" }
			let compounds = null;
			if (note.compounds != null) {
				compounds = {};
				for (const [code, c] of Object.entries(note.compounds)) {
					if (!TYRE_CODES.includes(code) || code === "?") errors.push(`${at}: compounds key "${code}" should be one of ${TYRE_CODES.filter((x) => x !== "?").join(", ")}`);
					else if (!/^C\d$/.test(c)) errors.push(`${at}: compound "${c}" for ${code} should be like C3`);
					else compounds[code] = c;
				}
			}

			// tyres: driver (F1DB id, abbreviation or car number) -> "M H S"
			const tyres = [];
			if (note.tyres != null) {
				const lapFile = lapFiles?.get(race.id);
				const stops = new Map();
				for (const [d] of lapFile?.pitStops ?? []) stops.set(d, (stops.get(d) ?? 0) + 1);
				const reds = neutralised.filter((n) => n[0] === "RF").length;
				const seen = new Set();
				for (const [key, value] of Object.entries(note.tyres)) {
					const matches = results.filter((r) => r.driverId === key || r.driverNumber === key || driverById.get(r.driverId)?.abbreviation === key.toUpperCase());
					if (matches.length !== 1) {
						const ids = results.map((r) => `${driverById.get(r.driverId)?.abbreviation ?? r.driverId}`).join(" ");
						errors.push(`${at}: tyres "${key}" ${matches.length ? "matches more than one driver, use the F1DB id" : `isn't a driver in the race (${ids})`}`);
						continue;
					}
					const driverId = matches[0].driverId;
					if (seen.has(driverId)) errors.push(`${at}: tyres has ${key} twice`);
					seen.add(driverId);
					const codes = String(value).trim().toUpperCase().split(/[\s,>-]+/).filter(Boolean);
					const bad = codes.filter((c) => !TYRE_CODES.includes(c));
					if (bad.length || !codes.length) {
						errors.push(`${at}: tyres for ${key} "${value}": ${bad.length ? `unknown ${bad.join(", ")}` : "empty"} (use ${TYRE_CODES.join(" ")})`);
						continue;
					}
					// every stop starts a new stint; red flags allow a tyre change without one
					const made = stops.get(driverId) ?? (lapFile?.pitStops ? 0 : matches[0].pitStops);
					if (made != null && (codes.length < made + 1 || codes.length > made + 1 + reds))
						warnings.push(`${at}: ${key} has ${codes.length} stint${codes.length === 1 ? "" : "s"} but made ${made} stop${made === 1 ? "" : "s"}${reds ? ` (and there were ${reds} red flag${reds === 1 ? "" : "s"})` : ""}`);
					tyres.push([driverId, codes]);
				}
				const order = new Map(results.map((r, i) => [r.driverId, i]));
				tyres.sort((a, b) => order.get(a[0]) - order.get(b[0]));
			}

			for (const s of note.sources ?? []) if (!/^https?:\/\//.test(s)) errors.push(`${at}: source "${s}" should be a link`);

			if (!weather && !neutralised.length && !tyres.length && !compounds) continue;
			count.races++;
			count.neutralised += neutralised.length;
			if (tyres.length) count.tyres++;
			rows.push([race.id, weather, neutralised, tyres.length ? 1 : 0]);
			if (tyres.length || compounds) files.set(race.id, { ...(tyres.length ? { tyres } : {}), ...(compounds ? { compounds } : {}) });
		}
	}
	rows.sort((a, b) => a[0] - b[0]);
	return { rows, files, errors, warnings, count };
}
