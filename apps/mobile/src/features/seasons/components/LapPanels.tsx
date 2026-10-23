// A race's lap chart and pit stops, from the per-race Jolpica file (data/laps/<raceId>.json),
// fetched only when one of those sections opens (apps/web race-laps.tsx).

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import type { RaceLapFile } from "@pitwall/core/f1/laps";
import type { DriverRef, ResultRow } from "@pitwall/core/f1/views";
import { EmptyState, ErrorState, Segmented, SkeletonRows, Skeleton, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dataUrl } from "@/lib/config";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { lapTime, shortNamer } from "../names";
import { HIGHLIGHTS, HighlightChart, toggleSlot, useHighlightColours, type ChartLine } from "./HighlightChart";

export function useRaceLaps(raceId: number) {
	return useQuery({
		queryKey: ["laps", raceId],
		queryFn: async () => {
					const res = await fetch(dataUrl(`laps/${raceId}.json`));
			if (!res.ok) throw new Error(`The lap data couldn't be loaded (the site answered ${res.status}).`);
			return (await res.json()) as RaceLapFile;
		},
	});
}

function Loading() {
	return (
		<View className="gap-3 px-4 pt-2">
			<Skeleton className="h-72 w-full" />
			<SkeletonRows count={4} />
		</View>
	);
}

type Session = { drivers: string[]; positions: (number | null)[][]; times: (number | null)[][] };

function lapTicks(laps: number, hasGrid: boolean) {
	const every = laps > 40 ? 10 : 5;
	const out: number[] = [];
	if (hasGrid) out.push(0);
	for (let lap = every; lap < laps - every / 2; lap += every) out.push(hasGrid ? lap : lap - 1);
	out.push(hasGrid ? laps : laps - 1);
	return out;
}

