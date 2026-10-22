import { ChevronLeft, ChevronRight, FlaskConical, History, MapPin, Sparkles, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { RaceLapFile } from "@/lib/f1/laps";
import type { RaceView, ResultRow } from "@/lib/f1/views";
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
	StatCard,
	TableCard,
	TeamLink,
	TyreLink,
	fmtDate,
	href,
	num,
	DateLink,
} from "../f1";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { buttonVariants } from "../ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { LapChartPanel, PitStopsPanel } from "./race-laps";

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
const spanText = (spans: [number, number][]) => spans.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");

/** Who led which laps (sidebar). */
function LapsLed({ view }: { view: RaceView }) {
	if (!view.lapsLed?.length) return null;
	return (
		<Section title="Laps led" description={`Lap-by-lap data from Jolpica${view.lapData?.dumpDate ? ` (dump of ${fmtDate(view.lapData.dumpDate)})` : ""}.`}>
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

/**
 * `laps`: the race's lap file when the server already read it (null: none);
 * leave it undefined in the browser and the lap tabs fetch it on demand.
 */
export function RacePage({ view, labHref, laps }: { view: RaceView; labHref?: string; laps?: RaceLapFile | null }) {
	const winner = view.results.find((r) => r.position === "1");
	const lapData = view.lapData && laps !== null ? view.lapData : null;
	const lapDrivers = view.results.map((r) => r.driver);
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
				</span>
				<span className="mt-1 block text-xs">{view.officialName}</span>
			</PageHeader>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<StatCard
					label="Winner"
					value={
						winner ? (
							<>
								<DriverLink driver={winner.driver} flag={false} className="sm:hidden" />
								<DriverLink driver={winner.driver} className="max-sm:hidden" />
							</>
						) : (
							"–"
						)
					}
				/>
				<StatCard
					label="Fastest lap"
					value={
						view.fastestLap ? (
							<span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
								<DriverLink driver={view.fastestLap.driver} flag={false} className="min-w-0" />
								{view.fastestLap.time && <span className="text-muted-foreground text-base whitespace-nowrap">{view.fastestLap.time}</span>}
							</span>
						) : (
							"–"
						)
					}
				/>
				<StatCard label="Laps" value={view.laps} />
				<StatCard label="Distance" value={`${num(view.distance)} km`} />
			</div>

			{!view.completed ? (
				<p className="text-muted-foreground text-sm">This race hasn&apos;t been run yet.</p>
			) : (
				<div className="grid grid-cols-1 gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
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
							{lapData?.pitStops && (laps === undefined || !!laps?.pitStops?.length) && (
								<TabsTrigger value="pits">
									<span className="sm:hidden">Pits</span>
									<span className="hidden sm:inline">Pit stops</span>
								</TabsTrigger>
							)}
						</TabsList>
						<TabsContent value="race">
							<ResultsTable rows={view.results} fastestLap={view.fastestLap} />
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
									sprintDrivers={view.sprint.map((r) => r.driver)}
									sprintGrid={gridOf(view.sprint)}
									sprintAvailable={lapData.sprintChart}
									highlight={winner ? [winner.driver.id] : []}
								/>
							</TabsContent>
						)}
						{lapData?.pitStops && (
							<TabsContent value="pits">
								<PitStopsPanel raceId={view.raceId} initial={laps && { raceId: laps.raceId, pitStops: laps.pitStops }} drivers={lapDrivers} />
							</TabsContent>
						)}
					</Tabs>

					<div className="space-y-8">
						<LapsLed view={view} />
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
				</div>
			)}
		</Page>
	);
}
