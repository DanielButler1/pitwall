// Championship progression: the table after every round of a season, for the
// season page's points chart. Built from standingsAfter per round, so dropped
// scores, shared drives and penalties match the official tables; the final round
// is snapped to the season standings so the chart ends where the table does.

import { completedRaces, type Db, type StandingRow } from "./dataset.ts";
import { seasonStandings, standingsAfter } from "./stats.ts";
import { driverRef, engineRef, teamRef, type DriverRef, type EngineRef, type TeamRef } from "./views.ts";

export type ProgressionSeries = {
	/** Driver id, or "constructorId|engineId" for constructors. */
	key: string;
	label: string;
	/** Short end-of-line label (surname or team name). */
	short: string;
	driver: DriverRef | null;
	team: TeamRef | null;
	engine: EngineRef | null;
	/** Final championship position (text) and points. */
	position: string;
	/** Points and championship position after each round (null before their first entry). */
	points: (number | null)[];
	positions: (number | null)[];
};

export type ProgressionTable = {
	series: ProgressionSeries[];
	/** The leader's points after each round, for the gap-to-leader view. */
	leader: number[];
	/** How many entries were classified after each round (bump chart's depth). */
	field: number[];
};

export type SeasonProgression = {
	year: number;
	rounds: { round: number; name: string; country: string | null }[];
	drivers: ProgressionTable;
	constructors: ProgressionTable | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const memo = new WeakMap<Db, Map<string, SeasonProgression | null>>();

export function seasonProgression(db: Db, year: number, top = 10): SeasonProgression | null {
	let m = memo.get(db);
	if (!m) memo.set(db, (m = new Map()));
	const k = `${year}:${top}`;
	if (!m.has(k)) m.set(k, build(db, year, top));
	return m.get(k)!;
}

function build(db: Db, year: number, top: number): SeasonProgression | null {
	const races = completedRaces(db, year);
	if (!races.length) return null;
	const tables = races.map((r) => standingsAfter(db, r));
	const official = seasonStandings(db, year);
	const keyOf = (s: StandingRow, team: boolean) => (team ? `${s.id}|${s.engineId ?? ""}` : s.id);

	const table = (pick: (t: (typeof tables)[number]) => StandingRow[], finalRows: StandingRow[], team: boolean): ProgressionTable | null => {
		const last = pick(tables[tables.length - 1]);
		const final = finalRows.length ? finalRows : last;
		if (!final.length) return null;
		const chosen = final.slice(0, top);
		const byRound = tables.map((t, i) => {
			const rows = i === tables.length - 1 && finalRows.length ? finalRows : pick(t);
			return new Map(rows.map((r) => [keyOf(r, team), r]));
		});
		const dupTeams = new Set(chosen.filter((s, i) => chosen.findIndex((x) => x.id === s.id) !== i).map((s) => s.id));
		const series = chosen.map((s): ProgressionSeries => {
			const key = keyOf(s, team);
			const engine = team && s.engineId ? engineRef(db, s.engineId) : null;
			const t = team ? teamRef(db, s.id) : null;
			const d = team ? null : driverRef(db, s.id);
			return {
				key,
				label: d ? d.name : `${t!.name}${dupTeams.has(s.id) && engine ? ` ${engine.name}` : ""}`,
				short: d ? (db.drivers.get(s.id)?.lastName ?? d.name) : t!.name,
				driver: d,
				team: t,
				engine,
				position: s.positionText,
				points: byRound.map((m) => {
					const r = m.get(key);
					return r ? r2(r.points) : null;
				}),
				positions: byRound.map((m) => m.get(key)?.position ?? null),
			};
		});
		return {
			series,
			leader: byRound.map((m) => {
				const rows = [...m.values()];
				return r2(rows.find((r) => r.position === 1)?.points ?? Math.max(0, ...rows.map((r) => r.points)));
			}),
			field: byRound.map((m) => [...m.values()].filter((r) => r.position != null).length),
		};
	};

	const drivers = table((t) => t.drivers, official.drivers, false)!;
	return {
		year,
		rounds: races.map((r) => {
			const gp = db.grandsPrix.get(r.grandPrixId);
			return { round: r.round, name: gp?.name ?? r.officialName, country: (gp && db.countries.get(gp.country)?.alpha2) ?? null };
		}),
		drivers,
		constructors: table((t) => t.constructors, official.constructors, true),
	};
}
