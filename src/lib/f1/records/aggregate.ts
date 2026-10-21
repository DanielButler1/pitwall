// Generic aggregations: a metric's event series for an entity type, reduced to
// a ranked table. Every "metric x aggregation" record category is one call here.

import { isStart, type Db, type Result } from "../dataset.ts";
import { ordinal, cCircuit, cEntity, cGp, cNation, cRace, cSeason, cText, cDate, daysText, fmt, fmtDate, pct, plural, ranked, sequence, type Draft } from "./cells.ts";
import { ageDaysAt, ageText, facts, homeCountry, keyOf, METRICS, participation, series, type Ev, type Kind, type MetricId } from "./facts.ts";
import type { Cell, RecordRow } from "./types.ts";

type Ctx = { db: Db; kind: Kind; metric: MetricId };

const noun = (m: MetricId) => METRICS[m].noun as [string, string];
const isSprintMetric = (m: MetricId) => "sprintOnly" in METRICS[m];
const raceOf = (db: Db, idx: number) => facts(db).races[idx].race;
const raceCell = (db: Db, idx: number) => cRace(db, raceOf(db, idx));
const span = (db: Db, a: number, b: number): Cell[] =>
	a === b ? [raceCell(db, a)] : [raceCell(db, a), cText("to"), raceCell(db, b)];
const yearSpan = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);
const val = (n: number, decimal = false) => (decimal ? fmt(Math.round(n * 100) / 100) : fmt(n));

function evs({ db, kind, metric }: Ctx) {
	return series(db, kind, metric);
}
function parts({ db, kind, metric }: Ctx) {
	return participation(db, kind, isSprintMetric(metric));
}

/** Total per entity ("by number"). `per` adds the share of starts. */
export function total(c: Ctx, opts: { share?: boolean } = {}): RecordRow[] {
	const p = parts(c);
	const decimal = !!METRICS[c.metric as MetricId] && "decimal" in METRICS[c.metric];
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const v = list.reduce((s, e) => s + e.n, 0);
		if (!v) continue;
		const starts = p.get(id)?.length ?? 0;
		rows.push({
			key: id,
			subject: [cEntity(c.db, c.kind, id)],
			value: Math.round(v * 100) / 100,
			display: val(v, decimal),
			detail: opts.share !== false && starts ? [cText(`${pct(list.length, starts)} of ${fmt(starts)} GPs`)] : undefined,
			tie: list[list.length - 1].idx,
		});
	}
	return ranked(rows);
}

/** First event of each entity, in date order. */
export function chronology(c: Ctx): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const e = list[0];
		const race = raceOf(c.db, e.idx);
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: e.idx, display: fmtDate(race.date), date: race.date, detail: [cRace(c.db, race), ...withWho(c, e)] });
	}
	rows.sort((a, b) => a.value - b.value);
	return sequence(rows, 2000);
}

/** For non-driver entities, name the driver who scored the event. */
function withWho(c: Ctx, e: Ev): Cell[] {
	if (c.kind === "driver") return [];
	return [cEntity(c.db, "driver", e.r.driverId)];
}

/** Every time the all-time record was set or equalled. */
export function recordChronology(c: Ctx): RecordRow[] {
	const all: { id: string; e: Ev }[] = [];
	for (const [id, list] of evs(c)) for (const e of list) all.push({ id, e });
	all.sort((a, b) => a.e.idx - b.e.idx);
	const tally = new Map<string, number>();
	let record = 0;
	const rows: Draft[] = [];
	for (const { id, e } of all) {
		const t = Math.round(((tally.get(id) ?? 0) + e.n) * 100) / 100;
		tally.set(id, t);
		if (t >= record) {
			const equal = t === record;
			record = t;
			const race = raceOf(c.db, e.idx);
			rows.push({
				key: `${id}|${e.idx}`,
				subject: [cEntity(c.db, c.kind, id)],
				value: rows.length,
				display: fmt(t),
				detail: [cDate(race.date), cRace(c.db, race), ...(equal ? [cText("(equalled)")] : [])],
			});
		}
	}
	return sequence(rows, 2000).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Youngest (first event) or oldest (last event) per driver. */
export function age(c: Ctx, which: "youngest" | "oldest"): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const e = which === "youngest" ? list[0] : list[list.length - 1];
		const race = raceOf(c.db, e.idx);
		const days = ageDaysAt(c.db, id, race.date);
		if (days == null) continue;
		rows.push({ key: id, subject: [cEntity(c.db, "driver", id)], value: days, display: ageText(c.db, id, race.date), detail: [cRace(c.db, race)], tie: e.idx });
	}
	return ranked(rows, which === "youngest" ? "asc" : "desc");
}

