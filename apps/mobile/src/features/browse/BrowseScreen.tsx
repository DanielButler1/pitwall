import { CalendarRange, Car, Cog, Dices, Disc3, Flag as FlagIcon, Globe, Route, UserRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import type { Db } from "@pitwall/core/f1/dataset";
import { activeGrid } from "@pitwall/core/f1/milestones";
import { constructorCareers, driverCareers } from "@pitwall/core/f1/stats";
import { driverRef, teamRef } from "@pitwall/core/f1/views";
import { Flag, Page, TabScreen } from "@/components/f1";
import { Button, Row, Section } from "@/components/ui";
import { useView } from "@/data/dataset";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { surname, Switcher } from "./kit";

/** How many of each kind there are, for the section rows (cheap counts, no full views). */
function counts(db: Db) {
	const engines = new Set<string>();
	const tyres = new Set<string>();
	const nations = new Set<string>();
	const grandsPrix = new Set<string>();
	const races: { year: number; round: number }[] = [];
	for (const race of db.races) {
		const results = db.resultsByRace.get(race.id);
		grandsPrix.add(race.grandPrixId);
		if (!results) continue;
		races.push({ year: race.year, round: race.round });
		const c = db.circuits.get(race.circuitId);
		if (c) nations.add(c.country);
		for (const r of results) {
			if (r.engineId) engines.add(r.engineId);
			if (r.tyreId) tyres.add(r.tyreId);
		}
	}
	for (const id of db.resultsByDriver.keys()) nations.add(db.drivers.get(id)?.nationality ?? "");
	for (const id of db.resultsByConstructor.keys()) nations.add(db.constructors.get(id)?.country ?? "");
	for (const id of engines) nations.add(db.engines.get(id)?.country ?? "");
	for (const id of tyres) nations.add(db.tyres.get(id)?.country ?? "");
	const drivers = [...driverCareers(db).keys()];
	return {
		seasons: db.years.filter((y) => (db.racesByYear.get(y) ?? []).some((r) => db.resultsByRace.has(r.id))),
		drivers,
		constructors: constructorCareers(db).size,
		circuits: db.circuits.size,
		grandsPrix: grandsPrix.size,
		engines: engines.size,
		tyres: tyres.size,
		nations: [...nations].filter((n) => db.countries.has(n)).length,
		races,
	};
}

/** Who's racing now: drivers with their team and standing, teams with their drivers. */
function grid(db: Db) {
	const g = activeGrid(db);
	if (!g) return null;
	const next = db.upcomingEntrants.filter((e) => e.year === g.year + 1);
	const teamOf = (id: string) => next.find((e) => e.driverId === id)?.constructorId ?? db.resultsByDriver.get(id)?.at(-1)?.constructorId ?? "";
	// standings of the season the grid comes from (next season's entrants have none yet)
	const standingYear = next.length ? null : g.year;
	const dStand = new Map((standingYear ? (db.driverStandings.get(standingYear) ?? []) : []).map((s) => [s.id, s]));
	const cStand = new Map((standingYear ? (db.constructorStandings.get(standingYear) ?? []) : []).map((s) => [s.id, s]));
	const drivers = [...g.drivers].map((id) => ({ driver: driverRef(db, id), team: teamRef(db, teamOf(id)), standing: dStand.get(id) ?? null }));
	drivers.sort((a, b) => (a.standing?.position ?? 99) - (b.standing?.position ?? 99) || a.team.name.localeCompare(b.team.name) || a.driver.name.localeCompare(b.driver.name));
	const teams = [...g.teams].map((id) => ({ team: teamRef(db, id), drivers: drivers.filter((d) => d.team.id === id).map((d) => d.driver), standing: cStand.get(id) ?? null }));
	teams.sort((a, b) => (a.standing?.position ?? 99) - (b.standing?.position ?? 99) || a.team.name.localeCompare(b.team.name));
	return { year: next.length ? g.year + 1 : g.year, drivers, teams };
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function BrowseScreen() {
	const c = useView(counts, []);
	const now = useView(grid, []);
	const open = useOpen();
	const [gridKind, setGridKind] = useState<"drivers" | "teams">("drivers");

	const kinds = [
		{ icon: CalendarRange, title: "Seasons", count: c.seasons.length, path: "/seasons" },
		{ icon: UserRound, title: "Drivers", count: c.drivers.length, path: "/drivers" },
		{ icon: Car, title: "Constructors", count: c.constructors, path: "/constructors" },
		{ icon: Route, title: "Circuits", count: c.circuits, path: "/circuits" },
		{ icon: FlagIcon, title: "Grands Prix", count: c.grandsPrix, path: "/grands-prix" },
		{ icon: Cog, title: "Engines", count: c.engines, path: "/engines" },
		{ icon: Disc3, title: "Tyres", count: c.tyres, path: "/tyres" },
		{ icon: Globe, title: "Nations", count: c.nations, path: "/nations" },
	];

	return (
		<TabScreen title="Browse" subtitle={`Every season since ${c.seasons[0] ?? 1950}`}>
			<Page>
				<Section className="mt-2">
					{kinds.map((k, i) => (
						<Row key={k.path} icon={k.icon} title={k.title} value={num(k.count)} onPress={() => open(k.path)} last={i === kinds.length - 1} />
					))}
				</Section>

				<Section title="Surprise me">
					<View className="flex-row flex-wrap gap-2 px-4 pt-1">
						<Button label="Driver" icon={Dices} variant="outline" size="sm" onPress={() => open(href.driver(pick(c.drivers)!))} />
						<Button label="Race" icon={Dices} variant="outline" size="sm" onPress={() => open(href.race(pick(c.races)!))} />
						<Button label="Season" icon={Dices} variant="outline" size="sm" onPress={() => open(href.season(pick(c.seasons)!))} />
					</View>
				</Section>

				{now ? (
					<Section title="Current grid" description={`Racing in ${now.year}`}>
						<Switcher<"drivers" | "teams">
							className="mb-1 mt-2"
							value={gridKind}
							onChange={setGridKind}
							options={[
								{ value: "drivers", label: `Drivers ${now.drivers.length}` },
								{ value: "teams", label: `Teams ${now.teams.length}` },
							]}
						/>
						{gridKind === "drivers"
							? now.drivers.map((d, i) => (
									<Row
										key={d.driver.id}
										leading={<Flag code={d.driver.country} />}
										title={d.driver.name}
										subtitle={d.team.name}
										value={d.standing ? `P${d.standing.positionText} · ${num(d.standing.points)} pts` : null}
										onPress={() => open(href.driver(d.driver.id))}
										last={i === now.drivers.length - 1}
									/>
								))
							: now.teams.map((t, i) => (
									<Row
										key={t.team.id}
										leading={<Flag code={t.team.country} />}
										title={t.team.name}
										subtitle={t.drivers.map((d) => surname(d.name)).join(", ")}
										value={t.standing ? `P${t.standing.positionText} · ${num(t.standing.points)} pts` : null}
										onPress={() => open(href.team(t.team.id))}
										last={i === now.teams.length - 1}
									/>
								))}
					</Section>
				) : null}
			</Page>
		</TabScreen>
	);
}
