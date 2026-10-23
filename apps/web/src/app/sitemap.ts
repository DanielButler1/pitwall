import type { MetadataRoute } from "next";
import { getDb } from "@/lib/server";
import { staticParams } from "@/lib/static-params";
import { SITE_URL } from "@/lib/site";

// Every public page: the fixed sections, the games and each prerendered profile, season,
// race, record and diary day. Built once per deployment, like the pages themselves.

const SECTIONS = [
	"",
	"/seasons",
	"/drivers",
	"/constructors",
	"/circuits",
	"/grands-prix",
	"/engines",
	"/tyres",
	"/nations",
	"/records",
	"/milestones",
	"/diary",
	"/compare",
	"/points",
	"/lab",
	"/play",
];
const GAMES = ["guess", "career", "grid", "chain", "constructor", "circuit", "race", "lap-chart", "name-the-grid", "predict", "higher-lower", "season", "fantasy"];

export default function sitemap(): MetadataRoute.Sitemap {
	const p = staticParams;
	const paths = [
		...SECTIONS,
		...GAMES.map((g) => `/play/${g}`),
		...p.seasons().map((s) => `/seasons/${s.year}`),
		...p.races().map((r) => `/races/${r.year}/${r.round}`),
		...p.drivers().map((d) => `/drivers/${d.id}`),
		...p.constructors().map((c) => `/constructors/${c.id}`),
		...p.circuits().map((c) => `/circuits/${c.id}`),
		...p.grandsPrix().map((g) => `/grands-prix/${g.id}`),
		...p.engines().map((e) => `/engines/${e.id}`),
		...p.tyres().map((t) => `/tyres/${t.id}`),
		...p.nations().map((n) => `/nations/${n.id}`),
		...p.records().map((r) => `/records/${r.slug.join("/")}`),
		...p.diary().map((d) => `/diary/${d.date}`),
	];
	const lastModified = getDb().meta.generatedAt;
	return paths.map((path) => ({ url: SITE_URL + path, lastModified }));
}
