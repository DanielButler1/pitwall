// One season: the champions (or leaders), the standings and results grid, the title fight round by
// round, the calendar, and the entry list before it starts. apps/web season.tsx in a phone form.

import { useLocalSearchParams } from "expo-router";
import { Share2, Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { seasonProgression } from "@pitwall/core/f1/progression";
import { seasonView, type DriverRef, type SeasonView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { Badge, EmptyState, Icon, IconButton, Row, Section, Segmented, Text } from "@/components/ui";
import { useUniverseBase, useView } from "@/data/dataset";
import { fmtDay, num, plural } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { PrevNext } from "./components/PrevNext";
import { ProgressionChart } from "./components/ProgressionChart";
import { ResultsMatrix } from "./components/ResultsMatrix";
import { shortNamer } from "./names";
import { shareLink } from "./share";
import { PosCell } from "./components/PosCell";

type Table = "drivers" | "constructors" | "grid";

function Standings({ view }: { view: SeasonView }) {
	const open = useOpen();
	const [table, setTable] = useState<Table>("drivers");
	const hasTeams = view.constructorStandings.length > 0;
	const options: { value: Table; label: string }[] = [{ value: "drivers", label: "Drivers" }, ...(hasTeams ? [{ value: "constructors" as const, label: "Constructors" }] : []), { value: "grid", label: "Results" }];
	return (
		<Section title="Championship" description={view.inProgress ? `After ${view.races.filter((r) => r.completed).length} of ${view.races.length} rounds` : undefined}>
			<Segmented<Table>
				className="mx-4 mb-2 mt-2"
				value={table}
				options={options}
				onChange={(v) => {
					haptic("selection");
					setTable(v);
				}}
			/>
			{table === "drivers"
				? view.driverStandings.map((d, i, all) => (
						<Row
							key={d.driver.id}
							leading={<PosCell text={d.position} />}
							title={d.driver.name}
							subtitle={[d.teams.map((t) => t.name).join(" / "), d.wins ? plural(d.wins, "win") : null, d.realPosition && d.realPosition !== d.position ? `real ${d.realPosition}` : null].filter(Boolean).join(" · ")}
							trailing={
								<View className="flex-row items-center gap-1.5">
									{d.champion ? <Icon icon={Trophy} tone="gold" size={14} /> : null}
									<Text variant="label" className="tabular-nums">
										{num(d.points)}
									</Text>
								</View>
							}
							onPress={() => open(href.driver(d.driver.id))}
							last={i === all.length - 1}
						/>
					))
				: table === "constructors"
					? view.constructorStandings.map((c, i, all) => (
							<Row
								key={c.team.id + (c.engine?.id ?? "")}
								leading={<PosCell text={c.position} />}
								title={c.team.name}
								subtitle={[c.engine && c.engine.name !== c.team.name ? c.engine.name : null, c.wins ? plural(c.wins, "win") : null, c.realPosition && c.realPosition !== c.position ? `real ${c.realPosition}` : null].filter(Boolean).join(" · ") || null}
								trailing={
									<View className="flex-row items-center gap-1.5">
										{c.champion ? <Icon icon={Trophy} tone="gold" size={14} /> : null}
										<Text variant="label" className="tabular-nums">
											{num(c.points)}
										</Text>
									</View>
								}
								onPress={() => open(href.team(c.team.id))}
								last={i === all.length - 1}
							/>
						))
					: <ResultsMatrix view={view} />}
		</Section>
	);
}

function Calendar({ view }: { view: SeasonView }) {
	const open = useOpen();
	const short = useMemo(() => shortNamer(view.races.flatMap((r) => [r.winner, r.pole]).filter((d): d is DriverRef => d != null)), [view]);
	return (
		<Section title="Calendar">
			{view.races.map((r, i, all) => {
				const parts = [fmtDay(r.race.date), r.sprint ? "Sprint" : null, r.circuit.name, r.completed ? null : "Upcoming"];
				const results = r.completed ? [r.winner && `Winner ${short(r.winner)}${r.winnerTeam ? ` (${r.winnerTeam.name})` : ""}`, r.pole && `pole ${short(r.pole)}`].filter(Boolean).join(" · ") : null;
				return (
					<Row
						key={r.race.round}
						leading={
							<View className="w-7 items-center">
								<Flag code={r.race.country} />
								<Text variant="caption" className="tabular-nums">
									{r.race.round}
								</Text>
							</View>
						}
						title={`${r.race.name} Grand Prix`}
						subtitle={[parts.filter(Boolean).join(" · "), results].filter(Boolean).join("\n")}
						onPress={() => open(href.race(r.race))}
						last={i === all.length - 1}
						className={r.completed ? undefined : "opacity-70"}
					/>
				);
			})}
		</Section>
	);
}

export function SeasonScreen() {
	const { year: yearParam } = useLocalSearchParams<{ year: string }>();
	const year = Number(yearParam);
	const base = useUniverseBase();
	const view = useView((db) => seasonView(db, year, base), [year, base]);
	const progression = useView((db) => seasonProgression(db, year), [year]);
	const open = useOpen();
	if (!view) {
		return (
			<DetailScreen title="Season">
				<EmptyState title="No such season" body={`There's no Formula 1 season ${yearParam ?? ""} in the data.`} />
			</DetailScreen>
		);
	}
	const done = view.races.filter((r) => r.completed).length;
	const champion = view.driverStandings.find((d) => d.champion) ?? (view.inProgress ? view.driverStandings[0] : undefined);
	const cChampion = view.constructorStandings.find((c) => c.champion) ?? (view.inProgress ? view.constructorStandings[0] : undefined);
	const title = view.inProgress ? "leader" : "champion";
	return (
		<DetailScreen
			title={`${view.year} season`}
			subtitle={`${plural(view.races.length, "round")}${done < view.races.length ? `, ${done} completed` : ""}`}
			right={<IconButton icon={Share2} label="Share" onPress={() => shareLink(href.season(view.year), `${view.year} Formula 1 season`)} />}
		>
			<Page>
				{view.modified ? (
					<View className="flex-row px-4 pb-1">
						<Badge label={`${view.simulated ? "Simulated" : "Altered"}${view.pointsSystem !== "Official" ? `: ${view.pointsSystem} points system` : ""}`} tone="primary" />
					</View>
				) : null}
				{champion || cChampion ? (
					<StatGrid className="mt-2">
						{champion ? (
							<Stat label={`Drivers' ${title}`} value={champion.driver.name} detail={`${num(champion.points)} pts · ${plural(champion.wins, "win")}`} onPress={() => open(href.driver(champion.driver.id))} />
						) : null}
						{cChampion ? (
							<Stat label={`Constructors' ${title}`} value={cChampion.team.name} detail={`${num(cChampion.points)} pts · ${plural(cChampion.wins, "win")}${cChampion.engine && cChampion.engine.name !== cChampion.team.name ? ` · ${cChampion.engine.name}` : ""}`} onPress={() => open(href.team(cChampion.team.id))} />
						) : null}
					</StatGrid>
				) : null}
				{view.inProgress ? (
					<Text variant="muted" className="mt-3 px-4">
						Standings are provisional until the final round.
					</Text>
				) : null}

				<PrevNext
					prev={view.prevYear ? { caption: "Previous season", label: String(view.prevYear), onPress: () => open(href.season(view.prevYear!)) } : null}
					next={view.nextYear ? { caption: "Next season", label: String(view.nextYear), onPress: () => open(href.season(view.nextYear!)) } : null}
				/>

				{view.completed ? <Standings view={view} /> : null}

				{progression && progression.rounds.length > 1 ? (
					<Section title="Championship progression" description={`The title fight round by round, for the top ten drivers${progression.constructors ? " and constructors" : ""}.`}>
						<View className="mt-2">
							<ProgressionChart progression={progression} />
						</View>
					</Section>
				) : null}

				<Calendar view={view} />

				{view.entrants.length > 0 ? (
					<Section title="Entry list">
						{view.entrants.map((e) => (
							<View key={e.team.id}>
								<Row title={e.team.name} subtitle={e.engine && e.engine.name !== e.team.name ? `${e.engine.name} engine` : null} leading={<View className="w-7 items-center"><Flag code={e.team.country} /></View>} onPress={() => open(href.team(e.team.id))} />
								{e.drivers.map((d) => (
									<Row key={d.id} title={d.name} className="pl-14" leading={<Flag code={d.country} />} onPress={() => open(href.driver(d.id))} />
								))}
							</View>
						))}
					</Section>
				) : null}

				{view.tyres.length > 0 ? (
					<Section title="Tyres">
						{view.tyres.map((t, i, all) => (
							<Row key={t.id} title={t.name} leading={<View className="w-7 items-center"><Flag code={t.country} /></View>} onPress={() => open(href.tyre(t.id))} last={i === all.length - 1} />
						))}
					</Section>
				) : null}

				<Row title="All seasons" className="mt-4" onPress={() => open("/seasons")} last />
			</Page>
		</DetailScreen>
	);
}
