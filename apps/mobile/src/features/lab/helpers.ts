// Small pure helpers the Lab's editors share (the website's editors.tsx / sim-editors.tsx helpers).

import { completedRaces, isStart, type Db } from "@pitwall/core/f1/dataset";
import type { Change } from "@pitwall/core/universe/apply";
import { yearRange } from "@/lib/format";
import type { Option } from "./components/Picker";

export const FUTURE_LIMIT = 2100;
export const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
export const lastReal = (db: Db) => db.meta.lastCompletedYear;

export const driverName = (db: Db, id: string) => db.drivers.get(id)?.name ?? id;
export const teamName = (db: Db, id: string) => db.constructors.get(id)?.name ?? id;
export const raceName = (db: Db, raceId: number) => {
	const r = db.raceById.get(raceId);
	return r ? `${db.grandsPrix.get(r.grandPrixId)?.name ?? r.officialName} Grand Prix` : `Race ${raceId}`;
};

/** Seasons with completed races, newest first. */
export const yearOptions = (db: Db): Option<number>[] =>
	db.years
		.filter((y) => completedRaces(db, y).length)
		.reverse()
		.map((y) => ({ value: y, label: String(y) }));

export const spanOptions = (from: number, to: number): Option<number>[] => range(from, to).map((y) => ({ value: y, label: String(y) })).reverse();

export const raceOptions = (db: Db, year: number): Option<number>[] =>
	completedRaces(db, year).map((r) => ({ value: r.id, label: `Round ${r.round} · ${raceName(db, r.id)}`, detail: r.date }));

export const lastRaceId = (db: Db) => {
	const races = completedRaces(db, db.meta.lastCompletedYear);
	return races[races.length - 1].id;
};

const careerSpan = (db: Db, results: Db["results"] | undefined) => {
	let first = Infinity;
	let last = -Infinity;
	for (const r of results ?? []) {
		const y = db.raceById.get(r.raceId)?.year;
		if (y == null) continue;
		if (y < first) first = y;
		if (y > last) last = y;
	}
	return Number.isFinite(first) ? yearRange(first, last) : "";
};

// ~860 drivers: built once per dataset
const driverCache = new WeakMap<Db, Option<string>[]>();
const teamCache = new WeakMap<Db, Option<string>[]>();

/** Every driver with a result, by surname (as on the website), with their seasons for telling namesakes apart. */
export function driverOptions(db: Db): Option<string>[] {
	let hit = driverCache.get(db);
	if (!hit) {
		hit = [...db.drivers.values()]
			.filter((d) => db.resultsByDriver.has(d.id))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name))
			.map((d) => ({ value: d.id, label: d.name, detail: careerSpan(db, db.resultsByDriver.get(d.id)) }));
		driverCache.set(db, hit);
	}
	return hit;
}

export function teamOptions(db: Db): Option<string>[] {
	let hit = teamCache.get(db);
	if (!hit) {
		hit = [...db.constructors.values()]
			.filter((t) => db.resultsByConstructor.has(t.id))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((t) => ({ value: t.id, label: t.name, detail: careerSpan(db, db.resultsByConstructor.get(t.id)) }));
		teamCache.set(db, hit);
	}
	return hit;
}

/** Seasons the universe already simulates (so performance changes show up there). */
export function simulatedYears(changes: Change[], mode?: "dynamic") {
	const out = new Set<number>();
	for (const c of changes) {
		if (c.kind === "history-sim" && (!mode || c.mode === mode)) for (const y of range(c.fromYear, c.toYear)) out.add(y);
		if (!mode && c.kind === "season-sim") out.add(c.year);
	}
	return out;
}

export const champion = (db: Db, y: number) => db.driverStandings.get(y)?.find((r) => r.champion)?.id ?? null;

/** The team a driver raced most for in a season. */
export function mainTeam(db: Db, driverId: string, year: number) {
	const counts = new Map<string, number>();
	for (const r of db.resultsByDriver.get(driverId) ?? []) if (db.raceById.get(r.raceId)?.year === year) counts.set(r.constructorId, (counts.get(r.constructorId) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Seasons a driver started a race in reality (first and last). */
export function realCareer(db: Db, driverId: string): [number, number] | null {
	let first = Infinity;
	let last = -Infinity;
	for (const r of db.resultsByDriver.get(driverId) ?? []) {
		const y = db.raceById.get(r.raceId)?.year;
		if (y == null || !isStart(r)) continue;
		first = Math.min(first, y);
		last = Math.max(last, y);
	}
	return Number.isFinite(first) ? [first, last] : null;
}

export const standing = (db: Db, year: number, id: string, constructors = false) => (constructors ? db.constructorStandings : db.driverStandings).get(year)?.find((r) => r.id === id) ?? null;

export type Flip = { year: number; before: string; after: string };

/** Seasons whose drivers' champion differs between two universes. */
export function titleFlips(before: Db, after: Db | null, years: Iterable<number>): Flip[] {
	if (!after) return [];
	const out: Flip[] = [];
	for (const y of [...years].sort((a, b) => a - b)) {
		const b = champion(before, y);
		const a = champion(after, y);
		if (a && b && a !== b) out.push({ year: y, before: b, after: a });
	}
	return out;
}

/** "M. Schumacher": struck-out names stay on one line. */
export const shortName = (name: string) => {
	const [first, ...rest] = name.split(" ");
	return rest.length ? `${first[0]}. ${rest.join(" ")}` : name;
};

export const chaosLabel = (x: number) => (x < 0.6 ? "Form book" : x > 1.4 ? "Chaos" : "Normal race day");
export const reliabilityLabel = (x: number) => (x === 0 ? "No retirements" : x < 0.7 ? "Better than it really was" : x > 1.3 ? "Fragile" : "As it really was");
