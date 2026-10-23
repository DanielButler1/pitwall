"use client";

// Lap chart and pit stops of one race, from the per-race Jolpica file
// (data/laps/<raceId>.json). Server pages pass the file in; universe pages
// fetch /data/laps/<raceId>.json on demand (the race page only offers these
// tabs when the race's results still match the real race).

import { useEffect, useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RaceLapFile } from "@pitwall/core/f1/laps";
import type { DriverRef } from "@pitwall/core/f1/views";
import { cn } from "@/lib/utils";
import { DriverLink, TableCard } from "../f1";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Skeleton } from "../ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Toggle } from "../ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

/* ------------------------------------------------------------------ data --- */

const requests = new Map<number, Promise<RaceLapFile | null>>();

function fetchLaps(raceId: number): Promise<RaceLapFile | null> {
	let p = requests.get(raceId);
	if (!p) {
		p = fetch(`/data/laps/${raceId}.json`)
			.then((r) => (r.ok ? (r.json() as Promise<RaceLapFile>) : null))
			.catch(() => null);
		requests.set(raceId, p);
	}
	return p;
}

/** The race's lap file: the server-provided one, or fetched in the browser. */
function useRaceLaps(raceId: number, initial: RaceLapFile | null | undefined) {
	const [state, setState] = useState<{ id: number; data: RaceLapFile | null } | null>(initial !== undefined ? { id: raceId, data: initial } : null);
	useEffect(() => {
		if (initial !== undefined) return;
		let live = true;
		fetchLaps(raceId).then((data) => live && setState({ id: raceId, data }));
		return () => {
			live = false;
		};
	}, [raceId, initial]);
	const current = initial !== undefined ? { id: raceId, data: initial } : state;
	return current && current.id === raceId ? { loading: false, data: current.data } : { loading: true, data: null };
}

export const lapTime = (ms: number | null | undefined) => {
	if (ms == null) return "";
	const m = Math.floor(ms / 60000);
	const s = ((ms % 60000) / 1000).toFixed(3);
	return m ? `${m}:${s.padStart(6, "0")}` : s;
};

function Loading() {
	return <Skeleton className="h-[28rem] w-full rounded-xl" />;
}

