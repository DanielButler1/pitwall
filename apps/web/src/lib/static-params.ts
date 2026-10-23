// Every page that exists, for the sitemap, and (prebuild, below) the few built at deploy time.
// The data only changes when the site is rebuilt, so each page is rendered once and then served as a file.

import { allDiaryDays, diarySlug } from "@pitwall/core/f1/diary-dates";
import { recordIndex } from "@pitwall/core/f1/records";
import { getDb } from "./server.ts";
import { activeGrid } from "@pitwall/core/f1/milestones";
import * as v from "@pitwall/core/f1/views";

export const staticParams = {
	seasons: () => [...getDb().racesByYear.keys()].map((year) => ({ year: String(year) })),
	races: () => getDb().races.map((r) => ({ year: String(r.year), round: String(r.round) })),
	drivers: () => v.driversView(getDb()).rows.map((r) => ({ id: r.driver.id })),
	constructors: () => v.constructorsView(getDb()).rows.map((r) => ({ id: r.team.id })),
	circuits: () => v.circuitsView(getDb()).rows.map((r) => ({ id: r.id })),
	grandsPrix: () => v.grandsPrixView(getDb()).rows.map((r) => ({ id: r.gp.id })),
	engines: () => v.enginesView(getDb()).rows.map((r) => ({ id: r.supplier.id })),
	tyres: () => v.tyresView(getDb()).rows.map((r) => ({ id: r.supplier.id })),
	nations: () => v.nationsView(getDb()).rows.map((r) => ({ id: r.nation.id })),
	diary: () => allDiaryDays().map((d) => ({ date: diarySlug(d.month, d.day) })),
	records: () => recordIndex().map((r) => ({ slug: r.id.split("/") })),
};

/**
 * The pages built at deploy time: only the current season, its races and the current grid.
 * Everything else in `staticParams` (thousands of pages) is rendered the first time it is
 * visited and then cached, which keeps each deployment small (a full prerender was ~1.7 GB).
 * `staticParams` itself still lists every page, for the sitemap.
 */
export const prebuild = {
	seasons: () => staticParams.seasons().filter((s) => Number(s.year) === getDb().meta.lastCompletedYear),
	races: () => staticParams.races().filter((r) => Number(r.year) === getDb().meta.lastCompletedYear),
	drivers: () => {
		const grid = activeGrid(getDb());
		return grid ? [...grid.drivers].map((id) => ({ id })) : [];
	},
	constructors: () => {
		const grid = activeGrid(getDb());
		return grid ? [...grid.teams].map((id) => ({ id })) : [];
	},
	none: () => [],
};
