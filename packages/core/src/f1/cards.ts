// Preview cards for the hover cards on driver, constructor, circuit, race, engine,
// tyre, Grand Prix, nation and season links (Football Manager style). For real
// history they are written to public/data/cards.json, race-cards.json and
// more-cards.json by scripts/build-client-data.ts; inside a universe the same
// builders run on the universe's Db in the browser.

import { completedRaces, seasonInProgress, type Db } from "./dataset.ts";
import { constructorCareers, driverCareers, winnerOf, type Career } from "./stats.ts";
import { engineView, enginesView, grandPrixView, grandsPrixView, nationView, nationsView, tyreView, tyresView } from "./views.ts";

export type CardKind = "driver" | "team" | "circuit" | "race" | MoreCardKind;
/** Kinds kept in more-cards.json, loaded on the first hover of one of them. */
export type MoreCardKind = "engine" | "tyre" | "grandPrix" | "nation" | "season";

type Years = [number, number] | null;
/** Something the card links to. */
export type CardRef = { id: string; name: string };
export type DriverCard = {
	kind: "driver";
	name: string;
	/** ISO alpha-2 for the flag, and the nationality's name and id (its /nations page). */
	flag: string | null;
	nation: string | null;
	nationId: string | null;
	born: string | null;
	died: string | null;
	placeOfBirth: string | null;
	years: Years;
	/** Teams in their latest season. */
	teams: CardRef[];
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	points: number;
	bestFinish: number | null;
	titleYears: number[];
};
export type TeamCard = {
	kind: "team";
	name: string;
	fullName: string | null;
	flag: string | null;
	nation: string | null;
	nationId: string | null;
	years: Years;
	/** Drivers and engine in their latest season. */
	drivers: CardRef[];
	engine: string | null;
	starts: number;
	wins: number;
	podiums: number;
	poles: number;
	titleYears: number[];
	driverTitles: number;
};
export type CircuitCard = {
	kind: "circuit";
	name: string;
	place: string;
	flag: string | null;
	nation: string | null;
	nationId: string | null;
	type: string;
	length: number;
	turns: number;
	races: number;
	years: Years;
	/** Most wins here. */
	topWinner: (CardRef & { wins: number }) | null;
	lastWinner: (CardRef & { year: number }) | null;
};
export type RaceCard = {
	kind: "race";
	name: string;
	year: number;
	round: number;
	rounds: number;
	date: string;
	flag: string | null;
	circuit: CardRef & { place: string };
	laps: number;
	distance: number;
	/** No results yet. */
	upcoming: boolean;
	podium: { driver: CardRef; team: CardRef; time: string | null }[];
	pole: CardRef | null;
	fastestLap: (CardRef & { time: string | null }) | null;
	sprintWinner: CardRef | null;
};
type Count = CardRef & { n: number };
export type SupplierCard = {
	kind: "engine" | "tyre";
	name: string;
	flag: string | null;
	nation: string | null;
	nationId: string | null;
	years: Years;
	races: number;
	wins: number;
	podiums: number;
	poles: number;
	/** Seasons a driver won the title with it. */
	titleYears: number[];
	constructorsTitles: number;
	/** Most wins first; `n` is wins (or races, for a supplier that never won). */
	teams: Count[];
	teamCount: number;
	topDriver: Count | null;
};
export type GrandPrixCard = {
	kind: "grandPrix";
	name: string;
	flag: string | null;
	nation: string | null;
	nationId: string | null;
	years: Years;
	races: number;
	/** Most races first; `n` is races held there. */
	circuits: Count[];
	circuitCount: number;
	winners: number;
	topDriver: Count | null;
	topTeam: Count | null;
	lastWinner: (CardRef & { year: number; team: CardRef | null }) | null;
};
export type NationCard = {
	kind: "nation";
	name: string;
	flag: string | null;
	demonym: string | null;
	drivers: number;
	winners: number;
	wins: number;
	titles: number;
	/** Drivers' champions, most titles first. */
	champions: (CardRef & { years: number[] })[];
	constructorTitles: number;
	racesHosted: number;
	circuits: number;
	grandsPrix: number;
	topDriver: Count | null;
};
export type SeasonCard = {
	kind: "season";
	year: number;
	rounds: number;
	completed: number;
	/** Started but not finished: `champion` and `constructorsChampion` are the leaders. */
	inProgress: boolean;
	start: string | null;
	end: string | null;
	champion: (CardRef & { points: number }) | null;
	championTeam: CardRef | null;
	constructorsChampion: CardRef | null;
	mostWins: Count | null;
	winners: number;
};
export type EntityCard = DriverCard | TeamCard | CircuitCard | RaceCard | SupplierCard | GrandPrixCard | NationCard | SeasonCard;

