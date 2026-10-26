import { useLocalSearchParams } from "expo-router";
import { Trophy } from "lucide-react-native";
import { Fragment, memo, useState } from "react";
import { Pressable, View } from "react-native";
import { constructorView, type ConstructorView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Stat, StatGrid } from "@/components/f1";
import { Badge, EmptyState, Icon, Row, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { NativeAdSlot } from "@/features/ads/NativeAdSlot";
import { InlineLink, MoreButton, surname, useMore } from "@/features/browse/kit";
import { cn } from "@/lib/cn";
import { num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { AllResults, initialResults, type ResultFilter, type ResultsState } from "./AllResults";
import { ScrollPage, useJump } from "./ScrollPage";

type Season = ConstructorView["seasons"][number];

// The 1950s teams ran a dozen drivers a season: list the first few and count the rest.
const DRIVERS_SHOWN = 6;

/** Linked names in running text, comma separated. */
function Links<T>({ items, label, onPress, tone }: { items: T[]; label(x: T): string; onPress(x: T): void; tone: "plain" | "muted" }) {
	return items.map((x, i) => (
		<Fragment key={i}>
			{i > 0 ? ", " : ""}
			<InlineLink label={label(x)} onPress={() => onPress(x)} tone={tone} />
		</Fragment>
	));
}

const SeasonRow = memo(function SeasonRow({ s, last, open }: { s: Season; last: boolean; open(path: string): void }) {
	const drivers = s.drivers.slice(0, DRIVERS_SHOWN);
	// No constructors' championship before 1958: no position and no points to show.
	const points = s.position == null && !s.points ? null : `${num(s.points)} pts`;
	return (
		<View className={cn("ml-4 flex-row items-start gap-3 py-3 pr-4", !last && "border-b border-border")}>
			<Pressable accessibilityRole="button" accessibilityLabel={`${s.year} season`} hitSlop={8} onPress={() => open(href.season(s.year))} className="w-11 active:opacity-60">
				<Text variant="label" className="tabular-nums">{s.year}</Text>
			</Pressable>
			<View className="flex-1 gap-0.5">
				<Text variant="small">
					<Links items={drivers} label={(d) => surname(d.name)} onPress={(d) => open(href.driver(d.id))} tone="plain" />
					{s.drivers.length > DRIVERS_SHOWN ? <Text variant="small" className="text-muted-foreground">{` +${s.drivers.length - DRIVERS_SHOWN} more`}</Text> : null}
				</Text>
				<Text variant="caption">
					<Links items={s.engines} label={(e) => e.name} onPress={(e) => open(href.engine(e.id))} tone="muted" />
					{s.engines.length && s.tyres.length ? " · " : ""}
					<Links items={s.tyres} label={(t) => t.name} onPress={(t) => open(href.tyre(t.id))} tone="muted" />
					{s.wins ? ` · ${plural(s.wins, "win")}` : ""}
				</Text>
			</View>
			<View className="items-end">
				<View className="flex-row items-center gap-1">
					{s.champion ? <Icon icon={Trophy} tone="gold" size={14} /> : null}
					<Text variant="label" className="tabular-nums">{s.position ? `P${s.position}` : "–"}</Text>
				</View>
				{points ? <Text variant="caption" className="tabular-nums">{points}</Text> : null}
			</View>
		</View>
	);
});

export function ConstructorScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => constructorView(db, id), [id]);
	const open = useOpen();
	const { scroll, onTargetLayout, jump } = useJump();
	const [results, setResults] = useState<ResultsState>(initialResults);
	const seasons = useMore(20, 50);
	const wins = useMore(10, 50);
	if (!view) return <DetailScreen title="Constructor"><EmptyState title="No such constructor" body="There's no World Championship constructor with this name in the data." /></DetailScreen>;

	const t = view.totals;
	const show = (filter: ResultFilter) => () => {
		setResults({ ...initialResults, filter });
		jump();
	};
	const allSeasons = [...view.seasons].reverse();
	const shownSeasons = allSeasons.slice(0, seasons.count);
	const shownWins = view.wins.slice(0, wins.count);

	return (
		<DetailScreen title={view.team.name} subtitle={`${view.nation.name} · ${yearRange(t.firstYear, t.lastYear)}`}>
			<ScrollPage scroll={scroll}>
				<View className="gap-2 px-4 pb-1 pt-2">
					<View className="flex-row flex-wrap items-center gap-2">
						<Pressable accessibilityRole="link" onPress={() => open(href.nation(view.nation.id))} hitSlop={8} className="flex-row items-center gap-1.5 active:opacity-60">
							<Flag code={view.nation.country} />
							<Text variant="small" className="font-semibold text-link">{view.nation.name}</Text>
						</Pressable>
					</View>
					{view.team.fullName && view.team.fullName !== view.team.name ? <Text variant="muted">{view.team.fullName}</Text> : null}
				</View>

				<StatGrid className="mt-3">
					<Stat label="Titles" value={t.titles} />
					<Stat label="Wins" value={t.wins} onPress={t.wins ? show("wins") : undefined} />
					<Stat label="1-2 finishes" value={t.oneTwos} />
					<Stat label="Podiums" value={t.podiums} onPress={t.podiums ? show("podiums") : undefined} />
					<Stat label="Poles" value={t.poles} onPress={t.poles ? show("poles") : undefined} />
					<Stat label="Fastest laps" value={t.fastestLaps} onPress={t.fastestLaps ? show("fastest-laps") : undefined} />
					<Stat label="Races" value={num(t.entries)} onPress={show("all")} />
					<Stat label="Points" value={num(t.points)} />
				</StatGrid>

				<NativeAdSlot />

				{allSeasons.length ? (
					<Section title="Season by season" description="Drivers, engines and tyres each season. Position and points in the constructors' championship (from 1958).">
						{shownSeasons.map((s, i) => (
							<SeasonRow key={s.year} s={s} last={i === shownSeasons.length - 1} open={open} />
						))}
						<MoreButton shown={shownSeasons.length} total={allSeasons.length} onPress={seasons.more} />
					</Section>
				) : null}

				{view.topDrivers.length ? (
					<Section title="Most starts for the team">
						{view.topDrivers.map((d, i) => (
							<Row key={d.driver.id} leading={<Flag code={d.driver.country} />} title={d.driver.name} subtitle={d.wins ? plural(d.wins, "win") : null} value={plural(d.starts, "start")} onPress={() => open(href.driver(d.driver.id))} last={i === view.topDrivers.length - 1} />
						))}
					</Section>
				) : null}

				{view.wins.length ? (
					<Section title="Wins" action={<Badge label={num(view.wins.length)} />}>
						{shownWins.map((w, i) => (
							<Row key={`${w.race.year}-${w.race.round}-${w.driver.id}`} title={`${w.race.year} ${w.race.name}`} subtitle={w.driver.name} onPress={() => open(href.race(w.race))} last={i === shownWins.length - 1} />
						))}
						<MoreButton shown={shownWins.length} total={view.wins.length} onPress={wins.more} />
					</Section>
				) : null}

				{t.entries ? <AllResults kind="team" id={view.team.id} state={results} onChange={setResults} onLayout={onTargetLayout} /> : null}
			</ScrollPage>
		</DetailScreen>
	);
}