/** Youngest (age at first event) or oldest (age at last event) driver of each nation. */
export function ageByNation(c: Ctx, which: "youngest" | "oldest"): RecordRow[] {
	const old = which === "oldest";
	const best = new Map<string, { id: string; days: number; idx: number }>();
	for (const [id, list] of evs(c)) {
		const idx = old ? list[list.length - 1].idx : list[0].idx;
		const days = ageDaysAt(c.db, id, raceOf(c.db, idx).date);
		const nation = c.db.drivers.get(id)?.nationality;
		if (days == null || !nation) continue;
		const b = best.get(nation);
		if (!b || (old ? days > b.days : days < b.days)) best.set(nation, { id, days, idx });
	}
	return ranked(
		[...best].map(([nation, b]) => ({
			key: nation,
			subject: [cEntity(c.db, "driver", b.id), cNation(c.db, nation)],
			value: b.days,
			display: ageText(c.db, b.id, raceOf(c.db, b.idx).date),
			detail: [raceCell(c.db, b.idx)],
		})),
		old ? "desc" : "asc",
	);
}

/** Events on the driver's birthday. */
export function birthday(c: Ctx): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const dob = c.db.drivers.get(id)?.dateOfBirth;
		if (!dob) continue;
		for (const e of list) {
			const race = raceOf(c.db, e.idx);
			if (race.date.slice(5) !== dob.slice(5)) continue;
			const years = Number(race.date.slice(0, 4)) - Number(dob.slice(0, 4));
			rows.push({ key: `${id}|${e.idx}`, subject: [cEntity(c.db, "driver", id)], value: e.idx, display: `${ordinal(years)} birthday`, detail: [cRace(c.db, race)] });
		}
	}
	rows.sort((a, b) => a.value - b.value);
	return sequence(rows);
}

type Run = { id: string; len: number; from: number; to: number };

/** Runs of consecutive participations with the event (non-participations are skipped). */
function runs(c: Ctx, domainFor?: (id: string) => number[]): Run[] {
	const p = parts(c);
	const out: Run[] = [];
	for (const [id, list] of evs(c)) {
		const hit = new Set(list.filter((e) => e.n > 0).map((e) => e.idx));
		const domain = domainFor ? domainFor(id) : [...new Set([...(p.get(id) ?? []), ...hit])].sort((a, b) => a - b);
		let cur: Run | null = null;
		for (const i of domain) {
			if (hit.has(i)) {
				if (cur) {
					cur.len++;
					cur.to = i;
				} else cur = { id, len: 1, from: i, to: i };
			} else if (cur) {
				out.push(cur);
				cur = null;
			}
		}
		if (cur) out.push(cur);
	}
	return out;
}

export function streak(c: Ctx): RecordRow[] {
	const all = runs(c);
	const min = all.filter((r) => r.len >= 2).length >= 10 ? 2 : 1;
	return ranked(
		all
			.filter((r) => r.len >= min)
			.map((r) => ({ key: `${r.id}|${r.from}`, subject: [cEntity(c.db, c.kind, r.id)], value: r.len, display: fmt(r.len), detail: span(c.db, r.from, r.to), tie: r.from })),
	);
}

/** Consecutive events from the first race of a season. */
export function seasonStartStreak(c: Ctx): RecordRow[] {
	const f = facts(c.db);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const hit = new Set(list.map((e) => e.idx));
		const years = new Set(list.map((e) => raceOf(c.db, e.idx).year));
		for (const year of years) {
			const season = f.seasons.get(year) ?? [];
			let n = 0;
			for (const i of season) {
				if (!hit.has(i)) break;
				n++;
			}
			if (n) rows.push({ key: `${id}|${year}`, subject: [cEntity(c.db, c.kind, id)], value: n, display: fmt(n), detail: span(c.db, season[0], season[n - 1]), tie: season[0] });
		}
	}
	return ranked(rows);
}

