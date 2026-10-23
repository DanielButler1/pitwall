import { useLocalSearchParams } from "expo-router";
import { driverView } from "@pitwall/core/f1/views";
import { DetailScreen, Page, Stat, StatGrid } from "@/components/f1";
import { EmptyState, Section, Row } from "@/components/ui";
import { useView } from "@/data/dataset";
import { num, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

export function DriverScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => driverView(db, id), [id]);
	const open = useOpen();
	if (!view) return <DetailScreen title="Driver"><EmptyState title="No such driver" /></DetailScreen>;
	const t = view.totals;
	return (
		<DetailScreen title={view.driver.name} subtitle={`${view.nation.name} · ${yearRange(view.seasons[0]?.year, view.seasons.at(-1)?.year)}`}>
			<Page>
				<StatGrid className="mt-2">
					<Stat label="Titles" value={t.titles} />
					<Stat label="Wins" value={t.wins} />
					<Stat label="Podiums" value={t.podiums} />
					<Stat label="Poles" value={t.poles} />
					<Stat label="Starts" value={t.starts} />
					<Stat label="Points" value={num(t.points)} />
				</StatGrid>
				<Section title="Season by season">
					{[...view.seasons].reverse().map((s, i, all) => (
						<Row key={s.year} title={String(s.year)} subtitle={s.teams.map((x) => x.name).join(" / ")} value={s.position ? `P${s.position} · ${num(s.points)} pts` : `${num(s.points)} pts`} onPress={() => open(href.season(s.year))} last={i === all.length - 1} />
					))}
				</Section>
			</Page>
		</DetailScreen>
	);
}
