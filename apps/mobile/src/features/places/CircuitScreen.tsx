import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { circuitView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { EmptyState, Fact, Row, Section, Text } from "@/components/ui";
import { InlineLink, MoreButton, Ranked, surname, useMore, words } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

export function CircuitScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => circuitView(db, id), [id]);
	const open = useOpen();
	const races = useMore(20, 50);
	if (!view) {
		return (
			<DetailScreen title="Circuit">
				<EmptyState title="No such circuit" />
			</DetailScreen>
		);
	}
	const c = view.circuit;
	const multiGp = view.grandsPrix.length > 1;
	const first = view.races.at(-1)?.race.year;
	const last = view.races[0]?.race.year;
	return (
		<DetailScreen title={c.name} subtitle={`${c.place}${c.place !== view.nation.name ? `, ${view.nation.name}` : ""}`}>
			<Page>
				<View className="px-4 pb-1 pt-2">
					<View className="flex-row flex-wrap items-center gap-x-1.5">
						<Flag code={view.nation.country} />
						<Text variant="small">{c.place}</Text>
						{c.place !== view.nation.name ? (
							<>
								<Text variant="small">·</Text>
								<InlineLink label={view.nation.name} onPress={() => open(href.nation(view.nation.id))} />
							</>
						) : null}
					</View>
					{c.fullName !== c.name ? <Text variant="muted" className="mt-1">{c.fullName}</Text> : null}
				</View>
				<StatGrid className="mt-3">
					<Stat label="Grands Prix" value={view.races.length} />
					<Stat label="Length" value={c.length ? `${num(c.length)} km` : "–"} />
					<Stat label="Turns" value={c.turns || "–"} />
					<Stat label="Direction" value={words(c.direction)} />
				</StatGrid>
				<Section title="Facts">
					<Fact label="Type" value={c.type === "RACE" ? "Race circuit" : words(c.type)} />
					<Fact label="Years" value={yearRange(first, last)} last />
				</Section>
				<Section title="Races held" description={view.races.length ? "Newest first." : undefined}>
					{view.races.length ? (
						view.races.slice(0, races.count).map((r, i, shown) => (
							<Row
								key={`${r.race.year}-${r.race.round}`}
								leading={<Text variant="label" className="w-11 tabular-nums">{r.race.year}</Text>}
								title={r.winner ? r.winner.name : multiGp ? r.race.name : "No winner"}
								subtitle={[multiGp && r.winner ? r.grandPrix.name : null, r.team?.name, r.pole ? `Pole ${surname(r.pole.name)}` : null].filter(Boolean).join(" · ")}
								onPress={() => open(href.race(r.race))}
								last={i === shown.length - 1}
							/>
						))
					) : (
						<Text variant="muted" className="px-4 py-2">No Grand Prix held here yet.</Text>
					)}
					<MoreButton shown={races.count} total={view.races.length} onPress={races.more} />
				</Section>
				{view.grandsPrix.length > 0 ? (
					<Section title="Grands Prix held here">
						{view.grandsPrix.map((g, i) => (
							<Row key={g.gp.id} leading={<Flag code={g.gp.country} />} title={g.gp.name} subtitle={yearRange(g.firstYear, g.lastYear)} value={plural(g.races, "race")} onPress={() => open(href.grandPrix(g.gp.id))} last={i === view.grandsPrix.length - 1} />
						))}
					</Section>
				) : null}
				<Section title="Most wins">
					<Ranked rows={view.topDrivers} title={(r) => r.driver.name} flag={(r) => r.driver.country} value={(r) => String(r.wins)} onPress={(r) => open(href.driver(r.driver.id))} />
				</Section>
				<Section title="Most wins by constructor">
					<Ranked rows={view.topTeams} title={(r) => r.team.name} flag={(r) => r.team.country} value={(r) => String(r.wins)} onPress={(r) => open(href.team(r.team.id))} />
				</Section>
			</Page>
		</DetailScreen>
	);
}
