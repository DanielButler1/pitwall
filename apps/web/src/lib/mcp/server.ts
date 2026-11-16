// Pitwall's MCP server: F1 statistics for AI assistants (ChatGPT, Claude, Cursor, ...), served at /mcp
// (src/app/mcp/route.ts). Each tool wraps the same view models the website's pages use, plus a read-only
// SQL escape hatch (sql.ts) for questions no page answers.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compareView } from "@pitwall/core/f1/compare";
import type { Db } from "@pitwall/core/f1/dataset";
import { diaryView } from "@pitwall/core/f1/diary";
import { diarySlug } from "@pitwall/core/f1/diary-dates";
import { milestonesView } from "@pitwall/core/f1/milestones";
import { COMPARE_SYSTEMS, compareRules, rescoreSeason } from "@pitwall/core/f1/points-compare";
import { ENTITY_LABELS, findRecord, recordIndex, recordPageView } from "@pitwall/core/f1/records";
import { teammatePairView } from "@pitwall/core/f1/teammates";
import {
	circuitView, constructorView, driverView, engineView, findRace, grandPrixView, nationView, raceView, searchIndex,
	seasonView, tyreView, type SearchEntry,
} from "@pitwall/core/f1/views";
import { getDb, getRaceLaps } from "../server";
import { SITE_URL } from "../site";
import { describeSchema, runSql } from "./sql";

/* ------------------------------------------------------------- credits --- */

function credits(db: Db) {
	const { meta } = db;
	const f1db = `F1DB${meta.release ? ` ${meta.release.tag}` : ""} (https://github.com/f1db/f1db, CC BY 4.0)`;
	const jolpica = meta.jolpica
		? `Jolpica F1 (https://github.com/jolpica/jolpica-f1, free non-commercial data dump${meta.jolpica.dumpDate ? ` of ${meta.jolpica.dumpDate}` : ""})`
		: null;
	return { f1db, jolpica };
}

function instructions(db: Db) {
	const { f1db, jolpica } = credits(db);
	const { meta } = db;
	return `Pitwall (${SITE_URL}) answers questions about Formula 1 World Championship history, ${meta.firstYear} to today: seasons, races, results, qualifying, standings, drivers, constructors, engines, tyres, circuits, Grands Prix, nations and ~580 record categories.

DATA CREDITS (required): the data comes from ${f1db}${jolpica ? ` and ${jolpica}, which supplies lap-by-lap positions and times, laps led and pit stops (1996 onwards)` : ""}. Whenever you present results from these tools, credit the sources, for example: "Data: F1DB (CC BY 4.0)${jolpica ? "; lap data: Jolpica F1" : ""}, via Pitwall". Mention Jolpica F1 whenever an answer uses laps led, lap charts, lap times or pit stops. Jolpica's data is for non-commercial use only. Where a tool returns a "url", link to that Pitwall page so the reader can see more.

HOW TO WORK:
1. Find ids first: call "search" with a name (driver, team, circuit, Grand Prix, engine, tyre maker, nation, season). Ids look like 'lewis-hamilton', 'red-bull', 'monaco'.
2. Use the specific tools (get_driver, get_race, get_season, get_record, compare, teammates, ...) for standard questions; they return the same figures the website shows, with official historic scoring rules applied.
3. For anything niche, combine calls or use SQL: call describe_schema once, then run_sql (SQLite, read-only, one SELECT per call, up to 500 rows). Build answers in several queries when needed. Count race starts with position_text NOT IN ('DNQ','DNPQ','DNP','DNS').
4. Records: list_records finds categories (e.g. 'consecutive wins'), get_record returns the ranking.
Data is updated after each Grand Prix (lap data runs about two weeks behind). Say when a figure covers only part of history (laps led, lap times and pit stops start in 1996; stewards' decisions in 2019).`;
}

/* ------------------------------------------------------------- helpers --- */

const url = (path: string) => `${SITE_URL}${path}`;

const PATHS: Record<SearchEntry[0], string> = {
	driver: "/drivers/",
	constructor: "/constructors/",
	circuit: "/circuits/",
	grandPrix: "/grands-prix/",
	engine: "/engines/",
	tyre: "/tyres/",
	nation: "/nations/",
	season: "/seasons/",
};