/** Driver, constructor and circuit cards, keyed by kind initial then id (public/data/cards.json). */
export type CardsFile = { d: Record<string, DriverCard>; t: Record<string, TeamCard>; c: Record<string, CircuitCard> };
/**
 * Race cards keyed "<year>-<round>" (public/data/race-cards.json, loaded on the first
 * race hover). Compact: ids only, names come from cards.json (see expandRaceCard).
 * [name, date, flag, circuitId, laps, distance, rounds, podium [driverId, teamId, time][], poleId, fastest [driverId, time], sprintWinnerId]
 */
export type PackedRace = [string, string, string | null, string, number, number, number, [string, string, string | null][], string | null, [string, string | null] | null, string | null];
export type RaceCardsFile = Record<string, PackedRace>;
/** Engine, tyre, Grand Prix, nation and season cards (public/data/more-cards.json). */
export type MoreCardsFile = {
	e: Record<string, SupplierCard>;
	y: Record<string, SupplierCard>;
	g: Record<string, GrandPrixCard>;
	n: Record<string, NationCard>;
	s: Record<string, SeasonCard>;
};

const years = (c: Career | undefined): Years => (c ? [c.firstYear, c.lastYear] : null);
const country = (db: Db, id: string | undefined) => {
	const c = id ? db.countries.get(id) : undefined;
	return { flag: c?.alpha2 ?? null, nation: c?.name ?? null, nationId: c ? id! : null };
};

function titleYears(map: Db["driverStandings"]): Map<string, number[]> {
	const out = new Map<string, number[]>();
	for (const [year, rows] of [...map].sort((a, b) => a[0] - b[0]))
		for (const r of rows) if (r.champion) out.set(r.id, [...(out.get(r.id) ?? []), year]);
	return out;
}

const memo = new WeakMap<Db, { driverTitles: Map<string, number[]>; teamTitles: Map<string, number[]>; driverTitlesWith: Map<string, number> }>();
function titles(db: Db) {
	let t = memo.get(db);
	if (!t) {
		const driverTitles = titleYears(db.driverStandings);
		// drivers' titles won in each constructor's car
		const driverTitlesWith = new Map<string, number>();
		for (const [year, rows] of db.driverStandings) {
			const champ = rows.find((r) => r.champion);
			if (!champ) continue;
			const races = new Set((db.racesByYear.get(year) ?? []).map((r) => r.id));
			const teams = new Map<string, number>();
			for (const r of db.resultsByDriver.get(champ.id) ?? []) if (races.has(r.raceId)) teams.set(r.constructorId, (teams.get(r.constructorId) ?? 0) + r.points);
			const main = [...teams].sort((a, b) => b[1] - a[1])[0]?.[0];
			if (main) driverTitlesWith.set(main, (driverTitlesWith.get(main) ?? 0) + 1);
		}
		memo.set(db, (t = { driverTitles, teamTitles: titleYears(db.constructorStandings), driverTitlesWith }));
	}
	return t;
}

/** Results in a career's final season. */
function lastSeason(db: Db, results: Db["results"] | undefined, last: number | undefined) {
	return (results ?? []).filter((r) => db.raceById.get(r.raceId)?.year === last);
}
const refs = (db: Db, ids: Iterable<string>, of: "drivers" | "constructors"): CardRef[] => [...new Set(ids)].map((id) => ({ id, name: db[of].get(id)?.name ?? id }));

