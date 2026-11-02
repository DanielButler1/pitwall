// The FIA documents' data (data/stewards/<year>.json, from scripts/fia-docs.mjs) in f1.json's compact form,
// one row per race: [raceId, decisions, deleted lap times, new power unit elements]
//   decisions:   [[driverId, session, [penalty code, ...]], ...]
//                T5 (5 s), SG10 (stop and go), DT (drive-through), G3 (3 grid places), BG (back of the grid),
//                PL (pit lane start), DQ, R / RN (driving / other reprimand), W (warning), F5000 (€), P2 (points),
//                LD2 (lap times deleted), L1 (penalty laps),
//                BAN (race ban), N (no penalty)
//   deleted:     [[session, driverId, lap times], ...]
//   newPu:       [[driverId, [element, ...]], ...]  (ICE, TC, MGU-H, MGU-K, ES, CE, EX)

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CODE = {
	time: (p) => `T${p.seconds}`,
	stopGo: (p) => `SG${p.seconds ?? ""}`,
	driveThrough: () => "DT",
	grid: (p) => `G${p.places}`,
	backOfGrid: () => "BG",
	pitLane: () => "PL",
	dsq: () => "DQ",
	reprimand: (p) => (p.driving ? "R" : "RN"),
	warning: () => "W",
	fine: (p) => `F${p.euros}`,
	points: (p) => `P${p.points}`,
	lapDeleted: (p) => `LD${p.laps}`,
	penaltyLap: (p) => `L${p.laps}`,
	ban: () => "BAN",
	none: () => "N",
};

/** @returns {{ rows: any[], count: { races: number, decisions: number } }} */
export function buildStewards(dir, races) {
	const rows = [];
	const count = { races: 0, decisions: 0 };
	if (!existsSync(dir)) return { rows, count };
	const byRound = new Map(races.map((r) => [`${r.year}|${r.round}`, r.id]));
	for (const name of readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort()) {
		const year = Number(name.slice(0, 4));
		const season = JSON.parse(readFileSync(join(dir, name), "utf8"));
		for (const [round, r] of Object.entries(season)) {
			const raceId = byRound.get(`${year}|${Number(round)}`);
			if (raceId == null) continue;
			const decisions = (r.decisions ?? []).filter((d) => d.driverId).map((d) => [d.driverId, d.session ?? null, d.penalties.map((p) => CODE[p.type]?.(p)).filter(Boolean)]);
			const deleted = Object.entries(r.deletedLaps ?? {}).flatMap(([session, per]) => Object.entries(per).map(([id, n]) => [session, id, n]));
			const newPu = Object.entries(r.newPu ?? {});
			rows.push([raceId, decisions, deleted, newPu]);
			count.races++;
			count.decisions += decisions.length;
		}
	}
	rows.sort((a, b) => a[0] - b[0]);
	return { rows, count };
}