/** Universe-only fields (a view compared with an alternate history) that mean nothing here. */
const DROP = new Set(["modified", "realTotals", "real", "simulated", "base"]);
const MAX_CHARS = 60_000;

/** JSON for the AI: Maps and Sets made plain, universe-only fields dropped, and kept under MAX_CHARS by leaving out the biggest lists. */
function toJson(value: Record<string, unknown>): string {
	const stringify = (v: unknown) =>
		JSON.stringify(v, (k, x) => (DROP.has(k) ? undefined : x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x));
	let text = stringify(value);
	if (text.length <= MAX_CHARS) return text;
	const obj = { ...value };
	const omitted: string[] = [];
	const sized = Object.entries(obj)
		.filter(([, v]) => v && typeof v === "object")
		.map(([k, v]) => [k, stringify(v).length] as const)
		.sort((a, b) => b[1] - a[1]);
	for (const [key] of sized) {
		if (text.length <= MAX_CHARS) break;
		delete obj[key];
		omitted.push(key);
		text = stringify({ ...obj, omitted: { fields: omitted, note: "Left out to keep the response small; use run_sql for these details." } });
	}
	return text;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (value: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: toJson(value) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });
const notFound = (what: string) => fail(`No ${what} found. Use the search tool to find the right id.`);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let index: { entry: SearchEntry; label: string; text: string }[] | undefined;

/** Global search over the same index as the site's Ctrl+K, best matches first. */
function search(db: Db, query: string, kind?: SearchEntry[0], limit = 10) {
	index ??= searchIndex(db).map((entry) => ({ entry, label: fold(entry[2]), text: fold(`${entry[2]} ${entry[1]} ${entry[4]}`) }));
	const q = fold(query.trim());
	const words = q.split(/\s+/).filter(Boolean);
	const scored: { entry: SearchEntry; score: number; order: number }[] = [];
	index.forEach(({ entry, label, text }, order) => {
		if (kind && entry[0] !== kind) return;
		let score = 0;
		if (label === q || entry[1] === q) score = 100;
		else if (label.startsWith(q)) score = 80;
		else if (words.every((w) => label.split(/[\s-]+/).some((part) => part.startsWith(w)))) score = 60;
		else if (words.every((w) => text.includes(w))) score = 40;
		if (score) scored.push({ entry, score, order });
	});
	return scored
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, limit)
		.map(({ entry: [k, id, name, flag, extra] }) => ({ kind: k, id, name, country: flag || null, info: extra || null, url: url(PATHS[k] + id) }));
}

/** A race's lap file, compacted for the AI: pit stops always, lap-by-lap positions and times on request. */
function raceLaps(raceId: number, includeLaps: boolean) {
	const file = getRaceLaps(raceId);
	if (!file) return null;
	const pitStops = (file.pitStops ?? []).map(([driverId, stop, lap, ms]) => ({ driverId, stop, lap, durationMs: ms }));
	if (!includeLaps) return { pitStops };
	const perDriver = (drivers: string[] | undefined, values: (number | null)[][] | undefined) =>
		drivers && values ? Object.fromEntries(drivers.map((d, i) => [d, values[i]])) : undefined;
	return {
		pitStops,
		positionsByLap: perDriver(file.drivers, file.positions),
		lapTimesMs: perDriver(file.drivers, file.times),
		sprint: file.sprint && {
			positionsByLap: perDriver(file.sprint.drivers, file.sprint.positions),
			lapTimesMs: perDriver(file.sprint.drivers, file.sprint.times),
		},
	};
}