function LapChart({ session, refs, grid, finish, initial }: { session: Session; refs: Map<string, DriverRef>; grid: Map<string, number>; finish: Map<string, string>; initial: string[] }) {
	const colours = useHighlightColours();
	const open = useOpen();
	const [slots, setSlots] = useState<(string | null)[]>(() => initial.filter((d) => session.drivers.includes(d)).slice(0, HIGHLIGHTS));
	const colourOf = (id: string) => {
		const i = slots.indexOf(id);
		return i >= 0 ? colours[i]! : null;
	};
	const laps = Math.max(0, ...session.positions.map((p) => p.length));
	const field = Math.max(session.drivers.length, ...session.positions.flat().map((p) => p ?? 0));
	const hasGrid = session.drivers.some((d) => grid.has(d));
	const offset = hasGrid ? 0 : 1;
	const count = laps + (hasGrid ? 1 : 0);
	const short = useMemo(() => shortNamer(session.drivers.map((id) => refs.get(id) ?? { id, name: id, country: null, countryName: null })), [session, refs]);
	const nameOf = (id: string) => short(refs.get(id) ?? { id, name: id, country: null, countryName: null });

	const lines: ChartLine[] = useMemo(
		() =>
			session.drivers.map((id, i) => ({
				key: id,
				values: Array.from({ length: count }, (_, x) => {
					const lap = x + offset;
					return lap === 0 ? (grid.get(id) ?? null) : (session.positions[i]![lap - 1] ?? null);
				}),
				colour: colourOf(id),
				label: nameOf(id),
			})),
		// colourOf and nameOf read slots, colours and short
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[session, grid, count, offset, slots, colours, short],
	);

	const rows = useMemo(
		() =>
			session.drivers.map((id, i) => {
				const pos = session.positions[i]!.filter((p): p is number => p != null);
				const times = session.times[i]!.filter((t): t is number => t != null);
				return {
					id,
					grid: grid.get(id) ?? null,
					finish: finish.get(id) ?? (pos.length ? String(pos[pos.length - 1]) : "–"),
					best: pos.length ? Math.min(...pos) : null,
					led: pos.filter((p) => p === 1).length,
					bestLap: times.length ? Math.min(...times) : null,
				};
			}),
		[session, grid, finish],
	);
	const fastest = Math.min(...rows.map((r) => r.bestLap ?? Infinity));
	const ticks = [1, ...Array.from({ length: Math.floor(field / 5) }, (_, i) => (i + 1) * 5).filter((t) => t <= field)];
	const index = useMemo(() => new Map(session.drivers.map((d, i) => [d, i])), [session]);
	const order = (x: number) =>
		lines
			.map((l) => ({ id: l.key, pos: l.values[x] }))
			.filter((e): e is { id: string; pos: number } => e.pos != null)
			.sort((a, b) => a.pos - b.pos);

	return (
		<View>
			<View className="px-2">
				<HighlightChart
					count={count}
					lines={lines}
					domain={[1, field]}
					reversed
					ticks={ticks}
					yFormat={(v) => `P${v}`}
					xLabel={(x) => (x + offset === 0 ? "Grid" : String(x + offset))}
					xTicks={lapTicks(laps, hasGrid)}
					height={340}
					label={`Lap chart: position at the end of each of ${laps} laps`}
					describe={(x) => {
						const lap = x + offset;
						return `${lap === 0 ? "Grid" : `Lap ${lap}`}: ${order(x)
							.slice(0, 5)
							.map((e) => `P${e.pos} ${nameOf(e.id)}`)
							.join(", ")}`;
					}}
					readout={(x) => {
						const lap = x + offset;
						const shown = order(x).filter((e) => e.pos <= 3 || colourOf(e.id));
						return (
							<>
								<Text variant="caption" className="mb-1 font-semibold text-foreground">
									{lap === 0 ? "Grid" : `Lap ${lap}`}
								</Text>
								{shown.map((e) => {
									const colour = colourOf(e.id);
									const t = lap > 0 ? session.times[index.get(e.id)!]?.[lap - 1] : null;
									return (
										<View key={e.id} className="flex-row items-center gap-1.5">
											<Text variant="caption" numberOfLines={1} className="w-8 text-right tabular-nums">{`P${e.pos}`}</Text>
											<View className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: colour ?? "transparent" }} />
											<Text variant="caption" numberOfLines={1} className={cn("shrink", colour && "font-semibold text-foreground")}>
												{nameOf(e.id)}
											</Text>
											<Text variant="caption" className="ml-auto pl-2 tabular-nums text-foreground">
												{lapTime(t)}
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
				{`Position at the end of each lap. Tap the colour boxes to highlight up to ${HIGHLIGHTS} drivers; hold the chart to read each lap.`}
			</Text>
			<View className="mt-3 flex-row items-end gap-3 border-b border-border px-4 pb-1.5">
				<View className="w-10" />
				<Text variant="caption" className="flex-1">
					Driver
				</Text>
				<Text variant="caption" className="w-12 text-right">
					Finish
				</Text>
				<Text variant="caption" className="w-[68px] text-right">
					Best lap
				</Text>
			</View>
			{rows.map((r) => {
				const ref = refs.get(r.id);
				const colour = colourOf(r.id);
				const name = ref?.name ?? r.id;
				const pos = /^\d+$/.test(r.finish) ? `P${r.finish}` : r.finish;
				return (
					<View key={r.id} className="flex-row items-center gap-3 border-b border-border pl-4 pr-4">
						<Pressable
							accessibilityRole="checkbox"
							accessibilityState={{ checked: colour != null }}
							accessibilityLabel={`${colour ? "Stop highlighting" : "Highlight"} ${name}`}
							hitSlop={6}
							onPress={() => {
								haptic("selection");
								setSlots((s) => toggleSlot(s, r.id));
							}}
							className={cn("h-8 w-10 items-center justify-center rounded-md border", colour ? "border-foreground/30 bg-accent" : "border-border active:bg-accent")}
						>
							<View className={cn("h-1 w-5 rounded-full", !colour && "bg-muted-foreground/40")} style={colour ? { backgroundColor: colour } : undefined} />
						</Pressable>
						<Pressable accessibilityRole="button" onPress={() => open(href.driver(r.id))} className="min-h-[52px] flex-1 flex-row items-center gap-3 py-2 active:opacity-70">
							<View className="flex-1">
								<Text variant="body" numberOfLines={1} className={cn(colour && "font-semibold")}>
									{name}
								</Text>
								<Text variant="caption" numberOfLines={1}>
									{[`Grid ${r.grid ?? "–"}`, r.best ? `best P${r.best}` : null, r.led ? `led ${r.led}` : null].filter(Boolean).join(" · ")}
								</Text>
							</View>
							<Text variant="label" className="w-12 text-right tabular-nums">
								{pos}
							</Text>
							<Text variant="small" className={cn("w-[68px] text-right tabular-nums", r.bestLap != null && r.bestLap === fastest ? "font-semibold text-primary" : "text-muted-foreground")}>
								{lapTime(r.bestLap) || "–"}
							</Text>
						</Pressable>
					</View>
				);
			})}
		</View>
	);
}

const gridOf = (rows: ResultRow[]) => new Map(rows.filter((r) => r.grid != null && r.grid > 0).map((r) => [r.driver.id, r.grid!]));
const finishOf = (rows: ResultRow[]) => new Map(rows.map((r) => [r.driver.id, r.position]));

export function LapChartPanel({ raceId, results, sprint, sprintAvailable, highlight }: { raceId: number; results: ResultRow[]; sprint: ResultRow[]; sprintAvailable: boolean; highlight: string[] }) {
	const query = useRaceLaps(raceId);
	const [which, setWhich] = useState<"race" | "sprint">("race");
	const refs = useMemo(() => new Map([...sprint, ...results].map((r) => [r.driver.id, r.driver])), [results, sprint]);
	const maps = useMemo(() => ({ grid: gridOf(results), finish: finishOf(results), sGrid: gridOf(sprint), sFinish: finishOf(sprint) }), [results, sprint]);
	if (query.isPending) return <Loading />;
	if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
	const data = query.data;
	if (!data.drivers || !data.positions || !data.times) return <EmptyState title="No lap chart for this race" body="The lap data file has no lap-by-lap positions." />;
	const race: Session = { drivers: data.drivers, positions: data.positions, times: data.times };
	const sprintSession = sprintAvailable ? data.sprint : undefined;
	return (
		<View>
			{sprintSession ? (
				<Segmented
					className="mx-4 mb-3"
					value={which}
					onChange={(v) => {
						haptic("selection");
						setWhich(v);
					}}
					options={[
						{ value: "race", label: "Grand Prix" },
						{ value: "sprint", label: "Sprint" },
					]}
				/>
			) : null}
			{which === "sprint" && sprintSession ? (
				<LapChart key="sprint" session={sprintSession} refs={refs} grid={maps.sGrid} finish={maps.sFinish} initial={sprint[0] ? [sprint[0].driver.id] : highlight} />
			) : (
				<LapChart key="race" session={race} refs={refs} grid={maps.grid} finish={maps.finish} initial={highlight} />
			)}
		</View>
	);
}

const stopTime = (ms: number | null) => {
	if (ms == null) return "–";
	return ms >= 60000 ? lapTime(ms) : `${(ms / 1000).toFixed(3)} s`;
};

export function PitStopsPanel({ raceId, drivers }: { raceId: number; drivers: DriverRef[] }) {
	const query = useRaceLaps(raceId);
	const open = useOpen();
	const refs = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
	if (query.isPending) return <Loading />;
	if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
	const stops = query.data.pitStops ?? [];
	if (!stops.length) return <EmptyState title="No pit stops for this race" body="The lap data file has no pit stops." />;
	const fastest = Math.min(...stops.map((p) => p[3] ?? Infinity));
	return (
		<View>
			<Text variant="caption" className="px-4 pb-2">
				Time in the pit lane, from pit entry to pit exit. Long times are usually stops under a red flag.
			</Text>
			<View className="flex-row items-end gap-3 border-b border-border px-4 pb-1.5">
				<Text variant="caption" className="w-9 text-right">
					Lap
				</Text>
				<Text variant="caption" className="flex-1">
					Driver
				</Text>
				<Text variant="caption" className="w-[72px] text-right">
					Duration
				</Text>
			</View>
			{stops.map(([id, stop, lap, ms], i) => (
				<Pressable key={`${id}-${stop}-${i}`} accessibilityRole="button" onPress={() => open(href.driver(id))} className="min-h-[52px] flex-row items-center gap-3 border-b border-border px-4 py-2 active:bg-accent">
					<Text variant="label" className="w-9 text-right tabular-nums">
						{lap ?? "–"}
					</Text>
					<View className="flex-1">
						<Text variant="body" numberOfLines={1}>
							{refs.get(id)?.name ?? id}
						</Text>
						<Text variant="caption">{`Stop ${stop}`}</Text>
					</View>
					<Text variant="small" className={cn("w-[72px] text-right tabular-nums", ms === fastest ? "font-semibold text-primary" : "text-foreground")}>
						{stopTime(ms)}
					</Text>
				</Pressable>
			))}
		</View>
	);
}
