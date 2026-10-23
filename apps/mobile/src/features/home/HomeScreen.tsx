import { homeView } from "@pitwall/core/f1/views";
import { Flag, Page, Pos, Stat, StatGrid, TabScreen } from "@/components/f1";
import { Row, Section } from "@/components/ui";
import { datasetStore, refreshDataset, useView } from "@/data/dataset";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

export function HomeScreen() {
	const view = useView((db) => homeView(db), []);
	const state = datasetStore.use();
	const open = useOpen();
	return (
		<TabScreen title="Pitwall" subtitle={`Formula 1 statistics, 1950–${view.lastYear}`}>
			<Page refreshing={state.status === "ready" && state.checking} onRefresh={() => void refreshDataset()}>
				<StatGrid className="mt-2">
					<Stat label={`${view.lastYear} ${view.inProgress ? "leader" : "champion"}`} value={view.champion?.driver.name ?? "–"} onPress={view.champion ? () => open(href.driver(view.champion!.driver.id)) : undefined} />
					<Stat label="Grands Prix" value={num(view.totals.races)} />
				</StatGrid>
				{view.latestRace ? (
					<Section title="Latest race" description={`${view.latestRace.race.year} ${view.latestRace.race.name}`}>
						{view.latestRace.top.slice(0, 10).map((r, i, all) => (
							<Row key={r.driver.id} leading={<Pos text={r.position} />} title={r.driver.name} subtitle={r.team.name} value={r.time ?? undefined} trailing={<Flag code={r.driver.country} />} onPress={() => open(href.driver(r.driver.id))} last={i === all.length - 1} />
						))}
					</Section>
				) : null}
			</Page>
		</TabScreen>
	);
}
