// Share pictures for the pages about one thing (a driver, team, race, season, circuit, Grand Prix, engine, tyre or
// nation), built from its hover card so they say what the card says.

import { entityCard, type CardKind, type EntityCard } from "@pitwall/core/f1/cards";
import { ogImage, ogNumber as num, ogYears as span, type OgStat } from "./og-image";
import { getDb } from "./server";

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const date = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
/** "2016", "2019–2021" or "4 titles, last in 2023". */
const titleNote = (years: number[]) => (years.length === 1 ? `${years[0]}` : years.length && years.at(-1)! - years[0] === years.length - 1 ? `${years[0]}–${years.at(-1)}` : years.length ? `last in ${years.at(-1)}` : null);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

function render(card: EntityCard) {
	switch (card.kind) {
		case "driver": {
			const stats: OgStat[] = card.titleYears.length
				? [{ label: plural(card.titleYears.length, "World title"), value: card.titleYears.length, note: titleNote(card.titleYears) }, { label: "Wins", value: num(card.wins) }, { label: "Podiums", value: num(card.podiums) }]
				: card.wins
					? [{ label: "Wins", value: num(card.wins) }, { label: "Podiums", value: num(card.podiums) }, { label: "Poles", value: num(card.poles) }]
					: [{ label: "Podiums", value: num(card.podiums) }, { label: "Best finish", value: card.bestFinish ? ordinal(card.bestFinish) : "–" }, { label: "Points", value: num(card.points) }];
			return ogImage({
				section: card.titleYears.length ? "World champion" : "Driver",
				title: card.name,
				flag: card.flag,
				detail: join(card.nation, span(card.years), card.teams.map((t) => t.name).join(" and ")),
				stats: [...stats, { label: "Starts", value: num(card.starts) }],
			});
		}
		case "team": {
			const titles: OgStat[] = [
				...(card.titleYears.length ? [{ label: "Constructors' titles", value: card.titleYears.length, note: titleNote(card.titleYears) }] : []),
				...(card.driverTitles ? [{ label: "Drivers' titles", value: card.driverTitles }] : []),
			];
			return ogImage({
				section: "Constructor",
				title: card.name,
				flag: card.flag,
				detail: join(card.nation, span(card.years), card.drivers.map((d) => d.name).join(" and ")),
				stats: [...titles, { label: "Wins", value: num(card.wins) }, { label: "Podiums", value: num(card.podiums) }, { label: "Poles", value: num(card.poles) }].slice(0, 3).concat({ label: "Races", value: num(card.starts) }),
			});
		}
		case "race": {
			const where = join(`${card.circuit.name}${card.circuit.place && !card.circuit.name.includes(card.circuit.place) ? `, ${card.circuit.place}` : ""}`, date(card.date));
			const stats: OgStat[] =
				card.upcoming || !card.podium.length
					? [
							{ label: "Round", value: `${card.round} of ${card.rounds}` },
							{ label: "Laps", value: card.laps || "–" },
							{ label: "Distance", value: card.distance ? `${card.distance.toFixed(1)} km` : "–" },
						]
					: [
							...card.podium.map((p, i) => ({ label: ["Winner", "Second", "Third"][i], value: p.driver.name, note: p.team.name })),
							...(card.pole ? [{ label: "Pole", value: card.pole.name }] : []),
						];
			return ogImage({ section: card.upcoming ? "Coming up" : `Round ${card.round} of ${card.year}`, title: `${card.year} ${card.name}`, flag: card.flag, detail: where, stats });
		}
		case "season": {
			const leader = card.inProgress ? "Leader" : "Champion";
			return ogImage({
				section: card.inProgress ? "Season in progress" : "Season",
				title: `${card.year} Formula 1 season`,
				detail: card.start && card.end ? `${date(card.start)} to ${date(card.end)}` : null,
				stats: [
					...(card.champion ? [{ label: leader, value: card.champion.name, note: join(card.championTeam?.name, `${num(card.champion.points)} pts`) }] : []),
					...(card.constructorsChampion ? [{ label: card.inProgress ? "Leading team" : "Constructors' champion", value: card.constructorsChampion.name }] : []),
					...(card.mostWins ? [{ label: "Most wins", value: card.mostWins.name, note: `${card.mostWins.n} ${plural(card.mostWins.n, "win")}` }] : []),
					{ label: "Rounds", value: card.inProgress ? `${card.completed} of ${card.rounds}` : card.rounds },
				],
			});
		}
		case "circuit": {
			const kind = { STREET: "Street circuit", ROAD: "Road circuit", RACE: "Race circuit" }[card.type] ?? "Circuit";
			return ogImage({
				section: kind,
				title: card.name,
				flag: card.flag,
				detail: join(card.place && !card.name.includes(card.place) ? card.place : null, card.nation),
				stats: [
					{ label: "Grands Prix", value: card.races, note: span(card.years) },
					...(card.length ? [{ label: "Length", value: `${card.length.toFixed(3)} km` }] : []),
					...(card.turns ? [{ label: "Turns", value: card.turns }] : []),
					...(card.topWinner ? [{ label: "Most wins", value: card.topWinner.name, note: `${card.topWinner.wins} ${plural(card.topWinner.wins, "win")}` }] : []),
				],
			});
		}
		case "grandPrix":
			return ogImage({
				section: "Grand Prix",
				title: card.name,
				flag: card.flag,
				detail: card.circuitCount > 1 ? `Held at ${card.circuitCount} circuits` : card.circuits[0] ? `Held at ${card.circuits[0].name}` : null,
				stats: [
					{ label: "Held", value: card.races, note: span(card.years) },
					{ label: "Winners", value: card.winners },
					...(card.topDriver ? [{ label: "Most wins", value: card.topDriver.name, note: `${card.topDriver.n} ${plural(card.topDriver.n, "win")}` }] : []),
					...(card.lastWinner ? [{ label: "Last winner", value: card.lastWinner.name, note: `${card.lastWinner.year}` }] : []),
				],
			});
		case "engine":
		case "tyre":
			return ogImage({
				section: card.kind === "engine" ? "Engine supplier" : "Tyre supplier",
				title: card.name,
				flag: card.flag,
				detail: join(card.nation, span(card.years)),
				stats: [
					{ label: "Races", value: num(card.races) },
					{ label: "Wins", value: num(card.wins) },
					{ label: "Drivers' titles", value: card.titleYears.length, note: titleNote(card.titleYears) },
					{ label: "Teams", value: card.teamCount },
				],
			});
		case "nation":
			return ogImage({
				section: "Nation in Formula 1",
				title: card.name,
				flag: card.flag,
				detail: card.champions.length ? `Champions: ${card.champions.slice(0, 3).map((c) => c.name).join(", ")}${card.champions.length > 3 ? " and more" : ""}` : null,
				stats: [
					{ label: "Drivers", value: num(card.drivers) },
					{ label: "Wins", value: num(card.wins) },
					{ label: "Drivers' titles", value: card.titles },
					{ label: "Grands Prix hosted", value: num(card.racesHosted) },
				],
			});
	}
}

