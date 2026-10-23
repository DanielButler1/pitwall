// Compare (/compare?d=a,b or ?t=x,y): two to four drivers or constructors side by side. The picks
// live in the route's params, so a website link opens the same comparison.

import { router, useLocalSearchParams } from "expo-router";
import { GitCompareArrows, Plus, Trophy, Users, X } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { COMPARE_MAX, compareQuery, compareView, type CompareEntity, type CompareTotals, type CompareView, type Snapshot } from "@pitwall/core/f1/compare";
import { DetailScreen, Flag, Page } from "@/components/f1";
import { Chip, EmptyState, Icon, Row, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { ComparePicker } from "./ComparePicker";
import { ProgressChart } from "./CompareChart";
import { COMPARE_COLORS, nameOf, shortName } from "./compare-colors";
import { Choice, Note } from "./kit";

type Kind = "driver" | "team";

const SUGGESTIONS: Record<Kind, [string, string][]> = {
	driver: [
		["ayrton-senna,alain-prost", "Senna vs Prost"],
		["lewis-hamilton,max-verstappen", "Hamilton vs Verstappen"],
		["michael-schumacher,lewis-hamilton", "Schumacher vs Hamilton"],
		["fernando-alonso,sebastian-vettel,kimi-raikkonen", "Alonso vs Vettel vs Räikkönen"],
	],
	team: [
		["ferrari,mclaren", "Ferrari vs McLaren"],
		["mercedes,red-bull", "Mercedes vs Red Bull"],
		["williams,lotus,brabham", "Williams vs Lotus vs Brabham"],
	],
};

type Metric = { label: string; value: (t: CompareTotals) => number | null; fmt?: (n: number) => string; lowerIsBetter?: boolean };
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function metrics(kind: Kind): Metric[] {
	return [
		{ label: "Titles", value: (t) => t.titles },
		{ label: "Wins", value: (t) => t.wins },
		{ label: "Podiums", value: (t) => t.podiums },
		{ label: "Poles", value: (t) => t.poles },
		{ label: "Fastest laps", value: (t) => t.fastestLaps },
		{ label: kind === "driver" ? "Starts" : "Races", value: (t) => t.starts },
		{ label: "Points", value: (t) => t.points },
		{ label: "Win %", value: (t) => t.winRate, fmt: pct },
		{ label: "Podium %", value: (t) => t.podiumRate, fmt: pct },
		{ label: "Seasons", value: (t) => t.seasons },
		{ label: "Best result", value: (t) => t.bestChampionship, fmt: (n) => `P${n}`, lowerIsBetter: true },
	];
}

/** The leaders of a row (ties share it); none when everyone is level. */
function leaders(values: (number | null)[], lowerIsBetter = false) {
	const xs = values.filter((v): v is number => v != null);
	if (xs.length < 2) return new Set<number>();
	const best = lowerIsBetter ? Math.min(...xs) : Math.max(...xs);
	if (xs.every((x) => x === best)) return new Set<number>();
	return new Set(values.flatMap((v, i) => (v === best ? [i] : [])));
}

export function CompareScreen() {
	const params = useLocalSearchParams<{ d?: string; t?: string }>();
	const { kind, ids } = compareQuery(params);
	const key = ids.join(",");
	const view = useView((db) => compareView(db, kind, ids), [kind, key]);
	const open = useOpen();
	const [picking, setPicking] = useState(false);
	const go = (k: Kind, next: string[]) => router.setParams(k === "driver" ? { d: next.join(","), t: undefined } : { t: next.join(","), d: undefined });
	const es = view.entities;
	const title = es.length >= 2 ? es.map((e) => shortName(e)).join(" vs ") : "Compare";

	return (
		<DetailScreen title={title} subtitle={kind === "driver" ? "Compare drivers" : "Compare constructors"}>
			<Page>
				<Choice
					className="mt-1"
					value={kind}
					onChange={(k) => go(k, [])}
					options={[
						{ value: "driver", label: "Drivers" },
						{ value: "team", label: "Constructors" },
					]}
				/>
				<Text variant="muted" className="px-4 pt-3">
					{`Pick two to four ${kind === "driver" ? "drivers" : "constructors"} to put their careers side by side.`}
					{view.unknown.length ? ` Not found: ${view.unknown.join(", ")}.` : ""}
				</Text>

				<Section className="mt-3">
					{es.map((e, i) => (
						<Row
							key={e.id}
							leading={
								<View className="w-7 flex-row items-center gap-1">
									<View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPARE_COLORS[i] }} />
									<Flag code={e.driver?.country ?? e.team?.country} className="text-[13px]" />
								</View>
							}
							title={nameOf(e)}
							subtitle={e.totals.firstYear ? `${e.totals.firstYear}–${e.totals.lastYear}` : null}
							chevron={false}
							onPress={() => open(e.driver ? href.driver(e.id) : href.team(e.id))}
							trailing={
								<Pressable accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(e)}`} hitSlop={12} onPress={() => go(kind, ids.filter((x) => x !== e.id))} className="h-9 w-9 items-center justify-center rounded-full active:bg-accent">
									<Icon icon={X} tone="muted" size={18} />
								</Pressable>
							}
							last={es.length >= COMPARE_MAX && i === es.length - 1}
						/>
					))}
					{es.length < COMPARE_MAX ? <Row icon={Plus} title={kind === "driver" ? "Add a driver" : "Add a constructor"} chevron={false} onPress={() => setPicking(true)} last /> : null}
				</Section>

				{es.length < 2 ? (
					<>
						<EmptyState
							icon={kind === "driver" ? GitCompareArrows : Users}
							title={es.length ? `Add another ${kind === "driver" ? "driver" : "constructor"}` : `Choose ${kind === "driver" ? "drivers" : "constructors"} to compare`}
							body="Or start from one of these:"
							className="pb-4"
						/>
						<View className="flex-row flex-wrap justify-center gap-2 px-4">
							{SUGGESTIONS[kind].map(([list, label]) => (
								<Chip key={list} label={label} onPress={() => go(kind, list.split(","))} />
							))}
						</View>
					</>
				) : (
					<Comparison view={view} onOpen={open} />
				)}
			</Page>
			<ComparePicker
				kind={kind}
				visible={picking}
				taken={ids}
				onClose={() => setPicking(false)}
				onPick={(id) => {
					setPicking(false);
					go(kind, [...ids, id]);
				}}
			/>
		</DetailScreen>
	);
}

function Comparison({ view, onOpen }: { view: CompareView; onOpen(path: string): void }) {
	const { kind, entities: es } = view;
	const unit = kind === "driver" ? "starts" : "races";
	return (
		<>
			<Section title="Career" description="Leader in each row highlighted.">
				<Table entities={es}>
					<TableRow label="Years" values={es.map((e) => (e.totals.firstYear ? (e.totals.lastYear !== e.totals.firstYear ? `${e.totals.firstYear}–${String(e.totals.lastYear).slice(es.length > 2 ? 2 : 0)}` : String(e.totals.firstYear)) : "–"))} />
					{metrics(kind).map((m) => {
						const values = es.map((e) => m.value(e.totals));
						const lead = leaders(values, m.lowerIsBetter);
						return <TableRow key={m.label} label={m.label} values={values.map((v) => (v == null ? "–" : m.fmt ? m.fmt(v) : num(v)))} lead={lead} />;
					})}
					<TableRow label="Title years" values={es.map((e) => (e.titleYears.length ? (e.titleYears.length > 3 ? `${e.titleYears.slice(0, 2).join(", ")} +${e.titleYears.length - 2}` : e.titleYears.join(", ")) : "–"))} small />
					<TableRow label="Debut" values={es.map((e) => (e.firstRace ? `${e.firstRace.year} ${es.length > 2 ? "" : e.firstRace.name}`.trim() : "–"))} small />
				</Table>
				<Note>Points as awarded at the time, sprints included.{kind === "team" ? " Podiums count every podium finish by the team's cars." : ""}</Note>
			</Section>

			{view.sameAge ? (
				<Section title="At the same age" description={`Everyone at ${view.sameAge.label}, the youngest age any of them reached at their last start. Titles count once the season had ended.`}>
					<SnapshotTable entities={es} rows={view.sameAge.rows} kind={kind} />
				</Section>
			) : null}
			{view.afterStarts ? (
				<Section title={`After ${num(view.afterStarts.n)} ${unit}`} description={`Everyone over their first ${num(view.afterStarts.n)} ${unit}, the shortest career here.`}>
					<SnapshotTable entities={es} rows={view.afterStarts.rows} kind={kind} skip="starts" />
				</Section>
			) : null}

			<Section title="Progression">
				<ProgressChart entities={es} kind={kind} />
			</Section>

			{view.h2h.length ? (
				<Section
					title="Head-to-head"
					description={
						kind === "driver"
							? "Races both started. Better classified finish counts; a classified finisher beats a retirement; races where neither was classified don't count."
							: "Races both entered, by each team's best-placed car."
					}
				>
					{view.h2h.map((h, i) => {
						const a = es.find((e) => e.id === h.a)!;
						const b = es.find((e) => e.id === h.b)!;
						return (
							<View key={`${h.a}-${h.b}`} className={cn("mx-4 gap-2 py-3", i < view.h2h.length - 1 && "border-b border-border")}>
								<View className="flex-row items-baseline">
									<Text variant="label" className="flex-1" numberOfLines={1}>{shortName(a)}</Text>
									<Text variant="caption" className="px-2">vs</Text>
									<Text variant="label" className="flex-1 text-right" numberOfLines={1}>{shortName(b)}</Text>
								</View>
								<DuelBar a={h.aAhead} b={h.bAhead} label={`${nameOf(a)} ahead ${h.aAhead}, ${nameOf(b)} ahead ${h.bAhead}`} />
								<View className="flex-row justify-between">
									<Text variant="caption" className="tabular-nums">{`${num(h.races)} ${kind === "driver" ? "races together" : "races against"}`}</Text>
									{kind === "driver" && h.teammateRaces ? (
										<Pressable accessibilityRole="link" hitSlop={10} onPress={() => onOpen(href.teammates(h.a, h.b))}>
											<Text variant="caption" className="text-link tabular-nums">{`${num(h.teammateRaces)} races as team-mates`}</Text>
										</Pressable>
									) : null}
								</View>
							</View>
						);
					})}
				</Section>
			) : null}

			<Section title="Best seasons" description="By championship position, then wins." />
			{es.map((e, i) => (
				<Section key={e.id} className="mt-3">
					<EntityHead e={e} i={i} />
					{e.bestSeasons.map((s, j) => (
						<Row
							key={s.year}
							leading={<Text variant="label" className="w-12 tabular-nums" numberOfLines={1}>{s.year}</Text>}
							title={`${s.position ? `P${s.position}` : "–"} · ${s.wins} win${s.wins === 1 ? "" : "s"} · ${num(s.points)} pts`}
							subtitle={s.teams[0]?.name}
							trailing={s.position === 1 ? <Icon icon={Trophy} tone="gold" size={16} /> : undefined}
							onPress={() => onOpen(href.season(s.year))}
							last={j === e.bestSeasons.length - 1}
						/>
					))}
				</Section>
			))}
		</>
	);
}

function EntityHead({ e, i }: { e: CompareEntity; i: number }) {
	return (
		<View className="mb-1 flex-row items-center gap-2 px-4">
			<View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPARE_COLORS[i] }} />
			<Text variant="heading" numberOfLines={1}>{nameOf(e)}</Text>
		</View>
	);
}

/** Label column, then one value column per entity, headed by its surname underlined in its colour. */
function Table({ entities, children }: { entities: CompareEntity[]; children: ReactNode }) {
	return (
		<View className="px-4">
			<View className="flex-row items-end gap-2 border-b border-border pb-2 pt-1">
				<View className="w-24" />
				{entities.map((e, i) => (
					<View key={e.id} className="flex-1 items-end">
						<Text variant="caption" className="text-right font-semibold text-foreground" numberOfLines={1} adjustsFontSizeToFit>{shortName(e)}</Text>
						<View className="mt-1 h-0.5 w-full rounded-full" style={{ backgroundColor: COMPARE_COLORS[i] }} />
					</View>
				))}
			</View>
			{children}
		</View>
	);
}

function TableRow({ label, values, lead, small }: { label: string; values: string[]; lead?: Set<number>; small?: boolean }) {
	return (
		<View className="flex-row items-center gap-2 border-b border-border py-1.5">
			<Text variant="muted" className="w-24" numberOfLines={1}>{label}</Text>
			{values.map((v, i) => (
				<View key={i} className={cn("flex-1 items-end rounded-md px-1 py-1", lead?.has(i) && "bg-gold/15")}>
					<Text variant={small ? "caption" : "small"} className={cn("text-right tabular-nums", small ? "text-foreground" : "", lead?.has(i) && "font-semibold")} numberOfLines={2}>{v}</Text>
				</View>
			))}
		</View>
	);
}

const SNAP: { label: string; key: keyof Snapshot }[] = [
	{ label: "Starts", key: "starts" },
	{ label: "Titles", key: "titles" },
	{ label: "Wins", key: "wins" },
	{ label: "Podiums", key: "podiums" },
	{ label: "Poles", key: "poles" },
	{ label: "Points", key: "points" },
];

function SnapshotTable({ entities, rows, kind, skip }: { entities: CompareEntity[]; rows: Snapshot[]; kind: Kind; skip?: keyof Snapshot }) {
	return (
		<Table entities={entities}>
			{SNAP.filter((s) => s.key !== skip).map((s) => {
				const values = rows.map((r) => r[s.key]);
				return <TableRow key={s.key} label={s.key === "starts" && kind === "team" ? "Races" : s.label} values={values.map(num)} lead={leaders(values)} />;
			})}
		</Table>
	);
}

function DuelBar({ a, b, label }: { a: number; b: number; label: string }) {
	const total = a + b;
	return (
		<View accessible accessibilityLabel={label} className="flex-row items-center gap-2">
			<Text variant="small" className={cn("min-w-8 tabular-nums", a > b && "font-semibold")}>{a}</Text>
			<View className="h-2 flex-1 flex-row gap-0.5">
				{total > 0 ? (
					<>
						{a > 0 ? <View className="h-full rounded-l-full bg-primary" style={{ flex: a }} /> : null}
						{b > 0 ? <View className="h-full rounded-r-full bg-muted-foreground/35" style={{ flex: b }} /> : null}
					</>
				) : (
					<View className="h-full flex-1 rounded-full bg-muted" />
				)}
			</View>
			<Text variant="small" className={cn("min-w-8 text-right tabular-nums", b > a && "font-semibold")}>{b}</Text>
		</View>
	);
}

