import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { grandPrixView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { Badge, EmptyState, Row, Section, Text } from "@/components/ui";
import { InlineLink, MoreButton, Ranked, useMore } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

export function GrandPrixScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => grandPrixView(db, id), [id]);
	const open = useOpen();
	const editions = useMore(20, 50);
	if (!view) {
		return (
			<DetailScreen title="Grand Prix">
				<EmptyState title="No such Grand Prix" />
			</DetailScreen>
		);
	}
	const t = view.totals;
	const top = view.topDrivers[0];
	return (
		<DetailScreen title={view.gp.name} subtitle={t.firstYear ? yearRange(t.firstYear, t.lastYear) : "Not held yet"}>
			<Page>
				<View className="px-4 pb-1 pt-2">
					<View className="flex-row items-center gap-1.5">
						<Flag code={view.nation.country} />
						<InlineLink label={view.nation.name} onPress={() => open(href.nation(view.nation.id))} />
					</View>
					<Text variant="muted" className="mt-1">
						{t.races ? `Held ${plural(t.races, "time")} at ${plural(t.circuits, "circuit")}, won by ${plural(t.winners, "different driver")}.` : "Not held yet."}
					</Text>
				</View>
				<StatGrid className="mt-3">
					<Stat label="Races" value={t.races} />
					<Stat label="First held" value={t.firstYear ?? "–"} onPress={t.firstYear ? () => open(href.season(t.firstYear!)) : undefined} />
					<Stat label="Circuits" value={t.circuits} />
					<Stat label="Different winners" value={t.winners} />
					<Stat label={top ? `Most wins (${top.wins})` : "Most wins"} value={top ? top.driver.name : "–"} onPress={top ? () => open(href.driver(top.driver.id)) : undefined} />
				</StatGrid>
				<Section title="Every edition" description="Newest first.">
					{view.editions.slice(0, editions.count).map((e, i, shown) => (
						<Row
							key={`${e.race.year}-${e.race.round}`}
							leading={<Text variant="label" className="w-11 tabular-nums">{e.race.year}</Text>}
							title={e.winner?.name ?? (e.completed ? "No winner" : e.circuit.name)}
							subtitle={[e.winner ? e.team?.name : null, e.winner ? e.circuit.name : null].filter(Boolean).join(" · ")}
							trailing={e.completed ? undefined : <Badge label="Upcoming" />}
							onPress={() => open(href.race(e.race))}
							last={i === shown.length - 1}
						/>
					))}
					<MoreButton shown={editions.count} total={view.editions.length} onPress={editions.more} />
				</Section>
				<Section title="Most wins">
					<Ranked rows={view.topDrivers} title={(r) => r.driver.name} flag={(r) => r.driver.country} value={(r) => String(r.wins)} onPress={(r) => open(href.driver(r.driver.id))} />
				</Section>
				<Section title="Most wins by constructor">
					<Ranked rows={view.topTeams} title={(r) => r.team.name} flag={(r) => r.team.country} value={(r) => String(r.wins)} onPress={(r) => open(href.team(r.team.id))} />
				</Section>
				<Section title="Most wins by engine">
					<Ranked rows={view.topEngines} title={(r) => r.engine.name} flag={(r) => r.engine.country} value={(r) => String(r.wins)} onPress={(r) => open(href.engine(r.engine.id))} />
				</Section>
				<Section title="Circuits used">
					{view.circuits.map((c, i) => (
						<Row key={c.circuit.id} leading={<Flag code={c.circuit.country} />} title={c.circuit.name} subtitle={`${c.circuit.place} · ${yearRange(c.firstYear, c.lastYear)}`} value={plural(c.races, "race")} onPress={() => open(href.circuit(c.circuit.id))} last={i === view.circuits.length - 1} />
					))}
				</Section>
			</Page>
		</DetailScreen>
	);
}
