// One-sentence summaries of a driver, team, circuit, race, engine, tyre, Grand Prix, nation or
// season, for the web pages' meta descriptions (what search results show under the title).
// Built from the hover cards, so they say what the card says.

import type { DriverCard, EntityCard, GrandPrixCard, NationCard, RaceCard, SeasonCard, SupplierCard, TeamCard, CircuitCard } from "./cards.ts";

const num = (n: number) => n.toLocaleString("en-GB");
/** "1 win", "12 wins". */
const count = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
/** "a, b and c". */
const list = (items: string[]) => (items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
/** ", Exampleton", unless the name already says where (Silverstone, Silverstone). */
const at = (name: string, place: string) => (place && !name.includes(place) ? `, ${place}` : "");
const span = (years: [number, number] | null) => (!years ? null : years[0] === years[1] ? `${years[0]}` : `${years[0]}–${years[1]}`);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
/** "world champion in 2016", "4-time world champion". */
const champion = (titles: number[]) => (titles.length === 1 ? `world champion in ${titles[0]}` : `${titles.length}-time world champion`);

function driver(c: DriverCard): string {
	const years = span(c.years);
	const record =
		c.wins > 0
			? `${list([count(c.wins, "win"), ...(c.poles ? [count(c.poles, "pole")] : []), count(c.podiums, "podium")])} from ${count(c.starts, "start")}`
			: c.podiums > 0
				? `${count(c.podiums, "podium")} from ${count(c.starts, "start")}`
				: `${count(c.starts, "start")}${c.bestFinish ? `, best finish ${ordinal(c.bestFinish)}` : ""}`;
	const lead = c.titleYears.length ? `${c.name}, ${champion(c.titleYears)}: ${record}` : `${c.name}: ${record}`;
	return `${lead}${years ? `, ${years}` : ""}. Every race result, season and team-mate.`;
}

function team(c: TeamCard): string {
	const titles = [c.titleYears.length ? count(c.titleYears.length, "constructors' title") : "", c.driverTitles ? count(c.driverTitles, "drivers' title") : ""].filter(Boolean);
	const results = c.wins > 0 ? [count(c.wins, "win"), ...(c.poles ? [count(c.poles, "pole")] : [])] : c.podiums > 0 ? [count(c.podiums, "podium")] : [];
	const record = `${list([...titles, ...results])}${titles.length || results.length ? " from " : ""}${count(c.starts, "race")}`;
	const years = span(c.years);
	return `${c.name}: ${record}${years ? `, ${years}` : ""}. Every season, race and driver.`;
}

function circuit(c: CircuitCard): string {
	const kind = { STREET: "street circuit", ROAD: "road circuit", RACE: "race circuit" }[c.type] ?? "circuit";
	const layout = [c.length ? `${c.length.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} km` : "", c.turns ? count(c.turns, "turn") : ""].filter(Boolean).join(", ");
	const years = span(c.years);
	const history = c.races ? ` ${count(c.races, "Grand Prix", "Grands Prix")}${years ? ` (${years})` : ""}` : "";
	const top = c.topWinner ? `; most wins: ${c.topWinner.name} (${c.topWinner.wins})` : c.lastWinner ? `; last winner: ${c.lastWinner.name} (${c.lastWinner.year})` : "";
	return `${c.name}${at(c.name, c.place)}: ${kind}${layout ? `, ${layout}` : ""}.${history ? `${history}${top}.` : ""}`;
}

function race(c: RaceCard): string {
	const where = `at ${c.circuit.name}${at(c.circuit.name, c.circuit.place)}`;
	if (c.upcoming || !c.podium.length) return `The ${c.year} ${c.name}, round ${c.round} of ${c.rounds}, ${where}, on ${c.date}.`;
	const [first, ...rest] = c.podium;
	const behind = rest.length ? ` ahead of ${list(rest.map((p) => p.driver.name))}` : "";
	const pole = c.pole ? ` Pole: ${c.pole.name}.` : "";
	return `The ${c.year} ${c.name} ${where}: won by ${first.driver.name} (${first.team.name})${behind}.${pole} Full results.`;
}

function supplier(c: SupplierCard): string {
	const what = c.kind === "engine" ? "engines" : "tyres";
	const titles = [c.titleYears.length ? count(c.titleYears.length, "drivers' title") : "", c.constructorsTitles ? count(c.constructorsTitles, "constructors' title") : ""].filter(Boolean);
	const record = list([...(c.wins ? [count(c.wins, "win")] : []), ...titles]);
	const years = span(c.years);
	const teams = c.teamCount ? ` with ${count(c.teamCount, "team")}` : "";
	return `${c.name} ${what} in Formula 1: ${record ? `${record} from ` : ""}${count(c.races, "race")}${teams}${years ? `, ${years}` : ""}.`;
}

function grandPrix(c: GrandPrixCard): string {
	const years = span(c.years);
	const held = `held ${count(c.races, "time")}${years ? ` (${years})` : ""}${c.circuitCount > 1 ? ` at ${count(c.circuitCount, "circuit")}` : c.circuits[0] ? ` at ${c.circuits[0].name}` : ""}`;
	const most = [c.topDriver ? `${c.topDriver.name} (${c.topDriver.n})` : "", c.topTeam ? `${c.topTeam.name} (${c.topTeam.n})` : ""].filter(Boolean);
	return `The ${c.name}: ${held}.${most.length ? ` Most wins: ${list(most)}.` : ""}`;
}

function nation(c: NationCard): string {
	const drivers = c.drivers ? [count(c.drivers, "driver"), ...(c.wins ? [count(c.wins, "win")] : []), ...(c.titles ? [count(c.titles, "drivers' title")] : [])] : [];
	const hosted = c.racesHosted ? `${count(c.racesHosted, "Grand Prix", "Grands Prix")} hosted` : "";
	const facts = [list(drivers), hosted].filter(Boolean).join("; ");
	return `${c.name} in Formula 1${facts ? `: ${facts}` : ""}.`;
}

function season(c: SeasonCard): string {
	const head = `The ${c.year} Formula 1 season`;
	if (c.inProgress) {
		const lead = c.champion ? `: ${c.champion.name} leads the championship on ${num(c.champion.points)} points` : "";
		return `${head}, ${c.completed} of ${count(c.rounds, "round")} run${lead}. Results, standings and the title fight.`;
	}
	const title = c.champion ? `: ${c.champion.name} won the title${c.championTeam ? ` with ${c.championTeam.name}` : ""}` : "";
	const constructors = c.constructorsChampion ? `, ${c.constructorsChampion.name} the constructors'` : "";
	const races = `${count(c.rounds, "race")}${c.winners ? `, ${count(c.winners, "different winner")}` : ""}`;
	return `${head}${title}${constructors}. ${races}. Results and standings.`;
}

/** A meta description for the entity's page; plain text, roughly 100–200 characters. */
export function describeEntity(card: EntityCard): string {
	// a name ending in a full stop (Carlos Sainz Jr.) ends its sentence too
	return sentence(card).replace(/\.\./g, ".");
}

function sentence(card: EntityCard): string {
	switch (card.kind) {
		case "driver":
			return driver(card);
		case "team":
			return team(card);
		case "circuit":
			return circuit(card);
		case "race":
			return race(card);
		case "engine":
		case "tyre":
			return supplier(card);
		case "grandPrix":
			return grandPrix(card);
		case "nation":
			return nation(card);
		case "season":
			return season(card);
	}
}
