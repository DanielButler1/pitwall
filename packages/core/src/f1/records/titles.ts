// Championship records: titles per driver / constructor / engine / nation /
// car number, title deciders, championship leaders after each round.

import type { Db, StandingRow } from "../dataset.ts";
import { constructorAdjustment, topPoints } from "../points.ts";
import { rulesFor, standingsAfter } from "../stats.ts";
import { cDriver, cEngine, cEntity, cGp, cCircuit, cNation, cRace, cSeason, cTeam, cText, cDate, fmt, ranked, sequence, type Draft } from "./cells.ts";
import { ageDaysAt, ageText, cached, champions, facts, participation, seasonConstructor, seasonEngine, series, type Kind } from "./facts.ts";
import type { RecordRow } from "./types.ts";

export type Title = { year: number; id: string; decider: number; points: number };

/** Max points one driver can still score in a race weekend. */
function maxPerRace(db: Db, idx: number, constructor: boolean) {
	const f = facts(db).races[idx];
	const rules = rulesFor(db, f.race.year);
	const s = rules.system;
	const cars = constructor ? 2 : 1;
	let p = topPoints(s.race, cars) + (s.fastestLap?.points ?? 0) + (s.pole ?? 0) + (s.finishing ?? 0) * cars;
	if (f.race.hasSprint && s.sprint) p += topPoints(s.sprint, cars);
	const season = facts(db).seasons.get(f.race.year)!;
	if (rules.doublePointsFinalRace && idx === season[season.length - 1]) p *= 2;
	return p;
}

/**
 * Race (index) at which each season's title was mathematically decided: the
 * first round after which no rival could still reach the champion's total,
 * with each era's dropped-score rules applied to drivers and constructors.
 */
export function deciders(db: Db, type: "driver" | "constructor"): Map<number, number> {
	return cached(db, `deciders:${type}`, () => {
		const f = facts(db);
		const out = new Map<number, number>();
		for (const t of champions(db, type)) {
			const season = f.seasons.get(t.year) ?? [];
			let decided = season[season.length - 1];
			for (let k = 0; k < season.length; k++) {
				const after = standingsAfter(db, f.races[season[k]].race);
				const table: StandingRow[] = type === "driver" ? after.drivers : merge(after.constructors);
				const champ = table.find((r) => r.id === t.id);
				if (!champ) continue;
				let remaining = 0;
				for (let j = k + 1; j < season.length; j++) remaining += maxPerRace(db, season[j], type === "constructor");
				void remaining;
				const contested = type === "driver" ? driverContested(db, t.year, k, champ.points, t.id) : constructorContested(db, t.year, k, champ.points, t.id);
				if (!contested) {
					decided = season[k];
					break;
				}
			}
			out.set(t.year, decided);
		}
		return out;
	});
}

type Drop = ReturnType<typeof rulesFor>["driverDrop"];
function counted(perRace: number[], drop: Drop): number {
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const top = (xs: number[], n: number) => sum([...xs].sort((a, b) => b - a).slice(0, n));
	if (drop.type === "all") return sum(perRace);
	if (drop.type === "best") return top(perRace, drop.best);
	return top(perRace.slice(0, drop.firstHalf), drop.firstBest) + top(perRace.slice(drop.firstHalf), drop.secondBest);
}

/** Could any rival still reach the champion's points if they won every remaining race (dropped scores applied)? */
function driverContested(db: Db, year: number, k: number, champPoints: number, champId: string): boolean {
	const f = facts(db);
	const season = f.seasons.get(year)!;
	const rules = rulesFor(db, year);
	const per = new Map<string, number[]>();
	for (let j = 0; j <= k; j++) {
		const rf = f.races[season[j]];
		for (const r of [...rf.results, ...rf.sprint]) {
			if (r.driverId === champId) continue;
			const arr = per.get(r.driverId) ?? new Array(season.length).fill(0);
			arr[j] += r.points;
			per.set(r.driverId, arr);
		}
	}
	for (const arr of per.values()) {
		const full = arr.map((p, j) => (j > k ? maxPerRace(db, season[j], false) : p));
		if (counted(full, rules.driverDrop) > champPoints) return true;
	}
	return false;
}