export function driverCard(db: Db, id: string): DriverCard | null {
	const d = db.drivers.get(id);
	if (!d) return null;
	const c = driverCareers(db).get(id);
	return {
		kind: "driver",
		name: d.name,
		...country(db, d.nationality),
		born: d.dateOfBirth,
		died: d.dateOfDeath,
		placeOfBirth: d.placeOfBirth,
		years: years(c),
		teams: refs(db, lastSeason(db, db.resultsByDriver.get(id), c?.lastYear).map((r) => r.constructorId), "constructors"),
		starts: c?.starts ?? 0,
		wins: c?.wins ?? 0,
		podiums: c?.podiums ?? 0,
		poles: c?.poles ?? 0,
		points: c?.points ?? 0,
		bestFinish: c?.bestFinish ?? null,
		titleYears: titles(db).driverTitles.get(id) ?? [],
	};
}

export function teamCard(db: Db, id: string): TeamCard | null {
	const t = db.constructors.get(id);
	if (!t) return null;
	const c = constructorCareers(db).get(id);
	const last = lastSeason(db, db.resultsByConstructor.get(id), c?.lastYear);
	const engineIds = [...new Set(last.map((r) => r.engineId))];
	return {
		kind: "team",
		name: t.name,
		fullName: t.fullName && t.fullName !== t.name ? t.fullName : null,
		...country(db, t.country),
		years: years(c),
		drivers: refs(db, last.map((r) => r.driverId), "drivers"),
		engine: engineIds.length === 1 ? (db.engines.get(engineIds[0])?.name ?? null) : null,
		starts: c?.entries ?? 0,
		wins: c?.wins ?? 0,
		podiums: c?.podiums ?? 0,
		poles: c?.poles ?? 0,
		titleYears: titles(db).teamTitles.get(id) ?? [],
		driverTitles: titles(db).driverTitlesWith.get(id) ?? 0,
	};
}

export function circuitCard(db: Db, id: string): CircuitCard | null {
	const c = db.circuits.get(id);
	if (!c) return null;
	const races = (db.racesByCircuit.get(id) ?? []).filter((r) => db.resultsByRace.has(r.id)).sort((a, b) => a.date.localeCompare(b.date));
	const wins = new Map<string, number>();
	let lastWinner: CircuitCard["lastWinner"] = null;
	for (const r of races) {
		const w = winnerOf(db, r.id);
		if (!w) continue;
		wins.set(w.driverId, (wins.get(w.driverId) ?? 0) + 1);
		lastWinner = { id: w.driverId, name: db.drivers.get(w.driverId)?.name ?? w.driverId, year: r.year };
	}
	const top = [...wins].sort((a, b) => b[1] - a[1])[0];
	return {
		kind: "circuit",
		name: c.name,
		place: c.place,
		...country(db, c.country),
		type: c.type,
		length: c.length,
		turns: c.turns,
		races: races.length,
		years: races.length ? [races[0].year, races[races.length - 1].year] : null,
		topWinner: top && top[1] > 1 ? { id: top[0], name: db.drivers.get(top[0])?.name ?? top[0], wins: top[1] } : null,
		lastWinner,
	};
}

/** `key` is "<year>-<round>". */
export function raceCard(db: Db, key: string): RaceCard | null {
	const [year, round] = key.split("-").map(Number);
	const season = db.racesByYear.get(year) ?? [];
	const race = season.find((r) => r.round === round);
	if (!race) return null;
	const gp = db.grandsPrix.get(race.grandPrixId);
	const circuit = db.circuits.get(race.circuitId);
	const results = db.resultsByRace.get(race.id) ?? [];
	const driver = (id: string): CardRef => ({ id, name: db.drivers.get(id)?.name ?? id });
	const team = (id: string): CardRef => ({ id, name: db.constructors.get(id)?.name ?? id });
	const pole = results.find((r) => r.pole) ?? db.qualifyingByRace.get(race.id)?.find((q) => q.position === 1);
	const fl = db.fastestLapByRace.get(race.id);
	const sprint = db.sprintByRace.get(race.id)?.find((r) => r.position === 1);
	return {
		kind: "race",
		name: gp?.fullName ?? race.officialName,
		year,
		round,
		rounds: season.length,
		date: race.date,
		flag: (gp && db.countries.get(gp.country)?.alpha2) ?? null,
		circuit: { id: race.circuitId, name: circuit?.name ?? race.circuitId, place: circuit?.place ?? "" },
		laps: race.laps,
		distance: race.distance,
		upcoming: !results.length,
		podium: [1, 2, 3]
			.map((p) => results.find((r) => r.position === p))
			.filter((r) => !!r)
			.map((r) => ({ driver: driver(r.driverId), team: team(r.constructorId), time: r.position === 1 ? r.time : r.gap })),
		pole: pole ? driver(pole.driverId) : null,
		fastestLap: fl ? { ...driver(fl.driverId), time: fl.time } : null,
		sprintWinner: sprint ? driver(sprint.driverId) : null,
	};
}

