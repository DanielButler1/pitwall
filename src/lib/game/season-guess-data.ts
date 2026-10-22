// Builds the season list for "Guess the season" (public/data/season-guess.json, written by
// scripts/build-client-data.ts): every completed championship season with its clues worked
// out up front (champion, runner-up, constructors' champion, when the champion took the lead
// for good, new circuits, notable debut and farewell) and the top of the drivers' standings.

import { completedRaces, type Db } from "../f1/dataset.ts";
import { driverCareers, seasonStandings, standingsAfter } from "../f1/stats.ts";
import { round2, type PackedRef, type PackedSeason, type SeasonFile } from "./season-guess.ts";

const TOP = 5;

export function seasonFile(db: Db): SeasonFile {
	const careers = driverCareers(db);
	const countries: SeasonFile["countries"] = {};
	const tables = { drivers: [] as PackedRef[], teams: [] as PackedRef[], circuits: [] as PackedRef[] };
	const indexes = { drivers: new Map<string, number>(), teams: new Map<string, number>(), circuits: new Map<string, number>() };
	const add = (kind: keyof typeof tables, id: string, name: string, country: string) => {
		let i = indexes[kind].get(id);
		if (i == null) {
			const c = db.countries.get(country);
			countries[country] ??= [c?.name ?? country, c?.alpha2 ?? null];
			i = tables[kind].push([id, name, country]) - 1;
			indexes[kind].set(id, i);
		}
		return i;
	};
	const driver = (id: string) => {
		const d = db.drivers.get(id);
		return add("drivers", id, d?.name ?? id, d?.nationality ?? "");
	};
	const team = (id: string) => {
		const t = db.constructors.get(id);
		return add("teams", id, t?.name ?? id, t?.country ?? "");
	};
	const circuit = (id: string) => {
		const c = db.circuits.get(id);
		return add("circuits", id, c?.name ?? id, c?.country ?? "");
	};

	// the first championship year of every circuit
	const circuitDebut = new Map<string, number>();
	for (const r of db.races) circuitDebut.set(r.circuitId, Math.min(r.year, circuitDebut.get(r.circuitId) ?? Infinity));
	// running title counts, for "the champion's nth title"
	const titlesSoFar = new Map<string, number>();
	const lastDbYear = db.years[db.years.length - 1];

	const seasons: PackedSeason[] = [];
	for (const year of db.years) {
		const races = completedRaces(db, year).sort((a, b) => a.round - b.round);
		if (!races.length || races.length < (db.racesByYear.get(year)?.length ?? 0)) continue;
		const { drivers: dStand, constructors: cStand } = seasonStandings(db, year);
		const champ = dStand.find((r) => r.champion);
		const second = dStand.find((r) => r.position === 2);
		if (!champ || !second) continue;
		titlesSoFar.set(champ.id, (titlesSoFar.get(champ.id) ?? 0) + 1);

		// per driver this season: points per team (for their main team), wins, poles, podiums
		const byDriver = new Map<string, { teams: Map<string, number>; wins: number; poles: number; podiums: number }>();
		const winners = new Set<string>();
		for (const race of races) {
			for (const r of db.resultsByRace.get(race.id) ?? []) {
				let s = byDriver.get(r.driverId);
				if (!s) byDriver.set(r.driverId, (s = { teams: new Map(), wins: 0, poles: 0, podiums: 0 }));
				// a tiny bonus per entry so a pointless team still counts, more points win
				s.teams.set(r.constructorId, (s.teams.get(r.constructorId) ?? 0) + r.points + 0.001);
				if (r.position === 1) {
					s.wins++;
					winners.add(r.driverId);
				}
				if (r.position != null && r.position <= 3) s.podiums++;
				if (r.pole) s.poles++;
			}
		}
		const mainTeam = (id: string) => {
			const t = byDriver.get(id)?.teams;
			return t ? [...t].sort((a, b) => b[1] - a[1])[0][0] : "";
		};
		const standing = (row: { id: string; points: number }): [number, number, number, number] => [
			driver(row.id),
			team(mainTeam(row.id)),
			round2(row.points),
			byDriver.get(row.id)?.wins ?? 0,
		];

		// when the champion led the standings, and from which round for good
		let led = 0;
		let lastNotLeading = 0;
		for (const race of races) {
			const leaders = standingsAfter(db, race).drivers.filter((r) => r.position === 1);
			if (leaders.length === 1 && leaders[0].id === champ.id) led++;
			else lastNotLeading = race.round;
		}
		const leadFrom = Math.min(lastNotLeading + 1, races[races.length - 1].round);

		// notable drivers whose championship career began or ended this year (never the champion)
		const notable = (pick: (c: { firstYear: number; lastYear: number }) => boolean): [number, number, number] | 0 => {
			let best: [string, number] | null = null;
			for (const id of byDriver.keys()) {
				const c = careers.get(id);
				if (!c || !c.starts || id === champ.id || !pick(c)) continue;
				if (!c.titles && !c.wins && c.podiums < 5) continue;
				const score = c.titles * 1000 + c.wins * 10 + c.podiums;
				if (!best || score > best[1]) best = [id, score];
			}
			if (!best) return 0;
			const c = careers.get(best[0])!;
			return [driver(best[0]), c.wins, c.titles];
		};

		const consChamp = cStand.find((r) => r.champion);
		seasons.push([
			year,
			races.length,
			races.filter((r) => db.sprintByRace.get(r.id)?.length).length,
			winners.size,
			leadFrom,
			led,
			[...standing(champ), byDriver.get(champ.id)?.poles ?? 0, byDriver.get(champ.id)?.podiums ?? 0, titlesSoFar.get(champ.id)!] as PackedSeason[6],
			standing(second),
			consChamp ? team(consChamp.id) : -1,
			[...new Set(races.map((r) => r.circuitId))].filter((id) => circuitDebut.get(id) === year).map(circuit),
			notable((c) => c.firstYear === year),
			year < lastDbYear ? notable((c) => c.lastYear === year) : 0,
			dStand
				.filter((r) => r.position != null)
				.sort((a, b) => a.position! - b.position!)
				.slice(0, TOP)
				.map(standing),
		]);
	}
	return { countries, ...tables, seasons };
}
