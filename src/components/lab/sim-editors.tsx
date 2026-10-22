"use client";

// Editors for the simulation layer: whole-history runs, performance tinkering,
// and seats & careers. Each builds candidate change(s), previews them in the
// worker, and hands them to `onAdd`.

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Info, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { isStart, type Db } from "@/lib/f1/dataset";
import { driverRef, teamRef } from "@/lib/f1/views";
import type { Change, UniverseDb } from "@/lib/universe/apply";
import { newId } from "@/lib/universe/store";
import { useRatingCurves } from "@/lib/universe/use-universe";
import { DEFAULT_ANCHOR } from "@/lib/sim/history";
import { DEFAULT_SIM, randomSeed } from "@/lib/sim/race";
import { DriverLink, Hint, SeasonLink, TeamLink } from "@/components/f1";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Actions,
	Choice,
	Delta,
	DriverCombobox,
	Field,
	PreviewCard,
	Reroll,
	SimControls,
	StandingsPreview,
	tableEdges,
	TeamCombobox,
	TitleFlips,
	titleFlips,
	Updating,
	usePreview,
	yearOptions,
	type EditorProps,
} from "./editors";
import { RatingChart, type CurvePoint } from "./rating-chart";

/* --------------------------------------------------------------- helpers --- */

const FUTURE_LIMIT = 2100;
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const lastReal = (db: Db) => db.meta.lastCompletedYear;
const years = (from: number, to: number) => range(from, to).map((y) => ({ value: y, label: String(y) })).reverse();

/** Seasons the universe already simulates (so performance changes show up there). */
function simulatedYears(changes: Change[], mode?: "dynamic") {
	const out = new Set<number>();
	for (const c of changes) {
		if (c.kind === "history-sim" && (!mode || c.mode === mode)) for (const y of range(c.fromYear, c.toYear)) out.add(y);
		if (!mode && c.kind === "season-sim") out.add(c.year);
	}
	return out;
}

function champion(db: Db, y: number) {
	return db.driverStandings.get(y)?.find((r) => r.champion)?.id ?? null;
}

/** The team a driver raced most for in a season. */
function mainTeam(db: Db, driverId: string, year: number) {
	const counts = new Map<string, number>();
	for (const r of db.resultsByDriver.get(driverId) ?? []) if (db.raceById.get(r.raceId)?.year === year) counts.set(r.constructorId, (counts.get(r.constructorId) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Seasons a driver started a race in reality (first and last). */
function realCareer(db: Db, driverId: string): [number, number] | null {
	let first = Infinity;
	let last = -Infinity;
	for (const r of db.resultsByDriver.get(driverId) ?? []) {
		const y = db.raceById.get(r.raceId)?.year;
		if (y == null || !isStart(r)) continue;
		first = Math.min(first, y);
		last = Math.max(last, y);
	}
	return Number.isFinite(first) ? [first, last] : null;
}

function standing(db: Db, year: number, id: string, constructors = false) {
	return (constructors ? db.constructorStandings : db.driverStandings).get(year)?.find((r) => r.id === id) ?? null;
}

function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
	const Icon = tone === "warn" ? CircleAlert : Info;
	return (
		<div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", tone === "warn" ? "border-universe/30 bg-universe/5" : "bg-muted/40")}>
			<Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-universe" : "text-muted-foreground")} />
			<div className="space-y-2">{children}</div>
		</div>
	);
}

function ToggleRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<Label className="flex cursor-pointer items-center gap-2 font-normal">
			<Switch checked={checked} onCheckedChange={(v: boolean) => onChange(v)} className="data-checked:border-universe data-checked:bg-universe" />
			{label}
		</Label>
	);
}

function Checks({ db }: { db: UniverseDb | null }) {
	if (!db?.sim) return null;
	const v = db.sim.violations.length;
	return v === 0 ? (
		<Badge variant="secondary" className="gap-1">
			<CircleCheck className="size-3.5" /> All race checks passed
		</Badge>
	) : (
		<Badge variant="destructive" className="gap-1">
			<CircleAlert className="size-3.5" /> {v} race check{v === 1 ? "" : "s"} failed
		</Badge>
	);
}

/* --------------------------------------------------------- history sim --- */

