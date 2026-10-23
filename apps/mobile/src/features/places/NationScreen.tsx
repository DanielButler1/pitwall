import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { nationView } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { Badge, EmptyState, Row, Section, Text } from "@/components/ui";
import { MoreButton, Note, TitleCount, useMore } from "@/features/browse/kit";
import { useView } from "@/data/dataset";
import { num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";

export function NationScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const view = useView((db) => nationView(db, id), [id]);
	const open = useOpen();
	const drivers = useMore(20, 50);
	const teams = useMore(20, 50);
	if (!view) {
		return (
			<DetailScreen title="Nation">
				<EmptyState title="No such nation" />
			</DetailScreen>
		);
	}
	const t = view.totals;
	const n = view.nation;
	const suppliers = [...view.engines.map((e) => ({ key: `e-${e.engine.id}`, ref: e.engine, badge: "Engine", firstYear: e.firstYear, lastYear: e.lastYear, races: e.races, wins: e.wins, path: href.engine(e.engine.id) })), ...view.tyres.map((e) => ({ key: `t-${e.tyre.id}`, ref: e.tyre, badge: "Tyres", firstYear: e.firstYear, lastYear: e.lastYear, races: e.races, wins: e.wins, path: href.tyre(e.tyre.id) }))];
	return (
		<DetailScreen title={n.name} subtitle={n.demonym ? `Nation · ${n.demonym}` : "Nation"}>
			<Page>
				<View className="flex-row items-center gap-3 px-4 pt-2">
					<Flag code={n.country} className="text-[34px] leading-[42px]" />
					{n.demonym ? <Text variant="muted" className="flex-1">{n.demonym}</Text> : null}
				</View>
				<StatGrid className="mt-3">
					<Stat label="Drivers" value={num(t.drivers)} />
					<Stat label="Champions" value={t.champions} />
					<Stat label="Drivers' titles" value={t.titles} />
					<Stat label="Race wins" value={num(t.wins)} />
					<Stat label="Podiums" value={num(t.podiums)} />
					<Stat label="Constructors" value={t.constructors} />
					<Stat label="Constructor wins" value={num(t.constructorWins)} />
					<Stat label="Races hosted" value={num(t.racesHosted)} />
				</StatGrid>
				<Section title={`${n.demonym ?? n.name} drivers`} description={view.drivers.length ? "Career totals, most successful first." : undefined}>
					{view.drivers.length ? (
						view.drivers.slice(0, drivers.count).map((d, i, shown) => (
							<Row
								key={d.driver.id}
								title={d.driver.name}
								subtitle={`${yearRange(d.firstYear, d.lastYear)} · ${plural(d.starts, "start")}`}
								value={d.wins ? plural(d.wins, "win") : null}
								trailing={d.titles ? <TitleCount n={d.titles} /> : undefined}
								onPress={() => open(href.driver(d.driver.id))}
								last={i === shown.length - 1}
							/>
						))
					) : (
						<Note>No driver of this nationality has entered a World Championship Grand Prix.</Note>
					)}
					<MoreButton shown={drivers.count} total={view.drivers.length} onPress={drivers.more} />
				</Section>
				{view.champions.length > 0 ? (
					<Section title="World Champions" action={<Badge label={String(view.champions.length)} />}>
						{view.champions.map((c, i) => (
							<Row key={c.year} leading={<Text variant="label" className="w-11 tabular-nums">{c.year}</Text>} title={c.driver.name} subtitle={c.team.name} onPress={() => open(href.driver(c.driver.id))} last={i === view.champions.length - 1} />
						))}
					</Section>
				) : null}
				{view.grandsPrix.length > 0 ? (
					<Section title="Grands Prix hosted">
						{view.grandsPrix.map((g, i) => (
							<Row key={g.gp.id} leading={<Flag code={g.gp.country} />} title={g.gp.name} subtitle={yearRange(g.firstYear, g.lastYear)} value={plural(g.races, "race")} onPress={() => open(href.grandPrix(g.gp.id))} last={i === view.grandsPrix.length - 1} />
						))}
					</Section>
				) : null}
				{view.circuits.length > 0 ? (
					<Section title="Circuits">
						{view.circuits.map((c, i) => (
							<Row key={c.circuit.id} title={c.circuit.name} subtitle={`${c.circuit.place} · ${yearRange(c.firstYear, c.lastYear)}`} value={plural(c.races, "race")} onPress={() => open(href.circuit(c.circuit.id))} last={i === view.circuits.length - 1} />
						))}
					</Section>
				) : null}
				{view.constructors.length > 0 ? (
					<Section title="Constructors">
						{view.constructors.slice(0, teams.count).map((c, i, shown) => (
							<Row
								key={c.team.id}
								title={c.team.name}
								subtitle={`${yearRange(c.firstYear, c.lastYear)} · ${plural(c.races, "race")}`}
								value={c.wins ? plural(c.wins, "win") : null}
								trailing={c.titles ? <TitleCount n={c.titles} /> : undefined}
								onPress={() => open(href.team(c.team.id))}
								last={i === shown.length - 1}
							/>
						))}
						<MoreButton shown={teams.count} total={view.constructors.length} onPress={teams.more} />
					</Section>
				) : null}
				{suppliers.length > 0 ? (
					<Section title="Engines and tyres">
						{suppliers.map((x, i) => (
							<Row
								key={x.key}
								title={x.ref.name}
								subtitle={`${yearRange(x.firstYear, x.lastYear)} · ${plural(x.races, "race")}`}
								value={x.wins ? plural(x.wins, "win") : null}
								trailing={<Badge label={x.badge} />}
								onPress={() => open(x.path)}
								last={i === suppliers.length - 1}
							/>
						))}
					</Section>
				) : null}
			</Page>
		</DetailScreen>
	);
}
