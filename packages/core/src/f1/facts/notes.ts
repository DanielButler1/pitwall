// Facts from what F1DB's results don't say: the race notes (weather, safety cars, virtual safety
// cars, red flags and tyres, entered by hand). F1DB's own pit stop counts aren't used: they count
// the field being led through the pit lane behind the safety car, and miss stops in the 1990s.
//
// The notes have gaps, so "the first since" is only said when every race in between is known: a
// race with no weather entered might have been wet. Red flags are complete from 1971. Safety cars
// count as known for seasons where most races have one entered (the import has them to 2021; later
// seasons fill in as they're typed up). Tyres are only known where they've been entered.

import type { Db, Neutralisation, RaceNote } from "../dataset.ts";
import { facts, type RaceFacts } from "../records/facts.ts";
import { cDriver, cGp, cSeason } from "../records/cells.ts";
import { raceNote, tyreName, type TyreCode } from "../laps.ts";
import { ordinal } from "../anniversaries.ts";
import { cRaceFull, log2, possessive, sentence, type Add } from "./shared.ts";

/** Red flags are listed for every race from this season. */
export const RED_FLAGS_FROM = 1971;

/** A race's notes; null when a universe changed the race (its notes no longer apply). */
const noteOf = (db: Db, rf: RaceFacts): RaceNote | null => raceNote(db, rf.race.id);
/** Whether a universe changed the race since its notes were entered. */
const stale = (db: Db, rf: RaceFacts) => db.raceNotes?.has(rf.race.id) === true && !noteOf(db, rf);

const wet = (n: RaceNote | null) => n?.weather === "wet" || n?.weather === "mixed";
const count = (n: RaceNote | null, type: Neutralisation[0]) => n?.neutralised.filter((x) => x[0] === type).length ?? 0;

/**
 * The latest race before `from` that `test` holds for, as long as every race on the way back is
 * `known`: -1 when there's none, null when an unknown race is in the way (the claim can't be made).
 */
function lastKnown(F: { races: RaceFacts[] }, from: number, known: (rf: RaceFacts) => boolean, test: (rf: RaceFacts) => boolean, stop = 0): number | null {
	for (let i = from - 1; i >= stop; i--) {
		const rf = F.races[i];
		if (!known(rf)) return null;
		if (test(rf)) return i;
	}
	return -1;
}

/** Whether a season's safety cars are entered: more than half its races up to race idx have one (or a VSC). */
function safetyCarsKnown(db: Db, year: number, idx: number): boolean {
	const F = facts(db);
	const idxs = (F.seasons.get(year) ?? []).filter((i) => i <= idx);
	const withSc = idxs.filter((i) => db.raceNotes?.get(F.races[i].race.id)?.neutralised.some((n) => n[0] !== "RF")).length;
	return withSc * 2 > idxs.length;
}

/** How many runnings of a Grand Prix up to race idx in a row, back to its first, had a safety car (0 unless all known). */
export function safetyCarEvery(db: Db, grandPrixId: string, idx: number): number {
	const F = facts(db);
	const editions = F.races.slice(0, idx + 1).filter((rf) => rf.race.grandPrixId === grandPrixId);
	const ok = editions.every((rf) => safetyCarsKnown(db, rf.race.year, idx) && !stale(db, rf) && count(noteOf(db, rf), "SC") > 0);
	return ok ? editions.length : 0;
}

