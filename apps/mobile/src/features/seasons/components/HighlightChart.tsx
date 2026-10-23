// Many lines, a few picked out: the championship progression and the lap chart. The kit's LineChart
// draws every series in its own colour and its bubble lists them in series order; these charts need
// twenty muted lines with up to three highlighted on top, end-of-line names, a reversed axis for
// positions, and a readout sorted by position, so they get their own small SVG chart. Same
// interaction as the kit: press and hold, then drag to read a point (a light tick per step); screen
// readers step through it as an adjustable element.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type AccessibilityActionEvent, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";
import { useToneColor } from "@/components/ui";
import { INSPECT_HOLD_MS } from "@/components/charts";
import { linePath } from "@/components/chartMath";
import { haptic } from "@/lib/haptics";

/** How many lines can be highlighted at once (as on the website). */
export const HIGHLIGHTS = 3;

/** The highlight colours, in a fixed order: F1 red, blue, gold. */
export function useHighlightColours(): string[] {
	const primary = useToneColor("primary");
	const gold = useToneColor("gold");
	const blue = String(useCSSVariable("--color-chart-3") ?? "#2f7fd1");
	return useMemo(() => [primary, blue, gold], [primary, blue, gold]);
}

/** Toggles a key in fixed highlight slots: a freed slot is reused, and a fourth pick replaces the last. */
export function toggleSlot(slots: (string | null)[], key: string): (string | null)[] {
	if (slots.includes(key)) return slots.map((x) => (x === key ? null : x));
	const next = [...slots];
	const free = next.indexOf(null);
	if (free >= 0) next[free] = key;
	else if (next.length < HIGHLIGHTS) next.push(key);
	else next[next.length - 1] = key;
	return next;
}

export type ChartLine = {
	key: string;
	/** One value per x (null: no data there). */
	values: (number | null)[];
	/** Null draws the line in muted ink. */
	colour: string | null;
	/** Name at the end of a highlighted line. */
	label?: string;
};

const A11Y_READOUT_MS = 5_000;
const LABEL_GAP = 13;

