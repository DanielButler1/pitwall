// The season's results grid in a phone form: each driver is a row (position, name, teams, points)
// over a wrapping strip of small coloured cells, one per round in the same place for every driver,
// so a column still reads down the page. Tap a cell to open that race.

import { Trophy } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import type { MatrixCell, SeasonView } from "@pitwall/core/f1/views";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { flagEmoji, num, ordinal } from "@/lib/format";
import { href, useOpen } from "@/lib/links";
import { RESULT_TEXT } from "../names";
import { PosCell } from "./PosCell";

type Round = SeasonView["races"][number];
type Standing = SeasonView["driverStandings"][number];

const CELL = "h-[26px] w-[30px] items-center justify-center rounded-[4px]";
const CELLS = { flexDirection: "row", flexWrap: "wrap", gap: 3 } as const;

function cellClass(c: MatrixCell) {
	if (!c) return "bg-muted/30";
	const n = Number(c.text);
	if (n === 1) return "bg-gold/40";
	if (n === 2) return "bg-silver/40";
	if (n === 3) return "bg-bronze/40";
	if (c.points > 0) return "bg-points/25";
	if (n) return "bg-finished/20";
	if (["DNQ", "DNPQ", "DNP", "DNS"].includes(c.text)) return "bg-muted";
	return "bg-retired/20";
}

const shortText = (t: string) => ({ DNF: "Ret", DNPQ: "DPQ" })[t] ?? t;

function describe(c: MatrixCell, r: Round) {
	const where = `Round ${r.race.round}, ${r.race.name}`;
	if (!c) return `${where}: no entry`;
	const n = Number(c.text);
	return [where, n ? ordinal(n) : (RESULT_TEXT[c.text] ?? c.text), c.points > 0 && `${num(c.points)} points`, c.pole && "pole position", c.fastestLap && "fastest lap"].filter(Boolean).join(", ");
}

const DriverRow = memo(function DriverRow({ d, rounds, open }: { d: Standing; rounds: Round[]; open(path: string): void }) {
	return (
		<View className="border-b border-border px-4 py-2.5">
			<Pressable accessibilityRole="button" onPress={() => open(href.driver(d.driver.id))} className="flex-row items-center gap-3 active:opacity-70">
				<PosCell text={d.position} />
				<View className="flex-1">
					<View className="flex-row items-center gap-1.5">
						<Text variant="label" numberOfLines={1} className="shrink">
							{d.driver.name}
						</Text>
						{d.champion ? <Icon icon={Trophy} tone="gold" size={14} /> : null}
					</View>
					<Text variant="caption" numberOfLines={1}>
						{d.teams.map((t) => t.name).join(" / ")}
						{d.wins ? ` · ${d.wins} ${d.wins === 1 ? "win" : "wins"}` : ""}
					</Text>
				</View>
				<Text variant="label" className="tabular-nums">
					{num(d.points)}
				</Text>
			</Pressable>
			<View className="mt-2" style={CELLS}>
				{d.cells.map((c, i) => {
					const r = rounds[i]!;
					return (
						<Pressable key={i} accessibilityRole="button" accessibilityLabel={describe(c, r)} onPress={() => open(href.race(r.race))} hitSlop={2} className={cn(CELL, cellClass(c), "active:opacity-60")}>
							{c ? (
								<Text
									className={cn(
										"text-[11px] leading-[14px] tabular-nums text-foreground",
										Number(c.text) <= 3 && Number(c.text) > 0 && "font-semibold",
										!Number(c.text) && "text-[10px] text-muted-foreground",
										c.fastestLap && "italic",
										c.pole && "underline",
									)}
								>
									{shortText(c.text)}
								</Text>
							) : null}
						</Pressable>
					);
				})}
			</View>
		</View>
	);
});

const PAGE = 25;

export function ResultsMatrix({ view }: { view: SeasonView }) {
	const open = useOpen();
	const rounds = view.races.filter((r) => r.completed);
	const [shown, setShown] = useState(PAGE);
	const rows = view.driverStandings.slice(0, shown);
	return (
		<View>
			<Text variant="caption" className="px-4 pb-2">
				Each round&apos;s result, in calendar order. Underlined: pole position. Italic: fastest lap. Tap a result to open the race.
			</Text>
			<View className="flex-row flex-wrap gap-x-3 gap-y-1 px-4 pb-3">
				{[
					["bg-gold/40", "Win"],
					["bg-silver/40", "2nd"],
					["bg-bronze/40", "3rd"],
					["bg-points/25", "Points"],
					["bg-finished/20", "Finished"],
					["bg-retired/20", "Retired"],
					["bg-muted", "Didn't start"],
				].map(([bg, label]) => (
					<View key={label} className="flex-row items-center gap-1">
						<View className={cn("h-3 w-3 rounded-[3px]", bg)} />
						<Text variant="caption">{label}</Text>
					</View>
				))}
			</View>
			<View className="border-b border-border px-4 pb-2" style={CELLS} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
				{rounds.map((r) => (
					<View key={r.race.round} className={cn(CELL, "h-[30px]")}>
						<Text className="text-[11px] leading-[13px]">{flagEmoji(r.race.country)}</Text>
						<Text className="text-[9px] leading-[11px] text-muted-foreground tabular-nums">{r.race.round}</Text>
					</View>
				))}
			</View>
			{rows.map((d) => (
				<DriverRow key={d.driver.id} d={d} rounds={rounds} open={open} />
			))}
			{view.driverStandings.length > shown ? (
				<Button label={`Show all ${view.driverStandings.length} drivers`} variant="outline" size="sm" className="mx-4 mt-3" onPress={() => setShown(Infinity)} />
			) : null}
		</View>
	);
}