/** Max points one constructor can still score in a race weekend under its era's rules. */
function constructorMaxPerRace(db: Db, idx: number): number {
	const f = facts(db).races[idx];
	const rules = rulesFor(db, f.race.year);
	const s = rules.system;
	if (f.race.grandPrixId === "indianapolis" && rules.constructorExcludesIndy) return 0;
	// best-car-only seasons (1958-1978): a constructor scores with one car per race
	const cars = rules.constructorBestCarOnly ? 1 : 2;
	let p = topPoints(s.race, cars) + (s.pole ?? 0) + (s.finishing ?? 0) * cars;
	if (rules.constructorFastestLap && s.fastestLap) p += s.fastestLap.points;
	if (f.race.hasSprint && s.sprint) p += topPoints(s.sprint, 2);
	const season = facts(db).seasons.get(f.race.year)!;
	if (rules.doublePointsFinalRace && idx === season[season.length - 1]) p *= 2;
	return p;
}

/**
 * Could any rival constructor still beat the champion's (counted) points if it
 * scored the maximum in every remaining race? Per-race points follow the era's
 * constructor rules (best car only, fastest-lap point, Indianapolis) and the
 * season's dropped-score rule is applied to the rival's full season.
 */
function constructorContested(db: Db, year: number, k: number, champPoints: number, champId: string): boolean {
	const f = facts(db);
	const season = f.seasons.get(year)!;
	const rules = rulesFor(db, year);
	// a constructor excluded from the championship (McLaren 2007) is no rival
	const simulated = Boolean((db as Db & { sim?: { years: number[] } }).sim?.years.includes(year));
	const excludedTeam = (id: string) => !simulated && constructorAdjustment(year, id).excluded;
	const per = new Map<string, number[]>();
	for (let j = 0; j <= k; j++) {
		const rf = f.races[season[j]];
		if (rf.race.grandPrixId === "indianapolis" && rules.constructorExcludesIndy) continue;
		const race = new Map<string, number>();
		for (const r of rf.results) {
			if (r.constructorId === champId || excludedTeam(r.constructorId)) continue;
			const key = `${r.constructorId}|${r.engineId}`;
			const pts = !rules.constructorFastestLap && r.fastestLap && rules.system.fastestLap ? Math.max(0, r.points - rules.system.fastestLap.points) : r.points;
			race.set(key, rules.constructorBestCarOnly ? Math.max(race.get(key) ?? 0, pts) : (race.get(key) ?? 0) + pts);
		}
		for (const r of rf.sprint) {
			if (r.constructorId === champId || excludedTeam(r.constructorId)) continue;
			const key = `${r.constructorId}|${r.engineId}`;
			race.set(key, (race.get(key) ?? 0) + r.points);
		}
		for (const [key, pts] of race) {
			const arr = per.get(key) ?? new Array(season.length).fill(0);
			arr[j] += pts;
			per.set(key, arr);
		}
	}
	// a possible tie still counts as undecided
	for (const arr of per.values()) {
		const full = arr.map((p, j) => (j > k ? constructorMaxPerRace(db, season[j]) : p));
		if (counted(full, rules.constructorDrop) >= champPoints) return true;
	}
	return false;
}

function merge(rows: StandingRow[]): StandingRow[] {
	const m = new Map<string, StandingRow>();
	for (const r of rows) {
		const x = m.get(r.id);
		if (x) x.points = Math.max(x.points, r.points);
		else m.set(r.id, { ...r });
	}
	return [...m.values()].sort((a, b) => b.points - a.points);
}

export function titles(db: Db, kind: Kind | "driver-of-constructor" | "driver-of-engine"): Title[] {
	return cached(db, `titles:${kind}`, () => {
		const dec = deciders(db, "driver");
		const cdec = deciders(db, "constructor");
		const lastIdx = (year: number) => {
			const s = facts(db).seasons.get(year)!;
			return s[s.length - 1];
		};
		const drivers = champions(db, "driver").map((t) => ({ ...t, decider: dec.get(t.year) ?? lastIdx(t.year) }));
		switch (kind) {
			case "driver":
				return drivers.map((t) => ({ year: t.year, id: t.id, decider: t.decider, points: t.points }));
			case "constructor":
				return dedupe(champions(db, "constructor").map((t) => ({ year: t.year, id: t.id, decider: cdec.get(t.year) ?? lastIdx(t.year), points: t.points })));
			case "engine":
				return dedupe(
					champions(db, "constructor").map((t) => ({ year: t.year, id: t.engineId ?? "", decider: cdec.get(t.year) ?? lastIdx(t.year), points: t.points })),
				).filter((t) => t.id);
			case "driver-of-constructor":
				return drivers.map((t) => ({ ...t, id: seasonConstructor(db, t.id, t.year) ?? "" })).filter((t) => t.id);
			case "driver-of-engine":
				return drivers.map((t) => ({ ...t, id: seasonEngine(db, t.id, t.year) ?? "" })).filter((t) => t.id);
			case "nation":
				return drivers.map((t) => ({ ...t, id: db.drivers.get(t.id)?.nationality ?? "" })).filter((t) => t.id);
			case "number":
				// the number the champion carried at the race that decided the title
				return drivers
					.map((t) => ({ ...t, id: facts(db).races[t.decider]?.results.find((r) => r.driverId === t.id)?.number ?? seasonNumber(db, t.id, t.year) ?? "" }))
					.filter((t) => t.id);
		}
	});
}

