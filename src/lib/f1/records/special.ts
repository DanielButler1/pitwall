// Bespoke records that don't fit the metric x aggregation grid: podium and
// front-row combinations, teammates, grid averages, debuts, women, families...

import { isStart, type Db, type Result } from "../dataset.ts";
import { cDriver, cEntity, cRace, cSeason, cTeam, cText, cDate, daysText, fmt, ranked, sequence, type Draft } from "./cells.ts";
import { ageDaysAt, ageText, facts, isClassified, participation, series, type Kind } from "./facts.ts";
import type { RecordRow } from "./types.ts";

const raceAt = (db: Db, idx: number) => facts(db).races[idx].race;
const yearSpan = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);

/** Combinations of drivers sharing a podium / the front row. */
export function combos(db: Db, mode: "identical" | "trio" | "duo" | "duo12" | "front-row"): RecordRow[] {
	const counts = new Map<string, { ids: string[]; races: number[] }>();
	for (const f of facts(db).races) {
		let ids: string[];
		if (mode === "front-row") ids = f.results.filter((r) => isStart(r) && r.grid != null && r.grid <= 2).sort((a, b) => a.grid! - b.grid!).map((r) => r.driverId);
		else {
			const top = f.results.filter((r) => r.position != null && r.position <= (mode === "duo12" ? 2 : 3)).sort((a, b) => a.position! - b.position!);
			ids = top.map((r) => r.driverId);
		}
		ids = [...new Set(ids)];
		const groups: string[][] = [];
		if (mode === "identical") ids.length === 3 && groups.push(ids);
		else if (mode === "trio") ids.length === 3 && groups.push([...ids].sort());
		else for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) groups.push([ids[i], ids[j]].sort());
		for (const g of groups) {
			const k = g.join("|");
			const x = counts.get(k) ?? { ids: g, races: [] };
			x.races.push(f.idx);
			counts.set(k, x);
		}
	}
	return ranked(
		[...counts]
			.filter(([, x]) => x.races.length >= 2)
			.map(([k, x]) => ({
				key: k,
				subject: x.ids.map((id) => cDriver(db, id)),
				value: x.races.length,
				display: fmt(x.races.length),
				detail: [cText(yearSpan(raceAt(db, x.races[0]).year, raceAt(db, x.races[x.races.length - 1]).year))],
				tie: x.races[x.races.length - 1],
			})),
	);
}

/** Pairs of teammates (same constructor, both started). */
export function teammates(db: Db): RecordRow[] {
	const counts = new Map<string, { a: string; b: string; team: Set<string>; races: number[] }>();
	for (const f of facts(db).races) {
		const byTeam = new Map<string, string[]>();
		for (const r of f.results) if (isStart(r)) byTeam.set(r.constructorId, [...new Set([...(byTeam.get(r.constructorId) ?? []), r.driverId])]);
		for (const [team, ids] of byTeam)
			for (let i = 0; i < ids.length; i++)
				for (let j = i + 1; j < ids.length; j++) {
					const [a, b] = [ids[i], ids[j]].sort();
					const k = `${a}|${b}`;
					const x = counts.get(k) ?? { a, b, team: new Set(), races: [] };
					x.team.add(team);
					if (x.races[x.races.length - 1] !== f.idx) x.races.push(f.idx);
					counts.set(k, x);
				}
	}
	return ranked(
		[...counts].map(([k, x]) => ({
			key: k,
			subject: [cDriver(db, x.a), cDriver(db, x.b)],
			value: x.races.length,
			display: fmt(x.races.length),
			detail: [...[...x.team].map((t) => cTeam(db, t)), cText(yearSpan(raceAt(db, x.races[0]).year, raceAt(db, x.races[x.races.length - 1]).year))],
			tie: x.races[x.races.length - 1],
		})),
	);
}

/** Grands Prix a driver started alongside (as teammate of) a world champion / race winner. */
export function startsWithTeammate(db: Db, kind: "champion" | "winner"): RecordRow[] {
	const champs = new Set(series(db, "driver", "wins").keys());
	if (kind === "champion") {
		champs.clear();
		for (const rows of db.driverStandings.values()) for (const r of rows) if (r.champion) champs.add(r.id);
	}
	const counts = new Map<string, Set<number>>();
	for (const f of facts(db).races) {
		const byTeam = new Map<string, string[]>();
		for (const r of f.results) if (isStart(r)) byTeam.set(r.constructorId, [...(byTeam.get(r.constructorId) ?? []), r.driverId]);
		for (const ids of byTeam.values())
			for (const id of ids)
				if (ids.some((o) => o !== id && champs.has(o))) counts.set(id, (counts.get(id) ?? new Set()).add(f.idx));
	}
	return ranked([...counts].map(([id, s]) => ({ key: id, subject: [cDriver(db, id)], value: s.size, display: fmt(s.size) })));
}

