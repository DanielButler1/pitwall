// Share pictures for the pages that aren't about one thing: a record category, a day in the diary, a pair of
// team-mates, a comparison and the games. Like og-cards.tsx, each says what the page itself leads with.

import { DAILY, MORE } from "@/components/play/games";
import { compareView } from "@pitwall/core/f1/compare";
import { diaryView } from "@pitwall/core/f1/diary";
import { parseDiarySlug } from "@pitwall/core/f1/diary-dates";
import { recordCategoryView } from "@pitwall/core/f1/records";
import type { Cell } from "@pitwall/core/f1/records/types";
import { teammatePairView, type Duel } from "@pitwall/core/f1/teammates";
import { ogTotals, sectionOgImage, siteOgImage } from "./og-cards";
import { ogImage, ogNumber as num, ogYears as span, type OgStat } from "./og-image";
import { getDb } from "./server";

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");
const surname = (name: string) => name.split(" ").at(-1) ?? name;
const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** A record table cell as plain words. */
function cellText(c: Cell): string {
	switch (c.t) {
		case "race":
			return `${c.ref.name} ${c.ref.year}`;
		case "season":
			return String(c.year);
		case "date":
			return date(c.iso);
		case "number":
			return `#${c.number}`;
		case "text":
			return c.text;
		default:
			return c.ref.name;
	}
}
const cellsText = (cells: Cell[] | undefined) => (cells ?? []).map(cellText).join(" ").replace(/\s+/g, " ").trim();
/** The first telling piece of a row's context ("Silverstone", "2010"): not a date, nor a joining word like "decided at". */
const context = (cells: Cell[] | undefined) => {
	const c = (cells ?? []).find((c) => c.t !== "date" && !(c.t === "text" && (!c.text || /^[a-z]/.test(c.text))));
	return c ? cellText(c) : null;
};

const ENTITY: Record<string, string> = { driver: "Driver", constructor: "Constructor", engine: "Engine", nation: "Nation", grandprix: "Grand Prix", number: "Car number" };

/** A record category: who holds it and the next two, or for a timeline, the latest holders. */
export function recordOgImage(id: string) {
	const view = recordCategoryView(getDb(), id);
	if (!view) return sectionOgImage("records");
	const { meta, rows, total } = view;
	// a chronology lists every holder in turn, oldest first: its rank is only the order
	const timeline = /chronology/.test(id);
	const shown = timeline ? rows.slice(-3).reverse() : rows.slice(0, 3);
	const tied = (rank: number) => rows.filter((r) => r.rank === rank).length > 1;
	const label = (rank: number, i: number) => (timeline ? (i ? "Before that" : "Latest") : `${tied(rank) ? "=" : ""}${ordinal(rank)}`);
	// The description reads as a title ("Most wins at the same circuit") where the catalogue's own is terse ("By
	// circuit"), but some run to a paragraph: those go under the terse one, without their asides in brackets.
	const description = meta.description.replace(/\s*\([^)]*\)/g, "").replace(/\.$/, "");
	const short = description.length <= 64;
	const clipped = description.length > 120 ? `${description.slice(0, 120).replace(/[\s,;:]+\S*$/, "")}…` : description;
	return ogImage({
		section: `${ENTITY[meta.entity] ?? view.entityLabel} records: ${meta.family}`,
		title: short && description ? description : meta.title,
		detail: short ? null : clipped,
		stats: [
			...shown.map((r, i) => ({ label: label(r.rank, i), value: cellsText(r.subject), note: join(r.display, context(r.detail)) })),
			...(total > shown.length ? [{ label: timeline ? "In the timeline" : "In the table", value: num(total) }] : []),
		],
	});
}

/** A day in the diary: how many races, title deciders, first wins and birthdays fell on it, and the one to lead with. */
export function diaryOgImage(slug: string) {
	const d = parseDiarySlug(slug);
	if (!d) return sectionOgImage("diary");
	const view = diaryView(getDb(), d.month, d.day);
	const run = view.races.filter((r) => !r.upcoming);
	// the best-known person born on the day: titles, then wins, then starts
	const famous = [...view.births].sort((a, b) => b.titles - a.titles || b.wins - a.wins || b.starts - a.starts)[0];
	// the latest drivers' title decided on the day, else constructors'
	const title = view.titles.findLast((t) => t.kind === "driver") ?? view.titles.at(-1);
	const race = run[0];
	const headline = title
		? `${title.race.year}: ${title.driver?.name ?? title.team?.name} clinched the ${title.kind === "driver" ? "drivers'" : "constructors'"} title in ${title.race.name}`
		: race?.winner
			? `${race.race.year}: ${race.winner.name} won in ${race.race.name}`
			: famous
				? `${famous.year}: ${famous.driver.name} was born`
				: "What happened on this day in Formula 1 history.";
	const stats: OgStat[] = [
		{ label: plural(run.length, "Grand Prix", "Grands Prix"), value: run.length, note: race ? `last in ${race.race.year}` : null },
		{ label: plural(view.titles.length, "Title decided", "Titles decided"), value: view.titles.length, note: view.titles.length ? `last in ${view.titles.at(-1)!.race.year}` : null },
		{ label: plural(view.firstWins.length, "First win"), value: view.firstWins.length, note: view.firstWins.at(-1)?.driver.name },
		{ label: "Birthdays", value: view.births.length, note: famous?.driver.name },
		{ label: "Debuts", value: view.debuts.length, note: view.debuts.at(-1)?.driver.name },
	];
	return ogImage({ section: "On this day in Formula 1", title: view.label, detail: headline, stats: stats.filter((s) => s.value).slice(0, 4) });
}