export function noteFacts(db: Db, f: RaceFacts, add: Add) {
	const F = facts(db);
	const note = noteOf(db, f);
	const race = f.race;
	const w = f.winner;
	const since = (i: number) => cRaceFull(db, F.races[i].race);
	const gapScore = (gap: number, base = 20, wt = 2) => wt * log2(gap / (base / 2));

	// ---- weather
	const weatherKnown = (rf: RaceFacts) => noteOf(db, rf)?.weather != null;
	if (wet(note)) {
		const prev = lastKnown(F, f.idx, weatherKnown, (rf) => wet(noteOf(db, rf)));
		if (prev != null && prev >= 0 && f.idx - prev >= 20) add("weather", "race:wet", gapScore(f.idx - prev), sentence("The first race run in the wet since the ", since(prev)));
		// at this Grand Prix
		const editions = F.races.slice(0, f.idx).filter((rf) => rf.race.grandPrixId === race.grandPrixId);
		let k = editions.length - 1;
		while (k >= 0 && weatherKnown(editions[k]) && !wet(noteOf(db, editions[k]))) k--;
		const dry = editions.length - 1 - k;
		if (k >= 0 && weatherKnown(editions[k]) && dry >= 8)
			add("weather", `gp:${race.grandPrixId}:wet`, 2 + log2(dry / 4), sentence("The first wet ", cGp(db, race.grandPrixId), ` since ${editions[k].race.year}, after ${dry} dry ones`));

		// the winner's first win in the wet
		if (w) {
			const wins = F.races.slice(0, f.idx).filter((rf) => rf.winner?.driverId === w.driverId);
			if (wins.length >= 3 && wins.every(weatherKnown) && !wins.some((rf) => wet(noteOf(db, rf))))
				add("weather", `driver:${w.driverId}:wet-win`, 3 + log2(wins.length / 3), sentence(...possessive(cDriver(db, w.driverId)), ` first wet-weather win, and ${ordinal(wins.length + 1)} win in all`));
		}
	}

	// ---- red flags
	const redKnown = (rf: RaceFacts) => rf.race.year >= RED_FLAGS_FROM && !stale(db, rf);
	const reds = count(note, "RF");
	if (reds && redKnown(f)) {
		if (reds >= 2) {
			const prev = lastKnown(F, f.idx, redKnown, (rf) => count(noteOf(db, rf), "RF") >= reds);
			if (prev === -1) add("neutral", "race:red-flags", 7, sentence(`Red-flagged ${reds} times, the first race to be since red flags were recorded (${RED_FLAGS_FROM})`));
			else if (prev != null && f.idx - prev >= 20) add("neutral", "race:red-flags", gapScore(f.idx - prev, 20, 2.2), sentence(`Red-flagged ${reds} times, the first race to be since the `, since(prev)));
		}
		// in the season
		const season = F.seasons.get(race.year)!.filter((i) => i <= f.idx);
		const n = season.filter((i) => count(noteOf(db, F.races[i]), "RF") > 0).length;
		if (n >= 3) {
			let year = race.year - 1;
			const redRaces = (y: number) => (F.seasons.get(y) ?? []).filter((i) => count(noteOf(db, F.races[i]), "RF") > 0).length;
			while (year >= RED_FLAGS_FROM && redRaces(year) < n) year--;
			const head = `The ${ordinal(n)} red-flagged race of ${race.year}`;
			if (year < RED_FLAGS_FROM) add("neutral", "race:red-season", 5 + Math.min(2, n - 3), sentence(head, `, the most in a season since red flags were recorded (${RED_FLAGS_FROM})`));
			else if (race.year - year >= 3) add("neutral", "race:red-season", 2 + log2(race.year - year), sentence(head, ", the most in a season since ", cSeason(year)));
		}
		// at this Grand Prix
		const editions = F.races.slice(0, f.idx).filter((rf) => rf.race.grandPrixId === race.grandPrixId);
		const before = editions.filter((rf) => count(noteOf(db, rf), "RF") > 0);
		const last = before.at(-1);
		if (!last && editions.length >= 5 && editions.every(redKnown)) add("neutral", `gp:${race.grandPrixId}:red`, 4, sentence("The first red flag at the ", cGp(db, race.grandPrixId), `, at its ${ordinal(editions.length + 1)} running`));
		else if (last && race.year - last.race.year >= 10 && editions.filter((rf) => rf.idx > last.idx).every(redKnown))
			add("neutral", `gp:${race.grandPrixId}:red`, 2 + log2((race.year - last.race.year) / 5), sentence("The first red flag at the ", cGp(db, race.grandPrixId), " since ", cSeason(last.race.year)));
	}

	// ---- safety cars
	const scKnown = (rf: RaceFacts) => safetyCarsKnown(db, rf.race.year, f.idx) && !stale(db, rf);
	if (note && scKnown(f)) {
		const scs = count(note, "SC");
		if (scs >= 4) {
			const prev = lastKnown(F, f.idx, scKnown, (rf) => count(noteOf(db, rf), "SC") >= scs);
			if (prev != null && prev >= 0 && f.idx - prev >= 20) add("neutral", "race:safety-cars", gapScore(f.idx - prev), sentence(`${scs} safety car periods, the most in a race since the `, since(prev)));
		}
		// a start behind the safety car
		const scStart = (n: RaceNote | null) => !!n?.neutralised.some(([t, from]) => t === "SC" && from === 1);
		if (scStart(note)) {
			const prev = lastKnown(F, f.idx, scKnown, (rf) => scStart(noteOf(db, rf)));
			if (prev != null && prev >= 0 && f.idx - prev >= 25) add("neutral", "race:sc-start", gapScore(f.idx - prev, 25), sentence("The race started behind the safety car, the first since the ", since(prev)));
		}
		// everything at once
		const all = (n: RaceNote | null) => count(n, "SC") > 0 && count(n, "VSC") > 0 && count(n, "RF") > 0;
		if (all(note)) {
			const prev = lastKnown(F, f.idx, scKnown, (rf) => all(noteOf(db, rf)));
			if (prev != null && prev >= 0 && f.idx - prev >= 20) add("neutral", "race:all-three", gapScore(f.idx - prev), sentence("A safety car, a virtual safety car and a red flag in one race, the first since the ", since(prev)));
		}
		// a safety car at every running of this Grand Prix
		const every = safetyCarEvery(db, race.grandPrixId, f.idx);
		if (every >= 5) add("neutral", `gp:${race.grandPrixId}:sc-every`, 3 + log2(every / 5), sentence("There has been a safety car at every running of the ", cGp(db, race.grandPrixId), ` (${every})`));
	}

	// ---- tyres (where entered): a stint per set, so the stops too
	const stintsOf = (rf: RaceFacts) => (rf.winner ? (noteOf(db, rf)?.stints?.get(rf.winner.driverId) as TyreCode[] | undefined) : undefined);
	const mine = stintsOf(f);
	if (w && mine?.length && !mine.includes("?")) {
		const known = (rf: RaceFacts) => !!stintsOf(rf)?.length && !stintsOf(rf)!.includes("?");
		const dry = (c: TyreCode) => c !== "I" && c !== "W";
		// a red flag lets cars change tyres without stopping, so stints aren't stops
		const stops = (rf: RaceFacts) => (count(noteOf(db, rf), "RF") ? null : stintsOf(rf)!.length - 1);
		const s = stops(f);
		if (s === 0) {
			const prev = lastKnown(F, f.idx, known, (rf) => stops(rf) === 0);
			if (prev != null && prev >= 0 && f.idx - prev >= 10) add("tyres", `driver:${w.driverId}:stops`, gapScore(f.idx - prev, 10, 2.2), sentence(cDriver(db, w.driverId), " won without a pit stop, the first winner to since the ", since(prev)));
		} else if (s != null && s >= 3) {
			const prev = lastKnown(F, f.idx, known, (rf) => (stops(rf) ?? 0) >= s);
			if (prev != null && prev >= 0 && f.idx - prev >= 10) add("tyres", `driver:${w.driverId}:stops`, gapScore(f.idx - prev, 10), sentence(cDriver(db, w.driverId), ` won with ${s} pit stops, the most by a winner since the `, since(prev)));
		}
		// started on the hardest tyre
		const hard = (cs: TyreCode[] | undefined) => !!cs && (cs[0] === "H" || cs[0] === "SH") && cs.every(dry);
		if (hard(mine)) {
			const prev = lastKnown(F, f.idx, known, (rf) => hard(stintsOf(rf)));
			if (prev != null && prev >= 0 && f.idx - prev >= 10) add("tyres", `driver:${w.driverId}:hard-start`, gapScore(f.idx - prev, 10), sentence(cDriver(db, w.driverId), ` won from a start on the ${tyreName(mine[0]).toLowerCase()} tyres, the first winner to since the `, since(prev)));
		}
		// full wets
		if (mine.includes("W")) {
			const prev = lastKnown(F, f.idx, known, (rf) => !!stintsOf(rf)?.includes("W"));
			if (prev != null && prev >= 0 && f.idx - prev >= 10) add("tyres", `driver:${w.driverId}:wets`, gapScore(f.idx - prev, 10), sentence(cDriver(db, w.driverId), " won with a stint on full wets, the first winner to since the ", since(prev)));
		}
		// one compound all race
		if (mine.length >= 2 && mine.every((c) => c === mine[0]) && dry(mine[0])) add("tyres", `driver:${w.driverId}:one-compound`, 3, sentence(cDriver(db, w.driverId), ` won on ${tyreName(mine[0]).toLowerCase()} tyres all race`));
	}
}
