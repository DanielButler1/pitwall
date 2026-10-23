// Jolpica (https://github.com/jolpica/jolpica-f1, the Ergast successor) as a
// supplement to F1DB: lap-by-lap positions and times for races since 1996,
// sprint laps where recorded, and pit stops since 2011.
//
// F1DB stays the primary source: Jolpica rounds are mapped onto F1DB race ids
// by (year, round) with a date check, and Jolpica drivers onto F1DB driver ids
// by date of birth and name (plus OVERRIDES). Anything used by lap data that
// can't be mapped fails the build.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTable } from "./csv.mjs";

/** Jolpica driver reference -> F1DB driver id, for drivers the automatic match can't resolve. */
export const OVERRIDES = {
	// filled from build reports when needed
};

/**
 * Lap leaders Jolpica gets wrong. Its final-lap positions sometimes follow the
 * post-race classification rather than the order across the line:
 * "year|round" -> { lap: driverId who actually led it }.
 */
export const LEADER_FIXES = {
	// Belgium 2008: Hamilton crossed the line first; his 25 s penalty came after the race.
	"2008|13": { 44: "lewis-hamilton" },
};

const norm = (s) =>
	(s ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z]/g, "");

/** "00:01:16.290" / "1:16.29" / "16.29" -> milliseconds. */
export function toMs(t) {
	if (!t) return null;
	const parts = t.split(":").map(Number);
	if (parts.some((p) => !Number.isFinite(p))) return null;
	let s = 0;
	for (const p of parts) s = s * 60 + p;
	return Math.round(s * 1000);
}

/** Run-length encode lap leaders: [[driverId, fromLap, toLap], ...]. */
function rle(leaders) {
	const out = [];
	for (let lap = 1; lap < leaders.length; lap++) {
		const d = leaders[lap];
		if (!d) continue;
		const last = out[out.length - 1];
		if (last && last[0] === d && last[2] === lap - 1) last[2] = lap;
		else out.push([d, lap, lap]);
	}
	return out;
}

/**
 * @param dir    folder with the Jolpica CSV dump
 * @param f1db   { races, drivers, grandsPrix, raceResults, sprintResults } (F1DB JSON arrays)
 * @returns null when there is no dump, else { meta, lapLeaders, sprintLapLeaders, files, report }
 */