/** "12–8", with who leads under it. */
const duel = (label: string, x: Duel, a: string, b: string, fmt: (n: number) => string = String): OgStat => ({
	label,
	value: `${fmt(x.a)}–${fmt(x.b)}`,
	note: x.a === x.b ? "level" : `${surname(x.a > x.b ? a : b)} ahead`,
});

/** Two team-mates: their head-to-head in qualifying, races and points or wins. */
export function teammatesOgImage(a: string, b: string) {
	const view = teammatePairView(getDb(), a, b);
	if (!view) return siteOgImage();
	const { totals: t } = view;
	const [na, nb] = [view.a.name, view.b.name];
	const points = (n: number) => num(Math.round(n * 10) / 10);
	return ogImage({
		section: "Team-mates",
		title: `${na} vs ${nb}`,
		detail: join(view.teams.map((x) => x.name).join(" and "), span([view.firstYear, view.lastYear])),
		stats: [
			{ label: "Races together", value: num(t.races) },
			duel("Qualifying", t.quali, na, nb),
			duel("Finished ahead", t.race, na, nb),
			t.wins.a + t.wins.b ? duel("Wins", t.wins, na, nb) : duel("Points", t.points, na, nb, points),
		],
	});
}

/** Two to four drivers or teams side by side, from /compare's query (d= or t=). */
export function compareOgImage(kind: "driver" | "team", ids: string[]) {
	const view = compareView(getDb(), kind, ids);
	const names = view.entities.map((e) => e.driver?.name ?? e.team?.name ?? e.id);
	if (view.entities.length < 2)
		return ogImage({
			section: "Compare",
			title: "Compare Formula 1 drivers and teams",
			detail: "Careers side by side: wins, titles, head-to-heads, and where each stood at the same age.",
			stats: ogTotals(),
		});
	// who finished ahead in the races both started, when there are two
	const h2h = view.entities.length === 2 ? view.h2h[0] : undefined;
	const ahead = (id: string) => (h2h?.a === id ? h2h.aAhead : (h2h?.bAhead ?? 0));
	return ogImage({
		section: kind === "driver" ? "Compare drivers" : "Compare constructors",
		title: names.join(" vs "),
		detail: h2h?.races
			? `Head to head in ${h2h.races} ${plural(h2h.races, "race")}: ${view.entities.map((e, i) => `${surname(names[i])} ${ahead(e.id)}`).join(", ")}`
			: join(...view.entities.map((e) => `${surname(e.driver?.name ?? e.team?.name ?? e.id)} ${span([e.totals.firstYear, e.totals.lastYear])}`)),
		stats: view.entities.map((e, i) => ({
			label: names[i],
			value: `${num(e.totals.wins)} ${plural(e.totals.wins, "win")}`,
			note: join(e.totals.titles ? `${e.totals.titles} ${plural(e.totals.titles, "title")}` : null, `${num(e.totals.starts)} ${kind === "driver" ? "starts" : "races"}`),
		})),
	});
}

/** A game on /play, by its id. */
export function gameOgImage(id: string) {
	const daily = DAILY.find((g) => g.id === id);
	const game = daily ?? MORE.find((g) => g.id === id);
	if (!game) return sectionOgImage("play");
	const [seasons, races] = ogTotals();
	return ogImage({
		section: daily ? "Daily Formula 1 puzzle" : "Formula 1 game",
		title: game.title,
		detail: game.description,
		stats: [
			...(daily ? [{ label: "New puzzle", value: "Every day", note: "at midnight UTC" }] : []),
			{ label: "Built on", value: `${races.value} races`, note: seasons.note },
			{ label: "Games on Pitwall", value: DAILY.length + MORE.length, note: `${DAILY.length} daily` },
		],
	});
}
