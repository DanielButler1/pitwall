"use client";

// Interactive parts of the compare page: the driver/team picker (static search
// index, URL-driven so it works on the real site and inside universes) and the
// cumulative progression chart.

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COMPARE_MAX, type CompareEntity, type ProgressPoint } from "@/lib/f1/compare";
import type { SearchEntry } from "@/lib/f1/views";
import { Flag, num } from "../f1";
import { Button } from "../ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Spinner } from "../ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { COMPARE_COLORS } from "./compare-colors";

/* --------------------------------------------------------------- picker --- */

let indexPromise: Promise<SearchEntry[]> | undefined;
const loadIndex = () =>
	(indexPromise ??= fetch("/data/search-index.json")
		.then((r) => (r.ok ? r : fetch("/search-index")))
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<SearchEntry[]>;
		})
		.catch((e) => {
			indexPromise = undefined;
			throw e;
		}));

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type PickedEntity = { id: string; name: string; country: string | null };

/** Selected drivers/teams as removable chips plus an "Add" search popover; changes go to the URL. */
export function ComparePicker({ kind, picked }: { kind: "driver" | "team"; picked: PickedEntity[] }) {
	const router = useRouter();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [index, setIndex] = useState<SearchEntry[] | null>(null);
	const [error, setError] = useState(false);
	const param = kind === "driver" ? "d" : "t";
	const go = (ids: string[]) => router.push(ids.length ? `${pathname}?${param}=${ids.map(encodeURIComponent).join(",")}` : pathname);

	const load = () => {
		if (index) return;
		loadIndex()
			.then((e) => setIndex(e))
			.catch(() => setError(true));
	};

	const hits = useMemo(() => {
		if (!index) return [];
		const k = kind === "driver" ? "driver" : "constructor";
		const taken = new Set(picked.map((p) => p.id));
		const tokens = fold(query.trim()).split(/\s+/).filter(Boolean);
		return index
			.filter((e) => e[0] === k && !taken.has(e[1]))
			.filter((e) => {
				const hay = fold(`${e[2]} ${e[4]}`);
				return tokens.every((t) => hay.includes(t));
			})
			.slice(0, 40);
	}, [index, query, kind, picked]);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{picked.map((p, i) => (
				<span key={p.id} className="bg-card ring-foreground/10 inline-flex h-8 items-center gap-2 rounded-md pr-1 pl-2.5 text-sm ring-1">
					<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COMPARE_COLORS[i] }} aria-hidden />
					<Flag code={p.country} />
					<span className="font-medium">{p.name}</span>
					<Button variant="ghost" size="icon-xs" aria-label={`Remove ${p.name}`} onClick={() => go(picked.filter((x) => x.id !== p.id).map((x) => x.id))}>
						<X />
					</Button>
				</span>
			))}
			{picked.length < COMPARE_MAX && (
				<Popover
					open={open}
					onOpenChange={(o) => {
						setOpen(o);
						if (o) load();
						else setQuery("");
					}}
				>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm" onPointerEnter={load}>
							<Plus data-icon="inline-start" />
							Add {kind === "driver" ? "driver" : "team"}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-72 p-0" align="start">
						<Command shouldFilter={false}>
							<CommandInput value={query} onValueChange={setQuery} placeholder={kind === "driver" ? "Search drivers" : "Search teams"} />
							<CommandList>
								{!index && !error && (
									<div className="flex justify-center py-6">
										<Spinner />
									</div>
								)}
								{error && <div className="text-muted-foreground py-6 text-center text-sm">Couldn&apos;t load the search index.</div>}
								{index && <CommandEmpty>No {kind === "driver" ? "driver" : "team"} found.</CommandEmpty>}
								{hits.length > 0 && (
									<CommandGroup>
										{hits.map((e) => (
											<CommandItem
												key={e[1]}
												value={e[1]}
												onSelect={() => {
													setOpen(false);
													setQuery("");
													go([...picked.map((p) => p.id), e[1]]);
												}}
											>
												<Flag code={e[3] || null} />
												<span className="truncate">{e[2]}</span>
												<span className="text-muted-foreground ml-auto text-xs tabular-nums">{e[4].match(/\d{4}(-\d{4})?/)?.[0]}</span>
											</CommandItem>
										))}
									</CommandGroup>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}

/* ---------------------------------------------------------------- chart --- */

type Metric = "wins" | "podiums" | "points";
type Axis = "starts" | "age";
type Row = { x: number } & Record<string, number | null>;

const AGE_STEP = 0.25;

/** Cumulative value at each x: by start number directly, by age resampled every quarter year. */
function buildRows(entities: CompareEntity[], metric: Metric, axis: Axis): Row[] {
	if (axis === "starts") {
		const max = Math.max(0, ...entities.map((e) => e.progress.length));
		return Array.from({ length: max }, (_, i) => {
			const row: Row = { x: i + 1 } as Row;
			for (const e of entities) row[e.id] = e.progress[i]?.[metric] ?? null;
			return row;
		});
	}
	const aged = entities.map((e) => ({ id: e.id, pts: e.progress.filter((p): p is ProgressPoint & { age: number } => p.age != null) }));
	const ages = aged.flatMap((a) => a.pts.map((p) => p.age));
	if (!ages.length) return [];
	const from = Math.floor(Math.min(...ages) / AGE_STEP) * AGE_STEP;
	const to = Math.ceil(Math.max(...ages) / AGE_STEP) * AGE_STEP;
	const cursor = new Map(aged.map((a) => [a.id, 0]));
	const rows: Row[] = [];
	for (let x = from; x <= to + 1e-9; x += AGE_STEP) {
		const row: Row = { x: Math.round(x * 100) / 100 } as Row;
		for (const a of aged) {
			if (!a.pts.length || x < a.pts[0].age - AGE_STEP || x > a.pts[a.pts.length - 1].age + AGE_STEP) {
				row[a.id] = null;
				continue;
			}
			let i = cursor.get(a.id)!;
			while (i + 1 < a.pts.length && a.pts[i + 1].age <= x) i++;
			cursor.set(a.id, i);
			row[a.id] = a.pts[i].age <= x ? a.pts[i][metric] : 0;
		}
		rows.push(row);
	}
	return rows;
}

const nameOf = (e: CompareEntity) => e.driver?.name ?? e.team?.name ?? e.id;
const short = (e: CompareEntity) => (e.driver ? e.driver.name.split(" ").slice(-1)[0] : nameOf(e));
const ageLabel = (x: number) => `${Math.floor(x)}y ${Math.round((x % 1) * 12)}m`;

function ChartTooltip({
	active,
	payload,
	label,
	entities,
	axis,
	unit,
}: {
	active?: boolean;
	payload?: { dataKey?: unknown; value?: unknown }[];
	label?: unknown;
	entities: CompareEntity[];
	axis: Axis;
	unit: string;
}) {
	if (!active || !payload?.length) return null;
	const x = Number(label);
	const values = new Map(payload.map((p) => [String(p.dataKey), p.value]));
	return (
		<div className="bg-popover text-popover-foreground ring-foreground/10 rounded-lg px-3 py-2 text-xs shadow-md ring-1">
			<div className="mb-1 font-medium tabular-nums">{axis === "starts" ? `After ${x} ${unit}${x === 1 ? "" : "s"}` : `Age ${ageLabel(x)}`}</div>
			<div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5">
				{entities.map((e, i) => {
					const v = values.get(e.id);
					return (
						<div key={e.id} className="contents">
							<span className="inline-block h-0.5 w-3 rounded-full" style={{ background: COMPARE_COLORS[i] }} />
							<span>{nameOf(e)}</span>
							<span className="text-right font-medium tabular-nums">{typeof v === "number" ? num(v) : "–"}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function ProgressChart({ entities, kind }: { entities: CompareEntity[]; kind: "driver" | "team" }) {
	const [metric, setMetric] = useState<Metric>("wins");
	const [axis, setAxis] = useState<Axis>("starts");
	const canAge = kind === "driver" && entities.every((e) => e.dateOfBirth);
	const useAxis: Axis = canAge ? axis : "starts";
	const data = useMemo(() => buildRows(entities, metric, useAxis), [entities, metric, useAxis]);
	const unit = kind === "driver" ? "start" : "race";
	const ticks = useMemo(() => {
		if (!data.length) return undefined;
		const lo = data[0].x;
		const hi = data[data.length - 1].x;
		const span = hi - lo;
		const step = useAxis === "age" ? (span > 16 ? 4 : 2) : [10, 25, 50, 100, 200, 250, 500].find((s) => span / s <= 8) ?? 1000;
		const out: number[] = [];
		for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
		return out;
	}, [data, useAxis]);
	const lastIndex = useMemo(() => {
		const m = new Map<string, number>();
		data.forEach((r, i) => {
			for (const e of entities) if (r[e.id] != null) m.set(e.id, i);
		});
		return m;
	}, [data, entities]);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3">
				<ToggleGroup variant="outline" size="sm" spacing={0} value={metric} onValueChange={(v: string) => v && setMetric(v as Metric)}>
					<ToggleGroupItem value="wins">Wins</ToggleGroupItem>
					<ToggleGroupItem value="podiums">Podiums</ToggleGroupItem>
					<ToggleGroupItem value="points">Points</ToggleGroupItem>
				</ToggleGroup>
				{canAge && (
					<ToggleGroup variant="outline" size="sm" spacing={0} value={useAxis} onValueChange={(v: string) => v && setAxis(v as Axis)}>
						<ToggleGroupItem value="starts">By start</ToggleGroupItem>
						<ToggleGroupItem value="age">By age</ToggleGroupItem>
					</ToggleGroup>
				)}
			</div>
			<div className="h-[24rem] w-full">
				<ResponsiveContainer width="100%" height="100%">
					<LineChart data={data} margin={{ top: 8, right: 88, bottom: 4, left: -8 }}>
						<CartesianGrid vertical={false} stroke="var(--border)" />
						<XAxis
							dataKey="x"
							type="number"
							domain={["dataMin", "dataMax"]}
							tickLine={false}
							axisLine={false}
							tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
							ticks={ticks}
							tickFormatter={(v: number) => String(v)}
						/>
						<YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={52} tickFormatter={(v: number) => num(v)} />
						<Tooltip
							content={(props) => <ChartTooltip {...(props as object)} entities={entities} axis={useAxis} unit={unit} />}
							cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
							wrapperStyle={{ zIndex: 20 }}
						/>
						{entities.map((e, i) => (
							<Line
								key={e.id}
								type="stepAfter"
								dataKey={e.id}
								name={nameOf(e)}
								stroke={COMPARE_COLORS[i]}
								strokeWidth={2}
								dot={false}
								activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: COMPARE_COLORS[i] }}
								connectNulls={false}
								isAnimationActive={false}
								label={(p: { index?: number; x?: number | string; y?: number | string }) =>
									p.index === lastIndex.get(e.id) ? (
										<text key={e.id} x={Number(p.x) + 6} y={Number(p.y)} dy={4} fontSize={12} fill="var(--foreground)">
											{short(e)}
										</text>
									) : (
										<g key={`${e.id}-${p.index}`} />
									)
								}
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			</div>
			<ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
				{entities.map((e, i) => (
					<li key={e.id} className="flex items-center gap-2">
						<span className="inline-block h-1 w-4 rounded-full" style={{ background: COMPARE_COLORS[i] }} aria-hidden />
						<span>{nameOf(e)}</span>
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-xs">
				Cumulative {metric} {useAxis === "starts" ? `after each ${unit}` : "by age (sampled every three months)"}.
				{metric === "points" && " Points as awarded at the time, so eras with different scoring aren't directly comparable."}
			</p>
		</div>
	);
}
