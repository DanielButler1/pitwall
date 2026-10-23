import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import type { DriverTeammatesView, TeammateRow } from "@pitwall/core/f1/teammates";
import { Icon, Section, Text } from "@/components/ui";
import { DuelBar, MoreButton, sharePct, useMore } from "@/features/browse/kit";
import { num, yearRange } from "@/lib/format";
import { cn } from "@/lib/cn";

export const QUALI_NOTE = "Qualifying: the better qualifying classification, or grid position when either has none.";
export const RACE_NOTE = "Race: both started; the better classified finish, a classified finisher beats a retirement, and races where neither was classified don't count.";

const MateRow = memo(function MateRow({ row, name, last, onPress }: { row: TeammateRow; name: string; last: boolean; onPress(): void }) {
	return (
		<Pressable accessibilityRole="button" accessibilityLabel={`Head-to-head with ${row.driver.name}`} onPress={onPress} className="pl-4 pr-3 active:bg-accent">
			<View className={cn("gap-2 py-3", !last && "border-b border-border")}>
				<View className="flex-row items-center gap-2">
					<View className="flex-1">
						<Text variant="body" numberOfLines={1}>{row.driver.name}</Text>
						<Text variant="caption" numberOfLines={1}>
							{[row.teams.map((t) => t.name).join(", "), yearRange(row.firstYear, row.lastYear), `${row.races} ${row.races === 1 ? "race" : "races"}`].join(" · ")}
						</Text>
					</View>
					<View className="items-end">
						<Text variant="label" className="tabular-nums">{sharePct(row.points)}</Text>
						<Text variant="caption">points</Text>
					</View>
					<Icon icon={ChevronRight} tone="muted" size={17} />
				</View>
				<View className="flex-row items-center gap-3 pr-6">
					<Text variant="caption" className="w-3">Q</Text>
					<DuelBar a={row.quali.a} b={row.quali.b} numWidth={22} label={`Qualifying, ${name} against ${row.driver.name}`} />
					<Text variant="caption" className="w-3">R</Text>
					<DuelBar a={row.race.a} b={row.race.b} numWidth={22} label={`Finished ahead, ${name} against ${row.driver.name}`} />
				</View>
			</View>
		</Pressable>
	);
});

/** Every team-mate, with qualifying and race head-to-heads; each opens the pair screen. */
export function TeammatesSection({ view, onOpen }: { view: DriverTeammatesView; onOpen(mateId: string): void }) {
	const more = useMore(12, 50);
	if (!view.rows.length) return null;
	const t = view.totals;
	const rows = view.rows.slice(0, more.count);
	return (
		<Section title="Team-mates" description={`Head-to-heads in races for the same team, ${view.driver.name} first. Qualifying ${sharePct(t.quali)}, races ${sharePct(t.race)}, points ${sharePct(t.points)} (${num(t.points.a)} – ${num(t.points.b)}).`}>
			{rows.map((r, i) => (
				<MateRow key={r.driver.id} row={r} name={view.driver.name} last={i === rows.length - 1} onPress={() => onOpen(r.driver.id)} />
			))}
			<MoreButton shown={rows.length} total={view.rows.length} onPress={more.more} />
			<Text variant="caption" className="px-4 pt-3">{QUALI_NOTE} {RACE_NOTE}</Text>
		</Section>
	);
}