export function HistorySimEditor({ base, current, changes, onAdd }: EditorProps) {
	const real = lastReal(base);
	const [mode, setMode] = useState<"dynamic" | "real-grids">("dynamic");
	const [fromYear, setFromYear] = useState(1990);
	const [toYear, setToYear] = useState(2050);
	const [seed, setSeed] = useState(randomSeed);
	const [chaos, setChaos] = useState(DEFAULT_SIM.chaos);
	const [reliability, setReliability] = useState(DEFAULT_SIM.reliability);
	const [anchor, setAnchor] = useState(DEFAULT_ANCHOR);
	const maxTo = mode === "dynamic" ? FUTURE_LIMIT : real;
	const from = Math.min(fromYear, mode === "dynamic" ? real + 1 : real);
	const to = Math.max(from, Math.min(toYear, maxTo));
	const candidate = useMemo<Change>(
		() => ({ id: newId(), kind: "history-sim", mode, fromYear: from, toYear: to, seed, chaos, reliability, ...(mode === "dynamic" ? { anchor } : {}) }),
		[mode, from, to, seed, chaos, reliability, anchor],
	);
	const [preview, pending] = usePreview(base, changes, candidate, "preview:history");

	const rows = useMemo(() => {
		if (!preview) return [];
		return range(from, to)
			.filter((y) => preview.driverStandings.get(y)?.length)
			.map((y) => {
				const now = champion(preview, y);
				return {
					year: y,
					now,
					team: now ? mainTeam(preview, now, y) : null,
					constructor: preview.constructorStandings.get(y)?.find((r) => r.champion)?.id ?? null,
					real: champion(base, y),
					before: champion(current, y),
				};
			});
	}, [preview, base, current, from, to]);
	const titles = useMemo(() => {
		const count = (ids: (string | null)[]) => {
			const m = new Map<string, number>();
			for (const id of ids) if (id) m.set(id, (m.get(id) ?? 0) + 1);
			return m;
		};
		const now = count(rows.map((r) => r.now));
		const was = count(rows.map((r) => r.real));
		const teams = count(rows.map((r) => r.constructor));
		return {
			drivers: [...now.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([id, n]) => ({ id, n, real: was.get(id) ?? 0 })),
			teams: [...teams.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
		};
	}, [rows]);
	const differs = rows.filter((r) => r.real && r.now !== r.real).length;
	const future = rows.filter((r) => r.year > real).length;

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
				<Field label="How">
					<Choice
						value={mode}
						onChange={(m) => setMode(m)}
						options={[
							{ value: "dynamic", label: "Simulate careers: driver market, retirements, new teams, the future" },
							{ value: "real-grids", label: "Re-race every season with the real entry lists" },
						]}
					/>
				</Field>
				<Field label="From">
					<Choice value={from} onChange={setFromYear} options={years(base.meta.firstYear, mode === "dynamic" ? real + 1 : real)} />
				</Field>
				<Field label="To">
					<Choice value={to} onChange={setToYear} options={years(from, maxTo)} />
				</Field>
			</div>
			<p className="text-muted-foreground text-sm">
				{mode === "dynamic"
					? `Real history up to ${from - 1}, then a living world: teams sign drivers every winter on 1–3 year deals, drivers age and retire (never past 45), real drivers who debuted later arrive as prospects around their real debut, invented rookies fill the gaps, and car form develops and resets with new regulations.${to > real ? ` Seasons after ${real} use the ${real} calendar and points.` : ""}`
					: "Every race in range is run again with its real entry list and grid. Performance changes and seat swaps in this universe apply."}
			</p>
			<SimControls chaos={chaos} setChaos={setChaos} reliability={reliability} setReliability={setReliability} />
			{mode === "dynamic" && (
				<Field label="Team form follows reality" className="sm:max-w-[calc(50%-12px)]">
					<Slider min={0} max={1} step={0.05} value={[anchor]} onValueChange={(v) => setAnchor(v[0])} />
					<span className="text-muted-foreground text-xs">
						{anchor < 0.15 ? "Teams develop freely from day one" : anchor > 0.75 ? "Cars stay close to how they really were" : "Recognisable eras, with room to diverge"}
						{from <= real && ` (until ${real})`}
					</span>
				</Field>
			)}
			<Actions onAdd={() => onAdd(candidate)}>
				<Updating pending={pending} label="Simulating" />
				<Reroll seed={seed} onReroll={() => setSeed(randomSeed())} />
			</Actions>

			{preview && rows.length > 0 && (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							{rows.length} season{rows.length === 1 ? "" : "s"}
						</Badge>
						{differs > 0 && <Badge className="bg-universe/15 text-universe">{differs} with a different champion</Badge>}
						{future > 0 && <Badge variant="secondary">{future} beyond {real}</Badge>}
						{(preview.sim?.generatedDrivers ?? 0) > 0 && (
							<Badge variant="secondary" className="gap-1">
								<Users className="size-3.5" /> {preview.sim!.generatedDrivers} new drivers, {preview.sim!.generatedTeams} new teams
							</Badge>
						)}
						<Checks db={preview} />
					</div>
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
						<PreviewCard
							title="Champions"
							description="Each season's drivers' champion, against reality."
							className="overflow-hidden"
							contentClassName="relative min-h-[28rem] flex-1"
						>
							{/* fills the card, which stretches to the height of the column beside it */}
							<ScrollArea className="absolute inset-0">
								<Table className={tableEdges} wrapInContainer={false}>
									<TableHeader className="bg-card sticky top-0 z-10">
										<TableRow>
											<TableHead className="w-16">Year</TableHead>
											<TableHead>Champion</TableHead>
											<TableHead className="hidden sm:table-cell">In reality</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.map((r) => (
											<TableRow key={r.year}>
												<TableCell className="font-semibold">
													<SeasonLink year={r.year} />
												</TableCell>
												<TableCell>
													{r.now ? (
														<div className="min-w-0">
															<DriverLink driver={driverRef(preview, r.now)} className={cn("font-medium", r.real && r.now !== r.real && "text-universe")} />
															{r.team && (
																<div className="text-muted-foreground text-xs">
																	<TeamLink team={teamRef(preview, r.team)} />
																</div>
															)}
															{r.real && r.real !== r.now && (
																<div className="text-muted-foreground text-xs sm:hidden">
																	In reality: <DriverLink driver={driverRef(base, r.real)} flag={false} />
																</div>
															)}
														</div>
													) : (
														<span className="text-muted-foreground">Season in progress</span>
													)}
												</TableCell>
												<TableCell className="text-muted-foreground hidden sm:table-cell">
													{r.real ? (
														r.real === r.now ? (
															<span className="text-xs">Same</span>
														) : (
															<DriverLink driver={driverRef(base, r.real)} flag={false} />
														)
													) : (
														<Hint label={r.year > real ? "Not raced yet in reality" : "No champion yet in reality"}>
															<span className="text-xs">–</span>
														</Hint>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</ScrollArea>
						</PreviewCard>
						<div className="space-y-6">
							<PreviewCard title="Most titles" description={`Drivers' championships ${from}–${to}.`}>
								<Table className={tableEdges}>
									<TableHeader>
										<TableRow>
											<TableHead>Driver</TableHead>
											<TableHead className="text-right">Titles</TableHead>
											<TableHead className="text-right">In reality</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{titles.drivers.map((t) => (
											<TableRow key={t.id}>
												<TableCell>
													<DriverLink driver={driverRef(preview, t.id)} className="font-medium" />
												</TableCell>
												<TableCell className="text-right font-semibold tabular-nums">{t.n}</TableCell>
												<TableCell className="text-muted-foreground text-right tabular-nums">{t.real}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</PreviewCard>
							{titles.teams.length > 0 && (
								<PreviewCard title="Constructors' titles">
									<Table className={tableEdges}>
										<TableBody>
											{titles.teams.map(([id, n]) => (
												<TableRow key={id}>
													<TableCell>
														<TeamLink team={teamRef(preview, id)} className="font-medium" />
													</TableCell>
													<TableCell className="text-right font-semibold tabular-nums">{n}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</PreviewCard>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

/* ---------------------------------------------------------- performance --- */

/** If nothing simulates the chosen seasons, offer to re-race them so the change can show. */
function useCoverage(changes: Change[], from: number, to: number) {
	const sims = useMemo(() => simulatedYears(changes), [changes]);
	const uncovered = range(from, to).filter((y) => !sims.has(y));
	return { covered: uncovered.length === 0, partly: uncovered.length > 0 && uncovered.length < to - from + 1 };
}

function SeasonCompare({
	title,
	before,
	after,
	id,
	from,
	to,
	constructors,
}: {
	title: string;
	before: Db;
	after: Db;
	id: string;
	from: number;
	to: number;
	constructors?: boolean;
}) {
	const rows = range(from, to).filter((y) => after.racesByYear.has(y));
	return (
		<PreviewCard title={title} description="Championship position and points, before and after.">
			<ScrollArea viewportClassName="sm:max-h-96">
				<Table className={tableEdges}>
					<TableHeader>
						<TableRow>
							<TableHead className="w-16">Year</TableHead>
							{!constructors && <TableHead>Team</TableHead>}
							<TableHead className="text-right">Before</TableHead>
							<TableHead className="text-right">After</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((y) => {
							const b = standing(before, y, id, constructors);
							const a = standing(after, y, id, constructors);
							const team = constructors ? null : mainTeam(after, id, y);
							return (
								<TableRow key={y}>
									<TableCell className="font-semibold">
										<SeasonLink year={y} />
									</TableCell>
									{!constructors && <TableCell>{team ? <TeamLink team={teamRef(after, team)} /> : <span className="text-muted-foreground">No seat</span>}</TableCell>}
									<TableCell className="text-muted-foreground text-right whitespace-nowrap tabular-nums">
										{b ? (
											<>
												P{b.positionText}
												<span className="max-sm:hidden"> · {b.points}</span>
											</>
										) : (
											"–"
										)}
									</TableCell>
									<TableCell className="text-right">
										<span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
											{a ? (
												<span>
													P{a.positionText}
													<span className="max-sm:hidden"> · {a.points}</span>
												</span>
											) : (
												"–"
											)}
											<Delta by={a?.position && b?.position ? b.position - a.position : 0} />
										</span>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</ScrollArea>
		</PreviewCard>
	);
}

function PerformanceEditor({ base, current, changes, onAdd, target }: EditorProps & { target: "driver" | "team" }) {
	// derived in the worker: the chart shows a skeleton until the curves arrive
	const { curves, error } = useRatingCurves(base);
	const [id, setId] = useState<string | null>(target === "driver" ? "fernando-alonso" : "williams");
	const curve = useMemo(
		() =>
			!curves || !id
				? []
				: target === "driver"
					? (curves.drivers[id] ?? []).map(([year, v, team]) => ({ year, v, note: base.constructors.get(team)?.name }))
					: (curves.teams[id] ?? []).map(([year, v]) => ({ year, v, note: undefined })),
		[curves, id, target, base],
	);
	const first = curve[0]?.year ?? base.meta.firstYear;
	const last = curve[curve.length - 1]?.year ?? lastReal(base);
	const [range_, setRange] = useState<[number, number] | null>(null);
	const [fromYear, toYear] = range_ ?? [first, last];
	const lo = Math.min(fromYear, toYear);
	const hi = Math.max(fromYear, toYear);
	const [delta, setDelta] = useState(10);
	const { covered, partly } = useCoverage(changes, lo, Math.min(hi, lastReal(base)));
	const [resim, setResim] = useState(true);
	const [seed] = useState(randomSeed);
	const pick = (next: string) => {
		setId(next);
		setRange(null);
	};
	const candidate = useMemo<Change[] | null>(() => {
		// the default range comes from the curve: wait for it rather than preview 75 seasons
		if (!id || (!range_ && !curves)) return null;
		const c: Change =
			target === "driver"
				? { id: newId(), kind: "driver-performance", driverId: id, fromYear: lo, toYear: hi, delta }
				: { id: newId(), kind: "team-performance", constructorId: id, fromYear: lo, toYear: hi, delta };
		const sim: Change = { id: newId(), kind: "history-sim", mode: "real-grids", fromYear: lo, toYear: Math.min(hi, lastReal(base)), seed, chaos: 1, reliability: 1 };
		return !covered && resim ? [sim, c] : [c];
	}, [id, target, lo, hi, delta, covered, resim, seed, base, range_, curves]);
	const [preview, pending] = usePreview(base, changes, candidate, `preview:${target}`);
	const data: CurvePoint[] = curve.map((p) => ({ year: p.year, real: p.v, changed: p.year >= lo && p.year <= hi ? p.v + delta : null, note: p.note }));
	const flips = useMemo(() => titleFlips(base, current, preview, range(lo, hi)), [base, current, preview, lo, hi]);
	const yearsAvailable = yearOptions(base);
	const unit = target === "driver" ? "skill" : "car pace";

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
				<Field label={target === "driver" ? "Driver" : "Team"}>
					{target === "driver" ? <DriverCombobox db={base} value={id} onChange={pick} /> : <TeamCombobox db={base} value={id} onChange={pick} />}
				</Field>
				<Field label="From">
					<Choice value={fromYear} onChange={(y) => setRange([y, toYear])} options={yearsAvailable} />
				</Field>
				<Field label="To">
					<Choice value={toYear} onChange={(y) => setRange([fromYear, y])} options={yearsAvailable} />
				</Field>
			</div>
			<Field label={`${target === "driver" ? "Skill" : "Car pace"} change: ${delta > 0 ? "+" : ""}${delta}`}>
				<Slider min={target === "driver" ? -30 : -50} max={target === "driver" ? 30 : 50} step={1} value={[delta]} onValueChange={(v) => setDelta(v[0])} />
				<span className="text-muted-foreground text-xs">
					{target === "driver"
						? "Points of the grid: +10 means qualifying about 10% of the field higher in the same car. Teammate gaps are typically 5–15."
						: "Points of the grid: +10 means the car qualifies about 10% of the field higher with the same drivers. The best and worst cars are usually 40–60 apart."}
				</span>
			</Field>
			{id && !curves && (
				<PreviewCard title={target === "driver" ? "Skill by season" : "Car pace by season"} description={error ? "Couldn't derive the ratings." : "Deriving ratings from 75 years of results."}>
					<div className="space-y-3 px-5 pb-5">
						{error ? (
							<span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
								<CircleAlert className="size-4" /> {error}
							</span>
						) : (
							<>
								<span className="text-muted-foreground inline-flex items-center gap-2 text-xs">
									<Spinner /> Loading ratings
								</span>
								<Skeleton className="h-56 w-full" />
							</>
						)}
					</div>
				</PreviewCard>
			)}
			{id && curve.length > 0 && (
				<PreviewCard
					title={target === "driver" ? `${base.drivers.get(id)?.name}: skill by season` : `${base.constructors.get(id)?.name}: car pace by season`}
					description={
						target === "driver"
							? "Derived from qualifying and race results against teammates, carried across teams and adjusted for age."
							: "Derived from where its cars qualified and finished, with the drivers' own skill taken out."
					}
				>
					<div className="px-5 pb-5">
						<RatingChart data={data} unit={unit} />
					</div>
				</PreviewCard>
			)}
			{!covered && (
				<Notice tone="warn">
					<p>
						Performance changes reshape simulated races only. {partly ? "Some of these seasons aren't" : "These seasons aren't"} simulated in this universe yet.
					</p>
					<ToggleRow checked={resim} onChange={setResim} label={`Also re-race ${lo === Math.min(hi, lastReal(base)) ? lo : `${lo}–${Math.min(hi, lastReal(base))}`} with real grids`} />
				</Notice>
			)}
			<Actions onAdd={() => candidate?.forEach((c) => onAdd(c))} disabled={!candidate}>
				<Updating pending={pending} />
			</Actions>
			{preview && id && (
				<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
					<SeasonCompare title={target === "driver" ? "Their seasons" : "The team's seasons"} before={current} after={preview} id={id} from={lo} to={hi} constructors={target === "team"} />
					<TitleFlips flips={flips} db={preview} />
				</div>
			)}
		</div>
	);
}

export const DriverPerformanceEditor = (p: EditorProps) => <PerformanceEditor {...p} target="driver" />;
export const TeamPerformanceEditor = (p: EditorProps) => <PerformanceEditor {...p} target="team" />;

/* ------------------------------------------------------- seats & careers --- */

/** Seat moves and career overrides act on simulated careers: offer one if there isn't one. */
function useDynamicCoverage(base: Db, changes: Change[], from: number, to: number) {
	const sims = useMemo(() => simulatedYears(changes, "dynamic"), [changes]);
	const covered = range(from, to).every((y) => sims.has(y));
	const [resim, setResim] = useState(true);
	const [seed] = useState(randomSeed);
	const sim: Change | null = covered || !resim ? null : { id: newId(), kind: "history-sim", mode: "dynamic", fromYear: Math.min(from, lastReal(base) + 1), toYear: Math.max(to, from), seed, chaos: 1, reliability: 1, anchor: DEFAULT_ANCHOR };
	const notice = covered ? null : (
		<Notice tone="warn">
			<p>Seat moves and career changes shape simulated careers, so the seasons around them need simulating.</p>
			<ToggleRow checked={resim} onChange={setResim} label={`Also simulate careers ${Math.min(from, lastReal(base) + 1)}–${Math.max(to, from)}`} />
		</Notice>
	);
	return { sim, notice };
}

function SwapEditor({ base, current, changes, onAdd }: EditorProps) {
	const [year, setYear] = useState(2007);
	const [a, setA] = useState<string | null>("fernando-alonso");
	const [b, setB] = useState<string | null>("kimi-raikkonen");
	const candidate = useMemo<Change | null>(() => (a && b && a !== b ? { id: newId(), kind: "driver-swap", year, driverA: a, driverB: b } : null), [year, a, b]);
	const [preview, pending] = usePreview(base, changes, candidate, "preview:swap");
	const teamOf = (id: string | null) => (id ? mainTeam(current, id, year) : null);
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
				<Field label="Season">
					<Choice value={year} onChange={setYear} options={yearOptions(base)} />
				</Field>
				<Field label="Driver">
					<DriverCombobox db={base} value={a} onChange={setA} />
				</Field>
				<Field label="Swaps seats with">
					<DriverCombobox db={base} value={b} onChange={setB} />
				</Field>
			</div>
			<p className="text-muted-foreground text-sm">
				{a && b ? (
					<>
						{base.drivers.get(a)?.name} takes the {teamOf(b) ? base.constructors.get(teamOf(b)!)?.name : "other"} seat and {base.drivers.get(b)?.name} the{" "}
						{teamOf(a) ? base.constructors.get(teamOf(a)!)?.name : "other"} one for the whole season, which is then re-raced. A driver who wasn&apos;t racing that year simply takes the other&apos;s car, if they were 17–45 and alive.
					</>
				) : (
					"Choose two drivers."
				)}
			</p>
			<Actions onAdd={() => candidate && onAdd(candidate)} disabled={!candidate}>
				<Updating pending={pending} />
			</Actions>
			{preview && candidate && (
				<PreviewCard title={`${year} final standings`} description="With the swap, re-raced with real grids otherwise.">
					<StandingsPreview before={current} after={preview} year={year} />
				</PreviewCard>
			)}
		</div>
	);
}

function MoveEditor({ base, current, changes, onAdd }: EditorProps) {
	const [driverId, setDriverId] = useState<string | null>("charles-leclerc");
	const [teamId, setTeamId] = useState<string | null>("red-bull");
	const [fromYear, setFromYear] = useState(2021);
	const [toYear, setToYear] = useState(2024);
	const lo = Math.min(fromYear, toYear);
	const hi = Math.max(fromYear, toYear);
	const { sim, notice } = useDynamicCoverage(base, changes, lo, hi);
	const candidate = useMemo<Change[] | null>(
		() => (driverId && teamId ? [...(sim ? [sim] : []), { id: newId(), kind: "driver-move", driverId, constructorId: teamId, fromYear: lo, toYear: hi }] : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[driverId, teamId, lo, hi, sim?.fromYear, sim?.toYear, sim?.seed],
	);
	const [preview, pending] = usePreview(base, changes, candidate, "preview:move");
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_120px]">
				<Field label="Driver">
					<DriverCombobox db={base} value={driverId} onChange={setDriverId} />
				</Field>
				<Field label="Drives for">
					<TeamCombobox db={base} value={teamId} onChange={setTeamId} />
				</Field>
				<Field label="From">
					<Choice value={fromYear} onChange={setFromYear} options={years(base.meta.firstYear, FUTURE_LIMIT)} />
				</Field>
				<Field label="To">
					<Choice value={toYear} onChange={setToYear} options={years(base.meta.firstYear, FUTURE_LIMIT)} />
				</Field>
			</div>
			<p className="text-muted-foreground text-sm">
				The team signs them for these seasons whatever the market says, bumping whoever they&apos;d have had. Ignored for any season the team isn&apos;t on the
				grid, or the driver is outside 17–45 or no longer alive.
			</p>
			{notice}
			<Actions onAdd={() => candidate?.forEach((c) => onAdd(c))} disabled={!candidate}>
				<Updating pending={pending} />
			</Actions>
			{preview && driverId && <SeasonCompare title="Their seasons" before={current} after={preview} id={driverId} from={lo} to={hi} />}
		</div>
	);
}

function CareerEditor({ base, current, changes, onAdd }: EditorProps) {
	const [driverId, setDriverId] = useState<string | null>("ayrton-senna");
	const [debut, setDebut] = useState<number | "real">("real");
	const [retire, setRetire] = useState<number | "real">("real");
	const career = useMemo(() => (driverId ? realCareer(base, driverId) : null), [base, driverId]);
	const realFirst = career?.[0] ?? 1990;
	const realLast = career?.[1] ?? 2000;
	const from = debut === "real" ? realFirst : debut;
	const to = Math.max(from, retire === "real" ? realLast : retire) + 2;
	const { sim, notice } = useDynamicCoverage(base, changes, debut === "real" ? Math.max(realFirst, (retire === "real" ? realLast : retire) - 1) : from - 1, to);
	const candidate = useMemo<Change[] | null>(
		() =>
			driverId && (debut !== "real" || retire !== "real")
				? [
						...(sim ? [sim] : []),
						{ id: newId(), kind: "career", driverId, ...(debut !== "real" ? { debutYear: debut } : {}), ...(retire !== "real" ? { retireAfter: retire } : {}) },
					]
				: null,
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[driverId, debut, retire, sim?.fromYear, sim?.toYear, sim?.seed],
	);
	const [preview, pending] = usePreview(base, changes, candidate, "preview:career");
	const dob = driverId ? base.drivers.get(driverId)?.dateOfBirth : null;
	const born = dob ? Number(dob.slice(0, 4)) : 1960;
	const pick = (id: string) => {
		setDriverId(id);
		setDebut("real");
		setRetire("real");
	};
	const ageOpts = (lo: number, hi: number, label: string) => [
		{ value: "real" as const, label },
		...range(Math.max(base.meta.firstYear, lo), Math.min(FUTURE_LIMIT, hi)).map((y) => ({ value: y, label: `${y} (aged ${y - born})` })),
	];
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
				<Field label="Driver">
					<DriverCombobox db={base} value={driverId} onChange={pick} />
				</Field>
				<Field label="Debut">
					<Choice value={debut} onChange={setDebut} options={ageOpts(born + 17, born + 40, `As simulated (really ${realFirst})`)} />
				</Field>
				<Field label="Retire after">
					<Choice value={retire} onChange={setRetire} options={ageOpts(born + 18, born + 45, `As simulated (really ${realLast})`)} />
				</Field>
			</div>
			<p className="text-muted-foreground text-sm">
				A set debut puts them on the grid that season (usually with a smaller team). A set retirement keeps them racing until then if a team will have them, and
				stops them after. Nobody races past 45.
			</p>
			{notice}
			<Actions onAdd={() => candidate?.forEach((c) => onAdd(c))} disabled={!candidate}>
				<Updating pending={pending} />
			</Actions>
			{preview && driverId && candidate && <SeasonCompare title="Their seasons" before={current} after={preview} id={driverId} from={Math.min(from, realFirst)} to={Math.min(to, FUTURE_LIMIT)} />}
		</div>
	);
}

export function SeatsEditor(props: EditorProps) {
	const [tab, setTab] = useState("swap");
	return (
		<Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-6">
			<TabsList>
				<TabsTrigger value="swap">Swap seats</TabsTrigger>
				<TabsTrigger value="move">Move a driver</TabsTrigger>
				<TabsTrigger value="career">
					<span className="sm:hidden">Career</span>
					<span className="max-sm:hidden">Debut and retirement</span>
				</TabsTrigger>
			</TabsList>
			<TabsContent value="swap">
				<SwapEditor {...props} />
			</TabsContent>
			<TabsContent value="move">
				<MoveEditor {...props} />
			</TabsContent>
			<TabsContent value="career">
				<CareerEditor {...props} />
			</TabsContent>
		</Tabs>
	);
}

