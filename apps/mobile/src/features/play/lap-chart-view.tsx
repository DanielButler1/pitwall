// The mystery lap chart: every driver's position lap by lap (P1 at the top), the winner in red
// and up to two drivers the player picks in colour, everyone else faint. Press and hold, then
// drag, to read the order on a lap (a tick per lap, as the app's other charts). Drawn with
// react-native-svg: the kit's LineChart has no reversed axis or per-line weights.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";
import { driverLetter, type LapRace, type LapReveal, type MysteryLaps } from "@pitwall/core/game/lap-chart";
import { Flag } from "@/components/f1";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { href } from "@/lib/links";
import { LinkText } from "./shared";

const HEIGHT = 300;
const PAD = { top: 12, right: 8, bottom: 20, left: 32 };
const PICK_LIMIT = 2;

export function MysteryChart({ file, race, reveal, over }: { file: MysteryLaps; race: LapRace; reveal: LapReveal; over: boolean }) {
	const positions = file.positions;
	const entries = race.entries;
	const [width, setWidth] = useState(0);
	const [picked, setPicked] = useState<number[]>([]);
	const [lap, setLap] = useState<number | null>(null);
	const colours = useCSSVariable(["--color-primary", "--color-chart-2", "--color-gold", "--color-muted-foreground", "--color-border"]).map((c) => String(c ?? "#888"));
	const [winnerColour, pick1, pick2, muted, grid] = colours as [string, string, string, string, string];
	const pickColours = [pick1, pick2];

	const laps = Math.max(0, ...positions.map((p) => p.length));
	const field = Math.max(positions.length, ...positions.flat().map((p) => p ?? 0));
	const hasGrid = entries.some((e) => e.grid != null);
	const firstLap = hasGrid ? 0 : 1;
	const plotW = Math.max(1, width - PAD.left - PAD.right);
	const plotH = HEIGHT - PAD.top - PAD.bottom;
	const x = (l: number) => PAD.left + (laps === firstLap ? plotW / 2 : ((l - firstLap) / (laps - firstLap)) * plotW);
	const y = (p: number) => PAD.top + (field <= 1 ? 0 : ((p - 1) / (field - 1)) * plotH);
	const posAt = (i: number, l: number) => (l === 0 ? (entries[i]?.grid ?? null) : (positions[i]?.[l - 1] ?? null));

	const paths = useMemo(() => {
		if (!width) return [];
		return positions.map((_, i) => {
			let d = "";
			let pen = false;
			for (let l = firstLap; l <= laps; l++) {
				const p = l === 0 ? (entries[i]?.grid ?? null) : (positions[i]![l - 1] ?? null);
				if (p == null) {
					pen = false;
					continue;
				}
				d += `${pen ? "L" : "M"}${x(l).toFixed(1)},${y(p).toFixed(1)}`;
				pen = true;
			}
			return d;
		});
		// x and y follow width, laps and field
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [positions, entries, width, laps, field, firstLap]);

	const name = (i: number) => {
		const e = entries[i];
		if (!e) return driverLetter(i);
		if (reveal.drivers || (i === 0 && reveal.winner)) return e.driver.name;
		return `Driver ${driverLetter(i)}`;
	};
	const team = (i: number) => (reveal.drivers || (i === 0 && reveal.team) ? entries[i]?.team.name : null);
	const colourOf = (i: number) => {
		if (i === 0) return winnerColour;
		const k = picked.indexOf(i);
		return k >= 0 ? pickColours[k]! : null;
	};
	const toggle = (i: number) => {
		haptic("selection");
		setPicked((s) => (s.includes(i) ? s.filter((v) => v !== i) : [...s, i].slice(-PICK_LIMIT)));
	};
	// faint lines first, coloured ones on top
	const order = positions.map((_, i) => i).sort((a, b) => Number(colourOf(a) != null) - Number(colourOf(b) != null));
	const yTicks = [1, ...Array.from({ length: Math.floor(field / 5) }, (_, i) => (i + 1) * 5).filter((t) => t <= field)];
	const xTicks = [...new Set([firstLap, ...[0.25, 0.5, 0.75].map((f) => Math.round(firstLap + (laps - firstLap) * f)), laps])];

	// press and hold, then drag: read a lap
	const latest = useRef({ width, laps, firstLap, plotW });
	useLayoutEffect(() => {
		latest.current = { width, laps, firstLap, plotW };
	});
	const current = useRef<number | null>(null);
	const gesture = usePanGesture(
		useMemo(() => {
			const move = (px: number) => {
				const { laps: n, firstLap: f, plotW: w } = latest.current;
				const l = Math.max(f, Math.min(n, Math.round(f + ((px - PAD.left) / w) * (n - f))));
				if (l === current.current) return;
				current.current = l;
				setLap(l);
				haptic("tick");
			};
			return {
				activateAfterLongPress: 250,
				runOnJS: true,
				onActivate: (e: { x: number }) => move(e.x),
				onUpdate: (e: { x: number }) => move(e.x),
				onFinalize: () => {
					current.current = null;
				},
			};
		}, []),
	);

	const readout =
		lap == null
			? null
			: positions
					.map((_, i) => ({ i, p: posAt(i, lap) }))
					.filter((r): r is { i: number; p: number } => r.p != null && (r.p <= 10 || colourOf(r.i) != null))
					.sort((a, b) => a.p - b.p);

	return (
		<View className="gap-3">
			<GestureDetector gesture={gesture}>
				<View
					style={{ height: HEIGHT }}
					className="mx-2"
					onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))}
					accessible
					accessibilityRole="image"
					accessibilityLabel={`Lap chart: position of ${positions.length} drivers over ${laps} laps; the winner's line is red. Press and hold, then drag, to read a lap.`}
				>
					{width > 0 ? (
						<Svg width={width} height={HEIGHT}>
							{yTicks.map((t) => (
								<Line key={`g${t}`} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={grid} strokeWidth={1} />
							))}
							{yTicks.map((t) => (
								<SvgText key={`y${t}`} x={PAD.left - 6} y={y(t) + 3.5} fontSize={10} fill={muted} textAnchor="end">{`P${t}`}</SvgText>
							))}
							{xTicks.map((l, k) => (
								<SvgText key={`x${l}`} x={x(l)} y={HEIGHT - 4} fontSize={10} fill={muted} textAnchor={k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"}>
									{l === 0 ? "Grid" : String(l)}
								</SvgText>
							))}
							{lap != null ? <Line x1={x(lap)} x2={x(lap)} y1={PAD.top} y2={PAD.top + plotH} stroke={muted} strokeWidth={1} strokeDasharray="3 3" /> : null}
							{order.map((i) => {
								const c = colourOf(i);
								return paths[i] ? (
									<Path key={i} d={paths[i]} stroke={c ?? muted} strokeOpacity={c ? 1 : 0.3} strokeWidth={c ? 2.5 : 1.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
								) : null;
							})}
							{(reveal.winner || reveal.drivers) && entries[0] ? (
								<SvgText x={PAD.left + plotW} y={Math.max(PAD.top + 10, y(posAt(0, laps) ?? 1) - 6)} fontSize={12} fontWeight="600" fill={winnerColour} textAnchor="end">
									{entries[0].driver.name}
								</SvgText>
							) : null}
						</Svg>
					) : null}
				</View>
			</GestureDetector>

			{readout ? (
				<View className="mx-4 rounded-md border border-border px-3 py-2">
					<View className="flex-row items-center justify-between">
						<Text variant="label">{lap === 0 ? "Grid" : `Lap ${lap}`}</Text>
						<Pressable accessibilityRole="button" hitSlop={10} onPress={() => setLap(null)}>
							<Text variant="caption" className="text-link">
								Close
							</Text>
						</Pressable>
					</View>
					<View className="mt-1 flex-row flex-wrap gap-x-4 gap-y-0.5">
						{readout.map(({ i, p }) => (
							<Text key={i} variant="caption" className={colourOf(i) ? "font-semibold text-foreground" : undefined}>
								{`P${p} ${name(i)}`}
							</Text>
						))}
					</View>
				</View>
			) : null}

			<View className="gap-2 px-4">
				<Text variant="caption">{`Position at the end of each lap, in finishing order. The winner is red; tap up to ${PICK_LIMIT} more to follow them. Press and hold the chart to read a lap.`}</Text>
				<View className="flex-row flex-wrap">
					{positions.map((_, i) => {
						const c = colourOf(i);
						const t = team(i);
						const e = entries[i];
						const showFlag = reveal.drivers || (i === 0 && reveal.winner);
						return (
							<Pressable
								key={i}
								disabled={i === 0}
								accessibilityRole="button"
								accessibilityState={i === 0 ? undefined : { selected: picked.includes(i) }}
								accessibilityLabel={i === 0 ? `${name(i)}, the winner` : `Follow ${name(i)}`}
								onPress={() => toggle(i)}
								style={{ width: "50%" }}
								className={cn("min-h-11 flex-row items-center gap-2 rounded-md px-2 py-1 active:bg-accent", picked.includes(i) && "bg-muted")}
							>
								<View className="h-1 w-4 rounded-full" style={{ backgroundColor: c ?? muted, opacity: c ? 1 : 0.4 }} />
								<View className="flex-1">
									<View className="flex-row items-center gap-1.5">
										{showFlag && e ? <Flag code={e.driver.flag} /> : null}
										<Text variant="small" numberOfLines={1} className={cn("flex-1", c ? "font-semibold" : "text-muted-foreground")}>
											{name(i)}
										</Text>
									</View>
									{t ? (
										<Text variant="caption" numberOfLines={1} className="text-[11px]">
											{t}
										</Text>
									) : null}
								</View>
							</Pressable>
						);
					})}
				</View>
				{over ? (
					<Text variant="caption">
						{entries.slice(0, 3).map((e, i) => (
							<Text key={e.driver.id} variant="caption">
								{i > 0 ? " · " : ""}
								{`P${i + 1} `}
								<LinkText href={href.driver(e.driver.id)} className="text-foreground">
									{e.driver.name}
								</LinkText>
							</Text>
						))}
					</Text>
				) : null}
			</View>
		</View>
	);
}