/** Average age of the podium (or the starting grid) per race. */
export function averageAge(db: Db, who: "podium" | "grid", dir: "asc" | "desc"): RecordRow[] {
	const rows: Draft[] = [];
	for (const f of facts(db).races) {
		const list = f.results.filter((r) => (who === "podium" ? r.position != null && r.position <= 3 : isStart(r)));
		const ages = list.map((r) => ageDaysAt(db, r.driverId, f.race.date)).filter((a): a is number => a != null);
		if (!ages.length || (who === "podium" && ages.length < 3)) continue;
		const avg = ages.reduce((a, b) => a + b, 0) / ages.length;
		rows.push({
			key: String(f.race.id),
			subject: [cRace(db, f.race)],
			value: Math.round(avg),
			display: daysText(avg),
			detail: who === "podium" ? list.map((r) => cDriver(db, r.driverId)) : [cText(`${ages.length} starters`)],
			tie: f.idx,
		});
	}
	return ranked(rows, dir);
}

/** Average age of each driver across all their starts. */
export function driverAverageAge(db: Db, dir: "asc" | "desc"): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of participation(db, "driver")) {
		if (list.length < 10) continue;
		const ages = list.map((i) => ageDaysAt(db, id, raceAt(db, i).date)).filter((a): a is number => a != null);
		if (!ages.length) continue;
		const avg = ages.reduce((a, b) => a + b, 0) / ages.length;
		rows.push({ key: id, subject: [cDriver(db, id)], value: Math.round(avg), display: daysText(avg), detail: [cText(`${list.length} GPs`)] });
	}
	return ranked(rows, dir);
}

/** Average starting position (minimum starts). */
export function averageGrid(db: Db, minStarts = 20): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of db.resultsByDriver) {
		const grids = list.filter((r) => isStart(r) && r.grid != null && r.grid > 0).map((r) => r.grid!);
		if (grids.length < minStarts) continue;
		const avg = grids.reduce((a, b) => a + b, 0) / grids.length;
		rows.push({ key: id, subject: [cDriver(db, id)], value: Math.round(avg * 1000) / 1000, display: avg.toFixed(2), detail: [cText(`${grids.length} starts`)] });
	}
	return ranked(rows, "asc");
}

/** Biggest gain from grid to finish in one race. */
export function positionsGained(db: Db): RecordRow[] {
	const rows: Draft[] = [];
	for (const f of facts(db).races)
		for (const r of f.results) {
			if (!isClassified(r) || r.grid == null || r.grid <= 0 || r.position == null) continue;
			const gain = r.grid - r.position;
			if (gain < 10) continue;
			rows.push({
				key: `${r.driverId}|${f.idx}`,
				subject: [cDriver(db, r.driverId)],
				value: gain,
				display: `+${gain}`,
				detail: [cRace(db, f.race), cText(`${r.grid} to ${r.position}`)],
				tie: f.idx,
			});
		}
	return ranked(rows);
}

/** Grid position or result on a driver's first / last Grand Prix. */
export function debutOrFinal(db: Db, which: "first" | "last", what: "grid" | "result"): RecordRow[] {
	const p = participation(db, "driver");
	const rows: Draft[] = [];
	for (const [id, list] of p) {
		const idx = which === "first" ? list[0] : list[list.length - 1];
		const r = facts(db).races[idx].results.find((x) => x.driverId === id && isStart(x));
		if (!r) continue;
		const v = what === "grid" ? r.grid : r.position;
		if (v == null || v <= 0) continue;
		rows.push({ key: id, subject: [cDriver(db, id)], value: v, display: what === "grid" ? `P${v}` : String(v), detail: [cRace(db, raceAt(db, idx))], tie: idx });
	}
	return ranked(rows, "asc");
}

/** Entrants that never made a start, by number of attempts. */
export function neverQualified(db: Db, kind: "driver" | "constructor"): RecordRow[] {
	const by = kind === "driver" ? db.resultsByDriver : db.resultsByConstructor;
	const rows: Draft[] = [];
	for (const [id, list] of by) {
		if (list.some(isStart)) continue;
		const years = list.map((r) => db.raceById.get(r.raceId)!.year);
		rows.push({ key: id, subject: [cEntity(db, kind, id)], value: list.length, display: fmt(list.length), detail: [cText(yearSpan(Math.min(...years), Math.max(...years)))] });
	}
	return ranked(rows);
}

