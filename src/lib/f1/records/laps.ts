// Records built on lap-leader data (Jolpica, since 1996). Only races whose lap
// data still matches the Db's results count (see ../laps.ts), so a universe that
// changed a race leaves it out instead of showing figures from the real race.

import type { Db } from "../dataset.ts";
import { lapCoverage, lapLedRaces } from "../laps.ts";
import { cCircuit, cDriver, cEntity, cGp, cRace, cText, fmt, ranked, type Draft } from "./cells.ts";
import { facts, keyOf, participation, series, type Kind, type MetricId } from "./facts.ts";
import type { RecordRow } from "./types.ts";

/** Race indexes (facts order) with usable lap-leader data. */
export function coveredIdx(db: Db): Set<number> {
	const races = lapLedRaces(db);
	return new Set(facts(db).races.filter((f) => races.has(f.race.id)).map((f) => f.idx));
}

/** Keep rows whose entity (row key) made its debut within the lap-data era: their "first" is then a real first. */
export function debutInCoverage(db: Db, kind: Kind, rows: RecordRow[]): RecordRow[] {
	const from = lapCoverage(db).from;
	const p = participation(db, kind);
	const races = facts(db).races;
	const kept = rows.filter((r) => {
		const first = p.get(r.key.split("|")[0])?.[0];
		return first != null && races[first].race.year >= from;
	});
	return kept.map((r, i) => {
		let j = i;
		while (j > 0 && kept[j - 1].value === r.value) j--;
		return { ...r, rank: j + 1 };
	});
}

/**
 * Longest runs of consecutive laps led (or km led), carried across races: a run
 * continues into the next race only if the entity led its opening lap. A race
 * without usable lap data ends every run.
 */
export function consecutiveLaps(db: Db, kind: Kind, km: boolean): RecordRow[] {
	const races = lapLedRaces(db);
	type Run = { id: string; laps: number; km: number; from: number; to: number };
	const done: Run[] = [];
	let carry: Run | null = null;
	for (const f of facts(db).races) {
		const spans = races.get(f.race.id);
		if (!spans) {
			if (carry) done.push(carry);
			carry = null;
			continue;
		}
		const keyOfDriver = new Map(f.results.map((r) => [r.driverId, keyOf(db, kind, r)]));
		let cur: Run | null = carry;
		let prevEnd = 0;
		for (const [driverId, a, b] of spans) {
			const id = keyOfDriver.get(driverId) ?? null;
			const n = b - a + 1;
			if (cur && id != null && cur.id === id && a === prevEnd + 1) {
				cur.laps += n;
				cur.km += n * f.race.courseLength;
				cur.to = f.idx;
			} else {
				if (cur) done.push(cur);
				cur = id == null ? null : { id, laps: n, km: n * f.race.courseLength, from: f.idx, to: f.idx };
			}
			prevEnd = b;
		}
		carry = cur;
	}
	if (carry) done.push(carry);
	const all = facts(db).races;
	const rows: Draft[] = done
		.filter((r) => r.laps >= 2)
		.map((r) => {
			const v = km ? Math.round(r.km * 10) / 10 : r.laps;
			return {
				key: `${r.id}|${r.from}|${r.laps}`,
				subject: [cEntity(db, kind, r.id)],
				value: v,
				display: km ? `${fmt(v, 1)} km` : fmt(v),
				detail: r.from === r.to ? [cRace(db, all[r.from].race)] : [cRace(db, all[r.from].race), cText("to"), cRace(db, all[r.to].race)],
				tie: r.from,
			};
		});
	return ranked(rows);
}