function Missing({ what }: { what: string }) {
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CircleAlert />
				</EmptyMedia>
				<EmptyTitle>No {what} for this race</EmptyTitle>
				<EmptyDescription>The lap data file couldn&apos;t be loaded. Run the data update to fetch the Jolpica dump.</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

/* ------------------------------------------------------------- lap chart --- */

/** Fixed highlight order (never cycled); every other driver is muted ink. */
const HIGHLIGHT = ["var(--f1)", "var(--chart-3)", "var(--gold)"];

type Session = { drivers: string[]; positions: (number | null)[][]; times: (number | null)[][] };
type Row = { lap: number } & Record<string, number | null>;

function ChartTooltip({
	active,
	payload,
	label,
	refs,
	session,
	colorOf,
}: {
	active?: boolean;
	payload?: { dataKey?: unknown; value?: unknown }[];
	label?: unknown;
	refs: Map<string, DriverRef>;
	session: Session;
	colorOf: (id: string) => string | null;
}) {
	if (!active || !payload?.length) return null;
	const lap = Number(label);
	const order = payload
		.filter((p) => typeof p.value === "number")
		.map((p) => ({ id: String(p.dataKey), pos: p.value as number }))
		.sort((a, b) => a.pos - b.pos);
	const index = new Map(session.drivers.map((d, i) => [d, i]));
	return (
		<div className="bg-popover text-popover-foreground ring-foreground/10 max-w-xs rounded-lg px-3 py-2 text-xs shadow-md ring-1">
			<div className="mb-1 font-medium tabular-nums">{lap === 0 ? "Grid" : `Lap ${lap}`}</div>
			<div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5">
				{order.map(({ id, pos }) => {
					const color = colorOf(id);
					const t = lap > 0 ? session.times[index.get(id)!]?.[lap - 1] : null;
					return (
						<div key={id} className={cn("contents", !color && "text-muted-foreground")}>
							<span className="text-right tabular-nums">P{pos}</span>
							<span className={cn("flex min-w-0 items-center gap-1.5", color && "text-foreground font-medium")}>
								<span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} />
								<span className="truncate">{refs.get(id)?.name ?? id}</span>
							</span>
							<span className="tabular-nums">{color ? lapTime(t) : ""}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function LapChart({
	session,
	refs,
	grid,
	finish,
	initial,
}: {
	session: Session;
	refs: Map<string, DriverRef>;
	grid: Map<string, number>;
	/** Classified result per driver ("1", "DNF"…). */
	finish: Map<string, string>;
	initial: string[];
}) {
	const [selected, setSelected] = useState<string[]>(initial.filter((d) => session.drivers.includes(d)).slice(0, HIGHLIGHT.length));
	const [hovered, setHovered] = useState<string | null>(null);
	const laps = Math.max(0, ...session.positions.map((p) => p.length));
	const field = Math.max(session.drivers.length, ...session.positions.flat().map((p) => p ?? 0));
	const hasGrid = session.drivers.some((d) => grid.has(d));

	const data = useMemo(() => {
		const rows: Row[] = [];
		for (let lap = hasGrid ? 0 : 1; lap <= laps; lap++) {
			const row: Row = { lap } as Row;
			session.drivers.forEach((d, i) => {
				row[d] = lap === 0 ? (grid.get(d) ?? null) : (session.positions[i][lap - 1] ?? null);
			});
			rows.push(row);
		}
		return rows;
	}, [session, grid, laps, hasGrid]);

	const colorOf = (id: string) => {
		const i = selected.indexOf(id);
		if (i >= 0) return HIGHLIGHT[i];
		return id === hovered ? "var(--foreground)" : null;
	};
	const toggle = (id: string) =>
		setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-HIGHLIGHT.length)));
	// muted lines first, highlighted ones drawn on top
	const drawOrder = [...session.drivers].sort((a, b) => Number(colorOf(a) != null) - Number(colorOf(b) != null));
	const rows = useMemo(
		() =>
			session.drivers.map((id, i) => {
				const pos = session.positions[i].filter((p): p is number => p != null);
				const times = session.times[i].filter((t): t is number => t != null);
				return {
					id,
					grid: grid.get(id) ?? null,
					finish: finish.get(id) ?? (pos.length ? `P${pos[pos.length - 1]}` : "–"),
					best: pos.length ? Math.min(...pos) : null,
					led: pos.filter((p) => p === 1).length,
					bestLap: times.length ? Math.min(...times) : null,
				};
			}),
		[session, grid, finish],
	);
	const fastest = Math.min(...rows.map((r) => r.bestLap ?? Infinity));
	const ticks = [1, ...Array.from({ length: Math.floor(field / 5) }, (_, i) => (i + 1) * 5).filter((t) => t <= field)];

	return (
		<div className="space-y-4">
			<div className="h-[28rem] w-full">
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }} onMouseLeave={() => setHovered(null)}>
						<CartesianGrid vertical={false} stroke="var(--border)" />
						<XAxis
							dataKey="lap"
							tickLine={false}
							axisLine={false}
							tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
							minTickGap={24}
							tickFormatter={(v: number) => (v === 0 ? "Grid" : String(v))}
						/>
						<YAxis reversed domain={[1, field]} ticks={ticks} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={44} tickFormatter={(v: number) => `P${v}`} />
						<Tooltip
							content={(props) => <ChartTooltip {...(props as object)} refs={refs} session={session} colorOf={colorOf} />}
							cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
							wrapperStyle={{ zIndex: 20 }}
						/>
						{drawOrder.map((id) => {
							const color = colorOf(id);
							return (
								<Line
									key={id}
									type="linear"
									dataKey={id}
									name={refs.get(id)?.name ?? id}
									stroke={color ?? "var(--muted-foreground)"}
									strokeOpacity={color ? 1 : 0.28}
									strokeWidth={color ? 2.5 : 1.5}
									dot={false}
									activeDot={color ? { r: 4, strokeWidth: 2, stroke: "var(--background)", fill: color } : false}
									connectNulls={false}
									isAnimationActive={false}
									onMouseEnter={() => setHovered(id)}
								/>
							);
						})}
					</LineChart>
				</ResponsiveContainer>
			</div>
			<p className="text-muted-foreground text-xs">
				Position at the end of each lap. Select up to {HIGHLIGHT.length} drivers below to highlight them.
			</p>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead className="w-10">
							<span className="sr-only">Highlight</span>
						</TableHead>
						<TableHead>Driver</TableHead>
						<TableHead className="text-right">Grid</TableHead>
						<TableHead className="text-right">Finish</TableHead>
						<TableHead className="text-right max-sm:hidden">Best</TableHead>
						<TableHead className="text-right">Led</TableHead>
						<TableHead className="text-right">Best lap</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => {
						const ref = refs.get(r.id);
						const i = selected.indexOf(r.id);
						const color = i >= 0 ? HIGHLIGHT[i] : null;
						return (
							<TableRow key={r.id} onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}>
								<TableCell>
									<Toggle
										size="sm"
										variant="outline"
										pressed={i >= 0}
										onPressedChange={() => toggle(r.id)}
										aria-label={`${i >= 0 ? "Stop highlighting" : "Highlight"} ${ref?.name ?? r.id}`}
										className="min-w-0 px-1.5"
									>
										<span className="inline-block h-1 w-4 rounded-full" style={{ background: color ?? "var(--muted-foreground)", opacity: color ? 1 : 0.4 }} />
									</Toggle>
								</TableCell>
								<TableCell className="max-sm:[&_.fi]:hidden">
									{ref ? <DriverLink driver={ref} className={cn(color && "font-medium")} /> : r.id}
								</TableCell>
								<TableCell className="text-muted-foreground text-right tabular-nums">{r.grid ?? "–"}</TableCell>
								<TableCell className="text-right font-medium tabular-nums">{r.finish}</TableCell>
								<TableCell className="text-muted-foreground text-right tabular-nums max-sm:hidden">{r.best ? `P${r.best}` : "–"}</TableCell>
								<TableCell className="text-right tabular-nums">{r.led || <span className="text-muted-foreground">–</span>}</TableCell>
								<TableCell className={cn("text-right whitespace-nowrap tabular-nums", r.bestLap != null && r.bestLap === fastest && "text-primary font-semibold")}>
									{lapTime(r.bestLap) || "–"}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</TableCard>
		</div>
	);
}

export function LapChartPanel({
	raceId,
	initial,
	drivers,
	grid,
	finish,
	sprintDrivers,
	sprintGrid,
	sprintFinish,
	sprintAvailable,
	highlight,
}: {
	raceId: number;
	initial?: RaceLapFile | null;
	drivers: DriverRef[];
	grid: Record<string, number>;
	finish: Record<string, string>;
	sprintDrivers: DriverRef[];
	sprintGrid: Record<string, number>;
	sprintFinish: Record<string, string>;
	sprintAvailable: boolean;
	highlight: string[];
}) {
	const { loading, data } = useRaceLaps(raceId, initial);
	const [which, setWhich] = useState<"race" | "sprint">("race");
	const refs = useMemo(() => new Map([...sprintDrivers, ...drivers].map((d) => [d.id, d])), [drivers, sprintDrivers]);
	const raceGrid = useMemo(() => new Map(Object.entries(grid)), [grid]);
	const sGrid = useMemo(() => new Map(Object.entries(sprintGrid)), [sprintGrid]);
	const raceFinish = useMemo(() => new Map(Object.entries(finish)), [finish]);
	const sFinish = useMemo(() => new Map(Object.entries(sprintFinish)), [sprintFinish]);
	if (loading) return <Loading />;
	if (!data?.drivers || !data.positions || !data.times) return <Missing what="lap chart" />;
	const race: Session = { drivers: data.drivers, positions: data.positions, times: data.times };
	const sprint = sprintAvailable ? data.sprint : undefined;
	return (
		<div className="space-y-4">
			{sprint && (
				<ToggleGroup variant="outline" size="sm" spacing={0} value={which} onValueChange={(v: string) => v && setWhich(v as "race" | "sprint")}>
					<ToggleGroupItem value="race">Grand Prix</ToggleGroupItem>
					<ToggleGroupItem value="sprint">Sprint</ToggleGroupItem>
				</ToggleGroup>
			)}
			{which === "sprint" && sprint ? (
				<LapChart key="sprint" session={sprint} refs={refs} grid={sGrid} finish={sFinish} initial={highlight} />
			) : (
				<LapChart key="race" session={race} refs={refs} grid={raceGrid} finish={raceFinish} initial={highlight} />
			)}
		</div>
	);
}

/* ------------------------------------------------------------- pit stops --- */

const stopTime = (ms: number | null) => {
	if (ms == null) return "–";
	return ms >= 60000 ? lapTime(ms) : `${(ms / 1000).toFixed(3)} s`;
};

export function PitStopsPanel({ raceId, initial, drivers }: { raceId: number; initial?: RaceLapFile | null; drivers: DriverRef[] }) {
	const { loading, data } = useRaceLaps(raceId, initial);
	const refs = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
	if (loading) return <Loading />;
	if (!data?.pitStops?.length) return <Missing what="pit stops" />;
	const fastest = Math.min(...data.pitStops.map((p) => p[3] ?? Infinity));
	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">Time in the pit lane, from pit entry to pit exit. Long times are usually stops under a red flag.</p>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12 text-right sm:w-16">Lap</TableHead>
						<TableHead>Driver</TableHead>
						<TableHead className="text-right">Stop</TableHead>
						<TableHead className="text-right">Duration</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.pitStops.map(([id, stop, lap, ms], i) => {
						const ref = refs.get(id);
						return (
							<TableRow key={`${id}-${stop}-${i}`}>
								<TableCell className="text-right tabular-nums">{lap ?? "–"}</TableCell>
								<TableCell>{ref ? <DriverLink driver={ref} className="font-medium" /> : id}</TableCell>
								<TableCell className="text-muted-foreground text-right tabular-nums">{stop}</TableCell>
								<TableCell className={cn("text-right whitespace-nowrap tabular-nums", ms === fastest && "text-primary font-semibold")}>{stopTime(ms)}</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</TableCard>
		</div>
	);
}
