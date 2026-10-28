import { useLocalSearchParams } from "expo-router";
import { CalendarDays, Flag as FlagIcon, GitCompareArrows, Trophy } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ageOn } from "@pitwall/core/f1/stats";
import { driverTeammatesView } from "@pitwall/core/f1/teammates";
import { driverView, type DriverView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Stat, StatGrid } from "@/components/f1";
import { Badge, Button, EmptyState, Icon, IconButton, Row, Section, Text } from "@/components/ui";
import { useDeferredView, useView } from "@/data/dataset";
import { MoreButton, ResultCell, useMore } from "@/features/browse/kit";
import { cn } from "@/lib/cn";
import { fmtDate, num, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { AllResults, initialResults, type ResultFilter, type ResultsState } from "./AllResults";
import { ScrollPage, useJump } from "./ScrollPage";
import { TeammatesSection } from "./TeammatesSection";
import { subjectFacts, upcomingAbout } from "@pitwall/core/f1/race-facts";
import { FactsSection } from "@/components/facts";
import { useFactEntries } from "@/data/facts";

type Season = DriverView["seasons"][number];
type Result = DriverView["results"][number];

const SeasonBlock = memo(function SeasonBlock({ s, results, last, open }: { s: Season; results: Result[]; last: boolean; open(path: string): void }) {
	const counts = [s.wins && `${s.wins} ${s.wins === 1 ? "win" : "wins"}`, s.podiums && `${s.podiums} ${s.podiums === 1 ? "podium" : "podiums"}`, s.poles && `${s.poles} ${s.poles === 1 ? "pole" : "poles"}`].filter(Boolean);
	return (
		<View className={cn("ml-4 pb-3 pr-4", !last && "border-b border-border")}>
			<Pressable accessibilityRole="button" accessibilityLabel={`${s.year} season`} onPress={() => open(href.season(s.year))} className="flex-row items-start gap-3 pb-2 pt-3 active:opacity-60">
				<Text variant="label" className="w-11 tabular-nums">{s.year}</Text>
				<View className="flex-1">
					<Text variant="small" numberOfLines={2}>{s.teams.map((t) => t.name).join(" / ")}</Text>
					{counts.length ? <Text variant="caption">{counts.join(" · ")}</Text> : null}
				</View>
				<View className="items-end">
					<View className="flex-row items-center gap-1">
						{s.champion ? <Icon icon={Trophy} tone="gold" size={14} /> : null}
						<Text variant="label" className="tabular-nums">{s.position ? `P${s.position}` : "–"}</Text>
					</View>
					<Text variant="caption" className="tabular-nums">{num(s.points)} pts</Text>
				</View>
			</Pressable>
			<View className="flex-row flex-wrap gap-1 pl-14">
				{results.map((r, i) => (
					<ResultCell key={`${r.race.round}-${i}`} position={r.position} points={r.points} pole={r.pole} label={`${r.race.name}: ${r.position}${r.points ? `, ${num(r.points)} points` : ""}${r.pole ? ", pole" : ""}`} onPress={() => open(href.race(r.race))} />
				))}
			</View>
		</View>
	);
});

export function DriverScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => driverView(db, id), [id]);
	const mates = useView((db) => driverTeammatesView(db, id), [id]);
	const facts = useFactEntries((db, index) => subjectFacts(db, index, "driver", id), [id]);
	const upcoming = useDeferredView((db) => upcomingAbout(db, { driver: id }), [id]);
	const open = useOpen();
	const { scroll, onTargetLayout, jump } = useJump();
	const [results, setResults] = useState<ResultsState>(initialResults);
	const moreSeasons = useMore(10, 50);
	const byYear = useMemo(() => {
		const m = new Map<number, Result[]>();
		for (const r of view?.results ?? []) (m.get(r.race.year) ?? m.set(r.race.year, []).get(r.race.year)!).push(r);
		return m;
	}, [view]);
	if (!view) return <DetailScreen title="Driver"><EmptyState title="No such driver" body="There's no World Championship driver with this name in the data." /></DetailScreen>;

	const d = view.driver;
	const t = view.totals;
	const today = new Date().toISOString().slice(0, 10);
	const age = ageOn(d.dateOfBirth, d.dateOfDeath ?? today);
	const show = (filter: ResultFilter) => () => {
		setResults({ ...initialResults, filter });
		jump();
	};
	const compare = () => open(`/compare?d=${d.id}`);
	const milestones = [
		{ icon: CalendarDays, label: "First race", race: view.firstRace },
		{ icon: Trophy, label: "First win", race: view.firstWin },
		{ icon: FlagIcon, label: "Last race", race: view.lastRace },
	].filter((m) => m.race);
	const allSeasons = [...view.seasons].reverse();
	const seasons = allSeasons.slice(0, moreSeasons.count);

	return (
		<DetailScreen title={d.name} subtitle={yearRange(t.firstYear || null, t.lastYear)} right={<IconButton icon={GitCompareArrows} label="Compare" onPress={compare} />}>
			<ScrollPage scroll={scroll}>
				<View className="gap-2 px-4 pb-1 pt-2">
					<View className="flex-row flex-wrap items-center gap-2">
						<Pressable accessibilityRole="link" onPress={() => open(href.nation(view.nation.id))} hitSlop={8} className="flex-row items-center gap-1.5 active:opacity-60">
							<Flag code={view.nation.country} />
							<Text variant="small" className="font-semibold text-link">{view.nation.name}</Text>
						</Pressable>
						{d.number ? <Badge label={`#${d.number}`} /> : null}
						{d.abbreviation ? <Badge label={d.abbreviation} /> : null}
					</View>
					{d.dateOfBirth ? (
						<Text variant="muted">
							Born {fmtDate(d.dateOfBirth)}
							{d.placeOfBirth ? ` in ${d.placeOfBirth}` : ""}
							{d.dateOfDeath ? `. Died ${fmtDate(d.dateOfDeath)}, aged ${age}.` : age != null ? ` (age ${age}).` : "."}
						</Text>
					) : null}
				</View>

				<StatGrid className="mt-3">
					<Stat label="Titles" value={t.titles} />
					<Stat label="Wins" value={t.wins} onPress={t.wins ? show("wins") : undefined} />
					<Stat label="Podiums" value={t.podiums} onPress={t.podiums ? show("podiums") : undefined} />
					<Stat label="Poles" value={t.poles} onPress={t.poles ? show("poles") : undefined} />
					<Stat label="Fastest laps" value={t.fastestLaps} onPress={t.fastestLaps ? show("fastest-laps") : undefined} />
					<Stat label="Starts" value={num(t.starts)} detail={t.entries !== t.starts ? `${t.entries} entries` : null} onPress={show("all")} />
					<Stat label="Points" value={num(t.points)} />
					<Stat label="Win rate" value={`${(t.winRate * 100).toFixed(1)}%`} />
					{view.lapsLed ? <Stat label={view.lapsLed.partial ? `Laps led since ${view.lapsLed.from}` : "Laps led"} value={num(view.lapsLed.laps)} detail={`in ${view.lapsLed.races} ${view.lapsLed.races === 1 ? "race" : "races"}`} /> : null}
				</StatGrid>

				<Button label="Compare with other drivers" icon={GitCompareArrows} variant="outline" size="sm" className="mx-4 mt-3" onPress={compare} />

				<FactsSection entries={facts} upcoming={upcoming} description="The career's standout moments" />

				{milestones.length ? (
					<Section title="Career">
						{milestones.map((m, i) => (
							<Row key={m.label} icon={m.icon} title={`${m.race!.year} ${m.race!.name}`} subtitle={`${m.label} · ${fmtDate(m.race!.date)}`} onPress={() => open(href.race(m.race!))} last={i === milestones.length - 1} />
						))}
					</Section>
				) : null}

				{seasons.length ? (
					<Section title="Season by season" description="Every result, newest season first. Underlined: pole position. R: retired.">
						{seasons.map((s, i) => (
							<SeasonBlock key={s.year} s={s} results={byYear.get(s.year) ?? []} last={i === seasons.length - 1} open={open} />
						))}
						<MoreButton shown={seasons.length} total={allSeasons.length} onPress={moreSeasons.more} step={50} />
					</Section>
				) : null}

				{view.relatives.length ? (
					<Section title="Family">
						{view.relatives.map((m, i) => (
							<Row key={m.driver.id} leading={<Flag code={m.driver.country} />} title={`${m.relation} ${m.driver.name}`}onPress={() => open(href.driver(m.driver.id))} last={i === view.relatives.length - 1} />
						))}
					</Section>
				) : null}

				{mates ? <TeammatesSection view={mates} onOpen={(mate) => open(href.teammates(d.id, mate))} /> : null}

				{t.entries ? <AllResults kind="driver" id={d.id} state={results} onChange={setResults} onLayout={onTargetLayout} /> : null}
			</ScrollPage>
		</DetailScreen>
	);
}