/* --------------------------------------------------------------- tools --- */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** A fresh server per request (the transport is stateless); the dataset and SQL database are loaded once per process. */
export function createPitwallServer(): McpServer {
	const db = getDb();
	const server = new McpServer({ name: "pitwall", title: "Pitwall F1 statistics", version: "1.0.0" }, { instructions: instructions(db) });
	const { f1db, jolpica } = credits(db);
	const source = { data: f1db, ...(jolpica ? { lapData: jolpica } : {}) };

	const entity = (name: string, title: string, description: string, get: (id: string) => object | null, path: string) =>
		server.registerTool(
			name,
			{ title, description, inputSchema: { id: z.string().describe("Id from the search tool") }, annotations: READ_ONLY },
			async ({ id }) => {
				const view = get(id);
				return view ? ok({ url: url(path + id), ...view, source }) : notFound(title.toLowerCase());
			},
		);

	server.registerTool(
		"search",
		{
			title: "Search",
			description:
				"Find drivers, constructors, circuits, Grands Prix, engine makers, tyre makers, nations and seasons by name. Returns ids for the other tools, best matches first.",
			inputSchema: {
				query: z.string().min(1).describe("A name or part of one, e.g. 'hamilton', 'red bull', 'spa'"),
				kind: z.enum(["driver", "constructor", "circuit", "grandPrix", "engine", "tyre", "nation", "season"]).optional(),
				limit: z.number().int().min(1).max(50).optional(),
			},
			annotations: READ_ONLY,
		},
		async ({ query, kind, limit }) => {
			const results = search(db, query, kind, limit ?? 10);
			return ok({ query, results, ...(results.length ? {} : { hint: "No match. Try a shorter or different spelling, or use run_sql on the drivers table." }) });
		},
	);

	server.registerTool(
		"fetch",
		{
			title: "Fetch",
			description:
				"Fetch one item by a typed id: 'driver:<id>', 'constructor:<id>', 'circuit:<id>', 'grandPrix:<id>', 'engine:<id>', 'tyre:<id>', 'nation:<id>', 'season:<year>', 'race:<year>-<round>' or 'record:<record id>'.",
			inputSchema: { id: z.string() },
			annotations: READ_ONLY,
		},
		async ({ id }) => {
			const [kind, ...rest] = id.split(":");
			const key = rest.join(":");
			let view: object | null = null;
			let path = "";
			switch (kind) {
				case "driver": view = driverView(db, key); path = `/drivers/${key}`; break;
				case "constructor": view = constructorView(db, key); path = `/constructors/${key}`; break;
				case "circuit": view = circuitView(db, key); path = `/circuits/${key}`; break;
				case "grandPrix": view = grandPrixView(db, key); path = `/grands-prix/${key}`; break;
				case "engine": view = engineView(db, key); path = `/engines/${key}`; break;
				case "tyre": view = tyreView(db, key); path = `/tyres/${key}`; break;
				case "nation": view = nationView(db, key); path = `/nations/${key}`; break;
				case "season": view = seasonView(db, Number(key)); path = `/seasons/${key}`; break;
				case "race": {
					const [year, round] = key.split("-").map(Number);
					view = raceView(db, year, round);
					path = `/races/${year}/${round}`;
					break;
				}
				case "record": view = recordPageView(db, key, undefined, 50); path = `/records/${key}`; break;
			}
			if (!view) return notFound(id);
			return ok({ id, url: url(path), ...view, source });
		},
	);

	server.registerTool(
		"get_season",
		{
			title: "Season",
			description: "A championship season: every round with its winner, the final (or current) driver and constructor standings, entrants and the points system used.",
			inputSchema: { year: z.number().int() },
			annotations: READ_ONLY,
		},
		async ({ year }) => {
			const view = seasonView(db, year);
			return view ? ok({ url: url(`/seasons/${year}`), ...view, source }) : notFound(`season ${year}`);
		},
	);

	server.registerTool(
		"get_race",
		{
			title: "Race",
			description:
				"A Grand Prix by season and round: full results, sprint, qualifying, fastest lap, laps led, pit stops, weather and safety cars, and the standings after it. Set include_laps for lap-by-lap positions and lap times (1996 onwards). Use get_season to find a race's round.",
			inputSchema: {
				year: z.number().int(),
				round: z.number().int().min(1),
				include_laps: z.boolean().optional().describe("Add lap-by-lap positions and lap times per driver (large)"),
			},
			annotations: READ_ONLY,
		},
		async ({ year, round, include_laps }) => {
			const view = raceView(db, year, round);
			const race = findRace(db, year, round);
			if (!view || !race) return notFound(`race (${year} round ${round})`);
			const { lapData: _chart, ...rest } = view as typeof view & { lapData?: unknown };
			return ok({ url: url(`/races/${year}/${round}`), ...rest, lapData: raceLaps(race.id, include_laps ?? false), source });
		},
	);

	entity("get_driver", "Driver", "A driver's career: totals (starts, wins, poles, podiums, titles, points), first race and win, season by season results, team-mates and relatives.", (id) => driverView(db, id), "/drivers/");
	entity("get_constructor", "Constructor", "A constructor's history: totals, titles, season by season results, drivers and engines.", (id) => constructorView(db, id), "/constructors/");
	entity("get_circuit", "Circuit", "A circuit: layout facts, every race held there, its winners and the drivers and teams with most wins there.", (id) => circuitView(db, id), "/circuits/");
	entity("get_grand_prix", "Grand Prix", "A Grand Prix (e.g. 'british'): every edition, its venues, and the most successful drivers and teams.", (id) => grandPrixView(db, id), "/grands-prix/");
	entity("get_nation", "Nation", "A nation's F1 history: its drivers, constructors, engines, tyres, Grands Prix and circuits.", (id) => nationView(db, id), "/nations/");
	entity("get_engine", "Engine maker", "An engine manufacturer: seasons, teams supplied, wins and titles.", (id) => engineView(db, id), "/engines/");
	entity("get_tyre", "Tyre maker", "A tyre manufacturer: seasons, teams supplied, wins and titles.", (id) => tyreView(db, id), "/tyres/");

	server.registerTool(
		"list_records",
		{
			title: "List records",
			description:
				"Find record categories (about 580: most wins, youngest winner, consecutive podiums, laps led, wins from pole, ...). Returns ids for get_record.",
			inputSchema: {
				query: z.string().optional().describe("Words to match in the title, family or description, e.g. 'youngest', 'consecutive wins'"),
				entity: z.enum(Object.keys(ENTITY_LABELS) as [string, ...string[]]).optional().describe("Whose record: driver, constructor, engine, nation, grandprix or number"),
			},
			annotations: READ_ONLY,
		},
		async ({ query, entity: kind }) => {
			// rough stems, so 'winner' finds 'wins' and 'consecutively' finds 'consecutive'
			const stem = (w: string) => w.replace(/(ners?|nings?|ers?|ings?|ly|es|s)$/, "").slice(0, Math.max(3, w.length - 4)) || w;
			const words = fold(query ?? "").split(/[^a-z0-9]+/).filter((w) => w.length > 1).map(stem);
			const records = recordIndex()
				.filter((r) => !kind || r.entity === kind)
				.map((r) => {
					const text = fold(`${r.family} ${r.title} ${r.description} ${r.id}`);
					return { r, hits: words.filter((w) => text.includes(w)).length };
				})
				.filter(({ hits }) => hits > 0 || !words.length)
				.sort((a, b) => b.hits - a.hits)
				.map(({ r }) => r)
				.map((r) => ({ id: r.id, entity: r.entity, family: r.family, title: r.title, description: r.description, ...(r.coverage ? { coverage: r.coverage.note } : {}) }));
			const shown = words.length ? 30 : 100;
			return ok({ count: records.length, records: records.slice(0, shown), ...(records.length > shown ? { note: `Best ${shown} matches shown; narrow the query or filter by entity.` } : {}) });
		},
	);

	server.registerTool(
		"get_record",
		{
			title: "Record",
			description: "The ranking for one record category (from list_records), with who holds it and the values.",
			inputSchema: { id: z.string().describe("Record id, e.g. 'driver/wins/total'"), limit: z.number().int().min(1).max(200).optional() },
			annotations: READ_ONLY,
		},
		async ({ id, limit }) => {
			if (!findRecord(id)) return fail(`No record '${id}'. Use list_records to find the id.`);
			const view = recordPageView(db, id, undefined, limit ?? 25);
			return view ? ok({ url: url(`/records/${id}`), ...view, source }) : fail(`No record '${id}'.`);
		},
	);

	server.registerTool(
		"compare",
		{
			title: "Compare careers",
			description: "Put 2 to 4 driver careers (or constructor histories) side by side: totals, rates, and progress by race start and by age.",
			inputSchema: { kind: z.enum(["driver", "constructor"]), ids: z.array(z.string()).min(2).max(4) },
			annotations: READ_ONLY,
		},
		async ({ kind, ids }) => {
			const team = kind === "constructor";
			return ok({ url: url(`/compare?${team ? "t" : "d"}=${ids.join(",")}`), ...compareView(db, team ? "team" : "driver", ids), source });
		},
	);

	server.registerTool(
		"teammates",
		{
			title: "Team-mate head-to-head",
			description: "Two drivers' head-to-head record in the races they were team-mates: who qualified and finished ahead, points, wins, race by race.",
			inputSchema: { a: z.string(), b: z.string() },
			annotations: READ_ONLY,
		},
		async ({ a, b }) => {
			const view = teammatePairView(db, a, b);
			return view ? ok({ url: url(`/teammates/${a}/${b}`), ...view, source }) : fail(`${a} and ${b} were never team-mates in a race (or an id is wrong; use search).`);
		},
	);

	server.registerTool(
		"on_this_day",
		{
			title: "On this day",
			description: "Everything that happened in F1 on a day of the year: races, birthdays, deaths, debuts, first wins and titles decided.",
			inputSchema: { month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) },
			annotations: READ_ONLY,
		},
		async ({ month, day }) => ok({ url: url(`/diary/${diarySlug(month, day)}`), ...diaryView(db, month, day), source }),
	);

	server.registerTool(
		"rescore_season",
		{
			title: "Re-score a season",
			description: `Re-score a season's championships under a different points system, to answer "who would have won under ...". Systems: ${COMPARE_SYSTEMS.map((s) => `'${s.id}' (${s.name}: ${s.description})`).join("; ")}.`,
			inputSchema: { year: z.number().int(), system: z.enum(COMPARE_SYSTEMS.map((s) => s.id) as [string, ...string[]]) },
			annotations: READ_ONLY,
		},
		async ({ year, system }) => {
			const rules = compareRules(db, year, system);
			if (!rules || !db.racesByYear.has(year)) return notFound(`season ${year}`);
			const { drivers, constructors } = rescoreSeason(db, year, rules);
			const top = <T>(rows: T[]) => rows.slice(0, 20);
			return ok({ url: url("/points"), year, system: COMPARE_SYSTEMS.find((s) => s.id === system), drivers: top(drivers), constructors: top(constructors), source });
		},
	);

	server.registerTool(
		"milestones",
		{
			title: "Milestones",
			description: "Milestones and all-time records the current grid is closing in on (e.g. 100th podium, moving up the all-time wins list), with how soon each could fall.",
			inputSchema: {},
			annotations: READ_ONLY,
		},
		async () => {
			const view = milestonesView(db);
			return view ? ok({ url: url("/milestones"), ...view, source }) : fail("No current season.");
		},
	);

	server.registerTool(
		"describe_schema",
		{
			title: "SQL schema",
			description: "The SQLite schema behind run_sql: every table and column, with notes. Call it once before writing queries.",
			inputSchema: {},
			annotations: READ_ONLY,
		},
		async () => ({ content: [{ type: "text", text: `${describeSchema(db)}\n\n-- Source: ${f1db}${jolpica ? `; laps_led: ${jolpica}` : ""}` }] }),
	);

	server.registerTool(
		"run_sql",
		{
			title: "Run SQL",
			description:
				"Run one read-only SQLite SELECT over the whole dataset (see describe_schema) for questions the other tools don't answer directly, e.g. wins from the lowest grid slot at a circuit, or drivers who won in their first season. Returns up to 500 rows; aggregate in SQL rather than fetching raw rows. Several queries in a row are fine.",
			inputSchema: { sql: z.string().min(1), max_rows: z.number().int().min(1).max(500).optional() },
			annotations: READ_ONLY,
		},
		async ({ sql, max_rows }) => {
			try {
				return ok({ ...runSql(db, sql, max_rows ?? 200), source });
			} catch (e) {
				return fail(`SQL error: ${e instanceof Error ? e.message : String(e)}`);
			}
		},
	);

	return server;
}
