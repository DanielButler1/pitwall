// Builds the circuit list for the "Guess the circuit" game (public/data/circuit-guess.json,
// written by scripts/build-client-data.ts): every circuit that held a championship race, with
// its layout, the Grands Prix held there and its most successful drivers.

import type { Db } from "../f1/dataset.ts";
import { fold } from "./daily.ts";
import type { CircuitFile, CircuitType, PackedCircuit } from "./circuit-guess.ts";

/** "interlagos" -> "Interlagos" when the circuit's name doesn't already say it (José Carlos Pace). */
function aliasFor(id: string, name: string, fullName: string): string | null {
	const words = id.split("-");
	const known = fold(`${name} ${fullName}`).replace(/[^a-z0-9]+/g, " ");
	if (words.every((w) => known.includes(w))) return null;
	return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function circuitFile(db: Db): CircuitFile {
	const grandsPrix: Record<string, string> = {};
	const drivers: Record<string, string> = {};
	const circuits: PackedCircuit[] = [];
	for (const [id, races] of db.racesByCircuit) {
		const run = races.filter((r) => db.resultsByRace.has(r.id));
		if (!run.length) continue;
		const c = db.circuits.get(id);
		if (!c) continue;
		const gps = new Map<string, [string, number, number, number]>();
		const wins = new Map<string, number>();
		for (const r of run) {
			const g = gps.get(r.grandPrixId);
			if (g) {
				g[1] = Math.min(g[1], r.year);
				g[2] = Math.max(g[2], r.year);
				g[3]++;
			} else gps.set(r.grandPrixId, [r.grandPrixId, r.year, r.year, 1]);
			for (const res of db.resultsByRace.get(r.id) ?? []) if (res.position === 1) wins.set(res.driverId, (wins.get(res.driverId) ?? 0) + 1);
		}
		const gpList = [...gps.values()].sort((a, b) => b[3] - a[3] || a[1] - b[1]);
		for (const [g] of gpList) grandsPrix[g] ??= db.grandsPrix.get(g)?.fullName ?? g;
		const winners = [...wins].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
		for (const [d] of winners) drivers[d] ??= db.drivers.get(d)?.name ?? d;
		const years = run.map((r) => r.year);
		const country = db.countries.get(c.country);
		circuits.push([
			id,
			c.name,
			aliasFor(id, c.name, c.fullName),
			c.fullName,
			c.place,
			country?.alpha2 ?? null,
			c.country,
			country?.name ?? c.country,
			Math.round(c.lat * 1e4) / 1e4,
			Math.round(c.lng * 1e4) / 1e4,
			c.type as CircuitType,
			c.direction,
			c.length,
			c.turns,
			Math.min(...years),
			Math.max(...years),
			run.length,
			gpList,
			winners,
		]);
	}
	circuits.sort((a, b) => a[0].localeCompare(b[0]));
	return { grandsPrix, drivers, circuits };
}
