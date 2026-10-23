// One race: where and when, the summary, then the race, sprint and qualifying results, the lap
// chart and the pit stops, one at a time. apps/web race.tsx in a phone form.

import { useLocalSearchParams } from "expo-router";
import { History, MapPin, Share2, Timer } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { raceView, type RaceView, type ResultRow } from "@pitwall/core/f1/views";
import { DetailScreen, Flag, Page, Stat, StatGrid } from "@/components/f1";
import { Badge, EmptyState, Icon, IconButton, Row, Section, Segmented, Text } from "@/components/ui";
import { useUniverseBase, useView } from "@/data/dataset";
import { cn } from "@/lib/cn";
import { fmtDate, num } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { LapChartPanel, PitStopsPanel } from "./components/LapPanels";
import { PrevNext } from "./components/PrevNext";
import { shareLink } from "./share";
import { PosCell } from "./components/PosCell";

type Tab = "race" | "sprint" | "qualifying" | "laps" | "pits";

const ResultLine = memo(function ResultLine({ r, fastest, open }: { r: ResultRow; fastest: RaceView["fastestLap"] | null; open(path: string): void }) {
	const pos = Number(r.position);
	const gained = r.grid != null && r.grid > 0 && pos > 0 ? r.grid - pos : null;
	const team = `${r.team.name}${r.engine && r.engine.name !== r.team.name ? ` · ${r.engine.name}` : ""}`;
	const real = r.realPosition != null && r.realPosition !== r.position && r.realPosition !== "–" ? `real ${r.realPosition} · ` : "";
	const label = [`${r.position}, ${r.driver.name}, ${r.team.name}`, r.timeOrStatus, r.points ? `${num(r.points)} points` : null, r.grid ? `from grid ${r.grid}` : null, r.fastestLap ? "fastest lap" : null].filter(Boolean).join(", ");
	return (
		<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => open(href.driver(r.driver.id))} className="flex-row items-center gap-3 pl-4 active:bg-accent">
			<PosCell text={r.position} />
			<View className="min-h-[56px] flex-1 flex-row items-center gap-3 border-b border-border py-2.5 pr-4">
				<View className="flex-1">
					<View className="flex-row items-center gap-1.5">
						<Text variant="body" numberOfLines={1} className="shrink font-semibold">
							{r.driver.name}
						</Text>
						{r.fastestLap ? <Icon icon={Timer} tone="primary" size={13} /> : null}
					</View>
					<Text variant="caption" numberOfLines={1}>
						{real}
						{team}
					</Text>
				</View>
				<View className="max-w-[96px] items-end">
					<Text variant="label" className="tabular-nums">
						{r.points ? num(r.points) : " "}
					</Text>
					<Text variant="caption" numberOfLines={1} className="tabular-nums">
						{r.timeOrStatus ?? ""}
					</Text>
				</View>
				<View className="w-11 items-end">
					<Text variant="caption" className="tabular-nums text-foreground">
						{r.grid ? r.grid : r.grid === 0 ? "Pit" : "–"}
					</Text>
					<Text variant="caption" className={cn("tabular-nums", gained && gained > 0 ? "text-success" : gained && gained < 0 ? "text-destructive" : "")}>
						{gained ? (gained > 0 ? `+${gained}` : `−${-gained}`) : " "}
					</Text>
				</View>
			</View>
		</Pressable>
	);
});

function ResultsList({ rows, fastest }: { rows: ResultRow[]; fastest: RaceView["fastestLap"] | null }) {
	const open = useOpen();
	return (
		<View>
			<View className="flex-row items-end gap-3 border-b border-border px-4 pb-1.5">
				<Text variant="caption" className="flex-1">
					Driver
				</Text>
				<Text variant="caption" className="text-right">
					Pts / time
				</Text>
				<Text variant="caption" className="w-11 text-right">
					Grid
				</Text>
			</View>
			{rows.map((r, i) => (
				<ResultLine key={r.driver.id + i} r={r} fastest={fastest} open={open} />
			))}
		</View>
	);
}