/** Different opponents a driver started against. */
export function competitors(db: Db): RecordRow[] {
	const opp = new Map<string, Set<string>>();
	for (const f of facts(db).races) {
		const ids = [...new Set(f.results.filter(isStart).map((r) => r.driverId))];
		for (const id of ids) {
			const s = opp.get(id) ?? new Set();
			for (const o of ids) if (o !== id) s.add(o);
			opp.set(id, s);
		}
	}
	return ranked([...opp].map(([id, s]) => ({ key: id, subject: [cDriver(db, id)], value: s.size, display: fmt(s.size) })));
}

export function women(db: Db): RecordRow[] {
	const p = participation(db, "driver");
	const rows: Draft[] = [];
	for (const d of db.drivers.values()) {
		if (d.gender !== "F") continue;
		const entries = db.resultsByDriver.get(d.id) ?? [];
		if (!entries.length) continue;
		const starts = p.get(d.id)?.length ?? 0;
		const points = entries.reduce((s, r) => s + r.points, 0);
		const years = entries.map((r) => db.raceById.get(r.raceId)!.year);
		rows.push({
			key: d.id,
			subject: [cDriver(db, d.id)],
			value: starts * 1000 + entries.length,
			display: `${starts} start${starts === 1 ? "" : "s"}`,
			detail: [cText(`${entries.length} entries`), cText(points ? `${fmt(points)} pts` : ""), cText(yearSpan(Math.min(...years), Math.max(...years)))],
		});
	}
	return ranked(rows);
}

const RELATION: Record<string, string> = {
	CHILD: "child of",
	PARENT: "parent of",
	SIBLING: "sibling of",
	HALF_SIBLING: "half-sibling of",
	SIBLINGS_CHILD: "nephew/niece of",
	PARENTS_SIBLING: "uncle/aunt of",
	PARENTS_SIBLINGS_CHILD: "cousin of",
	SIBLING_IN_LAW: "sibling-in-law of",
	CHILD_IN_LAW: "child-in-law of",
	PARENT_IN_LAW: "parent-in-law of",
	GRANDCHILD: "grandchild of",
	GRANDPARENT: "grandparent of",
	GRANDPARENTS_SIBLING: "great-uncle/aunt of",
	SIBLINGS_GRANDCHILD: "great-nephew/niece of",
	SIBLINGS_CHILD_IN_LAW: "nephew/niece-in-law of",
};

export function family(db: Db): RecordRow[] {
	const p = participation(db, "driver");
	const rows: Draft[] = [];
	const seen = new Set<string>();
	for (const link of db.families) {
		if (!db.resultsByDriver.has(link.driverId) || !db.resultsByDriver.has(link.relatedId)) continue;
		const pair = [link.driverId, link.relatedId].sort().join("|");
		if (seen.has(pair)) continue;
		seen.add(pair);
		const starts = (p.get(link.driverId)?.length ?? 0) + (p.get(link.relatedId)?.length ?? 0);
		rows.push({
			key: `${link.driverId}|${link.relatedId}`,
			subject: [cDriver(db, link.driverId)],
			value: starts,
			display: RELATION[link.type] ?? link.type.toLowerCase().replace(/_/g, " "),
			detail: [cDriver(db, link.relatedId), cText(`${starts} GPs combined`)],
		});
	}
	rows.sort((a, b) => b.value - a.value);
	return sequence(rows.map((r, i) => ({ ...r, value: i })), 2000);
}

/**
 * Grand Prix drivers who have died, most recent first,
 * with their age; deaths during a Grand Prix meeting name the race.
 */
export function passedAway(db: Db, kind: Kind = "driver"): RecordRow[] {
	void kind;
	const rows: Draft[] = [];
	for (const d of db.drivers.values()) {
		if (!d.dateOfDeath) continue;
		const list = db.resultsByDriver.get(d.id);
		if (!list) continue;
		const death = Date.parse(d.dateOfDeath);
		const at = list.find((r) => {
			const day = Date.parse(db.raceById.get(r.raceId)!.date);
			return death >= day - 3 * 86400000 && death <= day + 2 * 86400000;
		});
		const race = at ? db.raceById.get(at.raceId)! : null;
		rows.push({
			key: d.id,
			subject: [cDriver(db, d.id)],
			value: -death,
			display: ageText(db, d.id, d.dateOfDeath),
			detail: [cDate(d.dateOfDeath), ...(race ? [cText("at the"), cRace(db, race), cSeason(race.year)] : [])],
		});
	}
	rows.sort((a, b) => b.value - a.value);
	return sequence(rows, 2000);
}

