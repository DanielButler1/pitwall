"use client";

// A driver's skill or a team's car pace per season, as derived from real
// results, with the universe's change overlaid. One axis, two series: the
// derived curve (muted ink) and "with your change" (universe purple, dashed).

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CurvePoint = { year: number; real: number; changed: number | null; note?: string };

const fmt = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function CurveTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: CurvePoint }[]; unit: string }) {
	const p = active ? payload?.[0]?.payload : null;
	if (!p) return null;
	return (
		<div className="bg-popover text-popover-foreground ring-foreground/10 rounded-lg px-3 py-2 text-xs shadow-md ring-1">
			<div className="font-medium tabular-nums">
				{p.year}
				{p.note && <span className="text-muted-foreground font-normal"> · {p.note}</span>}
			</div>
			<div className="mt-1 flex items-center gap-2">
				<span className="bg-muted-foreground inline-block h-0.5 w-3 rounded-full" />
				<span className="text-muted-foreground">Derived {unit}</span>
				<span className="ml-auto tabular-nums">{fmt(p.real)}</span>
			</div>
			{p.changed != null && (
				<div className="mt-0.5 flex items-center gap-2">
					<span className="bg-universe inline-block h-0.5 w-3 rounded-full" />
					<span className="text-muted-foreground">With your change</span>
					<span className="ml-auto font-medium tabular-nums">{fmt(p.changed)}</span>
				</div>
			)}
		</div>
	);
}

export function RatingChart({ data, unit }: { data: CurvePoint[]; unit: string }) {
	const hasChange = data.some((d) => d.changed != null && d.changed !== d.real);
	return (
		<div className="space-y-3">
			<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
				<span className="inline-flex items-center gap-1.5">
					<span className="bg-muted-foreground inline-block h-0.5 w-4 rounded-full" />
					Derived {unit} (from real results)
				</span>
				{hasChange && (
					<span className="inline-flex items-center gap-1.5">
						<span className="border-universe inline-block w-4 border-t-2 border-dashed" />
						With your change
					</span>
				)}
				<span className="ml-auto">0 = field average · 1 point = 1% of the grid</span>
			</div>
			<div className="h-56 w-full">
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
						<CartesianGrid vertical={false} stroke="var(--border)" />
						<XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} minTickGap={24} />
						<YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={44} tickFormatter={(v: number) => fmt(v).replace(".0", "")} />
						<ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="2 4" />
						<Tooltip content={<CurveTooltip unit={unit} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
						<Line type="monotone" dataKey="real" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} isAnimationActive={false} />
						{hasChange && (
							<Line
								type="monotone"
								dataKey="changed"
								stroke="var(--universe)"
								strokeWidth={2}
								strokeDasharray="6 4"
								dot={false}
								connectNulls={false}
								activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: "var(--universe)" }}
								isAnimationActive={false}
							/>
						)}
					</LineChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
