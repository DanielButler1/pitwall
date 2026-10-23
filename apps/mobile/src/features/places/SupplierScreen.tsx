import { useLocalSearchParams } from "expo-router";
import { Trophy } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { engineView, tyreView, type SupplierKind, type SupplierView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { Badge, EmptyState, Icon, Row, Section, Text } from "@/components/ui";
import { InlineLink, MoreButton, useMore } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { cn } from "@/lib/cn";
import { num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { SUPPLIER } from "./SuppliersScreen";

type Season = SupplierView["seasons"][number];

/** One season: year, the teams supplied, wins, and the champions who won with this supplier. */
function SeasonRow({ s, last, open }: { s: Season; last: boolean; open(path: string): void }) {
	return (
		<Pressable accessibilityRole="button" accessibilityLabel={`${s.year} season`} onPress={() => open(href.season(s.year))} className="pl-4 active:bg-accent">
			<View className={cn("flex-row gap-3 py-3 pr-4", !last && "border-b border-border")}>
				<Text variant="label" className="w-11 tabular-nums">{s.year}</Text>
				<View className="flex-1 gap-1">
					<Text variant="small" className="text-muted-foreground" numberOfLines={2}>{s.teams.map((t) => t.name).join(", ")}</Text>
					{s.driversChampion ? (
						<View className="flex-row items-center gap-1.5">
							<Icon icon={Trophy} tone="gold" size={13} />
							<Text variant="small" accessibilityLabel={`Drivers' champion ${s.driversChampion.name}`}>{s.driversChampion.name}</Text>
						</View>
					) : null}
					{s.constructorsChampion ? (
						<View className="flex-row items-center gap-1.5">
							<Icon icon={Trophy} tone="silver" size={13} />
							<Text variant="small" accessibilityLabel={`Constructors' champion ${s.constructorsChampion.name}`}>{s.constructorsChampion.name}</Text>
						</View>
					) : null}
				</View>
				<View className="items-end">
					<Text variant="small" className="font-semibold tabular-nums">{s.wins ? plural(s.wins, "win") : ""}</Text>
					<Text variant="caption" className="tabular-nums">{plural(s.races, "race")}</Text>
				</View>
			</View>
		</Pressable>
	);
}

function SupplierScreen({ kind }: { kind: SupplierKind }) {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => (kind === "engine" ? engineView(db, id) : tyreView(db, id)), [kind, id]);
	const open = useOpen();
	const seasons = useMore(20, 50);
	const titles = useMore(20, 50);
	const wins = useMore(20, 50);
	const s = SUPPLIER[kind];
	if (!view) {
		return (
			<DetailScreen title={s.one}>
				<EmptyState title={`No such ${s.one.toLowerCase()}`} />
			</DetailScreen>
		);
	}
	const t = view.totals;
	return (
		<DetailScreen title={view.supplier.name} subtitle={`${s.one}${t.firstYear ? ` · ${yearRange(t.firstYear, t.lastYear)}` : ""}`}>
			<Page>
				<View className="px-4 pb-1 pt-2">
					<View className="flex-row items-center gap-1.5">
						<Flag code={view.nation.country} />
						<InlineLink label={view.nation.name} onPress={() => open(href.nation(view.nation.id))} />
					</View>
					<Text variant="muted" className="mt-1">
						Supplied {plural(t.teams, "team")} and {plural(t.drivers, "driver")} over {plural(t.seasons, "season")}. Titles are credited to the {kind === "engine" ? "engine" : "tyres"} of the champion&apos;s car.
					</Text>
				</View>
				<StatGrid className="mt-3">
					<Stat label="Drivers' titles" value={t.driversTitles} />
					<Stat label="Constructors' titles" value={t.constructorsTitles} />
					<Stat label="Wins" value={num(t.wins)} />
					<Stat label="Poles" value={num(t.poles)} />
					<Stat label="Podiums" value={num(t.podiums)} />
					<Stat label="Fastest laps" value={num(t.fastestLaps)} />
					<Stat label="Races" value={num(t.races)} />
					<Stat label="Teams" value={t.teams} />
				</StatGrid>
				<Section title="Season by season" description="Teams supplied each season; champions when they won with this supplier.">
					{view.seasons.slice(0, seasons.count).map((x, i, shown) => (
						<SeasonRow key={x.year} s={x} open={open} last={i === shown.length - 1} />
					))}
					<MoreButton shown={seasons.count} total={view.seasons.length} onPress={seasons.more} />
				</Section>
				{view.titles.length > 0 ? (
					<Section title="Championships" action={<Badge label={String(view.titles.length)} />}>
						{view.titles.slice(0, titles.count).map((x, i, shown) => (
							<Row
								key={`${x.year}-${x.kind}`}
								leading={<Text variant="label" className="w-11 tabular-nums">{x.year}</Text>}
								title={x.driver ? x.driver.name : x.team.name}
								subtitle={x.kind === "drivers" ? `Drivers' title · ${x.team.name}` : "Constructors' title"}
								onPress={() => open(x.driver ? href.driver(x.driver.id) : href.team(x.team.id))}
								last={i === shown.length - 1}
							/>
						))}
						<MoreButton shown={titles.count} total={view.titles.length} onPress={titles.more} />
					</Section>
				) : null}
				<Section title="Teams supplied">
					{view.topTeams.map((x, i) => (
						<Row key={x.team.id} leading={<Flag code={x.team.country} />} title={x.team.name} subtitle={`${yearRange(x.firstYear, x.lastYear)} · ${plural(x.races, "race")}`} value={x.wins ? plural(x.wins, "win") : null} onPress={() => open(href.team(x.team.id))} last={i === view.topTeams.length - 1} />
					))}
				</Section>
				<Section title="Most successful drivers">
					{view.topDrivers.map((x, i) => (
						<Row
							key={x.driver.id}
							leading={<Flag code={x.driver.country} />}
							title={x.driver.name}
							subtitle={`${plural(x.starts, "start")}${x.podiums ? ` · ${plural(x.podiums, "podium")}` : ""}`}
							value={x.wins ? plural(x.wins, "win") : null}
							onPress={() => open(href.driver(x.driver.id))}
							last={i === view.topDrivers.length - 1}
						/>
					))}
				</Section>
				{view.wins.length > 0 ? (
					<Section title="Wins" action={<Badge label={num(view.wins.length)} />}>
						{view.wins.slice(0, wins.count).map((w, i, shown) => (
							<Row
								key={`${w.race.year}-${w.race.round}-${i}`}
								leading={<Flag code={w.race.country} />}
								title={`${w.race.year} ${w.race.name}`}
								subtitle={`${w.driver.name} · ${w.team.name}`}
								onPress={() => open(href.race(w.race))}
								last={i === shown.length - 1}
							/>
						))}
						<MoreButton shown={wins.count} total={view.wins.length} onPress={wins.more} />
					</Section>
				) : null}
			</Page>
		</DetailScreen>
	);
}

export const EngineScreen = () => <SupplierScreen kind="engine" />;
export const TyreScreen = () => <SupplierScreen kind="tyre" />;