/** Each entity's most recent event, most recent first. */
export function last(c: Ctx): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const e = list[list.length - 1];
		const since = (p.get(id) ?? []).filter((i) => i > e.idx).length;
		rows.push({
			key: id,
			subject: [cEntity(c.db, c.kind, id)],
			value: e.idx,
			display: fmtDate(raceOf(c.db, e.idx).date),
			date: raceOf(c.db, e.idx).date,
			detail: [raceCell(c.db, e.idx), ...withWho(c, e), cText(since ? `${since} GP${since === 1 ? "" : "s"} since` : "")],
		});
	}
	rows.sort((a, b) => b.value - a.value);
	return sequence(rows.map((r) => ({ ...r, value: -r.value })));
}

const daysBetween = (c: Ctx, a: number, b: number) => Math.round((Date.parse(raceOf(c.db, b).date) - Date.parse(raceOf(c.db, a).date)) / 86400000);
const gpsBetween = (p: number[] | undefined, a: number, b: number) => (p ?? []).filter((i) => i > a && i < b).length;

/** Longest time between two consecutive events (with the Grands Prix contested in between). */
export function gapBetween(c: Ctx): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		for (let i = 1; i < list.length; i++) {
			const a = list[i - 1].idx;
			const b = list[i].idx;
			const days = daysBetween(c, a, b);
			if (days < 180) continue;
			const n = gpsBetween(p.get(id), a, b);
			rows.push({ key: `${id}|${a}`, subject: [cEntity(c.db, c.kind, id)], value: days, display: daysText(days), detail: [...(n ? [cText(`${n} GPs between`)] : []), ...span(c.db, a, b)], tie: a });
		}
	}
	return ranked(rows);
}

/** Time between the first and the last event. */
export function firstToLast(c: Ctx): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		if (list.length < 2) continue;
		const a = list[0].idx;
		const b = list[list.length - 1].idx;
		const days = daysBetween(c, a, b);
		const n = gpsBetween(p.get(id), a - 1, b + 1);
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: days, display: daysText(days), detail: [cText(`${n} GPs`), ...span(c.db, a, b)], tie: a });
	}
	return ranked(rows);
}

/** Most in one season. */
export function inYear(c: Ctx): RecordRow[] {
	const f = facts(c.db);
	const decimal = "decimal" in METRICS[c.metric];
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const per = new Map<number, number>();
		for (const e of list) {
			const y = raceOf(c.db, e.idx).year;
			per.set(y, (per.get(y) ?? 0) + e.n);
		}
		for (const [year, v] of per) {
			if (!v) continue;
			const races = f.seasons.get(year)?.length ?? 0;
			rows.push({
				key: `${id}|${year}`,
				subject: [cEntity(c.db, c.kind, id)],
				value: Math.round(v * 100) / 100,
				display: val(v, decimal),
				detail: [cSeason(year), cText(`${races} races`)],
				tie: year,
			});
		}
	}
	return ranked(rows);
}

function yearsOf(c: Ctx, list: Ev[]) {
	return [...new Set(list.filter((e) => e.n > 0).map((e) => raceOf(c.db, e.idx).year))].sort((a, b) => a - b);
}

export function numberOfYears(c: Ctx): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const ys = yearsOf(c, list);
		if (!ys.length) continue;
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: ys.length, display: fmt(ys.length), detail: [cText(yearSpan(ys[0], ys[ys.length - 1]))], tie: ys[ys.length - 1] });
	}
	return ranked(rows);
}

export function consecutiveYears(c: Ctx): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const ys = yearsOf(c, list);
		let best = { len: 0, from: 0, to: 0 };
		let from = ys[0];
		for (let i = 0; i < ys.length; i++) {
			if (i > 0 && ys[i] !== ys[i - 1] + 1) from = ys[i];
			const len = ys[i] - from + 1;
			if (len > best.len) best = { len, from, to: ys[i] };
		}
		if (best.len) rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: best.len, display: fmt(best.len), detail: [cText(yearSpan(best.from, best.to))], tie: best.to });
	}
	return ranked(rows);
}

/** Number of Grands Prix needed for the first event (1 = first time out), fewest first. */
export function before(c: Ctx): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const first = list[0].idx;
		const n = (p.get(id) ?? []).filter((i) => i < first).length + 1;
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: n, display: fmt(n), detail: [raceCell(c.db, first)], tie: first });
	}
	return ranked(rows, "asc");
}

type Other = "constructor" | "engine";
const otherOf = (o: Other, r: Result) => (o === "constructor" ? r.constructorId : r.engineId);

