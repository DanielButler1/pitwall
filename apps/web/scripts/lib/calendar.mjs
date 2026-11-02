// Announced calendars and line-ups (data/calendar/<year>.json) for seasons F1DB doesn't have yet. A season is
// only taken from here while F1DB has none of its races (or entrants), so F1DB's own wins once it's out.
// Laps and distances come from the latest race at the same circuit; the official name is the Grand Prix's.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @returns {{ races: any[], entrants: any[], drivers: any[], errors: string[], warnings: string[], years: number[] }}
 *   races in f1.json's tuple shape, entrants as [year, constructorId, engineId, driverId], and drivers F1DB doesn't
 *   have yet in its own shape (a rookie confirmed before their first race)
 */
export function buildCalendar(dir, f1db) {
	const out = { races: [], entrants: [], drivers: [], errors: [], warnings: [], years: [] };
	if (!existsSync(dir)) return out;
	const { races, circuits, grandsPrix, drivers, constructors, engines, entrants } = f1db;
	const circuitIds = new Set(circuits.map((c) => c.id));
	const gps = new Map(grandsPrix.map((g) => [g.id, g]));
	const driverIds = new Set(drivers.map((d) => d.id));
	const constructorIds = new Set(constructors.map((c) => c.id));
	const engineIds = new Set(engines.map((e) => e.id));
	let nextId = Math.max(...races.map((r) => r.id)) + 1;

	for (const name of readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort()) {
		const year = Number(name.slice(0, 4));
		const season = JSON.parse(readFileSync(join(dir, name), "utf8"));
		const at = (what) => `${name}: ${what}`;
		// rookies F1DB doesn't have yet; F1DB's own record wins once it has one
		for (const d of season.drivers ?? []) {
			if (driverIds.has(d.id)) continue;
			if (!d.name || !d.firstName || !d.lastName || !d.nationalityCountryId) {
				out.errors.push(at(`driver "${d.id}" needs name, firstName, lastName and nationalityCountryId`));
				continue;
			}
			out.drivers.push(d);
			driverIds.add(d.id);
		}
		if (!races.some((r) => r.year === year)) {
			out.years.push(year);
			for (const r of season.races ?? []) {
				const gp = gps.get(r.grandPrixId);
				if (!gp) out.errors.push(at(`round ${r.round}: no Grand Prix "${r.grandPrixId}" in F1DB`));
				if (!circuitIds.has(r.circuitId)) out.errors.push(at(`round ${r.round}: no circuit "${r.circuitId}" in F1DB`));
				if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "") || !r.date.startsWith(String(year))) out.errors.push(at(`round ${r.round}: date "${r.date}" isn't in ${year}`));
				if (!gp || !circuitIds.has(r.circuitId)) continue;
				// the latest race at the circuit, the same Grand Prix's if there is one
				const before = races.filter((x) => x.circuitId === r.circuitId && x.year < year).sort((a, b) => a.year - b.year || a.round - b.round);
				const like = before.filter((x) => x.grandPrixId === r.grandPrixId).at(-1) ?? before.at(-1);
				if (!like) out.warnings.push(at(`round ${r.round}: no earlier race at ${r.circuitId}, so no laps or distance`));
				out.races.push([
					nextId++, year, r.round, r.date, r.grandPrixId, r.circuitId, `Formula 1 ${gp.fullName} ${year}`,
					like?.laps ?? 0, like?.distance ?? 0, like?.courseLength ?? 0, r.sprint ? 1 : 0, like?.qualifyingFormat ?? "KNOCKOUT", like?.laps ?? null,
				]);
			}
		}
		if (!entrants.some((e) => e.year === year)) {
			for (const team of season.entrants ?? []) {
				if (!constructorIds.has(team.constructorId)) out.errors.push(at(`no constructor "${team.constructorId}" in F1DB`));
				if (!engineIds.has(team.engineId)) out.errors.push(at(`no engine "${team.engineId}" in F1DB`));
				for (const driverId of team.drivers ?? []) {
					// a driver who's never entered isn't in F1DB yet: they join once F1DB has them
					if (!driverIds.has(driverId)) out.warnings.push(at(`${driverId} isn't in F1DB yet, so isn't on the ${year} grid here`));
					else out.entrants.push([year, team.constructorId, team.engineId, driverId]);
				}
			}
		}
	}
	return out;
}