function Qualifying({ view }: { view: RaceView }) {
	const open = useOpen();
	const knockout = view.qualifying.some((q) => q.q1);
	return (
		<View>
			{view.qualifying.map((q, i, all) => {
				const best = q.q3 ?? q.q2 ?? q.q1 ?? q.time;
				const sessions = knockout ? [q.q1 && `Q1 ${q.q1}`, q.q2 && `Q2 ${q.q2}`, q.q3 && `Q3 ${q.q3}`].filter(Boolean).join(" · ") : null;
				return (
					<Row
						key={q.driver.id + i}
						leading={<PosCell text={q.position} />}
						title={q.driver.name}
						subtitle={[q.team.name, sessions].filter(Boolean).join("\n")}
						trailing={
							<Text variant="label" className="tabular-nums">
								{best ?? ""}
							</Text>
						}
						onPress={() => open(href.driver(q.driver.id))}
						last={i === all.length - 1}
					/>
				);
			})}
		</View>
	);
}

const spanText = (spans: [number, number][]) => spans.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");

function RaceContext({ view }: { view: RaceView }) {
	const open = useOpen();
	return (
		<>
			{view.lapsLed?.length ? (
				<Section title="Laps led">
					{view.lapsLed.map((l, i, all) => (
						<Row
							key={l.driver.id}
							title={l.driver.name}
							subtitle={`Laps ${spanText(l.spans)}`}
							trailing={
								<Text variant="label" className="tabular-nums">
									{l.laps}
								</Text>
							}
							onPress={() => open(href.driver(l.driver.id))}
							last={i === all.length - 1}
						/>
					))}
				</Section>
			) : null}
			{view.standingsAfter.drivers.length ? (
				<Section title="Drivers after this round">
					{view.standingsAfter.drivers.map((s, i, all) => (
						<Row
							key={s.driver.id}
							leading={<PosCell text={s.position} />}
							title={s.driver.name}
							trailing={
								<Text variant="label" className="tabular-nums">
									{num(s.points)}
								</Text>
							}
							onPress={() => open(href.driver(s.driver.id))}
							last={i === all.length - 1}
						/>
					))}
				</Section>
			) : null}
			{view.standingsAfter.constructors.length > 0 && view.race.year >= 1958 ? (
				<Section title="Constructors after this round">
					{view.standingsAfter.constructors.map((s, i, all) => (
						<Row
							key={s.team.id + i}
							leading={<PosCell text={s.position} />}
							title={s.team.name}
							trailing={
								<Text variant="label" className="tabular-nums">
									{num(s.points)}
								</Text>
							}
							onPress={() => open(href.team(s.team.id))}
							last={i === all.length - 1}
						/>
					))}
				</Section>
			) : null}
		</>
	);
}

const raceLabel = (r: { year: number; name: string }, year: number) => `${r.year !== year ? `${r.year} ` : ""}${r.name}`;