export function buildJolpica(dir, f1db) {
	if (!existsSync(join(dir, "formula_one_lap.csv"))) return null;
	const T = (name) => readTable(join(dir, `formula_one_${name}.csv`));
	let dumpDate = null;
	const info = join(dir, "jolpica-dump.json");
	if (existsSync(info)) dumpDate = JSON.parse(readFileSync(info, "utf8")).dumpDate ?? null;

	/* --------------------------------------------------------- races --- */
	const seasonYear = new Map(T("season").pick("id", "year").map((r) => [r.id, Number(r.year)]));
	const f1dbRace = new Map(f1db.races.map((r) => [`${r.year}|${r.round}`, r]));
	const roundToRace = new Map(); // jolpica round id -> F1DB race
	const raceProblems = [];
	const dateWarnings = [];
	const gpName = new Map((f1db.grandsPrix ?? []).map((g) => [g.id, g.fullName]));
	for (const r of T("round").pick("id", "season_id", "number", "date", "is_cancelled", "name")) {
		if (r.is_cancelled === "t" || !r.number) continue;
		const year = seasonYear.get(r.season_id);
		const race = f1dbRace.get(`${year}|${Number(r.number)}`);
		if (!race) {
			raceProblems.push(`${year} round ${r.number} (${r.name}): no F1DB race`);
			continue;
		}
		const days = Math.abs(Date.parse(race.date) - Date.parse(r.date)) / 86400000;
		// dates should agree; a small disagreement is accepted when the Grand Prix name matches too
		const sameName = norm(gpName.get(race.grandPrixId)) === norm(r.name);
		if (days > 3 && !(days <= 14 && sameName)) {
			raceProblems.push(`${year} round ${r.number} (${r.name} ${r.date}): F1DB ${race.id} is on ${race.date}`);
			continue;
		}
		if (days > 3) dateWarnings.push(`${year} round ${r.number} ${r.name}: Jolpica ${r.date}, F1DB ${race.date}`);
		roundToRace.set(r.id, race);
	}

	/* ------------------------------------------------------- drivers --- */
	const byDob = new Map();
	const byName = new Map();
	for (const d of f1db.drivers) {
		if (d.dateOfBirth) byDob.set(d.dateOfBirth, [...(byDob.get(d.dateOfBirth) ?? []), d]);
		const k = norm(d.firstName) + "|" + norm(d.lastName);
		byName.set(k, [...(byName.get(k) ?? []), d]);
	}
	const f1dbIds = new Set(f1db.drivers.map((d) => d.id));
	const jDrivers = new Map(T("driver").pick("id", "reference", "forename", "surname", "date_of_birth").map((d) => [d.id, d]));
	const driverMap = new Map(); // jolpica driver id -> F1DB id
	const how = { override: 0, dobName: 0, dobOnly: 0, name: 0 };
	const unmatchedDrivers = new Set();
	function mapDriver(jid) {
		if (driverMap.has(jid)) return driverMap.get(jid);
		const d = jDrivers.get(jid);
		let id = null;
		if (d && OVERRIDES[d.reference]) {
			id = OVERRIDES[d.reference];
			if (!f1dbIds.has(id)) throw new Error(`Jolpica override ${d.reference} -> ${id}: no such F1DB driver`);
			how.override++;
		} else if (d) {
			const sur = norm(d.surname);
			const fore = norm(d.forename);
			const sameDob = d.date_of_birth ? (byDob.get(d.date_of_birth) ?? []) : [];
			const named = sameDob.filter((x) => {
				const l = norm(x.lastName);
				const full = norm(x.name);
				return l === sur || full.includes(sur) || sur.includes(l) || norm(x.firstName) === fore;
			});
			if (named.length === 1) {
				id = named[0].id;
				how.dobName++;
			} else if (sameDob.length === 1) {
				id = sameDob[0].id;
				how.dobOnly++;
			} else {
				const n = byName.get(fore + "|" + sur) ?? [];
				if (n.length === 1) {
					id = n[0].id;
					how.name++;
				}
			}
		}
		if (!id) unmatchedDrivers.add(d ? `${d.reference} (${d.forename} ${d.surname}, ${d.date_of_birth || "no DOB"})` : `#${jid}`);
		driverMap.set(jid, id);
		return id;
	}

	/* ----------------------------------------------------- entries --- */
	const teamDriver = new Map(T("teamdriver").pick("id", "driver_id").map((r) => [r.id, r.driver_id]));
	const roundEntry = new Map(T("roundentry").pick("id", "team_driver_id").map((r) => [r.id, teamDriver.get(r.team_driver_id)]));
	const sessions = new Map();
	for (const s of T("session").pick("id", "round_id", "type", "is_cancelled")) if (s.type === "R" || s.type === "SR") sessions.set(s.id, s);
	const entries = new Map(); // session entry id -> { session, round, jDriver }
	for (const e of T("sessionentry").pick("id", "session_id", "round_entry_id")) {
		const s = sessions.get(e.session_id);
		if (!s) continue;
		entries.set(e.id, { session: s, round: s.round_id, jDriver: roundEntry.get(e.round_entry_id) });
	}

	/* ---------------------------------------------------------- laps --- */
	// per F1DB race and session type: driverId -> [{lap, pos, ms}]
	const perRace = new Map();
	const unmappedRounds = new Set();
	const lapNumber = new Map(); // jolpica lap id -> lap number (for pit stops)
	const lap = T("lap");
	const [cId, cSe, cNum, cPos, cTime, cFl] = ["id", "session_entry_id", "number", "position", "time", "is_entry_fastest_lap"].map((c) => lap.col(c));
	let noPosition = 0;
	// sprint fastest lap: the quickest of the drivers' own fastest laps (recorded for every sprint, even without lap charts)
	const sprintFastest = new Map(); // F1DB race id -> { driverId, lap, ms }
	for (const row of lap.rows) {
		const e = entries.get(row[cSe]);
		if (!e) continue;
		if (e.session.type === "SR" && row[cFl] === "t") {
			const race = roundToRace.get(e.round);
			const ms = toMs(row[cTime]);
			const driverId = race && ms != null ? mapDriver(e.jDriver) : null;
			if (!race) unmappedRounds.add(e.round);
			else if (driverId && ms != null) {
				const best = sprintFastest.get(race.id);
				if (!best || ms < best.ms) sprintFastest.set(race.id, { driverId, lap: row[cNum] ? Number(row[cNum]) : null, ms });
			}
		}
		if (!row[cNum]) continue;
		const n = Number(row[cNum]);
		lapNumber.set(row[cId], n);
		if (row[cPos] === "") {
			noPosition++;
			continue;
		}
		const race = roundToRace.get(e.round);
		if (!race) {
			unmappedRounds.add(e.round);
			continue;
		}
		const driverId = mapDriver(e.jDriver);
		if (!driverId) continue;
		let r = perRace.get(race.id);
		if (!r) perRace.set(race.id, (r = { race, R: new Map(), SR: new Map(), pits: [] }));
		const m = r[e.session.type];
		let list = m.get(driverId);
		if (!list) m.set(driverId, (list = []));
		list.push({ lap: n, pos: Number(row[cPos]), ms: toMs(row[cTime]) });
	}

	/* ----------------------------------------------------- pit stops --- */
	let pitYears = [Infinity, -Infinity];
	for (const p of T("pitstop").pick("session_entry_id", "lap_id", "number", "duration")) {
		const e = entries.get(p.session_entry_id);
		if (!e || e.session.type !== "R") continue;
		const race = roundToRace.get(e.round);
		if (!race) {
			unmappedRounds.add(e.round);
			continue;
		}
		const driverId = mapDriver(e.jDriver);
		if (!driverId) continue;
		let r = perRace.get(race.id);
		if (!r) perRace.set(race.id, (r = { race, R: new Map(), SR: new Map(), pits: [] }));
		r.pits.push({ driverId, stop: Number(p.number), lap: lapNumber.get(p.lap_id) ?? null, ms: toMs(p.duration) });
		pitYears = [Math.min(pitYears[0], race.year), Math.max(pitYears[1], race.year)];
	}

	if (unmatchedDrivers.size || unmappedRounds.size) {
		throw new Error(
			`Jolpica mapping failed for data in use:\n` +
				[...unmatchedDrivers].map((d) => `  driver ${d}: add it to OVERRIDES in scripts/lib/jolpica.mjs`).join("\n") +
				(unmappedRounds.size ? `\n  ${unmappedRounds.size} rounds with laps/pit stops have no F1DB race:\n  ${raceProblems.join("\n  ")}` : ""),
		);
	}

	/* -------------------------------------------------- consistency --- */
	const resultsByRace = new Map();
	for (const r of f1db.raceResults) resultsByRace.set(r.raceId, [...(resultsByRace.get(r.raceId) ?? []), r]);
	const sprintByRace = new Map();
	for (const r of f1db.sprintResults) sprintByRace.set(r.raceId, [...(sprintByRace.get(r.raceId) ?? []), r]);
	const notInResults = [];
	const lapCountMismatch = [];
	const leaderGaps = [];

	/** Session laps -> compact chart data + leader RLE. */
	function session(m, results, label, fix) {
		const drivers = [...m.keys()];
		const resultIds = new Set((results ?? []).map((r) => r.driverId));
		for (const d of drivers) if (results && !resultIds.has(d)) notInResults.push(`${label}: ${d}`);
		// order drivers by finishing position (F1DB), then laps completed
		const order = new Map((results ?? []).map((r, i) => [r.driverId, r.positionNumber ?? 900 + i]));
		drivers.sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || m.get(b).length - m.get(a).length);
		// the official result can end before Jolpica's last timed lap (e.g. China 2014, flag shown early)
		const winner = (results ?? []).find((r) => r.positionNumber === 1);
		const cap = winner?.laps ?? Infinity;
		for (const d of drivers) m.set(d, m.get(d).filter((x) => x.lap <= cap));
		const kept = drivers.filter((d) => m.get(d).length);
		let maxLap = 0;
		const pos = [];
		const times = [];
		const leaders = [];
		for (const d of kept) {
			const list = m.get(d).sort((a, b) => a.lap - b.lap);
			const last = list[list.length - 1].lap;
			maxLap = Math.max(maxLap, last);
			const p = new Array(last).fill(null);
			const t = new Array(last).fill(null);
			for (const x of list) {
				p[x.lap - 1] = x.pos;
				t[x.lap - 1] = x.ms;
				if (x.pos === 1) leaders[x.lap] = d;
			}
			pos.push(p);
			times.push(t);
		}
		for (const [l, d] of Object.entries(fix ?? {})) leaders[Number(l)] = d;
		for (let l = 1; l <= maxLap; l++) if (!leaders[l]) leaderGaps.push(`${label} lap ${l}`);
		if (winner?.laps != null && winner.laps !== maxLap) lapCountMismatch.push(`${label}: Jolpica ${maxLap} laps, F1DB winner ${winner.laps}`);
		return { drivers: kept, pos, times, maxLap, leaders: rle(leaders) };
	}

	const files = new Map(); // raceId -> per-race JSON object
	const lapLeaders = [];
	const sprintCandidates = [];
	let lapYears = [Infinity, -Infinity];
	let lastLapRace = null;
	for (const r of [...perRace.values()].sort((a, b) => a.race.year - b.race.year || a.race.round - b.race.round)) {
		const label = `${r.race.year} round ${r.race.round}`;
		const file = { raceId: r.race.id };
		if (r.R.size) {
			const s = session(r.R, resultsByRace.get(r.race.id), label, LEADER_FIXES[`${r.race.year}|${r.race.round}`]);
			file.drivers = s.drivers;
			file.positions = s.pos;
			file.times = s.times;
			lapLeaders.push([r.race.id, s.leaders]);
			lapYears = [Math.min(lapYears[0], r.race.year), Math.max(lapYears[1], r.race.year)];
			lastLapRace = r.race;
		}
		if (r.SR.size) {
			// only sprints with a position for every driver's every lap
			const s = session(r.SR, sprintByRace.get(r.race.id), `${label} sprint`);
			const complete = s.pos.every((p) => p.every((x) => x != null));
			if (complete && s.leaders.length) {
				file.sprint = { drivers: s.drivers, positions: s.pos, times: s.times };
				sprintCandidates.push({ race: r.race, leaders: s.leaders });
			}
		}
		if (r.pits.length) {
			const idx = new Map((file.drivers ?? []).map((d, i) => [d, i]));
			// [driverId, stop, lap, durationMs]
			file.pitStops = r.pits
				.sort((a, b) => (a.lap ?? 0) - (b.lap ?? 0) || (idx.get(a.driverId) ?? 99) - (idx.get(b.driverId) ?? 99))
				.map((p) => [p.driverId, p.stop, p.lap, p.ms]);
		}
		files.set(r.race.id, file);
	}

	// sprint lap leaders only for seasons where every sprint has complete lap positions
	// (2023 has only partial sprint lap data), so the coverage is a clean "since <year>"
	const sprintsPerYear = new Map();
	for (const id of sprintByRace.keys()) {
		const race = f1db.races.find((x) => x.id === id);
		// sprints after the dump's last race aren't expected yet
		const inDump = race && lastLapRace && (race.year < lastLapRace.year || (race.year === lastLapRace.year && race.round <= lastLapRace.round));
		if (inDump) sprintsPerYear.set(race.year, (sprintsPerYear.get(race.year) ?? 0) + 1);
	}
	const completePerYear = new Map();
	for (const c of sprintCandidates) completePerYear.set(c.race.year, (completePerYear.get(c.race.year) ?? 0) + 1);
	const sprintLapLeaders = sprintCandidates.filter((c) => completePerYear.get(c.race.year) === sprintsPerYear.get(c.race.year)).map((c) => [c.race.id, c.leaders]);
	const sprintYears = sprintCandidates.filter((c) => completePerYear.get(c.race.year) === sprintsPerYear.get(c.race.year)).map((c) => c.race.year);

	// every F1DB race with results from the first lap-data season up to the last one must be covered
	const missing = f1db.races
		.filter((r) => r.year >= lapYears[0] && resultsByRace.has(r.id) && (r.year < lastLapRace.year || (r.year === lastLapRace.year && r.round <= lastLapRace.round)))
		.filter((r) => !perRace.get(r.id)?.R.size);
	if (missing.length) throw new Error(`Jolpica has no lap data for ${missing.map((r) => `${r.year} round ${r.round}`).join(", ")}`);

	const sprintFastestLaps = [...sprintFastest]
		.filter(([raceId]) => sprintByRace.has(raceId))
		.map(([raceId, f]) => [raceId, f.driverId, f.lap, f.ms]);
	const sprintFlYears = sprintFastestLaps.map(([id]) => f1db.races.find((r) => r.id === id).year);

	return {
		meta: {
			source: "Jolpica",
			dumpDate,
			lapsFrom: lapYears[0],
			lapsTo: lapYears[1],
			lastLapRaceId: lastLapRace?.id ?? null,
			sprintLapsFrom: sprintYears.length ? Math.min(...sprintYears) : null,
			pitStopsFrom: Number.isFinite(pitYears[0]) ? pitYears[0] : null,
			sprintFastestLapsFrom: sprintFlYears.length ? Math.min(...sprintFlYears) : null,
		},
		lapLeaders,
		sprintLapLeaders,
		sprintFastestLaps,
		files,
		report: {
			drivers: { mapped: [...driverMap.values()].filter(Boolean).length, ...how, overrides: Object.keys(OVERRIDES).length },
			rounds: { mapped: roundToRace.size, problems: raceProblems, dateWarnings },
			noPosition,
			notInResults,
			lapCountMismatch,
			leaderGaps,
		},
	};
}
