import { ChevronLeft, ChevronRight, CloudRain, CloudSunRain, FlaskConical, History, MapPin, Sparkles, Sun, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { NEUTRAL_LABEL, type RaceLapFile } from "@pitwall/core/f1/laps";
import type { RaceView, ResultRow } from "@pitwall/core/f1/views";
import {
	CircuitLink,
	DriverLink,
	EngineLink,
	Flag,
	GrandPrixLink,
	Join,
	NationLink,
	Page,
	PageHeader,
	Pos,
	RealDiff,
	Section,
	TableCard,
	TeamLink,
	TyreLink,
	href,
	num,
	DateLink,
} from "../f1";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { buttonVariants } from "../ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { LapChartPanel, StrategyPanel } from "./race-laps";
import { FactList } from "../facts";
import type { RaceFact } from "@pitwall/core/f1/race-facts";

const WEATHER = { dry: { icon: Sun, label: "Dry" }, wet: { icon: CloudRain, label: "Wet" }, mixed: { icon: CloudSunRain, label: "Mixed conditions" } } as const;

/** Fastest-lap marker; the hover card gives the time and lap when known. */
function FastestLapMark({ lap, sprint }: { lap: RaceView["fastestLap"]; sprint?: boolean }) {
	return (
		<HoverCard>
			<HoverCardTrigger delay={150} render={<span />} className="inline-flex shrink-0 cursor-help">
				<Timer className="text-primary size-3.5" aria-label="Fastest lap" />
			</HoverCardTrigger>
			<HoverCardContent side="top" className="w-56 space-y-1.5 rounded-xl p-3">
				<div className="flex items-center gap-2 font-medium">
					<Timer className="text-primary size-4" />
					Fastest lap{sprint && " of the sprint"}
				</div>
				{lap?.time ? (
					<div className="flex items-baseline justify-between gap-3">
						<span className="text-lg font-semibold tabular-nums">{lap.time}</span>
						{lap.lap != null && <span className="text-muted-foreground text-xs">on lap {lap.lap}</span>}
					</div>
				) : (
					<p className="text-muted-foreground text-xs">No lap time recorded.</p>
				)}
			</HoverCardContent>
		</HoverCard>
	);
}

function ResultsTable({ rows, fastestLap, sprint }: { rows: ResultRow[]; fastestLap?: RaceView["fastestLap"]; sprint?: boolean }) {
	return (
		<TableCard>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12 sm:w-16">Pos</TableHead>
					<TableHead className="hidden w-12 sm:table-cell">No</TableHead>
					<TableHead>Driver</TableHead>
					<TableHead className="hidden sm:table-cell">Constructor</TableHead>
					<TableHead className="hidden text-right sm:table-cell">Laps</TableHead>
					<TableHead className="hidden sm:table-cell">Time / Retired</TableHead>
					<TableHead className="hidden text-right sm:table-cell">Grid</TableHead>
					<TableHead className="text-right">
						<span className="sm:hidden">Pts / time</span>
						<span className="hidden sm:inline">Pts</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((r, i) => (
					<TableRow key={r.driver.id + i}>
						<TableCell className="whitespace-nowrap">
							<Pos text={r.position} />
							<span className="max-sm:hidden">
								<RealDiff real={r.realPosition !== r.position ? r.realPosition : null} />
							</span>
						</TableCell>
						<TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">{r.number}</TableCell>
						<TableCell>
							<span className="inline-flex max-w-full items-center gap-1.5">
								<DriverLink driver={r.driver} className="font-medium" />
								{r.fastestLap && (
									<span className="max-sm:hidden">
										<FastestLapMark lap={!sprint && fastestLap?.driver.id === r.driver.id ? fastestLap : null} sprint={sprint} />
									</span>
								)}
							</span>
							<div className="text-muted-foreground flex items-center gap-1 text-xs sm:hidden">
								{r.fastestLap && <FastestLapMark lap={!sprint && fastestLap?.driver.id === r.driver.id ? fastestLap : null} sprint={sprint} />}
								{r.realPosition != null && r.realPosition !== r.position && r.realPosition !== "–" && (
									<span className="text-universe shrink-0 whitespace-nowrap">real {r.realPosition} ·</span>
								)}
								<span className="min-w-0 truncate">
									<TeamLink team={r.team} />
									{r.engine && r.engine.name !== r.team.name && <> · {r.engine.name}</>}
								</span>
							</div>
						</TableCell>
						<TableCell className="hidden whitespace-nowrap sm:table-cell">
							<TeamLink team={r.team} />
							{r.engine && r.engine.name !== r.team.name && <EngineLink engine={r.engine} className="text-muted-foreground ml-1.5 text-xs" />}
						</TableCell>
						<TableCell className="hidden text-right tabular-nums sm:table-cell">{r.laps}</TableCell>
						<TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">{r.timeOrStatus}</TableCell>
						<TableCell className="hidden text-right tabular-nums sm:table-cell">{r.grid ?? "–"}</TableCell>
						<TableCell className="text-right font-semibold tabular-nums">
							{r.points ? num(r.points) : ""}
							<div className="text-muted-foreground text-[11px] font-normal sm:hidden">{r.timeOrStatus}</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</TableCard>
	);
}

function QualifyingTable({ view }: { view: RaceView }) {
	const knockout = view.qualifying.some((q) => q.q1);
	return (
		<TableCard>
			<TableHeader>
				<TableRow>
					<TableHead className="w-12 sm:w-16">Pos</TableHead>
					<TableHead>Driver</TableHead>
					<TableHead className="hidden sm:table-cell">Constructor</TableHead>
					{knockout ? (
						<>
							<TableHead>Q1</TableHead>
							<TableHead>Q2</TableHead>
							<TableHead>Q3</TableHead>
						</>
					) : (
						<TableHead>Time</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{view.qualifying.map((q, i) => (
					<TableRow key={q.driver.id + i}>
						<TableCell>
							<Pos text={q.position} />
						</TableCell>
						<TableCell className="max-sm:max-w-36">
							<DriverLink driver={q.driver} className="font-medium" />
							<div className="text-muted-foreground truncate text-xs sm:hidden">
								<TeamLink team={q.team} />
							</div>
						</TableCell>
						<TableCell className="hidden sm:table-cell">
							<TeamLink team={q.team} />
						</TableCell>
						{knockout ? (
							<>
								<TableCell className="tabular-nums max-sm:text-xs">{q.q1}</TableCell>
								<TableCell className="tabular-nums max-sm:text-xs">{q.q2}</TableCell>
								<TableCell className="tabular-nums max-sm:text-xs">{q.q3}</TableCell>
							</>
						) : (
							<TableCell className="tabular-nums">{q.time}</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</TableCard>
	);
}

const gridOf = (rows: ResultRow[]) => Object.fromEntries(rows.filter((r) => r.grid != null && r.grid > 0).map((r) => [r.driver.id, r.grid!]));
const finishOf = (rows: ResultRow[]) => Object.fromEntries(rows.map((r) => [r.driver.id, r.position]));
const spanText = (spans: [number, number][]) => spans.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");

/** Who led which laps (sidebar). */
function LapsLed({ view }: { view: RaceView }) {
	if (!view.lapsLed?.length) return null;
	return (
		<Section title="Laps led">
			<TableCard>
				<TableBody>
					{view.lapsLed.map((l) => (
						<TableRow key={l.driver.id}>
							<TableCell className="whitespace-normal">
								<DriverLink driver={l.driver} className="font-medium" />
								<div className="text-muted-foreground mt-0.5 text-xs tabular-nums">Laps {spanText(l.spans)}</div>
							</TableCell>
							<TableCell className="text-right align-top font-semibold tabular-nums">{l.laps}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Section>
	);
}

/** Safety cars, virtual safety cars and red flags, from the race notes. */
function Neutralised({ view }: { view: RaceView }) {
	const list = view.notes?.neutralised ?? [];
	if (!list.length) return null;
	return (
		<Section title="Safety cars and red flags">
			<TableCard>
				<TableBody>
					{list.map(([type, from, to]) => (
						<TableRow key={`${type}-${from}`}>
							<TableCell className="flex items-center gap-2">
								<span className={cn("inline-block size-2 rounded-full", type === "RF" ? "bg-f1" : "bg-gold")} />
								{NEUTRAL_LABEL[type]}
							</TableCell>
							<TableCell className="text-muted-foreground text-right tabular-nums">{from === to ? `Lap ${from}` : `Laps ${from}–${to}`}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Section>
	);
}

/** Context for the race result: who led, safety cars, and the championships after the round. */
function RaceSidebar({ view }: { view: RaceView }) {
	return (
		<div className="space-y-8">
			<LapsLed view={view} />
			<Neutralised view={view} />
			<Section title="Drivers after this round">
				<TableCard>
					<TableBody>
						{view.standingsAfter.drivers.map((s) => (
							<TableRow key={s.driver.id}>
								<TableCell className="w-10">
									<Pos text={s.position} />
								</TableCell>
								<TableCell>
									<DriverLink driver={s.driver} />
								</TableCell>
								<TableCell className="text-right font-semibold tabular-nums">{num(s.points)}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</TableCard>
			</Section>
			{view.standingsAfter.constructors.length > 0 && view.race.year >= 1958 && (
				<Section title="Constructors after this round">
					<TableCard>
						<TableBody>
							{view.standingsAfter.constructors.map((s, i) => (
								<TableRow key={s.team.id + i}>
									<TableCell className="w-10">
										<Pos text={s.position} />
									</TableCell>
									<TableCell>
										<TeamLink team={s.team} flag />
									</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">{num(s.points)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
			)}
		</div>
	);
}

/** A summary card: label, value and a detail line pinned to the bottom, so the four line up. */
function RaceStat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
	return (
		<Card size="sm">
			<CardHeader className="flex h-full flex-col gap-1">
				<CardDescription>{label}</CardDescription>
				{/* long names wrap; the detail line stays on the card's bottom edge so the four still line up */}
				<CardTitle className="text-lg leading-snug font-semibold tabular-nums break-words sm:text-xl [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal">{value}</CardTitle>
				<div className="text-muted-foreground mt-auto min-h-4 truncate text-xs tabular-nums">{detail || "\u00a0"}</div>
			</CardHeader>
		</Card>
	);
}

/**
 * `laps`: the race's lap file when the server already read it (null: none);
 * leave it undefined in the browser and the lap tabs fetch it on demand.
 * `facts`: what made the race unusual, or what's at stake if it's next (@pitwall/core/f1/race-facts factsFor).
 */
export function RacePage({
	view,
	labHref,
	laps,
	facts,
}: {
	view: RaceView;
	labHref?: string;
	laps?: RaceLapFile | null;
	facts?: { upcoming: boolean; facts: RaceFact[] };
}) {
	const winner = view.results.find((r) => r.position === "1");
	const lapData = view.lapData && laps !== null ? view.lapData : null;
	const lapDrivers = view.results.map((r) => r.driver);
	const strategy = (lapData?.pitStops && (laps === undefined || !!laps?.pitStops?.length)) || lapData?.tyres;
	const classified = view.results.filter((r) => /^\d+$/.test(r.position)).length;
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<ULink href={href.season(view.race.year)} className="hover:text-foreground underline-offset-4 hover:underline">
							{view.race.year} season
						</ULink>
						<span>·</span>
						<span>Round {view.race.round}</span>
						<span>·</span>
						<DateLink date={view.race.date} />
						{view.modified && (
							<Badge variant="outline" className="border-universe/30 text-universe">
								<Sparkles /> Altered result
							</Badge>
						)}
					</>
				}
				title={
					<ULink href={href.grandPrix(view.grandPrix.id)} className="flex items-center gap-3 underline-offset-4 hover:underline">
						<Flag code={view.race.country} className="text-2xl" />
						{view.grandPrix.name}
					</ULink>
				}
				actions={
					<>
						{view.prev && (
							<ULink href={href.race(view.prev)} className={cn(buttonVariants({ variant: "outline" }))}>
								<ChevronLeft data-icon="inline-start" />
								{view.prev.year !== view.race.year && `${view.prev.year} `}
								{view.prev.name}
							</ULink>
						)}
						{view.next && (
							<ULink href={href.race(view.next)} className={cn(buttonVariants({ variant: "outline" }))}>
								{view.next.year !== view.race.year && `${view.next.year} `}
								{view.next.name}
								<ChevronRight data-icon="inline-end" />
							</ULink>
						)}
						{labHref && view.completed && (
							<Link
								href={labHref}
								className={cn(
									buttonVariants({
										variant: "outline",
										className: "border-universe/40 text-universe hover:text-universe hover:bg-universe/10",
									}),
								)}
							>
								<FlaskConical data-icon="inline-start" />
								Rewrite this race
							</Link>
						)}
					</>
				}
			>
				<span className="flex flex-wrap items-center gap-x-4 gap-y-1">
					<span className="inline-flex items-center gap-1.5">
						<MapPin className="size-3.5" />
						<CircuitLink circuit={view.circuit} className="text-foreground" />
						{view.nation && (
							<>
								<span>·</span>
								<NationLink nation={view.nation} flag={false} className="text-foreground" />
							</>
						)}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<History className="size-3.5" />
						<GrandPrixLink gp={view.grandPrix} flag={false} className="text-foreground" />
						<span>history</span>
					</span>
					{view.tyres.length > 0 && (
						<span>
							Tyres: <Join items={view.tyres} render={(t) => <TyreLink tyre={t} className="text-foreground" />} />
						</span>
					)}
					{view.notes?.weather &&
						(() => {
							const w = WEATHER[view.notes.weather];
							return (
								<span className="inline-flex items-center gap-1.5">
									<w.icon className="size-3.5" />
									<span className="text-foreground">{w.label}</span>
								</span>
							);
						})()}
				</span>
				<span className="mt-1 block text-xs">{view.officialName}</span>
			</PageHeader>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<RaceStat
					label="Winner"
					value={winner ? <DriverLink driver={winner.driver} flag={false} /> : "–"}
					detail={winner && <TeamLink team={winner.team} />}
				/>
				<RaceStat
					label="Fastest lap"
					value={view.fastestLap ? <DriverLink driver={view.fastestLap.driver} flag={false} /> : "–"}
					detail={
						view.fastestLap &&
						[view.fastestLap.time, view.fastestLap.lap != null && `lap ${view.fastestLap.lap}`].filter(Boolean).join(" · ")
					}
				/>
				<RaceStat label="Laps" value={view.laps} detail={view.completed && `${classified} classified`} />
				<RaceStat label="Distance" value={`${num(view.distance)} km`} detail={view.laps > 0 && `${num(Math.round((view.distance / view.laps) * 1000) / 1000)} km a lap`} />
			</div>

			{facts && facts.facts.length > 0 && (
				<Section title={facts.upcoming ? "What's at stake" : "Did you know?"} description={facts.upcoming ? undefined : "What made this race stand out, against everything before it"}>
					<Card size="sm">
						<CardHeader>
							<FactList facts={facts.facts} className="md:columns-2 md:gap-8 md:divide-y-0 md:[&>li]:break-inside-avoid md:[&>li]:py-1.5" />
						</CardHeader>
					</Card>
				</Section>
			)}

			{!view.completed ? (
				<p className="text-muted-foreground text-sm">This race hasn&apos;t been run yet.</p>
			) : (
				<Tabs defaultValue="race" className="min-w-0 gap-4">
					<TabsList variant="line">
						<TabsTrigger value="race">Race</TabsTrigger>
						{view.sprint.length > 0 && <TabsTrigger value="sprint">Sprint</TabsTrigger>}
						{view.qualifying.length > 0 && (
							<TabsTrigger value="qualifying">
								<span className="sm:hidden">Quali</span>
								<span className="hidden sm:inline">Qualifying</span>
							</TabsTrigger>
						)}
						{lapData?.chart && (
							<TabsTrigger value="laps">
								<span className="sm:hidden">Laps</span>
								<span className="hidden sm:inline">Lap chart</span>
							</TabsTrigger>
						)}
						{strategy && <TabsTrigger value="strategy">Strategy</TabsTrigger>}
					</TabsList>
					<TabsContent value="race">
						<div className="grid grid-cols-1 items-start gap-12 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8 2xl:grid-cols-[minmax(0,1fr)_380px]">
							<ResultsTable rows={view.results} fastestLap={view.fastestLap} />
							<RaceSidebar view={view} />
						</div>
					</TabsContent>
					{view.sprint.length > 0 && (
						<TabsContent value="sprint">
							<ResultsTable rows={view.sprint} sprint />
						</TabsContent>
					)}
					{view.qualifying.length > 0 && (
						<TabsContent value="qualifying">
							<QualifyingTable view={view} />
						</TabsContent>
					)}
					{lapData?.chart && (
						<TabsContent value="laps">
							<LapChartPanel
								raceId={view.raceId}
								initial={laps}
								drivers={lapDrivers}
								grid={gridOf(view.results)}
								finish={finishOf(view.results)}
								sprintDrivers={view.sprint.map((r) => r.driver)}
								sprintGrid={gridOf(view.sprint)}
								sprintFinish={finishOf(view.sprint)}
								sprintAvailable={lapData.sprintChart}
								highlight={winner ? [winner.driver.id] : []}
								neutralised={view.notes?.neutralised}
							/>
						</TabsContent>
					)}
					{strategy && (
						<TabsContent value="strategy">
							<StrategyPanel
								raceId={view.raceId}
								initial={laps && { raceId: laps.raceId, drivers: laps.drivers, pitStops: laps.pitStops, tyres: laps.tyres, compounds: laps.compounds }}
								drivers={lapDrivers}
								laps={Object.fromEntries(view.results.filter((r) => r.laps).map((r) => [r.driver.id, r.laps!]))}
								year={view.race.year}
								neutralised={view.notes?.neutralised}
							/>
						</TabsContent>
					)}
				</Tabs>
			)}
		</Page>
	);
}
