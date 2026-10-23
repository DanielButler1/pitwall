// The title fight round by round (the website's season-chart): points after each round as the
// table stood then, the gap to the leader, or the position; up to three lines highlighted.

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import type { ProgressionSeries, ProgressionTable, SeasonProgression } from "@pitwall/core/f1/progression";
import { niceTicks } from "@/components/charts";
import { Segmented, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { flagEmoji, num } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { behind } from "../names";
import { HIGHLIGHTS, HighlightChart, toggleSlot, useHighlightColours, type ChartLine } from "./HighlightChart";

type Mode = "points" | "gap" | "position";
type Kind = "drivers" | "constructors";

function valueOf(t: ProgressionTable, s: ProgressionSeries, i: number, mode: Mode) {
	if (mode === "position") return s.positions[i] ?? null;
	const p = s.points[i];
	if (p == null) return null;
	return mode === "gap" ? Math.round((p - t.leader[i]!) * 100) / 100 : p;
}

/** Every few rounds, always the first and last. */
function roundTicks(count: number) {
	if (count <= 1) return [0];
	const every = Math.max(1, Math.ceil(count / 6));
	const out: number[] = [];
	for (let i = 0; i < count - 1; i += every) out.push(i);
	if (count - 1 - (out.at(-1) ?? 0) < every / 2) out.pop();
	out.push(count - 1);
	return out;
}

function Chart({ table, rounds, mode, team }: { table: ProgressionTable; rounds: SeasonProgression["rounds"]; mode: Mode; team: boolean }) {
	const colours = useHighlightColours();
	const open = useOpen();
	const [slots, setSlots] = useState<(string | null)[]>(() => table.series.slice(0, HIGHLIGHTS).map((s) => s.key));
	const colourOf = (key: string) => {
		const i = slots.indexOf(key);
		return i >= 0 ? colours[i]! : null;
	};

	// surnames, with an initial where two drivers share one
	const shortOf = useMemo(() => {
		const count = new Map<string, number>();
		for (const s of table.series) count.set(s.short, (count.get(s.short) ?? 0) + 1);
		return new Map(table.series.map((s) => [s.key, s.driver && (count.get(s.short) ?? 0) > 1 ? `${s.label[0]}. ${s.short}` : s.short]));
	}, [table]);

	const lines: ChartLine[] = useMemo(
		() => table.series.map((s) => ({ key: s.key, values: rounds.map((_, i) => valueOf(table, s, i, mode)), colour: colourOf(s.key), label: shortOf.get(s.key) })),
		// colourOf reads slots and colours
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[table, rounds, mode, slots, colours, shortOf],
	);

	const values = lines.flatMap((l) => l.values).filter((v): v is number => v != null);
	let domain: [number, number];
	let ticks: number[];
	if (mode === "position") {
		const field = Math.max(table.series.length, ...values);
		domain = [1, field];
		ticks = [1, ...Array.from({ length: Math.floor(field / 5) }, (_, k) => (k + 1) * 5).filter((t) => t <= field)];
	} else if (mode === "gap") {
		const down = niceTicks(Math.max(1, -Math.min(0, ...values)));
		ticks = down.map((t) => -t);
		domain = [ticks.at(-1)!, 0];
	} else {
		ticks = niceTicks(Math.max(1, ...values));
		domain = [0, ticks.at(-1)!];
	}
	const yFormat = (v: number) => (mode === "position" ? `P${v}` : mode === "gap" ? behind(v) : num(v));
	const xTicks = useMemo(() => roundTicks(rounds.length), [rounds.length]);

	const ranked = (i: number) =>
		table.series.filter((s) => s.points[i] != null).sort((a, b) => (a.positions[i] ?? 999) - (b.positions[i] ?? 999) || (b.points[i] ?? 0) - (a.points[i] ?? 0));

	return (
		<View>
			<View className="px-2">
			<HighlightChart
				count={rounds.length}
				lines={lines}
				domain={domain}
				reversed={mode === "position"}
				ticks={ticks}
				yFormat={yFormat}
				xLabel={(i) => String(rounds[i]?.round ?? "")}
				xTicks={xTicks}
				height={300}
				label={`Championship ${mode === "position" ? "positions" : mode === "gap" ? "gaps to the leader" : "points"} after each of ${rounds.length} rounds`}
				describe={(i) =>
					`After round ${rounds[i]!.round}, ${rounds[i]!.name}: ${ranked(i)
						.slice(0, 5)
						.map((s) => `${s.positions[i] != null ? `P${s.positions[i]}` : ""} ${s.label} ${num(s.points[i] ?? 0)}`)
						.join(", ")}`
				}
				readout={(i) => {
					const r = rounds[i]!;
					return (
						<>
							<Text variant="caption" numberOfLines={1} className="mb-1 font-semibold text-foreground">
								{`${flagEmoji(r.country)} Round ${r.round} · ${r.name}`}
							</Text>
							{ranked(i).map((s) => {
								const colour = colourOf(s.key);
								const gap = (s.points[i] ?? 0) - table.leader[i]!;
								return (
									<View key={s.key} className="flex-row items-center gap-1.5">
										<Text variant="caption" numberOfLines={1} className="w-8 text-right tabular-nums">
											{s.positions[i] != null ? `P${s.positions[i]}` : "–"}
										</Text>
										<View className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: colour ?? "transparent" }} />
										<Text variant="caption" numberOfLines={1} className={cn("shrink", colour ? "font-semibold text-foreground" : "")}>
											{shortOf.get(s.key)}
										</Text>
										<Text variant="caption" className="ml-auto pl-2 tabular-nums text-foreground">
											{num(s.points[i] ?? 0)}
										</Text>
										<Text variant="caption" className="w-9 text-right tabular-nums">
											{gap < 0 ? behind(Math.round(gap * 100) / 100) : ""}
										</Text>
									</View>
								);
							})}
						</>
					);
				}}
			/>
			</View>
			<Text variant="caption" className="mt-3 px-4">
				{mode === "points" && "Championship points after each round, as the table stood then (dropped scores applied)."}
				{mode === "gap" && "Points behind the championship leader after each round."}
				{mode === "position" && "Championship position after each round."}
				{` Tap up to ${HIGHLIGHTS} ${team ? "teams" : "drivers"} to highlight them, hold one to open it; hold the chart to read each round.`}
			</Text>
			<View className="mt-2 flex-row flex-wrap gap-2 px-4">
				{table.series.map((s) => {
					const colour = colourOf(s.key);
					return (
						<Pressable
							key={s.key}
							accessibilityRole="button"
							accessibilityState={{ selected: colour != null }}
							accessibilityLabel={`${colour ? "Stop highlighting" : "Highlight"} ${s.label}`}
							onPress={() => {
								haptic("selection");
								setSlots((x) => toggleSlot(x, s.key));
							}}
							onLongPress={() => {
								haptic("longPress");
								if (s.driver) open(href.driver(s.driver.id));
								else if (s.team) open(href.team(s.team.id));
							}}
							className={cn("h-9 flex-row items-center gap-1.5 rounded-md border px-2.5", colour ? "border-foreground/30 bg-accent" : "border-border active:bg-accent")}
						>
							<View className={cn("h-1 w-4 rounded-full", !colour && "bg-muted-foreground/40")} style={colour ? { backgroundColor: colour } : undefined} />
							<Text variant="small" className={cn(colour ? "font-semibold" : "text-muted-foreground")} numberOfLines={1}>
								{s.driver ? shortOf.get(s.key) : s.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

export function ProgressionChart({ progression }: { progression: SeasonProgression }) {
	const [kind, setKind] = useState<Kind>("drivers");
	const [mode, setMode] = useState<Mode>("points");
	const table = kind === "constructors" && progression.constructors ? progression.constructors : progression.drivers;
	const team = table === progression.constructors;
	return (
		<View>
			<View className="gap-2 px-4 pb-3">
				{progression.constructors ? (
					<Segmented<Kind>
						value={kind}
						onChange={(v) => {
							haptic("selection");
							setKind(v);
						}}
						options={[
							{ value: "drivers", label: "Drivers" },
							{ value: "constructors", label: "Constructors" },
						]}
					/>
				) : null}
				<Segmented<Mode>
					value={mode}
					onChange={(v) => {
						haptic("selection");
						setMode(v);
					}}
					options={[
						{ value: "points", label: "Points" },
						{ value: "gap", label: "Gap to leader" },
						{ value: "position", label: "Position" },
					]}
				/>
			</View>
			<Chart key={kind} table={table} rounds={progression.rounds} mode={mode} team={team} />
		</View>
	);
}