const dedupe = (ts: Title[]) => {
	const seen = new Set<string>();
	return ts.filter((t) => !seen.has(`${t.year}|${t.id}`) && seen.add(`${t.year}|${t.id}`));
};

function seasonNumber(db: Db, driverId: string, year: number) {
	const counts = new Map<string, number>();
	for (const r of db.resultsByDriver.get(driverId) ?? []) {
		if (db.raceById.get(r.raceId)!.year !== year || !r.number) continue;
		counts.set(r.number, (counts.get(r.number) ?? 0) + 1);
	}
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const kindOf = (k: Parameters<typeof titles>[1]): Kind => (k === "driver-of-constructor" ? "constructor" : k === "driver-of-engine" ? "engine" : k);
const byId = (ts: Title[]) => {
	const m = new Map<string, Title[]>();
	for (const t of ts) m.set(t.id, [...(m.get(t.id) ?? []), t]);
	return m;
};
const raceAt = (db: Db, idx: number) => facts(db).races[idx].race;

export function titleCount(db: Db, k: Parameters<typeof titles>[1]): RecordRow[] {
	const kind = kindOf(k);
	return ranked(
		[...byId(titles(db, k))].map(([id, ts]) => ({
			key: id,
			subject: [cEntity(db, kind, id)],
			value: ts.length,
			display: fmt(ts.length),
			detail: ts.map((t) => cSeason(t.year)),
			tie: ts[ts.length - 1].year,
		})),
	);
}

export function titleChronology(db: Db, k: Parameters<typeof titles>[1]): RecordRow[] {
	const kind = kindOf(k);
	return sequence(
		titles(db, k).map((t) => {
			const race = raceAt(db, t.decider);
			return { key: `${t.id}|${t.year}`, subject: [cEntity(db, kind, t.id)], value: t.year, display: String(t.year), detail: [cText("decided"), cDate(race.date), cRace(db, race)] };
		}),
	);
}

/** Age at every title (youngest first), decided at the clinching race. */
export function titleAge(db: Db): RecordRow[] {
	const rows: Draft[] = [];
	for (const t of titles(db, "driver")) {
		const race = raceAt(db, t.decider);
		const days = ageDaysAt(db, t.id, race.date);
		if (days == null) continue;
		rows.push({ key: `${t.id}|${t.year}`, subject: [cDriver(db, t.id)], value: days, display: ageText(db, t.id, race.date), detail: [cSeason(t.year), cText("decided at"), cRace(db, race)] });
	}
	return ranked(rows, "asc");
}

/** Oldest living world champions (age today). */
export function livingChampions(db: Db): RecordRow[] {
	const today = new Date().toISOString().slice(0, 10);
	const rows: Draft[] = [];
	for (const [id, ts] of byId(titles(db, "driver"))) {
		const d = db.drivers.get(id);
		if (!d?.dateOfBirth || d.dateOfDeath) continue;
		rows.push({ key: id, subject: [cDriver(db, id)], value: ageDaysAt(db, id, today)!, display: ageText(db, id, today), detail: ts.map((t) => cSeason(t.year)) });
	}
	return ranked(rows);
}

export function titleStreak(db: Db, k: Parameters<typeof titles>[1]): RecordRow[] {
	const kind = kindOf(k);
	const rows: Draft[] = [];
	for (const [id, ts] of byId(titles(db, k))) {
		let from = ts[0].year;
		for (let i = 0; i < ts.length; i++) {
			if (i > 0 && ts[i].year !== ts[i - 1].year + 1) from = ts[i].year;
			const end = i === ts.length - 1 || ts[i + 1].year !== ts[i].year + 1;
			if (end) rows.push({ key: `${id}|${from}`, subject: [cEntity(db, kind, id)], value: ts[i].year - from + 1, display: fmt(ts[i].year - from + 1), detail: [cText(from === ts[i].year ? String(from) : `${from}–${ts[i].year}`)], tie: from });
		}
	}
	return ranked(rows);
}

/** Longest wait in seasons between two consecutive titles. */
export function titleInterval(db: Db, k: Parameters<typeof titles>[1]): RecordRow[] {
	const kind = kindOf(k);
	const rows: Draft[] = [];
	for (const [id, ts] of byId(titles(db, k))) {
		for (let i = 1; i < ts.length; i++) {
			const gap = ts[i].year - ts[i - 1].year;
			const a = ts[i - 1].year;
			if (gap > 1) rows.push({ key: `${id}|${a}`, subject: [cEntity(db, kind, id)], value: gap, display: `${gap} years`, detail: [cSeason(a), cText("and"), cSeason(ts[i].year)], tie: a });
		}
	}
	return ranked(rows);
}

/** Grands Prix started (or seasons contested) before the first title. */
export function titleBefore(db: Db, unit: "gp" | "season"): RecordRow[] {
	const p = participation(db, "driver");
	const rows: Draft[] = [];
	for (const [id, ts] of byId(titles(db, "driver"))) {
		const t = ts[0];
		const starts = p.get(id) ?? [];
		if (unit === "gp") {
			const n = starts.filter((i) => i <= t.decider).length;
			rows.push({ key: id, subject: [cDriver(db, id)], value: n, display: fmt(n), detail: [cSeason(t.year), cText("decided at"), cRace(db, raceAt(db, t.decider))] });
		} else {
			const n = new Set(starts.map((i) => raceAt(db, i).year).filter((y) => y < t.year)).size;
			rows.push({ key: id, subject: [cDriver(db, id)], value: n, display: fmt(n), detail: [cSeason(t.year)] });
		}
	}
	return ranked(rows, "asc");
}

/** Wins in each title-winning season. */
export function titleWins(db: Db, type: "driver" | "constructor"): RecordRow[] {
	const s = series(db, type, "wins");
	const f = facts(db);
	return ranked(
		titles(db, type).map((t) => {
			const n = (s.get(t.id) ?? []).filter((e) => raceAt(db, e.idx).year === t.year).length;
			return {
				key: `${t.id}|${t.year}`,
				subject: [cEntity(db, type, t.id)],
				value: n,
				display: fmt(n),
				detail: [cSeason(t.year), cText(`of ${f.seasons.get(t.year)?.length ?? 0} races`)],
				tie: t.year,
			};
		}),
	);
}

/** Points margin between champion and runner-up. */
export function titleMargin(db: Db, type: "driver" | "constructor"): RecordRow[] {
	const rows: Draft[] = [];
	for (const t of titles(db, type)) {
		const table = type === "driver" ? db.driverStandings.get(t.year)! : merge(db.constructorStandings.get(t.year)!);
		const second = table.find((r) => r.id !== t.id && r.position != null);
		if (!second) continue;
		const champ = table.find((r) => r.id === t.id)!;
		const gap = Math.round((champ.points - second.points) * 100) / 100;
		rows.push({
			key: `${t.id}|${t.year}`,
			subject: [cEntity(db, type, t.id)],
			value: gap,
			display: fmt(gap),
			detail: [cSeason(t.year), cText("over"), cEntity(db, type, second.id)],
			tie: t.year,
		});
	}
	return ranked(rows);
}

/** Distinct constructors / engines a driver won titles with. */
export function titleDistinct(db: Db, other: "constructor" | "engine"): RecordRow[] {
	const rows: Draft[] = [];
	for (const [id, ts] of byId(titles(db, "driver"))) {
		const os = [...new Set(ts.map((t) => (other === "constructor" ? seasonConstructor(db, id, t.year) : seasonEngine(db, id, t.year))).filter(Boolean) as string[])];
		rows.push({ key: id, subject: [cDriver(db, id)], value: os.length, display: fmt(os.length), detail: os.map((o) => (other === "constructor" ? cTeam(db, o) : cEngine(db, o))) });
	}
	return ranked(rows);
}

/** Seasons in which a driver's team won the constructors' title. */
export function driverConstructorTitles(db: Db): RecordRow[] {
	const champ = new Map(titles(db, "constructor").map((t) => [t.year, t.id]));
	const counts = new Map<string, number[]>();
	for (const year of champ.keys()) {
		const team = champ.get(year)!;
		const drivers = new Set<string>();
		// credits drivers who scored for the champion team that season (e.g. not Senna, pointless for Williams in 1994)
		const scored = new Map<string, number>();
		for (const i of facts(db).seasons.get(year) ?? [])
			for (const r of [...facts(db).races[i].results, ...facts(db).races[i].sprint]) if (r.constructorId === team) scored.set(r.driverId, (scored.get(r.driverId) ?? 0) + r.points);
		for (const [d, pts] of scored) if (pts > 0 && seasonConstructor(db, d, year) === team) drivers.add(d);
		for (const d of drivers) counts.set(d, [...(counts.get(d) ?? []), year]);
	}
	return ranked([...counts].map(([id, ys]) => ({ key: id, subject: [cDriver(db, id)], value: ys.length, display: fmt(ys.length), detail: ys.map(cSeason), tie: ys[ys.length - 1] })));
}

/**
 * Grands Prix by the number of starters who were already world champions (title
 * decided before the race) or already Grand Prix winners.
 */
export function fieldWith(db: Db, kind: "champion" | "winner"): RecordRow[] {
	const since = new Map<string, number>(); // driver -> race index from which they count
	if (kind === "champion") {
		for (const t of titles(db, "driver")) if (!since.has(t.id) || since.get(t.id)! > t.decider) since.set(t.id, t.decider);
	} else for (const [id, list] of series(db, "driver", "wins")) since.set(id, list[0].idx);
	const rows: Draft[] = [];
	for (const f of facts(db).races) {
		const ids = [...new Set(f.results.filter((r) => r.positionText !== "DNQ" && r.positionText !== "DNPQ" && r.positionText !== "DNP" && r.positionText !== "DNS").map((r) => r.driverId))];
		const who = ids.filter((id) => since.has(id) && since.get(id)! < f.idx);
		if (!who.length) continue;
		rows.push({ key: String(f.race.id), subject: [cRace(db, f.race)], value: who.length, display: fmt(who.length), detail: who.map((id) => cDriver(db, id)), tie: f.idx });
	}
	return ranked(rows);
}

/** Times finishing the championship in a given set of positions. */
export function championshipPlaces(db: Db, type: "driver" | "constructor", positions: number[]): RecordRow[] {
	const map = type === "driver" ? db.driverStandings : db.constructorStandings;
	const counts = new Map<string, number[]>();
	for (const year of map.keys()) {
		if (!champions(db, type).some((c) => c.year === year)) continue;
		const table = type === "driver" ? map.get(year)! : merge(map.get(year)!);
		const seen = new Set<string>();
		for (const r of table) {
			if (r.position == null || seen.has(r.id)) continue;
			seen.add(r.id);
			if (positions.includes(r.position)) counts.set(r.id, [...(counts.get(r.id) ?? []), year]);
		}
	}
	return ranked(
		[...counts].map(([id, ys]) => ({ key: id, subject: [cEntity(db, type, id)], value: ys.length, display: fmt(ys.length), detail: ys.map(cSeason), tie: ys[ys.length - 1] })),
	);
}

/** Best final championship position of each driver, and how often. */
export function bestRanking(db: Db): RecordRow[] {
	const best = new Map<string, { pos: number; years: number[] }>();
	for (const [year, rows] of db.driverStandings) {
		if (!champions(db, "driver").some((c) => c.year === year)) continue;
		for (const r of rows) {
			if (r.position == null || r.points <= 0) continue;
			const b = best.get(r.id);
			if (!b || r.position < b.pos) best.set(r.id, { pos: r.position, years: [year] });
			else if (r.position === b.pos) b.years.push(year);
		}
	}
	return ranked(
		[...best].map(([id, b]) => ({
			key: id,
			subject: [cDriver(db, id)],
			value: b.pos,
			display: `${b.pos}${["st", "nd", "rd"][b.pos - 1] ?? "th"}`,
			detail: b.years.sort((x, y) => x - y).map(cSeason),
			tie: -b.years.length,
		})),
		"asc",
	);
}

/** Different world champions per nation. */
export function nationChampions(db: Db): RecordRow[] {
	const m = new Map<string, Set<string>>();
	for (const t of titles(db, "driver")) {
		const n = db.drivers.get(t.id)?.nationality;
		if (!n) continue;
		m.set(n, (m.get(n) ?? new Set()).add(t.id));
	}
	return ranked([...m].map(([n, s]) => ({ key: n, subject: [cNation(db, n)], value: s.size, display: fmt(s.size), detail: [...s].map((d) => cDriver(db, d)) })));
}

/* ---------------------------------------------------------- deciders --- */

export function deciderChronology(db: Db, type: "driver" | "constructor"): RecordRow[] {
	const f = facts(db);
	return sequence(
		titles(db, type).map((t) => {
			const season = f.seasons.get(t.year)!;
			const left = season.length - 1 - season.indexOf(t.decider);
			return {
				key: String(t.year),
				subject: [cRace(db, raceAt(db, t.decider))],
				value: t.year,
				display: left ? `${left} to go` : "Final round",
				detail: [cEntity(db, type, t.id), cDate(raceAt(db, t.decider).date)],
			};
		}),
	);
}

export function deciderPlaces(db: Db, place: "gp" | "circuit"): RecordRow[] {
	const m = new Map<string, number[]>();
	for (const type of ["driver", "constructor"] as const)
		for (const t of titles(db, type)) {
			const race = raceAt(db, t.decider);
			const k = place === "gp" ? race.grandPrixId : race.circuitId;
			m.set(k, [...(m.get(k) ?? []), t.year]);
		}
	return ranked(
		[...m].map(([k, ys]) => ({
			key: k,
			subject: [place === "gp" ? cGp(db, k) : cCircuit(db, k)],
			value: ys.length,
			display: fmt(ys.length),
			detail: [cText([...new Set(ys)].sort((a, b) => a - b).join(", "))],
		})),
	);
}

/* ---------------------------------------------------- championship leaders --- */

/** Leader of the drivers' / constructors' championship after each race (index). */
export function leaders(db: Db, type: "driver" | "constructor"): string[][] {
	return cached(db, `leaders:${type}`, () =>
		facts(db).races.map((f) => {
			const after = standingsAfter(db, f.race);
			const table = type === "driver" ? after.drivers : merge(after.constructors);
			const top = table[0];
			if (!top || top.points <= 0) return [];
			return table.filter((r) => r.points === top.points && r.position === top.position).map((r) => r.id);
		}),
	);
}

export function leaderCount(db: Db, type: "driver" | "constructor"): RecordRow[] {
	const counts = new Map<string, number[]>();
	leaders(db, type).forEach((ids, i) => {
		for (const id of ids) counts.set(id, [...(counts.get(id) ?? []), i]);
	});
	return ranked(
		[...counts].map(([id, l]) => ({
			key: id,
			subject: [cEntity(db, type, id)],
			value: l.length,
			display: fmt(l.length),
			detail: [cText(`${raceAt(db, l[0]).year}–${raceAt(db, l[l.length - 1]).year}`)],
			tie: l[l.length - 1],
		})),
	);
}

export function leaderStreak(db: Db, type: "driver" | "constructor"): RecordRow[] {
	const all = leaders(db, type);
	const rows: Draft[] = [];
	const open = new Map<string, number>();
	const close = (id: string, end: number) => {
		const from = open.get(id)!;
		open.delete(id);
		rows.push({ key: `${id}|${from}`, subject: [cEntity(db, type, id)], value: end - from + 1, display: fmt(end - from + 1), detail: [cRace(db, raceAt(db, from)), cText("to"), cRace(db, raceAt(db, end))], tie: from });
	};
	all.forEach((ids, i) => {
		for (const id of [...open.keys()]) if (!ids.includes(id)) close(id, i - 1);
		for (const id of ids) if (!open.has(id)) open.set(id, i);
	});
	for (const id of [...open.keys()]) close(id, all.length - 1);
	return ranked(rows.filter((r) => r.value >= 2));
}

export function youngestLeader(db: Db): RecordRow[] {
	const first = new Map<string, number>();
	leaders(db, "driver").forEach((ids, i) => ids.forEach((id) => first.has(id) || first.set(id, i)));
	const rows: Draft[] = [];
	for (const [id, i] of first) {
		const race = raceAt(db, i);
		const days = ageDaysAt(db, id, race.date);
		if (days != null) rows.push({ key: id, subject: [cDriver(db, id)], value: days, display: ageText(db, id, race.date), detail: [cRace(db, race)] });
	}
	return ranked(rows, "asc");
}
