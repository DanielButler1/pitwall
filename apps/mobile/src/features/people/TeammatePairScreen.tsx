import { useLocalSearchParams } from "expo-router";
import { ArrowLeftRight, GitCompareArrows } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { teammatePairView, type PairSide, type TeammatePairView } from "@pitwall/core/f1/teammates";
import { DetailScreen, Page } from "@/components/f1";
import { Badge, Button, EmptyState, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { DuelBar, InlineLink, MoreButton, surname, useMore } from "@/features/browse/kit";
import { cn } from "@/lib/cn";
import { num, plural, yearRange } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { QUALI_NOTE, RACE_NOTE } from "./TeammatesSection";

type PairRace = TeammatePairView["races"][number];

const qualiText = (s: PairSide, basis: PairRace["qualiBasis"]) => {
	const v = basis === "grid" ? s.grid : (s.qualifying ?? s.grid);
	return v != null ? `${basis === "grid" ? "G" : "Q"}${v}` : "–";
};

function DuelLine({ label, a, b, decimals, width }: { label: string; a: number; b: number; decimals?: boolean; width: number }) {
	return (
		<View className="flex-row items-center gap-3 py-2">
			<Text variant="muted" className="w-32" numberOfLines={1}>{label}</Text>
			<DuelBar a={a} b={b} decimals={decimals} numWidth={width} label={label} />
		</View>
	);
}

/** One side of a race: finish on top (bold when ahead), qualifying under it. */
function SideCell({ s, race, side }: { s: PairSide; race: PairRace; side: "a" | "b" }) {
	return (
		<View className="w-[72px] items-end">
			<Text variant="small" className={cn("tabular-nums", race.finish === side ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.text}</Text>
			<Text variant="caption" className={cn("tabular-nums", race.quali === side && "font-semibold text-foreground", race.qualiBasis === "grid" && "italic")}>{qualiText(s, race.qualiBasis)}</Text>
		</View>
	);
}

const RaceRow = memo(function RaceRow({ r, multiTeam, last, onPress }: { r: PairRace; multiTeam: boolean; last: boolean; onPress(): void }) {
	return (
		<Pressable accessibilityRole="button" onPress={onPress} className="pl-4 pr-4 active:bg-accent">
			<View className={cn("flex-row items-center gap-2 py-2.5", !last && "border-b border-border")}>
				<View className="flex-1">
					<Text variant="body" numberOfLines={1}>{`${r.race.year} ${r.race.name}`}</Text>
					<Text variant="caption" numberOfLines={1}>{[multiTeam ? r.team.name : null, `${num(r.a.points)} – ${num(r.b.points)} pts`].filter(Boolean).join(" · ")}</Text>
				</View>
				<SideCell s={r.a} race={r} side="a" />
				<SideCell s={r.b} race={r} side="b" />
			</View>
		</Pressable>
	);
});

export function TeammatePairScreen() {
	const params = useLocalSearchParams<{ a: string; b: string }>();
	const a = decodeURIComponent(params.a);
	const b = decodeURIComponent(params.b);
	const view = useView((db) => teammatePairView(db, a, b), [a, b]);
	const open = useOpen();
	const races = useMore(25, 50);
	if (!view) return <DetailScreen title="Team-mates"><EmptyState title="Never team-mates" body="These two drivers never drove for the same team in the same race." /></DetailScreen>;

	const t = view.totals;
	const multiTeam = view.teams.length > 1;
	const figures = [t.quali, t.race, t.wins, t.podiums, t.poles].flatMap((d) => [String(d.a), String(d.b)]).concat(num(t.points.a), num(t.points.b));
	const width = Math.max(...figures.map((s) => s.length)) * 8 + 6;
	const allRaces = [...view.races].reverse();
	const shown = allRaces.slice(0, races.count);

	return (
		<DetailScreen title={`${surname(view.a.name)} vs ${surname(view.b.name)}`} subtitle="Team-mates">
			<Page>
				<View className="gap-2 px-4 pt-2">
					<Text variant="title">
						<Text variant="title" className="text-link" onPress={() => open(href.driver(view.a.id))} accessibilityRole="link">{view.a.name}</Text>
						<Text variant="title" className="font-normal text-muted-foreground"> vs </Text>
						<Text variant="title" className="text-link" onPress={() => open(href.driver(view.b.id))} accessibilityRole="link">{view.b.name}</Text>
					</Text>
					<View className="flex-row flex-wrap items-center gap-2">
						<Text variant="small">
							{view.teams.map((tm, i) => (
								<Text key={tm.id} variant="small">
									{i > 0 ? " · " : ""}
									<InlineLink label={tm.name} onPress={() => open(href.team(tm.id))} />
								</Text>
							))}
						</Text>
						<Badge label={yearRange(view.firstYear, view.lastYear)} />
					</View>
					<Text variant="muted">{plural(t.races, "race")} together.</Text>
					<View className="flex-row flex-wrap gap-2 pt-1">
						<Button label="Swap sides" icon={ArrowLeftRight} variant="outline" size="sm" onPress={() => open(href.teammates(view.b.id, view.a.id))} />
						<Button label="Compare careers" icon={GitCompareArrows} variant="outline" size="sm" onPress={() => open(`/compare?d=${view.a.id},${view.b.id}`)} />
					</View>
				</View>

				<Section title="Head-to-head">
					<View className="px-4">
						<View className="flex-row gap-3 pb-1">
							<View className="w-32" />
							<View className="flex-1 flex-row justify-between">
								<Text variant="caption" className="font-semibold text-foreground">{surname(view.a.name)}</Text>
								<Text variant="caption" className="font-semibold text-foreground">{surname(view.b.name)}</Text>
							</View>
						</View>
						<DuelLine label="Qualifying" a={t.quali.a} b={t.quali.b} width={width} />
						<DuelLine label="Finished ahead" a={t.race.a} b={t.race.b} width={width} />
						<DuelLine label="Points" a={t.points.a} b={t.points.b} decimals width={width} />
						<DuelLine label="Wins" a={t.wins.a} b={t.wins.b} width={width} />
						<DuelLine label="Podiums" a={t.podiums.a} b={t.podiums.b} width={width} />
						<DuelLine label="Poles" a={t.poles.a} b={t.poles.b} width={width} />
						<Text variant="caption" className="pt-2">
							{QUALI_NOTE}
							{t.gridDecided ? ` ${t.gridDecided} decided on grid position.` : ""} {RACE_NOTE} Points: race and sprint points at the shared weekends.
						</Text>
					</View>
				</Section>

				<Section title="Season by season">
					{view.seasons.map((s, i) => (
						<Pressable key={s.year} accessibilityRole="button" accessibilityLabel={`${s.year} season`} onPress={() => open(href.season(s.year))} className="pl-4 pr-4 active:bg-accent">
							<View className={cn("gap-2 py-3", i < view.seasons.length - 1 && "border-b border-border")}>
								<View className="flex-row items-baseline gap-3">
									<Text variant="label" className="w-11 tabular-nums">{s.year}</Text>
									<Text variant="caption" className="flex-1" numberOfLines={1}>{[plural(s.races, "race"), multiTeam ? s.teams.map((x) => x.name).join(", ") : null].filter(Boolean).join(" · ")}</Text>
									<Text variant="small" className="tabular-nums">{`${num(s.points.a)} – ${num(s.points.b)} pts`}</Text>
								</View>
								<View className="flex-row items-center gap-3">
									<Text variant="caption" className="w-3">Q</Text>
									<DuelBar a={s.quali.a} b={s.quali.b} numWidth={22} label={`Qualifying ${s.year}`} />
									<Text variant="caption" className="w-3">R</Text>
									<DuelBar a={s.race.a} b={s.race.b} numWidth={22} label={`Finished ahead ${s.year}`} />
								</View>
								{s.wins.a || s.wins.b ? <Text variant="caption">{`Wins ${s.wins.a} – ${s.wins.b}`}</Text> : null}
							</View>
						</Pressable>
					))}
				</Section>

				<Section title="Race by race" description="Newest first. Bold: ahead in that duel. Q: qualifying position; G (italic): decided on grid position.">
					<View className="flex-row justify-end gap-2 px-4 pb-1">
						<Text variant="caption" className="w-[72px] text-right font-semibold text-foreground" numberOfLines={1} adjustsFontSizeToFit>{surname(view.a.name)}</Text>
						<Text variant="caption" className="w-[72px] text-right font-semibold text-foreground" numberOfLines={1} adjustsFontSizeToFit>{surname(view.b.name)}</Text>
					</View>
					{shown.map((r, i) => (
						<RaceRow key={`${r.race.year}-${r.race.round}`} r={r} multiTeam={multiTeam} last={i === shown.length - 1} onPress={() => open(href.race(r.race))} />
					))}
					<MoreButton shown={shown.length} total={allRaces.length} onPress={races.more} />
				</Section>
			</Page>
		</DetailScreen>
	);
}