export function RaceScreen() {
	const params = useLocalSearchParams<{ year: string; round: string }>();
	const year = Number(params.year);
	const round = Number(params.round);
	const base = useUniverseBase();
	const view = useView((db) => raceView(db, year, round, base), [year, round, base]);
	const open = useOpen();
	const [tab, setTab] = useState<Tab>("race");
	if (!view) {
		return (
			<DetailScreen title="Race">
				<EmptyState title="No such race" body={`There's no round ${params.round ?? ""} in ${params.year ?? ""}.`} />
			</DetailScreen>
		);
	}
	const winner = view.results.find((r) => r.position === "1");
	const classified = view.results.filter((r) => /^\d+$/.test(r.position)).length;
	const path = href.race(view.race);
	const tabs: { value: Tab; label: string }[] = [
		{ value: "race", label: "Race" },
		...(view.sprint.length ? [{ value: "sprint" as const, label: "Sprint" }] : []),
		...(view.qualifying.length ? [{ value: "qualifying" as const, label: "Quali" }] : []),
		...(view.lapData?.chart ? [{ value: "laps" as const, label: "Laps" }] : []),
		...(view.lapData?.pitStops ? [{ value: "pits" as const, label: "Pits" }] : []),
	];
	const current = tabs.some((t) => t.value === tab) ? tab : "race";
	return (
		<DetailScreen
			title={`${view.race.year} season, round ${view.race.round}`}
			subtitle={fmtDate(view.race.date)}
			right={<IconButton icon={Share2} label="Share" onPress={() => shareLink(path, `${view.race.year} ${view.grandPrix.name}`)} />}
		>
			<Page>
				<View className="flex-row items-center gap-3 px-4 pt-1">
					<Flag code={view.race.country} className="text-[28px] leading-9" />
					<View className="flex-1">
						<Text variant="title" numberOfLines={2}>
							{view.grandPrix.name}
						</Text>
						<Text variant="caption" numberOfLines={2}>
							{view.officialName}
						</Text>
					</View>
				</View>
				{view.modified ? (
					<View className="flex-row px-4 pt-2">
						<Badge label="Altered result" tone="primary" />
					</View>
				) : null}
				<View className="mt-2">
					<Row icon={MapPin} title={view.circuit.name} subtitle={[view.circuit.place, view.nation?.name].filter(Boolean).join(", ")} onPress={() => open(href.circuit(view.circuit.id))} />
					<Row icon={History} title={`${view.grandPrix.name} history`} subtitle={`Every ${view.grandPrix.name}, year by year`} onPress={() => open(href.grandPrix(view.grandPrix.id))} last />
				</View>

				<StatGrid className="mt-3">
					<Stat label="Winner" value={winner ? winner.driver.name : "–"} detail={winner?.team.name} onPress={winner ? () => open(href.driver(winner.driver.id)) : undefined} />
					<Stat
						label="Fastest lap"
						value={view.fastestLap ? view.fastestLap.driver.name : "–"}
						detail={view.fastestLap ? [view.fastestLap.time, view.fastestLap.lap != null && `lap ${view.fastestLap.lap}`].filter(Boolean).join(" · ") : null}
						onPress={view.fastestLap ? () => open(href.driver(view.fastestLap!.driver.id)) : undefined}
					/>
					<Stat label="Laps" value={view.laps} detail={view.completed ? `${classified} classified` : null} />
					<Stat label="Distance" value={`${num(view.distance)} km`} detail={view.laps > 0 ? `${num(Math.round((view.distance / view.laps) * 1000) / 1000)} km a lap` : null} />
				</StatGrid>

				<PrevNext
					prev={view.prev ? { caption: "Previous race", label: raceLabel(view.prev, view.race.year), onPress: () => open(href.race(view.prev!)) } : null}
					next={view.next ? { caption: "Next race", label: raceLabel(view.next, view.race.year), onPress: () => open(href.race(view.next!)) } : null}
				/>

				{!view.completed ? (
					<EmptyState title="Not run yet" body={`The ${view.grandPrix.name} is on ${fmtDate(view.race.date)}. Results appear here after the race.`} />
				) : (
					<View className="mt-6">
						{tabs.length > 1 ? (
							<Segmented<Tab>
								className="mx-4 mb-3"
								value={current}
								options={tabs}
								onChange={(v) => {
									haptic("selection");
									setTab(v);
								}}
							/>
						) : null}
						{current === "race" ? (
							<>
								<ResultsList rows={view.results} fastest={view.fastestLap} />
								<RaceContext view={view} />
							</>
						) : current === "sprint" ? (
							<ResultsList rows={view.sprint} fastest={null} />
						) : current === "qualifying" ? (
							<Qualifying view={view} />
						) : current === "laps" ? (
							<LapChartPanel raceId={view.raceId} results={view.results} sprint={view.sprint} sprintAvailable={view.lapData?.sprintChart ?? false} highlight={winner ? [winner.driver.id] : []} />
						) : (
							<PitStopsPanel raceId={view.raceId} drivers={view.results.map((r) => r.driver)} />
						)}
					</View>
				)}

				<Section title="More">
					<Row title={`${view.race.year} season`} subtitle="Standings, calendar and results" onPress={() => open(href.season(view.race.year))} />
					{view.nation ? <Row title={view.nation.name} subtitle="Drivers, teams and races from this country" leading={<View className="w-7 items-center"><Flag code={view.nation.country} /></View>} onPress={() => open(href.nation(view.nation!.id))} /> : null}
					{view.tyres.map((t, i, all) => (
						<Row key={t.id} title={`${t.name} tyres`} leading={<View className="w-7 items-center"><Flag code={t.country} /></View>} onPress={() => open(href.tyre(t.id))} last={i === all.length - 1} />
					))}
				</Section>
			</Page>
		</DetailScreen>
	);
}
