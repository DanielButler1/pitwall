import {
	ArrowDown,
	ArrowUp,
	Cake,
	Calculator,
	CalendarDays,
	CalendarRange,
	ChevronRight,
	Cog,
	Crown,
	Dices,
	Factory,
	Flag as FlagIcon,
	FlaskConical,
	GitCompareArrows,
	Globe,
	MapPin,
	Medal,
	Target,
	Timer,
	Trophy,
	Users,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { HomeResult, HomeView, TitleFight } from "@pitwall/core/f1/views";
import type { MilestoneWatch } from "@pitwall/core/f1/milestones";
import type { OnThisDayItem, OnThisDayView } from "@pitwall/core/f1/diary";
import { CircuitLink, DateLink, DriverLink, Join, MoreLink, Page, PageHeader, Pos, RaceLink, Section, StatCard, TableCard, TeamLink, fmtDate, href, num } from "../f1";
import { ULink } from "../universe-link";
import { HomeGames } from "../play/home-games";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { TableBody, TableCell, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { DaysUntil } from "./days-until";
import { MilestoneWatchPanel } from "./milestones";
import { FactList } from "../facts";
import type { RaceFact } from "@pitwall/core/f1/race-facts";

export function HomePage({
	view,
	universeName,
	milestones,
	onThisDay,
	upcoming,
}: {
	view: HomeView;
	universeName?: string;
	milestones?: MilestoneWatch | null;
	onThisDay?: OnThisDayView | null;
	/** What's at stake at the next race (@pitwall/core/f1/race-facts upcomingFacts). */
	upcoming?: { race: { year: number; round: number }; facts: RaceFact[] } | null;
}) {
	return (
		<Page>
			<PageHeader
				eyebrow={universeName ? "Alternate universe" : undefined}
				title={universeName ?? "Formula 1 statistics"}
				actions={
					<>
						<ULink href={href.season(view.lastYear)} className={cn(buttonVariants({ size: "lg" }))}>
							{view.lastYear} season
							<ChevronRight data-icon="inline-end" />
						</ULink>
						{!universeName && (
							<Link href="/lab" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
								<FlaskConical data-icon="inline-start" />
								Rewrite history
							</Link>
						)}
					</>
				}
			>
				{universeName ? (
					<>
						This universe&apos;s history: {num(view.totals.races)} Grands Prix, {num(view.totals.drivers)} drivers and {view.totals.constructors} constructors over{" "}
						{view.totals.seasons} seasons in all. Browse its seasons and records as if it really happened.
					</>
				) : (
					<>
						{num(view.totals.races)} Grands Prix, {num(view.totals.drivers)} drivers and {view.totals.constructors} constructors across {view.totals.seasons} seasons.
						Browse the record books, play the daily games, or use the Lab to change results and see how history would have turned out.
					</>
				)}
			</PageHeader>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
				<StatCard
					label={`${view.lastYear} ${view.inProgress ? "drivers' leader" : "drivers' champion"}`}
					value={view.champion ? <DriverLink driver={view.champion.driver} /> : "–"}
					className="max-sm:col-span-2"
				/>
				<StatCard
					label={`${view.lastYear} ${view.inProgress ? "constructors' leader" : "constructors' champion"}`}
					value={view.constructorChampion ? <TeamLink team={view.constructorChampion.team} flag /> : "–"}
					className="max-sm:col-span-2"
				/>
				<StatCard label="Grands Prix" value={num(view.totals.races)} />
				<StatCard label="Race winners" value={num(view.totals.winners)} />
				<StatCard label="Drivers" value={num(view.totals.drivers)} className="max-sm:hidden" />
			</div>

			<div className="grid grid-cols-1 gap-12 xl:grid-cols-3 xl:gap-8">
				<Standings view={view} />

				{view.latestRace && <LatestRace race={view.latestRace} />}

				<div className="flex min-w-0 flex-col gap-12 xl:gap-8">
					{view.nextRace && (
						<NextRace
							next={view.nextRace}
							facts={upcoming && upcoming.race.year === view.nextRace.race.year && upcoming.race.round === view.nextRace.race.round ? upcoming.facts : []}
						/>
					)}
					{view.titleFight && <TitleFightCard fight={view.titleFight} year={view.lastYear} />}
				</div>
			</div>

			{!universeName && <HomeGames />}

			<div className="grid grid-cols-1 gap-12 xl:grid-cols-3 xl:gap-8">
				{onThisDay && <OnThisDay day={onThisDay} />}

				<Section title="Most race wins" action={<MoreLink href="/records">All records</MoreLink>}>
					<TableCard>
						<TableBody>
							{view.topWinners.map((w, i) => (
								<TableRow key={w.driver.id}>
									<TableCell className="text-muted-foreground w-10 tabular-nums">{i + 1}</TableCell>
									<TableCell>
										<DriverLink driver={w.driver} className="font-medium" />
									</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">
										<span className="inline-flex items-center gap-1.5">
											{i === 0 && <Trophy className="text-gold size-3.5" />}
											{w.value}
										</span>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>

				<Section title="Most championships" action={<MoreLink href="/seasons">All champions</MoreLink>}>
					<TableCard>
						<TableBody>
							{view.topChampions.map((c, i) => (
								<TableRow key={c.driver.id}>
									<TableCell className="text-muted-foreground w-10 tabular-nums">{i + 1}</TableCell>
									<TableCell>
										<DriverLink driver={c.driver} className="font-medium" />
										<div className="text-muted-foreground text-xs tabular-nums">{c.wins === 1 ? "1 win" : `${c.wins} wins`}</div>
									</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">
										<span className="inline-flex items-center gap-1.5">
											<Crown className={cn("size-3.5", i === 0 ? "text-gold" : "text-muted-foreground/60")} />
											{c.titles}
										</span>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
			</div>

			{milestones && <MilestoneWatchPanel watch={milestones} />}

			<Explore view={view} random={!universeName} />
		</Page>
	);
}

/* --------------------------------------------------------- latest race --- */

function LatestRace({ race: r }: { race: NonNullable<HomeView["latestRace"]> }) {
	return (
		<Section
			title="Latest race"
			description={
				<span className="inline-flex flex-wrap items-center gap-x-1.5">
					<RaceLink race={r.race} year className="text-foreground font-medium" />
					<span>
						· <DateLink date={r.race.date} />
					</span>
				</span>
			}
			action={<MoreLink href={href.race(r.race)}>Full result</MoreLink>}
		>
			<TableCard>
				<TableBody>
					{r.top.map((x) => (
						<TableRow key={x.driver.id}>
							<TableCell className="w-10">
								<Pos text={x.position} />
							</TableCell>
							<TableCell>
								<DriverLink driver={x.driver} className="font-medium" />
								<div className="text-muted-foreground text-xs">
									<TeamLink team={x.team} />
								</div>
							</TableCell>
							<TableCell className="w-12 text-right">
								<Moved result={x} />
							</TableCell>
							<TableCell className="text-right">
								<div className="text-sm tabular-nums">{x.time ?? ""}</div>
								<div className="text-muted-foreground text-xs tabular-nums">{x.points ? `+${num(x.points)} pts` : ""}</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
			{(r.pole || r.fastestLap) && (
				<div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1.5 px-1 text-xs">
					{r.pole && (
						<span className="inline-flex items-center gap-1.5">
							<Zap className="size-3.5" /> Pole <DriverLink driver={r.pole} className="text-foreground" />
						</span>
					)}
					{r.fastestLap && (
						<span className="inline-flex items-center gap-1.5">
							<Timer className="size-3.5" /> Fastest lap <DriverLink driver={r.fastestLap.driver} className="text-foreground" />
							{r.fastestLap.time && <span className="tabular-nums">{r.fastestLap.time}</span>}
						</span>
					)}
				</div>
			)}
		</Section>
	);
}

/** Places gained or lost from the grid ("PL": started from the pit lane). */
function Moved({ result: x }: { result: HomeResult }) {
	const pos = Number(x.position);
	if (x.grid == null) return <span className="text-muted-foreground text-xs">PL</span>;
	const d = x.grid - pos;
	if (!d || !Number.isFinite(d)) return <span className="text-muted-foreground/60 text-xs">–</span>;
	const Icon = d > 0 ? ArrowUp : ArrowDown;
	return (
		<span
			className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}
			title={`Started P${x.grid}`}
		>
			<Icon className="size-3" />
			{Math.abs(d)}
		</span>
	);
}

/* ----------------------------------------------------------- next race --- */

function NextRace({ next, facts }: { next: NonNullable<HomeView["nextRace"]>; facts: RaceFact[] }) {
	return (
		<Section title="Next race" action={<MoreLink href={href.grandPrix(next.grandPrix.id)}>Grand Prix history</MoreLink>}>
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						<RaceLink race={next.race} year />
					</CardTitle>
					<CardDescription className="space-y-1">
						<div>
							<CircuitLink circuit={next.circuit} />
						</div>
						<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
							<CalendarDays className="size-3.5" />
							{fmtDate(next.race.date)} <DaysUntil date={next.race.date} />
							<span>
								· Round {next.round} of {next.of}
							</span>
							{next.sprint && (
								<Badge variant="secondary" className="ml-1">
									Sprint weekend
								</Badge>
							)}
						</div>
					</CardDescription>
				</CardHeader>
				{facts.length > 0 && (
					<CardContent className="space-y-2 border-t pt-4">
						<div className="text-muted-foreground text-xs font-medium">What&apos;s at stake</div>
						<FactList facts={facts} />
					</CardContent>
				)}
				{(next.lastWinner || next.mostWins) && (
					<CardFooter className="flex-col items-stretch gap-2 border-t text-sm">
						{next.lastWinner && (
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground text-xs">Last winner here</span>
								<span className="flex min-w-0 items-center gap-1.5">
									<DriverLink driver={next.lastWinner.driver} className="font-medium" />
									<span className="text-muted-foreground text-xs tabular-nums">{next.lastWinner.year}</span>
								</span>
							</div>
						)}
						{next.mostWins && (
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground text-xs">Most wins here</span>
								<span className="flex min-w-0 items-center gap-1.5">
									<DriverLink driver={next.mostWins.driver} className="font-medium" />
									<span className="text-muted-foreground text-xs tabular-nums">×{next.mostWins.wins}</span>
								</span>
							</div>
						)}
						<div className="text-muted-foreground text-xs">
							{next.editions ? `Held ${next.editions} ${next.editions === 1 ? "time" : "times"} before in the championship` : "A new Grand Prix"}
						</div>
					</CardFooter>
				)}
			</Card>
		</Section>
	);
}

/* ------------------------------------------------------------ standings --- */

function Standings({ view }: { view: HomeView }) {
	return (
		<Tabs defaultValue="drivers" className="min-w-0 gap-0">
			<Section
				title={`${view.lastYear} standings`}
				description={view.inProgress ? `After ${view.completedRounds} of ${view.totalRounds} rounds` : "Final standings"}
				action={
					<TabsList>
						<TabsTrigger value="drivers">Drivers</TabsTrigger>
						<TabsTrigger value="constructors">Constructors</TabsTrigger>
					</TabsList>
				}
			>
				<TabsContent value="drivers">
					<TableCard>
						<TableBody>
							{view.standings.map((s) => (
								<TableRow key={s.driver.id}>
									<TableCell className="w-10">
										<Pos text={s.position} />
									</TableCell>
									<TableCell>
										<DriverLink driver={s.driver} className="font-medium" />
										<div className="text-muted-foreground text-xs">
											<Join items={s.teams} sep=" / " render={(t) => <TeamLink team={t} />} />
										</div>
									</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">{num(s.points)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</TabsContent>
				<TabsContent value="constructors">
					<TableCard>
						<TableBody>
							{view.constructorStandings.map((s) => (
								<TableRow key={s.team.id}>
									<TableCell className="w-10">
										<Pos text={s.position} />
									</TableCell>
									<TableCell>
										<TeamLink team={s.team} flag className="font-medium" />
										<div className="text-muted-foreground text-xs">
											{s.engine?.name ?? ""}
											{s.wins > 0 && `${s.engine ? " · " : ""}${s.wins === 1 ? "1 win" : `${s.wins} wins`}`}
										</div>
									</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">{num(s.points)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</TabsContent>
				<div className="flex justify-end">
					<MoreLink href={href.season(view.lastYear)}>Full season</MoreLink>
				</div>
			</Section>
		</Tabs>
	);
}

/* ---------------------------------------------------------- title fight --- */

const pts = (n: number) => `${num(n)} ${n === 1 ? "point" : "points"}`;
/** Contender lists longer than this are early-season noise: the card shows the winners so far instead. */
const CONTENDERS_SHOWN = 6;

function TitleFightCard({ fight: f, year }: { fight: NonNullable<HomeView["titleFight"]>; year: number }) {
	const d = f.drivers;
	const c = f.constructors;
	const decided = d.contenders.length === 1;
	const early = d.contenders.length > CONTENDERS_SHOWN;
	const left = `${f.roundsLeft} ${f.roundsLeft === 1 ? "round" : "rounds"}${f.sprintsLeft ? ` (${f.sprintsLeft} with a sprint)` : ""}`;
	return (
		<Section title="Title fight" action={<MoreLink href={href.season(year)}>Season</MoreLink>}>
			<Card>
				<CardHeader>
					<CardDescription className="text-foreground text-sm leading-relaxed">
						{decided ? (
							<>
								<DriverLink driver={d.leader} className="font-semibold" /> is the {year} champion, with {left} still to run.
							</>
						) : (
							<>
								<DriverLink driver={d.leader} className="font-semibold" /> leads
								{d.second && (
									<>
										{" "}
										<DriverLink driver={d.second} className="font-semibold" />
									</>
								)}{" "}
								by {pts(d.gap)}, with {left} and up to {pts(d.pointsLeft)} still to play for.
								<Clinch fight={d} name={(r) => r.name} />
							</>
						)}
					</CardDescription>
				</CardHeader>
				{!decided && (
					<CardContent className="space-y-2">
						{early ? (
							<>
								<div className="text-muted-foreground text-xs">
									{d.contenders.length} drivers can still win it. {f.winners.length === 1 ? "One winner" : `${f.winners.length} different winners`} so far:
								</div>
								{f.winners.slice(0, CONTENDERS_SHOWN).map((w, i) => (
									<div key={w.driver.id} className="flex items-center gap-3 text-sm">
										<Trophy className={cn("size-3.5 shrink-0", i === 0 ? "text-gold" : "text-muted-foreground/50")} />
										<DriverLink driver={w.driver} className="min-w-0 flex-1 font-medium" />
										<span className="text-muted-foreground text-xs tabular-nums">{w.wins === 1 ? "1 win" : `${w.wins} wins`}</span>
									</div>
								))}
							</>
						) : (
							<>
								<div className="text-muted-foreground text-xs">{d.contenders.length} drivers can still win it</div>
								{d.contenders.map((x, i) => (
									<div key={x.who.id} className="flex items-center gap-3 text-sm">
										<Medal className={cn("size-3.5 shrink-0", i === 0 ? "text-gold" : "text-muted-foreground/50")} />
										<DriverLink driver={x.who} className="min-w-0 flex-1 font-medium" />
										<span className="text-muted-foreground text-xs tabular-nums">{i === 0 ? `${num(x.points)} pts` : `−${num(x.behind)}`}</span>
									</div>
								))}
							</>
						)}
					</CardContent>
				)}
				{c && (
					<CardFooter className="text-muted-foreground border-t text-sm leading-relaxed">
						<p>
							<span className="text-foreground font-medium">Constructors:</span>{" "}
							{c.contenders.length === 1 ? (
								<>
									<TeamLink team={c.leader} flag className="text-foreground" /> have won the title.
								</>
							) : (
								<>
									<TeamLink team={c.leader} flag className="text-foreground" /> lead
									{c.second && (
										<>
											{" "}
											<TeamLink team={c.second} flag className="text-foreground" />
										</>
									)}{" "}
									by {pts(c.gap)}; {c.contenders.length > CONTENDERS_SHOWN ? "most teams" : `${c.contenders.length} teams`} can still win it.
									<Clinch fight={c} name={(r) => r.name} />
								</>
							)}
						</p>
					</CardFooter>
				)}
			</Card>
		</Section>
	);
}

/** "It could be settled at the next race…", when it could. */
function Clinch<R>({ fight: f, name }: { fight: TitleFight<R>; name: (r: R) => string }) {
	if (f.clinchMargin == null || !f.second) return null;
	return (
		<span className="text-muted-foreground">
			{" "}
			{f.clinchMargin === 0
				? "It could be settled at the next race."
				: `It could be settled at the next race: ${name(f.leader)} needs to outscore ${name(f.second)} by ${pts(f.clinchMargin)} (and the rest by less).`}
		</span>
	);
}

/* -------------------------------------------------------------- explore --- */

function Explore({ view, random }: { view: HomeView; random: boolean }) {
	const links: { href: string; icon: LucideIcon; label: string; detail: string }[] = [
		{ href: "/seasons", icon: CalendarRange, label: "Seasons", detail: `${view.totals.seasons} championships` },
		{ href: "/drivers", icon: Users, label: "Drivers", detail: `${num(view.totals.drivers)} who raced` },
		{ href: "/constructors", icon: Factory, label: "Constructors", detail: `${view.totals.constructors} teams` },
		{ href: "/circuits", icon: MapPin, label: "Circuits", detail: `${view.counts.circuits} tracks` },
		{ href: "/grands-prix", icon: FlagIcon, label: "Grands Prix", detail: `${view.counts.grandsPrix} events` },
		{ href: "/engines", icon: Cog, label: "Engines", detail: `${view.counts.engines} makers` },
		{ href: "/nations", icon: Globe, label: "Nations", detail: `${view.counts.nations} countries` },
		{ href: "/records", icon: Trophy, label: "Records", detail: "Every all-time list" },
		{ href: "/diary", icon: CalendarDays, label: "Diary", detail: "Every day of the year" },
		{ href: "/milestones", icon: Target, label: "Milestones", detail: "Records within reach" },
		{ href: "/compare", icon: GitCompareArrows, label: "Compare", detail: "Head to head" },
		{ href: "/points", icon: Calculator, label: "Points systems", detail: "Rescore history" },
	];
	return (
		<Section
			title="Explore"
			description="Everything on Pitwall, from 1950 to today"
			action={
				random && (
					<div className="flex flex-wrap gap-2">
						{(["race", "driver", "season"] as const).map((k) => (
							// a plain link: every visit should pick again, never a prefetched answer
							<a key={k} href={`/random/${k}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
								<Dices data-icon="inline-start" />
								Random {k}
							</a>
						))}
					</div>
				)
			}
		>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
				{links.map((l) => (
					<ULink
						key={l.href}
						href={l.href}
						className="bg-card ring-foreground/10 hover:ring-foreground/25 focus-visible:ring-ring flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 ring-1 transition-shadow outline-none focus-visible:ring-2"
					>
						<span className="bg-muted text-muted-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-lg">
							<l.icon className="size-4" />
						</span>
						<span className="min-w-0 leading-tight">
							<span className="block text-sm font-medium">{l.label}</span>
							<span className="text-muted-foreground block text-xs">{l.detail}</span>
						</span>
					</ULink>
				))}
			</div>
		</Section>
	);
}

/* ---------------------------------------------------------- on this day --- */

function OnThisDay({ day }: { day: OnThisDayView }) {
	return (
		<Section title="On this day" description={`${day.label} in Formula 1 history`} action={<MoreLink href={href.diary(day.slug)}>More from {day.label}</MoreLink>}>
			<Card>
				<CardContent className="space-y-3.5">
					{day.items.length ? (
						day.items.map((item, i) => (
							<div key={i} className="flex items-start gap-3 text-sm">
								<Badge variant="secondary" className="mt-0.5 w-12 shrink-0 justify-center tabular-nums">
									{item.year}
								</Badge>
								<div className="min-w-0 flex-1 leading-relaxed">
									<DayItem item={item} />
								</div>
							</div>
						))
					) : (
						<p className="text-muted-foreground text-sm">A quiet day in the history books: no races, titles or maiden wins.</p>
					)}
				</CardContent>
			</Card>
		</Section>
	);
}

const careerLine = (p: { titles: number; wins: number; starts: number }) =>
	p.titles ? `${p.titles}× champion` : p.wins ? (p.wins === 1 ? "1 win" : `${p.wins} wins`) : p.starts === 1 ? "1 start" : `${p.starts} starts`;

function DayItem({ item }: { item: OnThisDayItem }) {
	switch (item.kind) {
		case "title":
			return (
				<>
					<Crown className="text-gold mr-1 inline size-3.5 align-[-2px]" />
					{item.driver && <DriverLink driver={item.driver} className="font-medium" />} sealed the {item.year} title at the <RaceLink race={item.race} />
				</>
			);
		case "firstWin":
			return (
				<>
					<Trophy className="text-gold mr-1 inline size-3.5 align-[-2px]" />
					<DriverLink driver={item.driver} className="font-medium" />
					&apos;s first Grand Prix win, at the <RaceLink race={item.race} />
				</>
			);
		case "race":
			return (
				<>
					<RaceLink race={item.race} className="font-medium" />
					{item.winner && (
						<div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
							Won by <DriverLink driver={item.winner} className="text-foreground" />
							{item.winnerTeam && (
								<>
									· <TeamLink team={item.winnerTeam} />
								</>
							)}
						</div>
					)}
				</>
			);
		case "debut":
			return (
				<>
					<DriverLink driver={item.driver} className="font-medium" />
					&apos;s first start, at the <RaceLink race={item.race} />
					<span className="text-muted-foreground"> ({careerLine(item)})</span>
				</>
			);
		case "birth":
			return (
				<>
					<Cake className="text-muted-foreground mr-1 inline size-3.5 align-[-2px]" />
					<DriverLink driver={item.driver} className="font-medium" /> was born
					<span className="text-muted-foreground"> ({careerLine(item)})</span>
				</>
			);
	}
}
