// Grand Prix (per race) records: length, distance, finishers, duration,
// average speed, winning margin, nationalities on the grid.

import { isStart, type Db } from "../dataset.ts";
import { cDriver, cRace, cText, fmt, ranked, type Draft } from "./cells.ts";
import { facts, isClassified, type RaceFacts } from "./facts.ts";
import type { RecordRow } from "./types.ts";

/** "1:33:56.736" / "25:38.426" / "58.2" -> milliseconds. */
export function parseTime(s: string | null): number | null {
	if (!s) return null;
	const m = s.trim().replace(/^\+/, "");
	if (!/^[\d:.]+$/.test(m)) return null;
	const parts = m.split(":").map(Number);
	if (parts.some((p) => Number.isNaN(p))) return null;
	let sec = 0;
	for (const p of parts) sec = sec * 60 + p;
	return Math.round(sec * 1000);
}

export function clock(ms: number): string {
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	const s = (ms % 60000) / 1000;
	const ss = s.toFixed(3).padStart(6, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Winning margin: seconds, or laps (encoded as 1e9 + laps so they rank above any time gap). */
function margin(f: RaceFacts): { value: number; display: string } | null {
	const second = f.results.find((r) => r.position === 2);
	if (!second?.gap) return null;
	const laps = second.gap.match(/\+?(\d+)\s*laps?/i);
	if (laps) return { value: 1e9 + Number(laps[1]), display: `${laps[1]} lap${laps[1] === "1" ? "" : "s"}` };
	const ms = parseTime(second.gap);
	if (ms == null) return null;
	return { value: ms, display: `${(ms / 1000).toFixed(3)}s` };
}

type RaceMetric = { value: (f: RaceFacts, db: Db) => number | null; display: (v: number, f: RaceFacts) => string };

const winnerDuration = (f: RaceFacts) => (f.winner ? parseTime(f.winner.time) : null);

export const RACE_METRICS = {
	laps: { value: (f) => f.race.laps || null, display: (v) => `${fmt(v)} laps` },
	distance: { value: (f) => f.race.distance || null, display: (v) => `${fmt(Math.round(v * 10) / 10)} km` },
	finishers: { value: (f) => f.results.filter(isClassified).length, display: (v) => fmt(v) },
	duration: { value: winnerDuration, display: (v) => clock(v) },
	speed: {
		value: (f) => {
			const ms = winnerDuration(f);
			if (!ms || !f.race.distance || !f.winner?.laps) return null;
			const km = f.winner.laps * f.race.courseLength || f.race.distance;
			return Math.round((km / (ms / 3600000)) * 1000) / 1000;
		},
		display: (v) => `${v.toFixed(3)} km/h`,
	},
	margin: { value: (f) => margin(f)?.value ?? null, display: (_v, f) => margin(f)?.display ?? "" },
	nations: {
		value: (f, db) => new Set(f.results.filter(isStart).map((r) => db.drivers.get(r.driverId)?.nationality)).size || null,
		display: (v) => fmt(v),
	},
} satisfies Record<string, RaceMetric>;

export type RaceMetricId = keyof typeof RACE_METRICS;

export function raceExtremes(db: Db, metric: RaceMetricId, dir: "asc" | "desc"): RecordRow[] {
	const m: RaceMetric = RACE_METRICS[metric];
	const rows: Draft[] = [];
	for (const f of facts(db).races) {
		const v = m.value(f, db);
		if (v == null) continue;
		rows.push({
			key: String(f.race.id),
			subject: [cRace(db, f.race)],
			value: v,
			display: m.display(v, f),
			detail: f.winner ? [cText("won by"), cDriver(db, f.winner.driverId)] : undefined,
			tie: f.idx,
		});
	}
	return ranked(rows, dir);
}