export function HighlightChart({
	count,
	lines,
	domain,
	reversed = false,
	ticks,
	yFormat,
	xLabel,
	xTicks,
	height = 300,
	endLabels = true,
	readout,
	label,
	describe,
}: {
	/** Number of x points (rounds, laps). */
	count: number;
	lines: ChartLine[];
	domain: [number, number];
	/** Smaller values at the top (positions). */
	reversed?: boolean;
	ticks: number[];
	yFormat: (v: number) => string;
	xLabel: (index: number) => string;
	/** Which x indices get a label. */
	xTicks: number[];
	height?: number;
	endLabels?: boolean;
	/** The readout shown while a point is read. */
	readout: (index: number) => ReactNode;
	label: string;
	describe: (index: number) => string;
}) {
	const [width, setWidth] = useState(0);
	const [active, setActive] = useState<number | null>(null);
	const grid = useToneColor("border");
	const muted = useToneColor("muted");
	const ink = useToneColor("foreground");
	const background = useToneColor("background");

	const left = Math.max(26, ...ticks.map((t) => yFormat(t).length * 6.2 + 6));
	const right = endLabels && lines.some((l) => l.colour && l.label) ? 74 : 8;
	const plotW = Math.max(1, width - left - right);
	const plotH = height - 26;
	const [d0, d1] = domain;
	const span = d1 - d0 || 1;
	const scaleX = (i: number) => left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
	const scaleY = (v: number) => 8 + (reversed ? ((v - d0) / span) * plotH : plotH - ((v - d0) / span) * plotH);

	// muted lines first, highlighted ones on top
	const ordered = useMemo(() => [...lines].sort((a, b) => Number(a.colour != null) - Number(b.colour != null)), [lines]);

	const paths = useMemo(() => {
		if (!width) return [];
		return ordered.map((line) => ({ line, ...linePath(line.values.map((v, i) => ({ x: scaleX(i), y: v == null ? null : scaleY(v) }))) }));
		// scale functions depend only on these
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ordered, width, height, d0, d1, reversed, left, right, count]);

	// end labels, nudged apart so they never overlap
	const labels = useMemo(() => {
		if (!endLabels || !width) return [];
		const ends = lines
			.filter((l) => l.colour && l.label)
			.map((l) => {
				let i = l.values.length - 1;
				while (i >= 0 && l.values[i] == null) i--;
				return i < 0 ? null : { line: l, x: scaleX(i), y: scaleY(l.values[i]!) };
			})
			.filter((e): e is NonNullable<typeof e> => e != null)
			.sort((a, b) => a.y - b.y);
		let prev = -Infinity;
		return ends.map((e) => {
			const y = Math.max(e.y, prev + LABEL_GAP);
			prev = y;
			return { ...e, labelY: y };
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lines, endLabels, width, height, d0, d1, reversed, left, right, count]);

	// the gesture's callbacks are made once and read the current geometry from here
	const latest = useRef({ left, plotW, count });
	useLayoutEffect(() => {
		latest.current = { left, plotW, count };
	});
	const selected = useRef<number | null>(null);
	const a11yTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(a11yTimer.current), []);

	const gesture = usePanGesture(
		useMemo(() => {
			const move = (x: number) => {
				const { left: l, plotW: w, count: n } = latest.current;
				if (n <= 0) return;
				const index = Math.max(0, Math.min(n - 1, Math.round(((x - l) / w) * (n - 1))));
				if (index === selected.current) return;
				selected.current = index;
				setActive(index);
				haptic("tick");
			};
			return {
				activateAfterLongPress: INSPECT_HOLD_MS,
				runOnJS: true,
				onActivate: (event: { x: number }) => move(event.x),
				onUpdate: (event: { x: number }) => move(event.x),
				onFinalize: () => {
					if (selected.current == null) return;
					selected.current = null;
					setActive(null);
				},
			};
		}, []),
	);

	const step = (event: AccessibilityActionEvent) => {
		const dir = event.nativeEvent.actionName === "increment" ? 1 : event.nativeEvent.actionName === "decrement" ? -1 : 0;
		if (!dir || count <= 0) return;
		setActive((a) => (a == null ? (dir === 1 ? 0 : count - 1) : Math.max(0, Math.min(count - 1, a + dir))));
		clearTimeout(a11yTimer.current);
		a11yTimer.current = setTimeout(() => setActive(null), A11Y_READOUT_MS);
	};

	const activeX = active != null ? scaleX(active) : null;

	return (
		<GestureDetector gesture={gesture}>
			<View
				style={{ height }}
				onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
				accessible
				accessibilityRole="adjustable"
				accessibilityLabel={label}
				accessibilityHint="Swipe up or down to read each point. Or press and hold, then drag."
				accessibilityValue={active != null ? { text: describe(active) } : undefined}
				accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
				onAccessibilityAction={step}
			>
				{width > 0 ? (
					<Svg width={width} height={height}>
						{ticks.map((t) => (
							<Line key={`g${t}`} x1={left} x2={left + plotW} y1={scaleY(t)} y2={scaleY(t)} stroke={grid} strokeWidth={1} />
						))}
						{ticks.map((t) => (
							<SvgText key={`y${t}`} x={left - 6} y={scaleY(t) + 3.5} fontSize={10} fill={muted} textAnchor="end">
								{yFormat(t)}
							</SvgText>
						))}
						{xTicks.map((i, n) => (
							<SvgText key={`x${i}`} x={scaleX(i)} y={height - 4} fontSize={10} fill={muted} textAnchor={xTicks.length > 1 && n === 0 ? "start" : n === xTicks.length - 1 && xTicks.length > 1 ? "end" : "middle"}>
								{xLabel(i)}
							</SvgText>
						))}
						{activeX != null ? <Line x1={activeX} x2={activeX} y1={8} y2={8 + plotH} stroke={muted} strokeWidth={1} strokeDasharray="3 3" /> : null}
						{paths.map(({ line, d }) =>
							d ? (
								<Path
									key={line.key}
									d={d}
									stroke={line.colour ?? muted}
									strokeOpacity={line.colour ? 1 : 0.3}
									strokeWidth={line.colour ? 2.5 : 1.5}
									fill="none"
									strokeLinejoin="round"
									strokeLinecap="round"
								/>
							) : null,
						)}
						{paths.flatMap(({ line, dots }) => dots.map((dot, i) => <Circle key={`lone${line.key}${i}`} cx={dot.x} cy={dot.y} r={2.5} fill={line.colour ?? muted} opacity={line.colour ? 1 : 0.4} />))}
						{active != null
							? ordered.map((line) => {
									const v = line.values[active];
									return line.colour && v != null ? <Circle key={`dot${line.key}`} cx={scaleX(active)} cy={scaleY(v)} r={4} fill={line.colour} stroke={background} strokeWidth={2} /> : null;
								})
							: null}
						{labels.map((l) => (
							<SvgText key={`l${l.line.key}`} x={l.x + 6} y={l.labelY + 3.5} fontSize={11} fontWeight="600" fill={ink}>
								{l.line.label!.length > 11 ? `${l.line.label!.slice(0, 10)}…` : l.line.label}
							</SvgText>
						))}
					</Svg>
				) : null}
				{active != null && activeX != null ? (
					<View
						pointerEvents="none"
						className="absolute top-1 rounded-md border border-border bg-popover px-2.5 py-2"
						style={[{ maxWidth: Math.min(240, width - left - 8), elevation: 4 }, activeX > width / 2 ? { left: left + 4 } : { right: 4 }]}
					>
						{readout(active)}
					</View>
				) : null}
			</View>
		</GestureDetector>
	);
}