/** Most events with the same partner (constructor or engine). */
export function withSame(c: Ctx, other: Other): RecordRow[] {
	const decimal = "decimal" in METRICS[c.metric];
	const counts = new Map<string, { id: string; o: string; n: number; first: number; last: number }>();
	for (const [id, list] of evs(c)) {
		for (const e of list) {
			const o = otherOf(other, e.r);
			const k = `${id}|${o}`;
			const x = counts.get(k) ?? { id, o, n: 0, first: e.idx, last: e.idx };
			x.n += e.n;
			x.last = e.idx;
			counts.set(k, x);
		}
	}
	return ranked(
		[...counts].map(([k, x]) => ({
			key: k,
			subject: [cEntity(c.db, c.kind, x.id)],
			value: Math.round(x.n * 100) / 100,
			display: val(x.n, decimal),
			detail: [cEntity(c.db, other, x.o), cText(yearSpan(raceOf(c.db, x.first).year, raceOf(c.db, x.last).year))],
			tie: x.last,
		})),
	);
}

export function distinctOthers(c: Ctx, other: Other): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const os = [...new Set(list.filter((e) => e.n > 0).map((e) => otherOf(other, e.r)))];
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: os.length, display: fmt(os.length), detail: os.map((o) => cEntity(c.db, other, o)), tie: list[list.length - 1].idx });
	}
	return ranked(rows);
}

type Place = "gp" | "circuit";
const placeOf = (c: Ctx, idx: number, place: Place) => {
	const r = raceOf(c.db, idx);
	return place === "gp" ? r.grandPrixId : r.circuitId;
};
const placeCell = (c: Ctx, place: Place, id: string) => (place === "gp" ? cGp(c.db, id) : cCircuit(c.db, id));

/** Most events at the same Grand Prix / circuit. */
export function byPlace(c: Ctx, place: Place): RecordRow[] {
	const counts = new Map<string, { id: string; p: string; n: number; years: number[] }>();
	for (const [id, list] of evs(c)) {
		for (const e of list) {
			const p = placeOf(c, e.idx, place);
			const k = `${id}|${p}`;
			const x = counts.get(k) ?? { id, p, n: 0, years: [] };
			x.n += 1;
			x.years.push(raceOf(c.db, e.idx).year);
			counts.set(k, x);
		}
	}
	return ranked(
		[...counts].map(([k, x]) => ({
			key: k,
			subject: [cEntity(c.db, c.kind, x.id)],
			value: x.n,
			display: fmt(x.n),
			detail: [placeCell(c, place, x.p), cText(x.years.join(", "))],
			tie: x.years[x.years.length - 1],
		})),
	);
}

/** Consecutive events at the same Grand Prix (over the editions the entity contested). */
export function placeStreak(c: Ctx): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const hit = new Set(list.map((e) => e.idx));
		const byGp = new Map<string, number[]>();
		for (const i of new Set([...(p.get(id) ?? []), ...hit])) {
			const g = placeOf(c, i, "gp");
			const l = byGp.get(g) ?? [];
			l.push(i);
			byGp.set(g, l);
		}
		for (const [g, domain] of byGp) {
			domain.sort((a, b) => a - b);
			let best = { len: 0, from: 0, to: 0 };
			let cur = { len: 0, from: 0, to: 0 };
			for (const i of domain) {
				if (hit.has(i)) cur = cur.len ? { ...cur, len: cur.len + 1, to: i } : { len: 1, from: i, to: i };
				else cur = { len: 0, from: 0, to: 0 };
				if (cur.len > best.len) best = { ...cur };
			}
			if (best.len >= 2)
				rows.push({
					key: `${id}|${g}`,
					subject: [cEntity(c.db, c.kind, id)],
					value: best.len,
					display: fmt(best.len),
					detail: [cGp(c.db, g), cText(yearSpan(raceOf(c.db, best.from).year, raceOf(c.db, best.to).year))],
					tie: best.from,
				});
		}
	}
	return ranked(rows);
}

export function distinctPlaces(c: Ctx, place: Place): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const ps = new Set(list.map((e) => placeOf(c, e.idx, place)));
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: ps.size, display: fmt(ps.size), tie: list[list.length - 1].idx });
	}
	return ranked(rows);
}

/** Events at the entity's home Grand Prix. */
export function national(c: Ctx): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const home = homeCountry(c.db, c.kind, id);
		if (!home) continue;
		const at = list.filter((e) => c.db.grandsPrix.get(raceOf(c.db, e.idx).grandPrixId)?.country === home);
		if (!at.length) continue;
		rows.push({
			key: id,
			subject: [cEntity(c.db, c.kind, id)],
			value: at.length,
			display: fmt(at.length),
			detail: [cText(at.map((e) => raceOf(c.db, e.idx).year).join(", "))],
			tie: at[at.length - 1].idx,
		});
	}
	return ranked(rows);
}