const ref = (r: CardRef): CardRef => ({ id: r.id, name: r.name });
const span = (a: number | null, b: number | null): Years => (a != null && b != null ? [a, b] : null);

export function supplierCard(db: Db, kind: "engine" | "tyre", id: string): SupplierCard | null {
	const v = (kind === "engine" ? engineView : tyreView)(db, id);
	if (!v) return null;
	const t = v.totals;
	const won = t.wins > 0;
	const teams = won ? v.topTeams.filter((x) => x.wins > 0) : [...v.topTeams].sort((a, b) => b.races - a.races);
	const top = v.topDrivers[0];
	return {
		kind,
		name: v.supplier.name,
		...country(db, v.nation.id),
		years: span(t.firstYear, t.lastYear),
		races: t.races,
		wins: t.wins,
		podiums: t.podiums,
		poles: t.poles,
		titleYears: v.titles.filter((x) => x.kind === "drivers").map((x) => x.year).sort((a, b) => a - b),
		constructorsTitles: t.constructorsTitles,
		teams: teams.slice(0, 3).map((x) => ({ ...ref(x.team), n: won ? x.wins : x.races })),
		teamCount: t.teams,
		topDriver: top && top.wins > 0 ? { ...ref(top.driver), n: top.wins } : null,
	};
}

export function grandPrixCard(db: Db, id: string): GrandPrixCard | null {
	const v = grandPrixView(db, id);
	if (!v) return null;
	const t = v.totals;
	const last = v.editions.find((e) => e.winner);
	// a "most wins" of one is only worth showing when there was a single edition
	const best = <T extends { wins: number }>(xs: T[]) => (xs[0] && (xs[0].wins > 1 || t.races === 1) ? xs[0] : null);
	const d = best(v.topDrivers);
	const tm = best(v.topTeams);
	return {
		kind: "grandPrix",
		name: v.gp.name,
		...country(db, v.nation.id),
		years: span(t.firstYear, t.lastYear),
		races: t.races,
		circuits: v.circuits.slice(0, 3).map((c) => ({ ...ref(c.circuit), n: c.races })),
		circuitCount: v.circuits.length,
		winners: t.winners,
		topDriver: d && { ...ref(d.driver), n: d.wins },
		topTeam: tm && { ...ref(tm.team), n: tm.wins },
		lastWinner: last?.winner ? { ...ref(last.winner), year: last.race.year, team: last.team && ref(last.team) } : null,
	};
}

export function nationCard(db: Db, id: string): NationCard | null {
	const v = nationView(db, id);
	if (!v) return null;
	const t = v.totals;
	const champs = new Map<string, CardRef & { years: number[] }>();
	for (const c of [...v.champions].reverse()) {
		const x = champs.get(c.driver.id) ?? { ...ref(c.driver), years: [] };
		x.years.push(c.year);
		champs.set(c.driver.id, x);
	}
	const top = [...v.drivers].sort((a, b) => b.wins - a.wins || b.podiums - a.podiums)[0];
	return {
		kind: "nation",
		name: v.nation.name,
		flag: v.nation.country,
		demonym: v.nation.demonym,
		drivers: t.drivers,
		winners: t.winners,
		wins: t.wins,
		titles: t.titles,
		champions: [...champs.values()].sort((a, b) => b.years.length - a.years.length || a.years[0] - b.years[0]),
		constructorTitles: t.constructorTitles,
		racesHosted: t.racesHosted,
		circuits: t.circuits,
		grandsPrix: v.grandsPrix.length,
		topDriver: top && top.wins > 0 ? { ...ref(top.driver), n: top.wins } : null,
	};
}