/** For each starting grid position, the drivers who started there most often. */
export function gridPositions(db: Db): RecordRow[] {
	const per = new Map<number, Map<string, number>>();
	for (const f of facts(db).races)
		for (const r of f.results) {
			if (!isStart(r) || r.grid == null || r.grid <= 0) continue;
			const m = per.get(r.grid) ?? new Map<string, number>();
			m.set(r.driverId, (m.get(r.driverId) ?? 0) + 1);
			per.set(r.grid, m);
		}
	return [...per]
		.sort((a, b) => a[0] - b[0])
		.map(([grid, m], i) => {
			const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 3);
			return {
				rank: i + 1,
				key: String(grid),
				subject: [cText(`Grid ${grid}`)],
				value: top[0][1],
				display: fmt(top[0][1]),
				detail: top.flatMap(([id, n], j) => [cDriver(db, id), cText(j === 0 ? "" : `${n}`)]),
			};
		});
}

/** Drivers who only ever drove in Friday practice as test/third drivers, by practice weekends. */
export function thirdDriversOnly(db: Db): RecordRow[] {
	const rows: Draft[] = [];
	for (const t of db.thirdDrivers ?? []) {
		if (!db.drivers.has(t.driverId) || db.resultsByDriver.has(t.driverId)) continue;
		rows.push({
			key: t.driverId,
			subject: [cDriver(db, t.driverId)],
			value: t.weekends,
			display: fmt(t.weekends),
			detail: [...t.constructorIds.filter((c) => db.constructors.has(c)).map((c) => cTeam(db, c)), cText(t.firstYear === t.lastYear ? String(t.firstYear) : `${t.firstYear}–${t.lastYear}`)],
			tie: -t.lastYear,
		});
	}
	return ranked(rows);
}

/** Seasons contested (with at least one start). */
export function seasonsCount(db: Db, kind: Kind): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of participation(db, kind)) {
		const ys = [...new Set(list.map((i) => raceAt(db, i).year))];
		rows.push({ key: id, subject: [cEntity(db, kind, id)], value: ys.length, display: fmt(ys.length), detail: [cText(yearSpan(ys[0], ys[ys.length - 1]))], tie: ys[ys.length - 1] });
	}
	return ranked(rows);
}

/** Entities that started N Grands Prix without ever achieving any of the given results. */
export function startsWithout(db: Db, kind: Kind, never: (keyof typeof import("./facts.ts").METRICS)[]): RecordRow[] {
	const exclude = new Set<string>();
	for (const m of never) for (const id of series(db, kind, m).keys()) exclude.add(id);
	const rows: Draft[] = [];
	for (const [id, list] of participation(db, kind)) {
		if (exclude.has(id)) continue;
		rows.push({
			key: id,
			subject: [cEntity(db, kind, id)],
			value: list.length,
			display: fmt(list.length),
			detail: [cText(yearSpan(raceAt(db, list[0]).year, raceAt(db, list[list.length - 1]).year))],
			tie: list[list.length - 1],
		});
	}
	return ranked(rows);
}

/** Pairs (entity, partner) by number of starts together (e.g. constructor with the same driver). */
export function startsWithSame(db: Db, kind: Kind, other: Kind): RecordRow[] {
	const counts = new Map<string, { a: string; b: string; races: Set<number> }>();
	for (const f of facts(db).races)
		for (const r of f.results) {
			if (!isStart(r)) continue;
			const a = key(db, kind, r);
			const b = key(db, other, r);
			if (!a || !b) continue;
			const k = `${a}|${b}`;
			const x = counts.get(k) ?? { a, b, races: new Set() };
			x.races.add(f.idx);
			counts.set(k, x);
		}
	return ranked(
		[...counts].map(([k, x]) => {
			const rs = [...x.races];
			return {
				key: k,
				subject: [cEntity(db, kind, x.a)],
				value: rs.length,
				display: fmt(rs.length),
				detail: [cEntity(db, other, x.b), cText(yearSpan(raceAt(db, rs[0]).year, raceAt(db, rs[rs.length - 1]).year))],
				tie: rs[rs.length - 1],
			};
		}),
	);
}

function key(db: Db, kind: Kind, r: Result) {
	switch (kind) {
		case "driver":
			return r.driverId;
		case "constructor":
			return r.constructorId;
		case "engine":
			return r.engineId;
		case "nation":
			return db.drivers.get(r.driverId)?.nationality ?? null;
		case "number":
			return r.number;
	}
}

/** Distinct drivers who started for an entity. */
export function driversOf(db: Db, kind: Kind): RecordRow[] {
	const m = new Map<string, Set<string>>();
	for (const r of db.results) {
		if (!isStart(r)) continue;
		const k = key(db, kind, r);
		if (!k) continue;
		m.set(k, (m.get(k) ?? new Set()).add(r.driverId));
	}
	return ranked([...m].map(([k, s]) => ({ key: k, subject: [cEntity(db, kind, k)], value: s.size, display: fmt(s.size) })));
}

/** Youngest driver to achieve a metric for the first time (shared helper for hat trick / grand slam / front row by age). */
export { ageText };