/** Average per Grand Prix contested (minimum number of starts). */
export function average(c: Ctx, minStarts: number): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const starts = p.get(id)?.length ?? 0;
		if (starts < minStarts) continue;
		const v = list.reduce((s, e) => s + e.n, 0) / starts;
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: Math.round(v * 1000) / 1000, display: v.toFixed(2), detail: [cText(`${fmt(starts)} GPs`)] });
	}
	return ranked(rows);
}

/** Average per season contested. */
export function averagePerSeason(c: Ctx, minSeasons = 3): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const seasons = new Set((p.get(id) ?? []).map((i) => raceOf(c.db, i).year)).size;
		if (seasons < minSeasons) continue;
		const v = list.reduce((s, e) => s + e.n, 0) / seasons;
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: Math.round(v * 100) / 100, display: v.toFixed(2), detail: [cText(`${seasons} seasons`)] });
	}
	return ranked(rows);
}

/** Number of Grands Prix with the event ("GP in the points"). */
export function racesWith(c: Ctx): RecordRow[] {
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const n = list.filter((e) => e.n > 0).length;
		const starts = p.get(id)?.length ?? 0;
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: n, display: fmt(n), detail: starts ? [cText(`${pct(n, starts)} of ${fmt(starts)} GPs`)] : undefined, tie: list[list.length - 1].idx });
	}
	return ranked(rows);
}

/** Total of a metric for entities that never achieved any of `never`. */
export function totalWithout(c: Ctx, never: MetricId[]): RecordRow[] {
	const exclude = new Set<string>();
	for (const m of never) for (const id of series(c.db, c.kind, m).keys()) exclude.add(id);
	const decimal = "decimal" in METRICS[c.metric];
	const p = parts(c);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		if (exclude.has(id)) continue;
		const v = list.reduce((s, e) => s + e.n, 0);
		if (!v) continue;
		const ps = p.get(id) ?? [];
		rows.push({
			key: id,
			subject: [cEntity(c.db, c.kind, id)],
			value: Math.round(v * 100) / 100,
			display: val(v, decimal),
			detail: ps.length ? [cText(yearSpan(raceOf(c.db, ps[0]).year, raceOf(c.db, ps[ps.length - 1]).year))] : undefined,
			tie: list[list.length - 1].idx,
		});
	}
	return ranked(rows);
}

/** Events of the metric before the first event of `first` (e.g. podiums before the first win). */
export function beforeFirst(c: Ctx, first: MetricId): RecordRow[] {
	const other = series(c.db, c.kind, first);
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const o = other.get(id);
		if (!o) continue;
		const n = list.filter((e) => e.idx < o[0].idx).reduce((s, e) => s + e.n, 0);
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: n, display: fmt(n), detail: [raceCell(c.db, o[0].idx)], tie: o[0].idx });
	}
	return ranked(rows);
}

/** Distinct values of a result property among events (e.g. different grid positions). */
export function distinctBy(c: Ctx, pick: (r: Result) => string | number | null): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const vs = [...new Set(list.map((e) => pick(e.r)).filter((v) => v != null))];
		if (!vs.length) continue;
		vs.sort((a, b) => Number(a) - Number(b));
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: vs.length, display: fmt(vs.length), detail: [cText(vs.join(", "))], tie: list[list.length - 1].idx });
	}
	return ranked(rows);
}

/** Every event, ranked by a value (e.g. wins from the lowest grid position). */
export function eachEvent(c: Ctx, pick: (e: Ev) => number | null, display: (v: number) => string, dir: "desc" | "asc" = "desc"): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		for (const e of list) {
			const v = pick(e);
			if (v == null) continue;
			rows.push({ key: `${id}|${e.idx}`, subject: [cEntity(c.db, c.kind, id)], value: v, display: display(v), detail: [raceCell(c.db, e.idx)], tie: e.idx });
		}
	}
	return ranked(rows, dir);
}

/** Number of distinct drivers of an entity (constructor/engine/nation/number) with the event. */
export function distinctDrivers(c: Ctx): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, list] of evs(c)) {
		const ds = [...new Set(list.map((e) => e.r.driverId))];
		rows.push({ key: id, subject: [cEntity(c.db, c.kind, id)], value: ds.length, display: fmt(ds.length), tie: list[list.length - 1].idx });
	}
	return ranked(rows);
}

