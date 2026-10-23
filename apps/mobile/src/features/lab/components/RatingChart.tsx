// A driver's skill or a team's car pace per season, derived from real results, with the change
// overlaid (the website's rating-chart.tsx). Values go below zero, which the kit's LineChart doesn't
// draw, so this is its own small SVG. Press and drag to read a season.

import { useMemo, useRef, useState } from "react";
import { View, type GestureResponderEvent } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";
import { LegendItem } from "@/components/charts";
import { Text, useToneColor } from "@/components/ui";
import { haptic } from "@/lib/haptics";

export type CurvePoint = { year: number; real: number; changed: number | null; note?: string };

const fmt = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
const HEIGHT = 190;
const LEFT = 34;
const TOP = 8;
const BOTTOM = 18;

function ticks(lo: number, hi: number) {
	const span = hi - lo || 1;
	const raw = span / 4;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((c) => c >= raw) ?? raw;
	const out: number[] = [];
	// from the step at or below the lowest value to the one at or above the highest
	for (let v = Math.floor(lo / step) * step; ; v += step) {
		out.push(Number(v.toPrecision(10)));
		if (v >= hi - step * 0.001) break;
	}
	return out;
}

export function RatingChart({ data, unit }: { data: CurvePoint[]; unit: string }) {
	const [width, setWidth] = useState(0);
	const [active, setActive] = useState<number | null>(null);
	const lastActive = useRef<number | null>(null);
	const muted = useToneColor("muted");
	const grid = useToneColor("border");
	const universe = useToneColor("universe");
	const hasChange = data.some((d) => d.changed != null && d.changed !== d.real);

	const geo = useMemo(() => {
		const values = data.flatMap((d) => (d.changed != null ? [d.real, d.changed] : [d.real]));
		const t = ticks(Math.min(0, ...values), Math.max(0, ...values));
		const lo = t[0];
		const hi = t[t.length - 1];
		const x0 = data[0]?.year ?? 0;
		const x1 = data[data.length - 1]?.year ?? 1;
		const plotW = Math.max(1, width - LEFT - 6);
		const plotH = HEIGHT - TOP - BOTTOM;
		const sx = (x: number) => LEFT + (x1 === x0 ? plotW / 2 : ((x - x0) / (x1 - x0)) * plotW);
		const sy = (y: number) => TOP + plotH - ((y - lo) / (hi - lo || 1)) * plotH;
		const path = (pick: (d: CurvePoint) => number | null) => {
			let d = "";
			let open = false;
			for (const p of data) {
				const v = pick(p);
				if (v == null) {
					open = false;
					continue;
				}
				d += `${open ? "L" : "M"}${sx(p.year).toFixed(1)},${sy(v).toFixed(1)}`;
				open = true;
			}
			return d;
		};
		return { t, sx, sy, plotW, real: path((d) => d.real), changed: path((d) => d.changed), x0, x1 };
	}, [data, width]);

	const pick = (e: GestureResponderEvent) => {
		if (!data.length) return;
		const x = e.nativeEvent.locationX;
		let best = 0;
		for (let i = 1; i < data.length; i++) if (Math.abs(geo.sx(data[i].year) - x) < Math.abs(geo.sx(data[best].year) - x)) best = i;
		if (best !== lastActive.current) {
			lastActive.current = best;
			haptic("tick");
			setActive(best);
		}
	};
	const point = active != null ? data[active] : null;
	const label = `${unit === "skill" ? "Skill" : "Car pace"} by season, ${data.length} seasons from ${geo.x0} to ${geo.x1}`;

	return (
		<View className="px-4">
			<View className="flex-row flex-wrap gap-x-4 gap-y-1">
				<LegendItem colour={muted} label={`Derived ${unit}`} />
				{hasChange ? <LegendItem colour={universe} dash="4 3" label="With your change" /> : null}
			</View>
			<View
				className="mt-2"
				accessible
				accessibilityLabel={label}
				onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
				onStartShouldSetResponder={() => true}
				onMoveShouldSetResponder={() => true}
				onResponderTerminationRequest={() => false}
				onResponderGrant={pick}
				onResponderMove={pick}
				onResponderRelease={() => {
					lastActive.current = null;
					setActive(null);
				}}
				style={{ height: HEIGHT }}
			>
				{width > 0 ? (
					<Svg width={width} height={HEIGHT}>
						{geo.t.map((v) => (
							<Line key={`g${v}`} x1={LEFT} x2={LEFT + geo.plotW} y1={geo.sy(v)} y2={geo.sy(v)} stroke={grid} strokeWidth={1} strokeDasharray={v === 0 ? "2 4" : undefined} />
						))}
						{geo.t.map((v) => (
							<SvgText key={`y${v}`} x={LEFT - 6} y={geo.sy(v) + 3.5} fontSize={10} fill={muted} textAnchor="end">
								{fmt(v).replace(".0", "")}
							</SvgText>
						))}
						<SvgText x={LEFT} y={HEIGHT - 4} fontSize={10} fill={muted} textAnchor="start">
							{geo.x0}
						</SvgText>
						<SvgText x={LEFT + geo.plotW} y={HEIGHT - 4} fontSize={10} fill={muted} textAnchor="end">
							{geo.x1}
						</SvgText>
						{point ? <Line x1={geo.sx(point.year)} x2={geo.sx(point.year)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={muted} strokeWidth={1} strokeDasharray="3 3" /> : null}
						<Path d={geo.real} stroke={muted} strokeWidth={2} fill="none" strokeLinejoin="round" />
						{hasChange ? <Path d={geo.changed} stroke={universe} strokeWidth={2} fill="none" strokeDasharray="6 4" strokeLinejoin="round" /> : null}
					</Svg>
				) : null}
			</View>
			<Text variant="caption" className="mt-1" numberOfLines={2}>
				{point
					? `${point.year}${point.note ? ` · ${point.note}` : ""}: derived ${fmt(point.real)}${point.changed != null ? `, with your change ${fmt(point.changed)}` : ""}`
					: "0 = field average · 1 point = 1% of the grid. Hold and drag to read a season."}
			</Text>
		</View>
	);
}
