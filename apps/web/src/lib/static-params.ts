// Every indexed historical page, for both the sitemap and build-time rendering.
// Data changes only at deploy: crawlers should not have to generate the archive after every release.

import { allDiaryDays, diarySlug } from "@pitwall/core/f1/diary-dates";
import { recordIndex } from "@pitwall/core/f1/records";
import { getDb } from "./server.ts";
import { activeGrid } from "@pitwall/core/f1/milestones";
import { teammatePairs } from "@pitwall/core/f1/teammates";
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
	// Both orders are linked from driver profiles and put that driver on the left.
	teammates: () => teammatePairs(getDb()).flatMap(({ a, b }) => [{ a, b }, { a: b, b: a }]),
};

/**
 * Share-image routes still prebuild only the current constructors. Other image routes
 * generate on first request; race, driver and season images are built into public/social.
 * Pages use staticParams above. Keep their compact view models at a client boundary so
 * the build does not serialize the full table markup into every RSC artifact.
 */
export const prebuild = {
	constructors: () => {
		const grid = activeGrid(getDb());
		return grid ? [...grid.teams].map((id) => ({ id })) : [];
	},
	none: () => [],
};
