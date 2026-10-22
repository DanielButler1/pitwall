"use client";

// Championship progression on the season page: points after every round (as the
// standings stood, dropped scores applied), the gap to the leader, or position.
// Same house style as the race lap chart: up to three highlighted lines in a
// fixed order, everyone else muted ink, hover to pick a line out.

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressionSeries, ProgressionTable, SeasonProgression } from "@/lib/f1/progression";
import { cn } from "@/lib/utils";
import { DriverLink, Flag, TeamLink, num } from "../f1";
import { Toggle } from "../ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const HIGHLIGHT = ["var(--f1)", "var(--chart-3)", "var(--gold)"];
const HEIGHT = 384;
const MARGIN = { top: 12, right: 96, bottom: 4, left: -8 };
const X_AXIS = 30;
const PLOT = HEIGHT - MARGIN.top - MARGIN.bottom - X_AXIS;
const LABEL_GAP = 16;

type Mode = "points" | "gap" | "position";
type Row = { i: number } & Record<string, number | null>;
type Rounds = SeasonProgression["rounds"];

const clip = (t: string) => (t.length > 14 ? t.slice(0, 13) + "…" : t);
const signed = (n: number) => (n === 0 ? "0" : `−${num(-n)}`);

function valueOf(t: ProgressionTable, s: ProgressionSeries, i: number, mode: Mode) {
	if (mode === "position") return s.positions[i];
	const p = s.points[i];
	if (p == null) return null;
	return mode === "gap" ? Math.round((p - t.leader[i]) * 100) / 100 : p;
}