/** The share picture for one thing's page, or the site's own when it isn't found. */
export function entityOgImage(kind: CardKind, id: string) {
	const card = entityCard(getDb(), kind, id);
	return card ? render(card) : siteOgImage();
}

/** How much history there is, along the bottom of the site's and the lists' pictures. */
function totals(): OgStat[] {
	const db = getDb();
	// races run so far, not the ones announced
	const run = db.races.filter((r) => db.resultsByRace.has(r.id));
	return [
		{ label: "Seasons", value: num(new Set(run.map((r) => r.year)).size), note: `${db.meta.firstYear}–${run.at(-1)?.year ?? db.meta.lastCompletedYear}` },
		{ label: "Races", value: num(run.length) },
		{ label: "Drivers", value: num(db.drivers.size) },
		{ label: "Constructors", value: num(db.constructors.size) },
	];
}

/** The site's own share picture (the home page, and anything without one of its own). */
export const siteOgImage = () =>
	ogImage({
		title: "Every Formula 1 season, race, driver and team",
		detail: "Since 1950, with their records and facts, plus a lab to rewrite history.",
		stats: totals(),
	});

/** The lists and tools, by their address. */
const SECTIONS: Record<string, { title: string; detail: string }> = {
	drivers: { title: "Every Formula 1 driver", detail: "Careers, titles, wins and team-mates of everyone who has started a Grand Prix." },
	constructors: { title: "Every Formula 1 constructor", detail: "Every team's seasons, races, drivers and titles." },
	seasons: { title: "Every Formula 1 season", detail: "Calendars, results and championship standings, year by year." },
	circuits: { title: "Every Formula 1 circuit", detail: "Where Formula 1 has raced, and who has won there." },
	"grands-prix": { title: "Every Grand Prix", detail: "Each Grand Prix's runnings, circuits and winners." },
	engines: { title: "Formula 1 engines", detail: "Every engine supplier's teams, wins and titles." },
	tyres: { title: "Formula 1 tyres", detail: "Every tyre supplier's seasons, wins and titles." },
	nations: { title: "Nations in Formula 1", detail: "Drivers, winners, champions and Grands Prix by country." },
	records: { title: "Formula 1 records", detail: "The all-time leaders in wins, poles, podiums, streaks and more." },
	milestones: { title: "Milestone watch", detail: "The records and round numbers today's drivers and teams are closing in on." },
	diary: { title: "On this day in Formula 1", detail: "Races, birthdays and moments from every day of the year." },
	points: { title: "Points systems", detail: "Every season's scoring, and how the titles would have gone under another." },
	lab: { title: "Rewrite Formula 1 history", detail: "Change the rules or the results and browse the history that follows." },
	play: { title: "Formula 1 games", detail: "Daily puzzles and games built on seventy-odd years of results." },
};

/** The share picture for a list or tool page ("drivers", "records"…). */
export function sectionOgImage(path: keyof typeof SECTIONS) {
	return ogImage({ ...SECTIONS[path], stats: path === "lab" || path === "play" ? [] : totals() });
}
