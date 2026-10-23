"use client";

// "All results" on a driver or constructor page: every race, filterable to the wins, podiums,
// poles, fastest laps or retirements, and by season. The real site fetches the entity's file
// (public/data/results/…) when the list mounts; universes pass their own rows in.
// The stat cards above link here with "#results-<filter>".

import { useEffect, useMemo, useState } from "react";
import { unpackResults, type EntityResult, type ResultsFile, type ResultsKind } from "@pitwall/core/f1/entity-results";
import type { DriverRef, TeamRef } from "@pitwall/core/f1/views";
import { cn } from "@/lib/utils";
import { DriverLink, Pos, RaceLink, Section, TableCard, TeamLink, num } from "../f1";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

const FILTERS = {
	all: { label: "All", test: () => true },
	wins: { label: "Wins", test: (r: EntityResult) => r.position === "1" },
	podiums: { label: "Podiums", test: (r: EntityResult) => ["1", "2", "3"].includes(r.position) },
	poles: { label: "Poles", test: (r: EntityResult) => r.pole },
	"fastest-laps": { label: "Fastest laps", test: (r: EntityResult) => r.fastestLap },
	retirements: { label: "Retirements", test: (r: EntityResult) => r.position === "DNF" },
} as const;
type Filter = keyof typeof FILTERS;
const isFilter = (s: string): s is Filter => s in FILTERS;

/** Rows shown before "Show all". */
const PAGE = 25;

const loaded = new Map<string, Promise<EntityResult[] | null>>();
function load(kind: ResultsKind, id: string) {
	const key = `${kind}/${id}`;
	let p = loaded.get(key);
	if (!p) {
		p = fetch(`/data/results/${key}.json`)
			.then((r) => (r.ok ? (r.json() as Promise<ResultsFile>) : null))
			.then((f) => f && unpackResults(f))
			.catch(() => null);
		loaded.set(key, p);
	}
	return p;
}

export function ResultsExplorer({ kind, id, rows: given }: { kind: ResultsKind; id: string; rows?: EntityResult[] }) {
	const [fetched, setFetched] = useState<{ id: string; rows: EntityResult[] | null } | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [season, setSeason] = useState("all");
	const [all, setAll] = useState(false);
	/** Set by a "#results-…" link: scroll here once the rows are in. */
	const [jump, setJump] = useState(0);

	useEffect(() => {
		if (given) return;
		let live = true;
		load(kind, id).then((rows) => live && setFetched({ id, rows }));
		return () => {
			live = false;
		};
	}, [kind, id, given]);

	// "#results-wins" (from the stat cards) picks a filter
	useEffect(() => {
		const apply = () => {
			const m = /^#results(?:-(.+))?$/.exec(location.hash);
			if (!m) return;
			if (m[1] && isFilter(m[1])) setFilter(m[1]);
			setSeason("all");
			setAll(false);
			setJump((j) => j + 1);
		};
		apply();
		window.addEventListener("hashchange", apply);
		return () => window.removeEventListener("hashchange", apply);
	}, []);

	const rows = given ?? (fetched?.id === id ? fetched.rows : undefined);
	const ready = rows !== undefined;
	useEffect(() => {
		if (jump && ready) document.getElementById("results")?.scrollIntoView({ block: "start" });
	}, [jump, ready]);
	const years = useMemo(() => [...new Set((rows ?? []).map((r) => r.race.year))].reverse(), [rows]);
	const counts = useMemo(() => Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, (rows ?? []).filter(f.test).length])) as Record<Filter, number>, [rows]);
	const shown = useMemo(
		() =>
			(rows ?? [])
				.filter((r) => FILTERS[filter].test(r) && (season === "all" || String(r.race.year) === season))
				.reverse(),
		[rows, filter, season],
	);
	const visible = all ? shown : shown.slice(0, PAGE);
	const otherLabel = kind === "driver" ? "Team" : "Driver";

	return (
		<Section
			title={
				<span id="results" className="scroll-mt-20">
					All results
				</span>
			}
			description={rows ? `${num(rows.length)} race entries, newest first` : undefined}
		>
			{rows === undefined ? (
				<Skeleton className="h-96 w-full rounded-xl" />
			) : rows === null ? (
				<p className="text-muted-foreground text-sm">The results couldn&apos;t be loaded.</p>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<ToggleGroup
							variant="outline"
							size="sm"
							spacing={0}
							value={filter}
							onValueChange={(v: string) => {
								if (v && isFilter(v)) {
									setFilter(v);
									setAll(false);
								}
							}}
							className="flex-wrap"
						>
							{(Object.keys(FILTERS) as Filter[])
								.filter((k) => k === "all" || counts[k] > 0)
								.map((k) => (
									<ToggleGroupItem key={k} value={k}>
										{FILTERS[k].label}
										{k !== "all" && <span className="text-muted-foreground tabular-nums">{counts[k]}</span>}
									</ToggleGroupItem>
								))}
						</ToggleGroup>
						{years.length > 1 && (
							<Select
								items={[{ value: "all", label: "All seasons" }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
								value={season}
								onValueChange={(v) => {
									if (v != null) {
										setSeason(String(v));
										setAll(false);
									}
								}}
							>
								<SelectTrigger size="sm" className="w-36" aria-label="Season">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All seasons</SelectItem>
									{years.map((y) => (
										<SelectItem key={y} value={String(y)}>
											{y}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>
					{shown.length ? (
						<TableCard>
							<TableHeader>
								<TableRow>
									<TableHead>Race</TableHead>
									<TableHead className="max-sm:hidden">{otherLabel}</TableHead>
									<TableHead className="text-right">Grid</TableHead>
									<TableHead className="text-right">Finish</TableHead>
									<TableHead className="text-right">Pts</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visible.map((r, i) => (
									<TableRow key={`${r.race.year}-${r.race.round}-${r.other.id}-${i}`}>
										<TableCell className="whitespace-normal">
											<RaceLink race={r.race} year className="font-medium" />
											<div className="text-muted-foreground text-xs sm:hidden">
												<Other kind={kind} other={r.other} />
											</div>
										</TableCell>
										<TableCell className="max-sm:hidden">
											<Other kind={kind} other={r.other} />
										</TableCell>
										<TableCell className={cn("text-right tabular-nums", r.pole ? "text-primary font-semibold" : "text-muted-foreground")} title={r.pole ? "Pole position" : undefined}>
											{r.grid || (r.grid === 0 ? "PL" : "–")}
										</TableCell>
										<TableCell className="text-right">
											<span className="inline-flex items-center justify-end gap-1.5">
												{r.fastestLap && (
													<span className="text-primary text-[10px] font-semibold" title="Fastest lap">
														FL
													</span>
												)}
												<Pos text={r.position} />
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{r.points ? num(r.points) : ""}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					) : (
						<p className="text-muted-foreground text-sm">Nothing to show for this filter.</p>
					)}
					{shown.length > PAGE && (
						<Button variant="outline" size="sm" onClick={() => setAll((a) => !a)}>
							{all ? "Show fewer" : `Show all ${num(shown.length)}`}
						</Button>
					)}
				</>
			)}
		</Section>
	);
}

function Other({ kind, other }: { kind: ResultsKind; other: DriverRef | TeamRef }) {
	return kind === "driver" ? <TeamLink team={other as TeamRef} /> : <DriverLink driver={other as DriverRef} flag={false} />;
}
