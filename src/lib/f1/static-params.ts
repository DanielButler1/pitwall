// Every page the build prerenders. The data only changes when the site is rebuilt, so
// each page is rendered once at build time and then served as a file.

import { allDiaryDays, diarySlug } from "./diary-dates.ts";
import { recordIndex } from "./records/index.ts";
import { getDb } from "./server.ts";
import * as v from "./views.ts";

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