/** Sum of a metric per entity at one Grand Prix or circuit (e.g. laps led at Monaco). */
export function sumByPlace(db: Db, kind: Kind, metric: MetricId, place: "gp" | "circuit", unit = ""): RecordRow[] {
	const all = facts(db).races;
	const counts = new Map<string, { id: string; p: string; n: number; years: Set<number> }>();
	for (const [id, list] of series(db, kind, metric)) {
		for (const e of list) {
			const race = all[e.idx].race;
			const p = place === "gp" ? race.grandPrixId : race.circuitId;
			const k = `${id}|${p}`;
			const x = counts.get(k) ?? { id, p, n: 0, years: new Set<number>() };
			x.n += e.n;
			x.years.add(race.year);
			counts.set(k, x);
		}
	}
	return ranked(
		[...counts].map(([k, x]) => {
			const v = Math.round(x.n * 10) / 10;
			return {
				key: k,
				subject: [cEntity(db, kind, x.id)],
				value: v,
				display: `${fmt(v, 1)}${unit}`,
				detail: [place === "gp" ? cGp(db, x.p) : cCircuit(db, x.p), cText([...x.years].sort((a, b) => a - b).join(", "))],
				tie: Math.max(...x.years),
			};
		}),
	);
}

/** Each event of a metric, grouped per driver with the races listed (e.g. wins taking the lead on the last lap). */
export function eventsByDriver(db: Db, metric: MetricId, describe?: (raceIdx: number, driverId: string) => string): RecordRow[] {
	const all = facts(db).races;
	const rows: Draft[] = [];
	for (const [id, list] of series(db, "driver", metric)) {
		const hits = list.filter((e) => e.n > 0);
		if (!hits.length) continue;
		rows.push({
			key: id,
			subject: [cDriver(db, id)],
			value: hits.length,
			display: fmt(hits.length),
			detail: hits.flatMap((e) => {
				const note = describe?.(e.idx, id);
				return [cRace(db, all[e.idx].race), ...(note ? [cText(note)] : [])];
			}),
			tie: hits[hits.length - 1].idx,
		});
	}
	return ranked(rows);
}

/** Classified position of a driver in a race (by facts index), e.g. "P2". */
export function classifiedAs(db: Db, idx: number, driverId: string): string {
	const r = facts(db).races[idx].results.find((x) => x.driverId === driverId);
	return r ? (/^\d+$/.test(r.positionText) ? `classified P${r.positionText}` : r.positionText) : "";
}

/** Grands Prix by number of different leaders. */
export function raceLeaders(db: Db, dir: "asc" | "desc"): RecordRow[] {
	const races = lapLedRaces(db);
	const rows: Draft[] = [];
	for (const f of facts(db).races) {
		const spans = races.get(f.race.id);
		if (!spans?.length) continue;
		const leaders = [...new Set(spans.map((s) => s[0]))];
		const changes = spans.length - 1;
		rows.push({
			key: String(f.race.id),
			subject: [cRace(db, f.race)],
			value: leaders.length,
			display: fmt(leaders.length),
			detail: [...leaders.map((d) => cDriver(db, d)), cText(`${changes} lead change${changes === 1 ? "" : "s"}`)],
			tie: dir === "desc" ? -changes : changes,
		});
	}
	return ranked(rows, dir);
}

/** Drivers who never led a lap, by Grands Prix started (careers that began in the lap-data era). */
export function startsWithoutLeading(db: Db): RecordRow[] {
	const covered = coveredIdx(db);
	const ledBy = series(db, "driver", "gpsLed");
	const all = facts(db).races;
	const from = lapCoverage(db).from;
	const rows: Draft[] = [];
	for (const [id, list] of participation(db, "driver")) {
		if (ledBy.has(id) || !list.length || all[list[0]].race.year < from) continue;
		const n = list.filter((i) => covered.has(i)).length;
		if (!n) continue;
		const a = all[list[0]].race.year;
		const b = all[list[list.length - 1]].race.year;
		rows.push({ key: id, subject: [cDriver(db, id)], value: n, display: fmt(n), detail: [cText(a === b ? String(a) : `${a}–${b}`)], tie: list[list.length - 1] });
	}
	return ranked(rows);
}

