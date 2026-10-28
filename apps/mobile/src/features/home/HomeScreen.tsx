import { onThisDayView } from "@pitwall/core/f1/diary";
import { milestoneWatch, type MilestoneWatch } from "@pitwall/core/f1/milestones";
import { homeView } from "@pitwall/core/f1/views";
import { ChevronRight, FlaskConical } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Page, Stat, StatGrid, TabScreen } from "@/components/f1";
import { Button, Text } from "@/components/ui";
import { useDb, useDeferredView, useView } from "@/data/dataset";
import { onThisDayFacts, raceEntries, seasonFacts, upcomingFacts } from "@pitwall/core/f1/race-facts";
import { useFactEntries } from "@/data/facts";
import { num } from "@/lib/format";
import { href } from "@/lib/links";
import { watchDataChecks } from "@/features/settings/data";
import { Explore, Puzzles } from "./ExploreSections";
import { MilestoneWatchSection, MostTitles, MostWins, OnThisDay } from "./HistorySections";
import { useGo } from "./kit";
import { LatestRace, NextRace, Standings, TitleFightSection } from "./SeasonSections";

watchDataChecks();

/** Today's month and day on the phone, moving on at midnight while the app stays open. */
function useToday() {
	const read = () => {
		const d = new Date();
		return `${d.getMonth() + 1}-${d.getDate()}`;
	};
	const [today, setToday] = useState(read);
	useEffect(() => {
		const t = setInterval(() => setToday(read()), 60_000);
		return () => clearInterval(t);
	}, []);
	const [month, day] = today.split("-").map(Number) as [number, number];
	return { month, day };
}

/**
 * The milestone watch, worked out just after Home first draws: it ranks every active driver and
 * team against the all-time lists, the slowest part of the page by far (about a second on a
 * mid-range phone), and it sits near the bottom.
 */
function useMilestoneWatch() {
	const db = useDb();
	const [state, setState] = useState<{ db: typeof db; watch: MilestoneWatch | null } | null>(null);
	useEffect(() => {
		const t = setTimeout(() => setState({ db, watch: milestoneWatch(db) }), 250);
		return () => clearTimeout(t);
	}, [db]);
	return state?.db === db ? state.watch : null;
}

export function HomeScreen() {
	const view = useView((db) => homeView(db), []);
	const watch = useMilestoneWatch();
	const { month, day } = useToday();
	const onThisDay = useView((db) => onThisDayView(db, month, day), [month, day]);
	const go = useGo();
	const upcoming = useDeferredView((db) => upcomingFacts(db, 4), []);
	const latestFacts = useFactEntries((db, index) => {
		const r = view.latestRace && db.racesByYear.get(view.latestRace.race.year)?.find((x) => x.round === view.latestRace!.race.round);
		return r ? raceEntries(db, index, r.id) : [];
	}, [view]);
	const seasonSoFar = useFactEntries((db, index) => (view.titleFight ? seasonFacts(db, index, view.lastYear, 4) : []), [view]);
	const dayFacts = useFactEntries((db, index) => onThisDayFacts(db, index, month, day, 3), [month, day]);

	const leader = view.inProgress ? "leader" : "champion";
	return (
		<TabScreen title="Pitwall" subtitle={`Formula 1 statistics, 1950–${view.lastYear}`}>
			<Page>
				<Text variant="muted" className="px-4 pt-1">
					{num(view.totals.races)} Grands Prix, {num(view.totals.drivers)} drivers and {view.totals.constructors} constructors across {view.totals.seasons} seasons. Browse the record books, play the daily games, or use the Lab to change results and see how history would have turned out.
				</Text>
				<View className="flex-row gap-2 px-4 pb-1 pt-3">
					<Button label={`${view.lastYear} season`} icon={ChevronRight} size="sm" onPress={() => go(href.season(view.lastYear))} />
					<Button label="Rewrite history" icon={FlaskConical} size="sm" variant="outline" onPress={() => go("/lab")} />
				</View>

				<StatGrid className="mt-3">
					<Stat label={`${view.lastYear} drivers' ${leader}`} value={view.champion?.driver.name ?? "–"} detail={view.champion ? `${num(view.champion.points)} points` : null} onPress={view.champion ? () => go(href.driver(view.champion!.driver.id)) : undefined} />
					<Stat
						label={`${view.lastYear} constructors' ${leader}`}
						value={view.constructorChampion?.team.name ?? "–"}
						detail={view.constructorChampion ? `${num(view.constructorChampion.points)} points` : null}
						onPress={view.constructorChampion ? () => go(href.team(view.constructorChampion!.team.id)) : undefined}
					/>
					<Stat label="Grands Prix" value={num(view.totals.races)} onPress={() => go("/seasons")} />
					<Stat label="Race winners" value={num(view.totals.winners)} onPress={() => go(href.record("drivers/wins/by-number"))} />
					<Stat label="Drivers" value={num(view.totals.drivers)} onPress={() => go("/drivers")} />
					<Stat label="Seasons" value={num(view.totals.seasons)} onPress={() => go("/seasons")} />
				</StatGrid>

				<Standings view={view} go={go} />
				{view.latestRace ? <LatestRace race={view.latestRace} go={go} facts={latestFacts} /> : null}
				{view.nextRace ? (
					<NextRace
						next={view.nextRace}
						go={go}
						facts={upcoming && upcoming.race.year === view.nextRace.race.year && upcoming.race.round === view.nextRace.race.round ? upcoming.facts : null}
					/>
				) : null}
				{view.titleFight ? <TitleFightSection fight={view.titleFight} year={view.lastYear} go={go} facts={seasonSoFar} /> : null}
				<Puzzles go={go} />
				<OnThisDay day={onThisDay} go={go} facts={dayFacts} />
				<MostWins view={view} go={go} />
				<MostTitles view={view} go={go} />
				{watch ? <MilestoneWatchSection watch={watch} go={go} /> : null}
				<Explore view={view} go={go} />
			</Page>
		</TabScreen>
	);
}
