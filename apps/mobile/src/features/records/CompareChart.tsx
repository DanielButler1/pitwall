// Compare's progression chart: cumulative wins, podiums or points by start number or by age, one
// line per driver or constructor in the compare colours. Press and hold to read the values.

import { useMemo, useState } from "react";
import { View } from "react-native";
import type { CompareEntity, ProgressPoint } from "@pitwall/core/f1/compare";
import { LegendItem, LineChart, type LineSeries } from "@/components/charts";
import { num } from "@/lib/format";
import { COMPARE_COLORS, nameOf } from "./compare-colors";
import { Choice, Note } from "./kit";

type Metric = "wins" | "podiums" | "points";
type Axis = "starts" | "age";

const AGE_STEP = 0.25;
const ageLabel = (x: number) => `${Math.floor(x)}y ${Math.round((x % 1) * 12)}m`;

/** One series per entity: by start number directly, by age resampled every quarter year. */
function buildSeries(entities: CompareEntity[], metric: Metric, axis: Axis): LineSeries[] {
	if (axis === "starts")
		return entities.map((e, i) => ({ key: e.id, label: nameOf(e), colour: COMPARE_COLORS[i]!, points: e.progress.map((p) => ({ x: p.n, y: p[metric] })) }));
	const aged = entities.map((e) => e.progress.filter((p): p is ProgressPoint & { age: number } => p.age != null));
	const ages = aged.flatMap((pts) => pts.map((p) => p.age));
	if (!ages.length) return [];
	const from = Math.floor(Math.min(...ages) / AGE_STEP) * AGE_STEP;
	return entities.map((e, i) => {
		const pts = aged[i]!;
		const points: { x: number; y: number | null }[] = [];
		if (pts.length) {
			const last = pts[pts.length - 1]!.age;
			let j = 0;
			for (let x = Math.max(from, Math.floor(pts[0]!.age / AGE_STEP) * AGE_STEP); x <= last + AGE_STEP + 1e-9; x += AGE_STEP) {
				while (j + 1 < pts.length && pts[j + 1]!.age <= x) j++;
				points.push({ x: Math.round(x * 100) / 100, y: pts[j]!.age <= x ? pts[j]![metric] : 0 });
			}
		}
		return { key: e.id, label: nameOf(e), colour: COMPARE_COLORS[i]!, points };
	});
}

export function ProgressChart({ entities, kind }: { entities: CompareEntity[]; kind: "driver" | "team" }) {
	const [metric, setMetric] = useState<Metric>("wins");
	const [axis, setAxis] = useState<Axis>("starts");
	const canAge = kind === "driver" && entities.every((e) => e.dateOfBirth);
	const use: Axis = canAge ? axis : "starts";
	const series = useMemo(() => buildSeries(entities, metric, use), [entities, metric, use]);
	const unit = kind === "driver" ? "start" : "race";
	return (
		<View className="gap-3">
			<Choice
				value={metric}
				onChange={setMetric}
				options={[
					{ value: "wins", label: "Wins" },
					{ value: "podiums", label: "Podiums" },
					{ value: "points", label: "Points" },
				]}
			/>
			{canAge ? (
				<Choice
					value={use}
					onChange={setAxis}
					options={[
						{ value: "starts", label: "By start" },
						{ value: "age", label: "By age" },
					]}
				/>
			) : null}
			<View className="px-4">
				<LineChart
					series={series}
					height={240}
					step
					yFormat={num}
					xTicks={4}
					xFormat={(x) => (use === "age" ? String(Math.round(x)) : num(Math.round(x)))}
					tooltipTitle={(x) => (use === "starts" ? `After ${num(x)} ${unit}${x === 1 ? "" : "s"}` : `Age ${ageLabel(x)}`)}
					accessibilityLabel={`Cumulative ${metric} ${use === "starts" ? `by ${unit}` : "by age"} for ${entities.map(nameOf).join(", ")}`}
				/>
				<View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5">
					{entities.map((e, i) => {
						const last = e.progress.at(-1);
						return <LegendItem key={e.id} colour={COMPARE_COLORS[i]!} label={nameOf(e)} value={last ? num(last[metric]) : null} />;
					})}
				</View>
			</View>
			<Note className="pt-0">
				{`Cumulative ${metric} ${use === "starts" ? `after each ${unit}` : "by age (sampled every three months)"}.`}
				{metric === "points" ? " Points as awarded at the time, so eras with different scoring aren't directly comparable." : ""}
			</Note>
		</View>
	);
}
