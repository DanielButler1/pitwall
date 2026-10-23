// Builds the category list and each driver's memberships for "Grid of nine"
// (public/data/grid.json, written by scripts/build-client-data.ts). Categories are worked out
// here once, so the page only has to intersect them.

import { isStart, type Db } from "../f1/dataset.ts";
import { driverCareers } from "../f1/stats.ts";
import { DECADES, FEATS, MATES, type GridFile, type PackedCategory, type PackedGridDriver } from "./grid.ts";

/** Well-known constructors (F1DB ids, one constructor each: F1DB has no lineage), kept if enough drivers raced for them. */
const TEAMS = [
	"ferrari", "mclaren", "williams", "lotus", "red-bull", "mercedes", "renault", "benetton", "brabham", "tyrrell", "ligier", "jordan", "sauber",
	"alfa-romeo", "toro-rosso", "alphatauri", "rb", "force-india", "racing-point", "aston-martin", "minardi", "arrows", "cooper", "brm", "maserati",
	"march", "surtees", "shadow", "lola", "footwork", "prost", "stewart", "bar", "toyota", "honda", "jaguar", "haas", "alpine", "toleman", "matra",
	"vanwall", "hesketh", "caterham", "hrt", "ensign", "osella",
];
const TEAM_MIN_DRIVERS = 7;
const NATION_MIN_DRIVERS = 8;
const SHORT_NATION: Record<string, string> = { "united-states-of-america": "United States" };

export function gridFile(db: Db): GridFile {
	const careers = driverCareers(db);
	const starters = [...careers.values()].filter((c) => c.starts > 0 && db.drivers.has(c.id)).map((c) => c.id);
	const members = new Map<string, Set<string>>();
	const add = (cat: string, id: string) => (members.get(cat) ?? members.set(cat, new Set()).get(cat)!).add(id);

	const teamsOf = new Map<string, Set<string>>();
	const mates = new Map(MATES.map((m) => [m, new Set<string>()]));
	const startsByRace = new Map<number, { driverId: string; constructorId: string }[]>();
	for (const r of db.results) {
		if (!isStart(r)) continue;
		const race = db.raceById.get(r.raceId)!;
		(teamsOf.get(r.driverId) ?? teamsOf.set(r.driverId, new Set()).get(r.driverId)!).add(r.constructorId);
		add(`decade:${Math.floor(race.year / 10) * 10}`, r.driverId);
		if (r.position != null && r.position <= 3) add("feat:podium", r.driverId);
		if (r.position === 1) {
			if (race.grandPrixId === "monaco") add("feat:monaco", r.driverId);
			if (db.grandsPrix.get(race.grandPrixId)?.country === db.drivers.get(r.driverId)?.nationality) add("feat:home-win", r.driverId);
		}
		(startsByRace.get(r.raceId) ?? startsByRace.set(r.raceId, []).get(r.raceId)!).push(r);
	}
	for (const list of startsByRace.values())
		for (const m of list)
			if (mates.has(m.driverId)) for (const o of list) if (o.driverId !== m.driverId && o.constructorId === m.constructorId) mates.get(m.driverId)!.add(o.driverId);

	for (const id of starters) {
		const c = careers.get(id)!;
		const teams = teamsOf.get(id) ?? new Set();
		for (const t of teams) add(`team:${t}`, id);
		add(`nation:${db.drivers.get(id)!.nationality}`, id);
		if (c.wins) add("feat:winner", id);
		if (c.poles) add("feat:pole", id);
		if (c.fastestLaps) add("feat:fastest-lap", id);
		if (c.titles) add("feat:champion", id);
		if (c.starts >= 100) add("feat:starts-100", id);
		if (c.starts >= 200) add("feat:starts-200", id);
		if (c.points === 0) add("feat:pointless", id);
		if (teams.size >= 5) add("feat:teams-5", id);
	}
	for (const [m, set] of mates) for (const id of set) add(`mate:${m}`, id);

	const categories: PackedCategory[] = [];
	for (const t of TEAMS) {
		const team = db.constructors.get(t);
		if (team && (members.get(`team:${t}`)?.size ?? 0) >= TEAM_MIN_DRIVERS) categories.push([`team:${t}`, team.name, db.countries.get(team.country)?.alpha2 ?? null]);
	}
	for (const [cat, set] of members) {
		if (!cat.startsWith("nation:") || set.size < NATION_MIN_DRIVERS) continue;
		const country = db.countries.get(cat.slice(7));
		if (country) categories.push([cat, SHORT_NATION[country.id] ?? country.name, country.alpha2]);
	}
	for (const d of DECADES) if (members.has(`decade:${d}`)) categories.push([`decade:${d}`, `Raced in the ${d}s`, null]);
	for (const [key, f] of Object.entries(FEATS)) if (members.has(`feat:${key}`)) categories.push([`feat:${key}`, f.label, null]);
	for (const m of MATES) {
		const d = db.drivers.get(m);
		if (d) categories.push([`mate:${m}`, `Team-mate of ${d.lastName}`, null]);
	}
	categories.sort((a, b) => a[0].localeCompare(b[0]));
	const catIndex = new Map(categories.map((c, i) => [c[0], i]));

	const drivers: PackedGridDriver[] = starters.map((id) => {
		const d = db.drivers.get(id)!;
		const c = careers.get(id)!;
		const cats = [...members].filter(([cat, set]) => set.has(id) && catIndex.has(cat)).map(([cat]) => catIndex.get(cat)!);
		return [id, d.name, d.lastName, db.countries.get(d.nationality)?.alpha2 ?? null, c.firstYear, c.lastYear, c.starts, c.wins, cats.sort((a, b) => a - b)];
	});
	drivers.sort((a, b) => a[0].localeCompare(b[0]));
	return { categories, drivers };
}