/** `key` is the year. */
export function seasonCard(db: Db, key: string): SeasonCard | null {
	const year = Number(key);
	const all = db.racesByYear.get(year);
	if (!all?.length) return null;
	const done = completedRaces(db, year);
	const inProgress = seasonInProgress(db, year);
	const drivers = db.driverStandings.get(year) ?? [];
	const teams = db.constructorStandings.get(year) ?? [];
	const champ = drivers.find((d) => d.champion) ?? (inProgress ? drivers[0] : undefined);
	const cChamp = teams.find((c) => c.champion) ?? (inProgress ? teams[0] : undefined);
	const wins = new Map<string, number>();
	const champTeams = new Map<string, number>();
	for (const race of done) {
		const w = winnerOf(db, race.id);
		if (w) wins.set(w.driverId, (wins.get(w.driverId) ?? 0) + 1);
		for (const r of db.resultsByRace.get(race.id) ?? []) if (r.driverId === champ?.id) champTeams.set(r.constructorId, (champTeams.get(r.constructorId) ?? 0) + 1);
	}
	const top = [...wins].sort((a, b) => b[1] - a[1])[0];
	const champTeam = [...champTeams].sort((a, b) => b[1] - a[1])[0]?.[0];
	const driver = (id: string): CardRef => ({ id, name: db.drivers.get(id)?.name ?? id });
	const team = (id: string): CardRef => ({ id, name: db.constructors.get(id)?.name ?? id });
	const dates = all.map((r) => r.date).sort();
	return {
		kind: "season",
		year,
		rounds: all.length,
		completed: done.length,
		inProgress,
		start: dates[0] ?? null,
		end: dates[dates.length - 1] ?? null,
		champion: champ ? { ...driver(champ.id), points: champ.points } : null,
		championTeam: champTeam ? team(champTeam) : null,
		constructorsChampion: cChamp ? team(cChamp.id) : null,
		mostWins: top ? { ...driver(top[0]), n: top[1] } : null,
		winners: wins.size,
	};
}

export function entityCard(db: Db, kind: CardKind, id: string): EntityCard | null {
	switch (kind) {
		case "driver":
			return driverCard(db, id);
		case "team":
			return teamCard(db, id);
		case "circuit":
			return circuitCard(db, id);
		case "race":
			return raceCard(db, id);
		case "engine":
		case "tyre":
			return supplierCard(db, kind, id);
		case "grandPrix":
			return grandPrixCard(db, id);
		case "nation":
			return nationCard(db, id);
		case "season":
			return seasonCard(db, id);
	}
	return null;
}

/** Cards for every driver who raced, every constructor and every circuit used. */
export function allCards(db: Db): CardsFile {
	const out: CardsFile = { d: {}, t: {}, c: {} };
	for (const id of driverCareers(db).keys()) out.d[id] = driverCard(db, id)!;
	for (const id of db.constructors.keys()) out.t[id] = teamCard(db, id)!;
	for (const id of db.circuits.keys()) out.c[id] = circuitCard(db, id)!;
	return out;
}

export function allRaceCards(db: Db): RaceCardsFile {
	const out: RaceCardsFile = {};
	for (const r of db.races) {
		const c = raceCard(db, `${r.year}-${r.round}`)!;
		out[`${r.year}-${r.round}`] = [
			c.name,
			c.date,
			c.flag,
			c.circuit.id,
			c.laps,
			c.distance,
			c.rounds,
			c.podium.map((p) => [p.driver.id, p.team.id, p.time]),
			c.pole?.id ?? null,
			c.fastestLap ? [c.fastestLap.id, c.fastestLap.time] : null,
			c.sprintWinner?.id ?? null,
		];
	}
	return out;
}

/** Every engine and tyre supplier that raced, every Grand Prix, every nation with drivers, teams or races, and every season. */
export function allMoreCards(db: Db): MoreCardsFile {
	const out: MoreCardsFile = { e: {}, y: {}, g: {}, n: {}, s: {} };
	for (const r of enginesView(db).rows) out.e[r.supplier.id] = supplierCard(db, "engine", r.supplier.id)!;
	for (const r of tyresView(db).rows) out.y[r.supplier.id] = supplierCard(db, "tyre", r.supplier.id)!;
	for (const r of grandsPrixView(db).rows) out.g[r.gp.id] = grandPrixCard(db, r.gp.id)!;
	for (const r of nationsView(db).rows) out.n[r.nation.id] = nationCard(db, r.nation.id)!;
	for (const y of db.years) out.s[y] = seasonCard(db, String(y))!;
	return out;
}
