import { Cake, CalendarDays, ChevronLeft, ChevronRight, Flag as FlagIcon, Flower2, Medal, Rocket, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTHS, allDiaryDays, diaryKey, diarySlug, type DiaryDaySummary, type DiaryIndexView, type DiaryPerson, type DiaryView } from "@pitwall/core/f1/diary";
import { CircuitLink, DateLink, DriverLink, Flag, Hint, MoreLink, Page, PageHeader, RaceLink, Section, SeasonLink, StatCard, TableCard, TeamLink, YearRange, href, num } from "../f1";
import { DiaryTodayButton } from "../diary-today";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { UpcomingAnniversaries } from "./anniversaries";
import { DiaryMonthPager, DiaryTodayMark } from "./diary-months";
import { surname } from "./season";

/* ---------------------------------------------------------------- a date --- */

export function DiaryPage({ view }: { view: DiaryView }) {
	const nothing = !view.races.length && !view.births.length && !view.deaths.length && !view.debuts.length && !view.firstWins.length;
	const stats = [
		{ label: "Grands Prix", one: "Grand Prix", many: "Grands Prix", value: view.races.filter((r) => !r.upcoming).length },
		{ label: "Drivers born", one: "driver born", many: "drivers born", value: view.births.length },
		{ label: "Drivers died", one: "driver died", many: "drivers died", value: view.deaths.length },
		{ label: "Debuts", one: "debut", many: "debuts", value: view.debuts.length },
		{ label: "Titles decided", one: "title decided", many: "titles decided", value: view.titles.length },
	];
	return (
		<Page>
			<PageHeader
				eyebrow={
					<ULink href="/diary" className="hover:text-foreground inline-flex items-center gap-1.5">
						<CalendarDays className="size-4" /> Diary
					</ULink>
				}
				title={view.label}
				actions={
					<>
						<ULink href={href.diary(view.prev.slug)} className={cn(buttonVariants({ variant: "outline" }))}>
							<ChevronLeft data-icon="inline-start" />
							{view.prev.label}
						</ULink>
						<ULink href={href.diary(view.next.slug)} className={cn(buttonVariants({ variant: "outline" }))}>
							{view.next.label}
							<ChevronRight data-icon="inline-end" />
						</ULink>
					</>
				}
			>
				Everything that happened in Formula 1 on {view.label}, in any year.
			</PageHeader>

			<div className="grid grid-cols-2 gap-4 max-sm:hidden md:grid-cols-3 xl:grid-cols-5">
				{stats.map((s) => (
					<StatCard key={s.label} label={s.label} value={num(s.value)} />
				))}
			</div>
			{stats.some((s) => s.value > 0) && (
				<Card size="sm" className="sm:hidden">
					<CardContent className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
						{stats
							.filter((s) => s.value > 0)
							.map((s) => (
								<span key={s.label} className="whitespace-nowrap">
									<span className="text-base font-semibold tabular-nums">{num(s.value)}</span>{" "}
									<span className="text-muted-foreground">{s.value === 1 ? s.one : s.many}</span>
								</span>
							))}
					</CardContent>
				</Card>
			)}

			{nothing && (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CalendarDays />
						</EmptyMedia>
						<EmptyTitle>A quiet day</EmptyTitle>
						<EmptyDescription>No races, birthdays or milestones on {view.label}.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			{view.titles.length > 0 && (
				<Section title="Championships decided" description="The race after which no rival could catch the champion.">
					<Card size="sm" className="py-0 sm:hidden">
						<ul className="divide-y">
							{view.titles.map((t, i) => (
								<li key={i} className="flex items-center gap-3 px-4 py-2.5">
									<Trophy className={cn("size-4 shrink-0", t.kind === "driver" ? "text-gold" : "text-silver")} />
									<div className="min-w-0">
										<div className="font-medium">{t.driver ? <DriverLink driver={t.driver} /> : t.team && <TeamLink team={t.team} flag />}</div>
										<div className="text-muted-foreground text-xs">
											<SeasonLink year={t.race.year} /> {t.kind === "driver" ? "drivers'" : "constructors'"} title at <RaceLink race={t.race} />
										</div>
									</div>
								</li>
							))}
						</ul>
					</Card>
					<div className="grid grid-cols-1 gap-4 max-sm:hidden md:grid-cols-2 xl:grid-cols-3">
						{view.titles.map((t, i) => (
							<Card key={i} size="sm">
								<CardHeader>
									<div className="text-muted-foreground flex items-center gap-1.5 text-sm">
										<Trophy className={cn("size-4", t.kind === "driver" ? "text-gold" : "text-silver")} />
										<SeasonLink year={t.race.year} /> {t.kind === "driver" ? "drivers'" : "constructors'"} title
									</div>
									<CardTitle className="text-lg">
										{t.driver ? <DriverLink driver={t.driver} /> : t.team && <TeamLink team={t.team} flag />}
									</CardTitle>
									<div className="text-muted-foreground text-sm">
										at <RaceLink race={t.race} />
									</div>
								</CardHeader>
							</Card>
						))}
					</div>
				</Section>
			)}

			{view.races.length > 0 && (
				<Section title="Races" description={`Grands Prix held on ${view.label}, latest first.`}>
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12 sm:w-16">Year</TableHead>
								<TableHead>Grand Prix</TableHead>
								<TableHead className="hidden sm:table-cell">Circuit</TableHead>
								<TableHead>Winner</TableHead>
								<TableHead className="hidden sm:table-cell">Pole position</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.races.map((r) => (
								<TableRow key={r.race.year + "-" + r.race.round}>
									<TableCell className="font-semibold">
										<SeasonLink year={r.race.year} />
									</TableCell>
									<TableCell className="max-sm:max-w-32">
										<RaceLink race={r.race} className="max-w-full font-medium" />
										<div className="text-muted-foreground truncate text-xs sm:hidden">{r.circuit.name}</div>
									</TableCell>
									<TableCell className="text-muted-foreground hidden sm:table-cell">
										<CircuitLink circuit={r.circuit} />
									</TableCell>
									<TableCell>
										{r.upcoming ? (
											<Badge variant="outline">Upcoming</Badge>
										) : (
											r.winner && (
												<div className="min-w-0 max-sm:max-w-36">
													<DriverLink driver={{ ...r.winner, name: `${r.winner.name[0]}. ${surname(r.winner.name)}` }} className="max-w-full font-medium sm:hidden" />
													<DriverLink driver={r.winner} className="max-w-full font-medium max-sm:hidden" />
													{r.winnerTeam && (
														<div className="text-muted-foreground truncate text-xs">
															<TeamLink team={r.winnerTeam} />
														</div>
													)}
												</div>
											)
										)}
									</TableCell>
									<TableCell className="text-muted-foreground hidden sm:table-cell">{r.pole && <DriverLink driver={r.pole} />}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
			)}

			{(view.births.length > 0 || view.deaths.length > 0) && (
				<div className="grid grid-cols-1 gap-12 xl:grid-cols-2 xl:gap-8">
					{view.births.length > 0 && <People title="Born on this day" icon={<Cake />} rows={view.births} kind="birth" />}
					{view.deaths.length > 0 && <People title="Died on this day" icon={<Flower2 />} rows={view.deaths} kind="death" />}
				</div>
			)}

			{(view.debuts.length > 0 || view.firstWins.length > 0) && (
				<div className="grid grid-cols-1 gap-12 xl:grid-cols-2 xl:gap-8">
					{view.debuts.length > 0 && <Firsts title="Debuts" description="First Grand Prix start." icon={<Rocket />} rows={view.debuts} />}
					{view.firstWins.length > 0 && <Firsts title="First wins" description="Maiden Grand Prix victories." icon={<Medal />} rows={view.firstWins} />}
				</div>
			)}
		</Page>
	);
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-2 [&_svg]:size-5 [&_svg]:text-muted-foreground">
			{icon}
			{children}
		</span>
	);
}

function People({ title, icon, rows, kind }: { title: string; icon: React.ReactNode; rows: DiaryPerson[]; kind: "birth" | "death" }) {
	return (
		<Section title={<SectionTitle icon={icon}>{title}</SectionTitle>}>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12 sm:w-16">Year</TableHead>
						<TableHead>Driver</TableHead>
						<TableHead className="hidden sm:table-cell">Career</TableHead>
						<TableHead className="text-right">Starts</TableHead>
						<TableHead className="text-right">Wins</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((p) => (
						<TableRow key={p.driver.id}>
							<TableCell className="font-semibold tabular-nums">{p.year}</TableCell>
							<TableCell className="max-sm:max-w-44 max-sm:whitespace-normal">
								<div className="flex items-center gap-1.5">
									<DriverLink driver={p.driver} className="font-medium" />
									{p.titles > 0 && (
										<Hint label={`${p.titles}× world champion`}>
											<Trophy className="text-gold size-3.5" />
										</Hint>
									)}
								</div>
								<div className="text-muted-foreground text-xs sm:hidden">
									<YearRange from={p.firstYear} to={p.lastYear} />
								</div>
								<div className="text-muted-foreground text-xs">
									{kind === "death"
										? p.age != null && `Aged\u00a0${p.age}`
										: p.died && (
												<>
													Died <DateLink date={p.died} />
													{p.age != null && `, aged\u00a0${p.age}`}
												</>
											)}
								</div>
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell">
								<YearRange from={p.firstYear} to={p.lastYear} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{p.starts}</TableCell>
							<TableCell className="text-right tabular-nums">{p.wins || ""}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Section>
	);
}

function Firsts({ title, description, icon, rows }: { title: string; description: string; icon: React.ReactNode; rows: DiaryView["debuts"] }) {
	return (
		<Section title={<SectionTitle icon={icon}>{title}</SectionTitle>} description={description}>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12 sm:w-16">Year</TableHead>
						<TableHead>Driver</TableHead>
						<TableHead className="hidden sm:table-cell">Race</TableHead>
						<TableHead className="text-right">Age</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r) => (
						<TableRow key={r.driver.id}>
							<TableCell className="font-semibold">
								<SeasonLink year={r.race.year} />
							</TableCell>
							<TableCell className="max-sm:max-w-56">
								<DriverLink driver={r.driver} className="max-w-full font-medium" />
								<div className="text-muted-foreground truncate text-xs sm:hidden">{r.race.name}</div>
							</TableCell>
							<TableCell className="hidden sm:table-cell">
								<RaceLink race={r.race} />
							</TableCell>
							<TableCell className="text-muted-foreground text-right tabular-nums">{r.age ?? ""}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Section>
	);
}

/* ------------------------------------------------------------- the index --- */

export function DiaryIndexPage({ view }: { view: DiaryIndexView }) {
	const maxRaces = Math.max(...Object.values(view.days).map((d) => d.races), 1);
	const months = MONTHS.map((name, m) => <MonthCard key={name} view={view} month={m} maxRaces={maxRaces} />);
	return (
		<Page>
			<PageHeader title="Diary" eyebrow="On this day" actions={<DiaryTodayButton />}>
				Pick any date to see the Grands Prix held on it, the drivers born and lost, debuts, maiden wins and championships decided. Darker days have
				hosted more races.
			</PageHeader>

			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-muted-foreground max-sm:w-full">Busiest race days:</span>
				{view.busiest.map((b) => (
					<ULink key={b.slug} href={href.diary(b.slug)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
						{b.label}
						<Badge variant="secondary" className="tabular-nums">
							{b.races}
						</Badge>
					</ULink>
				))}
			</div>

			<UpcomingAnniversaries
				events={view.anniversaries}
				days={30}
				limit={6}
				action={<MoreLink href="/milestones">Milestone watch</MoreLink>}
			/>

			<DiaryMonthPager className="sm:hidden" months={months} />
			<div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{MONTHS.map((name, m) => (
					<MonthCard key={name} view={view} month={m} maxRaces={maxRaces} />
				))}
			</div>
			<DiaryTodayMark />
		</Page>
	);
}

function MonthCard({ view, month: m, maxRaces }: { view: DiaryIndexView; month: number; maxRaces: number }) {
	const name = MONTHS[m];
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>{name}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-7 gap-1">
					{allDiaryDays()
						.filter((d) => d.month === m + 1)
						.map((d) => {
							const c = view.days[diaryKey(d.month, d.day)];
							const races = c?.races ?? 0;
							return (
								<HoverCard key={d.day}>
									<HoverCardTrigger
										delay={200}
										render={<ULink href={href.diary(diarySlug(d.month, d.day))} data-diary-day={`${d.month}-${d.day}`} />}
										className={cn(
											"hover:ring-primary data-today:ring-foreground flex h-10 items-center justify-center rounded-md text-xs tabular-nums transition-shadow hover:ring-2 data-today:font-bold data-today:ring-2 sm:h-9",
											races ? "text-foreground" : "text-muted-foreground bg-muted/40",
										)}
										style={races ? { backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(12 + (60 * races) / maxRaces)}%, transparent)` } : undefined}
									>
										{d.day}
									</HoverCardTrigger>
									<HoverCardContent side="top" className="w-64 rounded-xl p-3">
										<DaySummary label={`${d.day} ${name}`} day={c} />
									</HoverCardContent>
								</HoverCard>
							);
						})}
				</div>
			</CardContent>
		</Card>
	);
}

const SUMMARY_ROWS = [
	{ key: "races", icon: FlagIcon, one: "race", many: "races" },
	{ key: "titles", icon: Trophy, one: "title decided", many: "titles decided" },
	{ key: "births", icon: Cake, one: "driver born", many: "drivers born" },
	{ key: "deaths", icon: Flower2, one: "driver died", many: "drivers died" },
	{ key: "debuts", icon: Rocket, one: "debut", many: "debuts" },
	{ key: "firstWins", icon: Medal, one: "first win", many: "first wins" },
] as const;

/** Hover card for a calendar day: what happened on it, one line per kind. */
function DaySummary({ label, day }: { label: string; day: DiaryDaySummary | undefined }) {
	const rows = SUMMARY_ROWS.filter((r) => (day?.[r.key] ?? 0) > 0);
	return (
		<div className="space-y-2.5">
			<div className="font-medium">{label}</div>
			{rows.length ? (
				<ul className="space-y-1.5">
					{rows.map(({ key, icon: Icon, one, many }) => {
						const n = day![key];
						return (
							<li key={key} className="flex items-center gap-2">
								<Icon className="text-muted-foreground size-4 shrink-0" />
								<span className="w-7 text-right font-semibold tabular-nums">{n}</span>
								<span className="text-muted-foreground">{n === 1 ? one : many}</span>
							</li>
						);
					})}
				</ul>
			) : (
				<p className="text-muted-foreground">Nothing has happened on this date yet.</p>
			)}
			{day?.latest && (
				<div className="text-muted-foreground flex items-center gap-1.5 border-t pt-2.5 text-xs">
					<span>Latest:</span>
					<Flag code={day.latest.country} />
					<span className="text-foreground truncate">
						{day.latest.year} {day.latest.name}
					</span>
				</div>
			)}
		</div>
	);
}