/** Per-season count of different entities achieving the event. */
export function differentPerYear(c: Ctx): RecordRow[] {
	const f = facts(c.db);
	const per = new Map<number, Set<string>>();
	for (const [id, list] of evs(c)) for (const e of list) {
		const y = raceOf(c.db, e.idx).year;
		const s = per.get(y) ?? new Set();
		s.add(id);
		per.set(y, s);
	}
	return ranked(
		[...per].map(([year, s]) => ({
			key: String(year),
			subject: [cSeason(year)],
			value: s.size,
			display: fmt(s.size),
			detail: [cText(`${f.seasons.get(year)?.length ?? 0} races`)],
			tie: year,
		})),
	);
}

/** Runs of consecutive races each won by a different entity than any other in the run. */
export function differentConsecutive(c: Ctx): RecordRow[] {
	const byRace = new Map<number, string>();
	for (const [id, list] of evs(c)) for (const e of list) if (!byRace.has(e.idx)) byRace.set(e.idx, id);
	const order = [...byRace.keys()].sort((a, b) => a - b);
	const rows: Draft[] = [];
	let start = 0;
	const seen = new Map<string, number>();
	for (let i = 0; i < order.length; i++) {
		const id = byRace.get(order[i])!;
		const prev = seen.get(id);
		if (prev != null && prev >= start) {
			rows.push({ key: String(order[start]), subject: span(c.db, order[start], order[i - 1]), value: i - start, display: fmt(i - start), tie: order[start] });
			start = prev + 1;
		}
		seen.set(id, i);
	}
	rows.push({ key: String(order[start]), subject: span(c.db, order[start], order[order.length - 1]), value: order.length - start, display: fmt(order.length - start), tie: order[start] });
	return ranked(rows.filter((r) => r.value >= 3));
}

export const started = isStart;
export { keyOf };

/** Runs of consecutive Grands Prix (all races, Indianapolis 500 excluded) with the event. */
export function streakOverAllRaces(c: Ctx): RecordRow[] {
	const f = facts(c.db);
	const domain = f.races.filter((r) => r.race.grandPrixId !== "indianapolis").map((r) => r.idx);
	const all = runs(c, () => domain);
	return ranked(
		all
			.filter((r) => r.len >= 10)
			.map((r) => ({ key: `${r.id}|${r.from}`, subject: [cEntity(c.db, c.kind, r.id)], value: r.len, display: fmt(r.len), detail: span(c.db, r.from, r.to), tie: r.from })),
	);
}

/** Championship points per season from the standings (after dropped scores). */
export function standingsPoints(db: Db, kind: "driver" | "constructor"): RecordRow[] {
	const map = kind === "driver" ? db.driverStandings : db.constructorStandings;
	const rows: Draft[] = [];
	for (const [year, table] of map) {
		const per = new Map<string, number>();
		for (const r of table) per.set(r.id, (per.get(r.id) ?? 0) + r.points);
		for (const [id, pts] of per) {
			if (pts <= 0) continue;
			const pos = table.find((r) => r.id === id)?.positionText ?? "";
			rows.push({ key: `${id}|${year}`, subject: [cEntity(db, kind, id)], value: Math.round(pts * 100) / 100, display: fmt(Math.round(pts * 100) / 100), detail: [cSeason(year), cText(pos ? `P${pos}` : "")], tie: year });
		}
	}
	return ranked(rows);
}

/** Wins (or other events) by starting grid position. */
export function byGrid(c: Ctx): RecordRow[] {
	const per = new Map<number, Ev[]>();
	let total = 0;
	for (const list of evs(c).values())
		for (const e of list) {
			const g = e.r.grid;
			if (!g || g <= 0) continue;
			per.set(g, [...(per.get(g) ?? []), e]);
			total++;
		}
	const rows: Draft[] = [...per]
		.sort((a, b) => b[0] - a[0])
		.map(([g, list]) => ({
			key: String(g),
			subject: [cText(`Grid ${g}`)],
			value: list.length,
			display: fmt(list.length),
			detail: [cText(pct(list.length, total)), ...(list.length <= 5 ? list.flatMap((e) => [cEntity(c.db, "driver", e.r.driverId), raceCell(c.db, e.idx)]) : [])],
		}));
	return rows.map(({ tie: _t, ...r }, i) => (void _t, { ...r, rank: i + 1 }));
}