function ChartTooltip({
	active,
	label,
	rounds,
	table,
	colorOf,
}: {
	active?: boolean;
	label?: unknown;
	rounds: Rounds;
	table: ProgressionTable;
	colorOf: (key: string) => string | null;
}) {
	if (!active || label == null) return null;
	const i = Number(label);
	const r = rounds[i];
	if (!r) return null;
	const rows = table.series
		.filter((s) => s.points[i] != null)
		.sort((a, b) => (a.positions[i] ?? 999) - (b.positions[i] ?? 999) || (b.points[i] ?? 0) - (a.points[i] ?? 0));
	return (
		<div className="bg-popover text-popover-foreground ring-foreground/10 max-w-xs rounded-lg px-3 py-2 text-xs shadow-md ring-1">
			<div className="mb-1 flex items-center gap-1.5 font-medium">
				<Flag code={r.country} />
				<span className="truncate">
					After round {r.round} · {r.name}
				</span>
			</div>
			<div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 gap-y-0.5">
				{rows.map((s) => {
					const color = colorOf(s.key);
					const gap = (s.points[i] ?? 0) - table.leader[i];
					return (
						<div key={s.key} className={cn("contents", !color && "text-muted-foreground")}>
							<span className="text-right tabular-nums">{s.positions[i] != null ? `P${s.positions[i]}` : "–"}</span>
							<span className={cn("flex min-w-0 items-center gap-1.5", color && "text-foreground font-medium")}>
								<span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} />
								<span className="truncate">{s.label}</span>
							</span>
							<span className="text-right tabular-nums">{num(s.points[i] ?? 0)}</span>
							<span className="text-muted-foreground text-right tabular-nums">{gap < 0 ? signed(Math.round(gap * 100) / 100) : ""}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ProgressionChart({ table, rounds, mode, team }: { table: ProgressionTable; rounds: Rounds; mode: Mode; team: boolean }) {
	const [slots, setSlots] = useState<(string | null)[]>(() => table.series.slice(0, HIGHLIGHT.length).map((s) => s.key));
	const [hovered, setHovered] = useState<string | null>(null);
	const last = rounds.length - 1;

	const data = useMemo(
		() =>
			rounds.map((_, i) => {
				const row = { i } as Row;
				for (const s of table.series) row[s.key] = valueOf(table, s, i, mode);
				return row;
			}),
		[rounds, table, mode],
	);

	const values = data.flatMap((row) => table.series.map((s) => row[s.key])).filter((v): v is number => v != null);
	const domain: [number, number] =
		mode === "position" ? [1, Math.max(table.series.length, ...values)] : mode === "gap" ? [Math.min(0, ...values), 0] : [0, Math.max(1, ...values)];
	const span = domain[1] - domain[0] || 1;

	// surnames, with an initial where two drivers share one (the Schumachers)
	const shortOf = useMemo(() => {
		const count = new Map<string, number>();
		for (const s of table.series) count.set(s.short, (count.get(s.short) ?? 0) + 1);
		return new Map(table.series.map((s) => [s.key, s.driver && (count.get(s.short) ?? 0) > 1 ? `${s.label[0]}. ${s.short}` : s.short]));
	}, [table]);

	const colorOf = (key: string) => {
		const i = slots.indexOf(key);
		if (i >= 0) return HIGHLIGHT[i];
		return key === hovered ? "var(--foreground)" : null;
	};
	const toggle = (key: string) =>
		setSlots((s) => {
			if (s.includes(key)) return s.map((x) => (x === key ? null : x));
			const free = s.indexOf(null);
			const next = [...s];
			if (free >= 0) next[free] = key;
			else if (next.length < HIGHLIGHT.length) next.push(key);
			else next[next.length - 1] = key;
			return next;
		});

	// end-of-line labels for highlighted series, nudged apart so they never overlap
	const labelShift = useMemo(() => {
		const px = PLOT / span;
		const ends = table.series
			.filter((s) => slots.includes(s.key))
			.map((s) => {
				const v = valueOf(table, s, last, mode);
				const y = v == null ? null : mode === "position" ? (v - domain[0]) * px : (domain[1] - v) * px;
				return { key: s.key, y };
			})
			.filter((e): e is { key: string; y: number } => e.y != null)
			.sort((a, b) => a.y - b.y);
		const shift = new Map<string, number>();
		let prev = -Infinity;
		for (const e of ends) {
			const y = Math.max(e.y, prev + LABEL_GAP);
			shift.set(e.key, y - e.y);
			prev = y;
		}
		return shift;
	}, [table, slots, last, mode, span, domain]);

	const drawOrder = [...table.series].sort((a, b) => Number(colorOf(a.key) != null) - Number(colorOf(b.key) != null));
	const posTicks = mode === "position" ? [1, ...Array.from({ length: Math.floor(domain[1] / 5) }, (_, k) => (k + 1) * 5).filter((t) => t <= domain[1])] : undefined;

	return (
		<div className="space-y-4">
			<div className="w-full" style={{ height: HEIGHT }}>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={MARGIN} onMouseLeave={() => setHovered(null)}>
						<CartesianGrid vertical={false} stroke="var(--border)" />
						<XAxis
							dataKey="i"
							height={X_AXIS}
							tickLine={false}
							axisLine={false}
							tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
							minTickGap={12}
							tickFormatter={(i: number) => String(rounds[i]?.round ?? "")}
						/>
						<YAxis
							reversed={mode === "position"}
							domain={domain}
							ticks={posTicks}
							allowDecimals={false}
							tickLine={false}
							axisLine={false}
							tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
							width={52}
							tickFormatter={(v: number) => (mode === "position" ? `P${v}` : mode === "gap" ? signed(v) : num(v))}
						/>
						<Tooltip
							content={(props) => <ChartTooltip {...(props as object)} rounds={rounds} table={table} colorOf={colorOf} />}
							cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
							wrapperStyle={{ zIndex: 20 }}
						/>
						{drawOrder.map((s) => {
							const color = colorOf(s.key);
							const highlighted = slots.includes(s.key);
							return (
								<Line
									key={s.key}
									type="linear"
									dataKey={s.key}
									name={s.label}
									stroke={color ?? "var(--muted-foreground)"}
									strokeOpacity={color ? 1 : 0.3}
									strokeWidth={color ? 2.5 : 1.5}
									dot={false}
									activeDot={color ? { r: 4, strokeWidth: 2, stroke: "var(--background)", fill: color } : false}
									connectNulls={false}
									isAnimationActive={false}
									onMouseEnter={() => setHovered(s.key)}
									label={
										highlighted
											? (p: { x?: number | string; y?: number | string; index?: number }) =>
													p.index === last && p.x != null && p.y != null ? (
														<text
															key={`${s.key}-label`}
															x={Number(p.x) + 8}
															y={Number(p.y) + (labelShift.get(s.key) ?? 0)}
															dy="0.35em"
															fontSize={12}
															fontWeight={500}
															fill="var(--foreground)"
														>
															{clip(shortOf.get(s.key) ?? s.short)}
														</text>
													) : (
														<g key={`${s.key}-${p.index}`} />
													)
											: undefined
									}
								/>
							);
						})}
					</LineChart>
				</ResponsiveContainer>
			</div>
			<div className="space-y-2">
				<p className="text-muted-foreground text-xs">
					{mode === "points" && "Championship points after each round, as the table stood then (dropped scores applied)."}
					{mode === "gap" && "Points behind the championship leader after each round."}
					{mode === "position" && "Championship position after each round."} Select up to {HIGHLIGHT.length} {team ? "teams" : "drivers"} to
					highlight them; hover or tap the chart for the table at each round.
				</p>
				<ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-sm:[&_.fi]:hidden! sm:flex sm:flex-wrap">
					{table.series.map((s) => {
						const i = slots.indexOf(s.key);
						const color = i >= 0 ? HIGHLIGHT[i] : null;
						return (
							<li key={s.key} className="flex min-w-0 items-center gap-1" onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)}>
								<Toggle
									size="sm"
									variant="outline"
									pressed={i >= 0}
									onPressedChange={() => toggle(s.key)}
									aria-label={`${i >= 0 ? "Stop highlighting" : "Highlight"} ${s.label}`}
									className="min-w-0 px-1.5"
								>
									<span className="inline-block h-1 w-4 rounded-full" style={{ background: color ?? "var(--muted-foreground)", opacity: color ? 1 : 0.4 }} />
								</Toggle>
								{s.driver ? (
									<>
										<DriverLink
											driver={{ ...s.driver, name: shortOf.get(s.key) ?? s.short }}
											className={cn("text-sm sm:hidden [&>span]:whitespace-nowrap", color ? "font-medium" : "text-muted-foreground")}
										/>
										<DriverLink driver={s.driver} className={cn("text-sm max-sm:hidden", color ? "font-medium" : "text-muted-foreground")} />
									</>
								) : s.team ? (
									<span className={cn("inline-flex min-w-0 items-center gap-1 text-sm", color ? "font-medium" : "text-muted-foreground")}>
										<TeamLink team={s.team} flag className="max-sm:[&>span]:whitespace-nowrap" />
										{s.label !== s.team.name && s.engine && <span className="text-muted-foreground truncate text-xs">{s.engine.name}</span>}
									</span>
								) : (
									<span className="text-sm">{s.label}</span>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}

export function SeasonProgressionChart({ progression }: { progression: SeasonProgression }) {
	const [kind, setKind] = useState<"drivers" | "constructors">("drivers");
	const [mode, setMode] = useState<Mode>("points");
	const table = kind === "constructors" && progression.constructors ? progression.constructors : progression.drivers;
	const team = table === progression.constructors;
	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3">
				{progression.constructors && (
					<ToggleGroup variant="outline" size="sm" spacing={0} value={kind} onValueChange={(v: string) => v && setKind(v as typeof kind)}>
						<ToggleGroupItem value="drivers">Drivers</ToggleGroupItem>
						<ToggleGroupItem value="constructors">Constructors</ToggleGroupItem>
					</ToggleGroup>
				)}
				<ToggleGroup variant="outline" size="sm" spacing={0} value={mode} onValueChange={(v: string) => v && setMode(v as Mode)}>
					<ToggleGroupItem value="points">Points</ToggleGroupItem>
					<ToggleGroupItem value="gap">Gap to leader</ToggleGroupItem>
					<ToggleGroupItem value="position">Position</ToggleGroupItem>
				</ToggleGroup>
			</div>
			<ProgressionChart key={kind} table={table} rounds={progression.rounds} mode={mode} team={team} />
		</div>
	);
}
