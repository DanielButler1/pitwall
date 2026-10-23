// Sanity checks run on every simulated race. A violation is a simulator bug, so
// it's recorded (and surfaced by tests) rather than silently patched up.

import { isStart, type Driver, type Race, type Result } from "../f1/dataset.ts";

export const MIN_AGE = 17;
export const MAX_AGE = 45;

export function ageAt(dob: string | null | undefined, date: string): number | null {
	if (!dob) return null;
	const [by, bm, bd] = dob.split("-").map(Number);
	const [y, m, d] = date.split("-").map(Number);
	return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function checkRace(
	race: Race,
	results: Result[],
	driver: (id: string) => Driver | undefined,
	opts: { seats?: Map<string, number>; ages: boolean },
): string[] {
	const issues: string[] = [];
	const seen = new Set<string>();
	const perTeam = new Map<string, number>();
	for (const r of results) {
		const where = `${race.year} R${race.round} ${r.driverId}`;
		if (seen.has(r.driverId)) issues.push(`${where}: drives more than one car`);
		seen.add(r.driverId);
		perTeam.set(r.constructorId, (perTeam.get(r.constructorId) ?? 0) + 1);
		const d = driver(r.driverId);
		if (!d) {
			issues.push(`${where}: unknown driver`);
			continue;
		}
		// non-starters stay as listed (a driver killed in practice is still on that weekend's entry list)
		if (isStart(r) && d.dateOfDeath && d.dateOfDeath < race.date) issues.push(`${where}: races after their death (${d.dateOfDeath})`);
		if (opts.ages) {
			const age = ageAt(d.dateOfBirth, race.date);
			if (age == null || age < MIN_AGE || age > MAX_AGE) issues.push(`${where}: aged ${age}`);
		}
	}
	if (opts.seats)
		for (const [team, n] of perTeam) {
			const max = opts.seats.get(team) ?? 0;
			if (n > max) issues.push(`${race.year} R${race.round} ${team}: ${n} cars for ${max} seats`);
		}
	return issues;
}
