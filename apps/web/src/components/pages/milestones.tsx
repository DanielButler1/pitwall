import { CalendarDays, Target, TrendingUp } from "lucide-react";
import type { Milestone, MilestoneStat, MilestoneWatch, MilestonesView, RecordChase, Subject } from "@pitwall/core/f1/milestones";
import { ordinal } from "@pitwall/core/f1/anniversaries";
import { cn } from "@/lib/utils";
import { DateLink, DriverLink, Hint, MoreLink, Page, PageHeader, Section, TableCard, TeamLink, href, num } from "../f1";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { UpcomingAnniversaries } from "./anniversaries";

const STAT: Record<MilestoneStat, { one: string; many: string; title: string }> = {
	wins: { one: "win", many: "wins", title: "Wins" },
	podiums: { one: "podium", many: "podiums", title: "Podiums" },
	poles: { one: "pole", many: "poles", title: "Pole positions" },
	titles: { one: "title", many: "titles", title: "Championships" },
	starts: { one: "start", many: "starts", title: "Starts" },
	points: { one: "point", many: "points", title: "Points" },
	fastestLaps: { one: "fastest lap", many: "fastest laps", title: "Fastest laps" },
};

function SubjectLink({ s, className }: { s: Subject; className?: string }) {
	return s.kind === "driver" ? <DriverLink driver={s.driver} className={className} /> : <TeamLink team={s.team} flag className={className} />;
}

const subjectKey = (s: Subject) => (s.kind === "driver" ? `d:${s.driver.id}` : `t:${s.team.id}`);

/** "100th start", "500 points". */
function markLabel(m: Pick<Milestone, "stat" | "target">) {
	return m.stat === "points" ? `${num(m.target)} points` : `${ordinal(m.target)} ${STAT[m.stat].one}`;
}

const soon = (eta: number | null, thisSeason: boolean, inProgress: boolean) => inProgress && thisSeason && eta != null && eta > 1;
const ETA_HINT = "At their rate over the last 22 races, less the rate of anyone they are chasing who is still racing";

function SeasonBadge() {
	return <Badge variant="secondary">This season</Badge>;
}

/** The soonest milestones get an accent pill, so they read as the most urgent. */
function NextRaceBadge() {
	return (
		<Hint label={ETA_HINT}>
			<Badge className="bg-primary/15 text-primary border-primary/25">Next race</Badge>
		</Hint>
	);
}

/** A name with, on phones, the "Next race" / "This season" pill in a fixed slot at the row's right edge. */
function NameLine({ s, eta, badge }: { s: Subject; eta: number | null; badge: boolean }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<SubjectLink s={s} className="font-medium" />
			{(badge || eta === 1) && <span className="ml-auto shrink-0 sm:hidden">{eta === 1 ? <NextRaceBadge /> : <SeasonBadge />}</span>}
		</div>
	);
}

function Eta({ eta, thisSeason, inProgress, badge = true }: { eta: number | null; thisSeason: boolean; inProgress: boolean; badge?: boolean }) {
	if (eta == null) return <span className="text-muted-foreground">–</span>;
	if (eta === 1) return badge ? <NextRaceBadge /> : null;
	return (
		<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
			<Hint label={ETA_HINT}>
				<span className="tabular-nums">~{eta} races</span>
			</Hint>
			{badge && soon(eta, thisSeason, inProgress) && <SeasonBadge />}
		</span>
	);
}

/** Who they'd pass: up to three names, the rest in a hint. */
function Targets({ c, className }: { c: RecordChase; className?: string }) {
	const shown = c.target.subjects.slice(0, c.target.subjects.length > 3 ? 2 : 3);
	const rest = c.target.subjects.slice(shown.length);
	// the figure rides with the last group, so "Lotus (7)" never splits
	const value = <span className="text-muted-foreground ml-1.5 tabular-nums">({num(c.target.value)})</span>;
	return (
		<span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
			{shown.map((s, i) => (
				<span key={subjectKey(s)} className="inline-flex items-center whitespace-nowrap [&_*]:whitespace-nowrap">
					<SubjectLink s={s} />
					{i < shown.length - 1 || rest.length ? <span className="text-muted-foreground">,</span> : null}
					{i === shown.length - 1 && !rest.length && value}
				</span>
			))}
			{rest.length > 0 && (
				<span className="inline-flex items-center whitespace-nowrap">
					<Hint label={rest.map((s) => (s.kind === "driver" ? s.driver.name : s.team.name)).join(", ")}>
						<span className="text-muted-foreground underline decoration-dotted underline-offset-4">+{rest.length} more</span>
					</Hint>
					{value}
				</span>
			)}
		</span>
	);
}

function needText(c: RecordChase) {
	if (c.stat === "points") return `${num(c.needed)} pts behind`;
	return `${num(c.needed)} more ${c.needed === 1 ? STAT[c.stat].one : STAT[c.stat].many}`;
}

/* ---------------------------------------------------------------- page --- */

export function MilestonesPage({ view }: { view: MilestonesView | null }) {
	if (!view)
		return (
			<Page>
				<PageHeader title="Milestone watch" />
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Target />
						</EmptyMedia>
						<EmptyTitle>No season yet</EmptyTitle>
						<EmptyDescription>There are no results to measure milestones against.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</Page>
		);
	const byStat = new Map<MilestoneStat, RecordChase[]>();
	for (const c of view.chases) byStat.set(c.stat, [...(byStat.get(c.stat) ?? []), c]);
	return (
		<Page>
			<PageHeader eyebrow={`The ${view.year} grid`} title="Milestone watch">
				Round numbers coming up for the drivers and teams on the current grid, and the names they are closing in on in the all-time lists. Estimates use
				each driver&apos;s or team&apos;s rate over their last 22 races; when the name they are chasing is still racing, only the rate they are closing the gap at
				counts.
				{view.nextRace && (
					<span className="mt-1 flex items-center gap-1.5">
						<CalendarDays className="size-4 shrink-0" />
						<span>
							Next race:{" "}
							<ULink href={href.race(view.nextRace)} className="text-foreground font-medium underline-offset-4 hover:underline">
								{view.nextRace.year} {view.nextRace.name}
							</ULink>
							, <DateLink date={view.nextRace.date} />
						</span>
					</span>
				)}
			</PageHeader>

			<Section title="Coming up" description="The next round-number milestone each driver and team is expected to reach within about a season.">
				{view.milestones.length ? (
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Driver / team</TableHead>
								<TableHead className="hidden sm:table-cell">Milestone</TableHead>
								<TableHead className="hidden text-right sm:table-cell">Now</TableHead>
								<TableHead className="hidden text-right sm:table-cell">To go</TableHead>
								<TableHead className="hidden sm:table-cell">Expected</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.milestones.map((m) => (
								<TableRow key={`${subjectKey(m.subject)}:${m.stat}`}>
									<TableCell className="max-sm:max-w-0 max-sm:whitespace-normal">
										<NameLine s={m.subject} eta={m.eta} badge={soon(m.eta, m.thisSeason, view.inProgress)} />
										<div className="text-muted-foreground text-xs sm:hidden">
											<span className="text-foreground font-medium">{markLabel(m)}</span> · {num(m.current)} now ·{" "}
											<span className="text-foreground font-medium">{num(m.needed)} to go</span>
											{m.eta != null && m.eta > 1 && (
												<>
													{" "}
													<span className="whitespace-nowrap">
														· <Eta eta={m.eta} thisSeason={m.thisSeason} inProgress={view.inProgress} badge={false} />
													</span>
												</>
											)}
										</div>
									</TableCell>
									<TableCell className="hidden font-medium sm:table-cell">{markLabel(m)}</TableCell>
									<TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">{num(m.current)}</TableCell>
									<TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">{num(m.needed)}</TableCell>
									<TableCell className="hidden sm:table-cell">
										<Eta eta={m.eta} thisSeason={m.thisSeason} inProgress={view.inProgress} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				) : (
					<p className="text-muted-foreground text-sm">Nothing round-numbered is within reach right now.</p>
				)}
			</Section>

			<Section
				title="Record chases"
				description="Who each driver and team on the grid passes next on the all-time lists, for climbs into the top 30."
				action={<MoreLink href="/records">All records</MoreLink>}
			>
				<div className="grid grid-cols-1 gap-8 min-[1800px]:grid-cols-2">
					{[...byStat].map(([stat, chases]) => (
						<div key={stat} className="min-w-0 space-y-3">
							<h3 className="flex items-center gap-2 font-medium">
								<TrendingUp className="text-muted-foreground size-4" />
								{STAT[stat].title}
							</h3>
							<TableCard>
								<TableHeader>
									<TableRow>
										<TableHead>Driver / team</TableHead>
										<TableHead className="hidden text-right sm:table-cell">Total</TableHead>
										<TableHead className="w-[110px] min-w-[110px] sm:w-28 sm:min-w-28">All-time</TableHead>
										<TableHead className="hidden sm:table-cell">To pass</TableHead>
										<TableHead className="hidden text-right sm:table-cell">Needs</TableHead>
										<TableHead className="hidden sm:table-cell">Expected</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{chases.map((c) => (
										<TableRow key={`${subjectKey(c.subject)}:${c.stat}`}>
											<TableCell className="max-sm:w-full max-sm:max-w-0 max-sm:whitespace-normal max-sm:align-top">
												<SubjectLink s={c.subject} className="font-medium" />
												<div className="text-muted-foreground text-xs sm:hidden">
													{c.stat === "points" ? needText(c) : `${needText(c)} to pass`} <Targets c={c} className="inline [&>span]:mr-1" />
												</div>
											</TableCell>
											<TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">{num(c.current)}</TableCell>
											<TableCell className="w-[110px] min-w-[110px] whitespace-nowrap tabular-nums max-sm:align-top sm:w-28 sm:min-w-28">
												{ordinal(c.rank)} <span className="text-muted-foreground">→</span> {ordinal(c.newRank)}
												{c.eta != null && (
													<div className="text-muted-foreground mt-1 flex flex-col items-start gap-1 text-xs sm:hidden">
														{c.eta > 1 && <Eta eta={c.eta} thisSeason={c.thisSeason} inProgress={view.inProgress} badge={false} />}
														{c.eta === 1 ? <NextRaceBadge /> : soon(c.eta, c.thisSeason, view.inProgress) && <SeasonBadge />}
													</div>
												)}
											</TableCell>
											<TableCell className="hidden max-w-64 sm:table-cell">
												<Targets c={c} />
											</TableCell>
											<TableCell className="hidden text-right whitespace-nowrap tabular-nums sm:table-cell">{needText(c)}</TableCell>
											<TableCell className="hidden sm:table-cell">
												<Eta eta={c.eta} thisSeason={c.thisSeason} inProgress={view.inProgress} />
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</div>
					))}
				</div>
				{!view.chases.length && <p className="text-muted-foreground text-sm">No all-time places are within reach right now.</p>}
			</Section>

			<UpcomingAnniversaries events={view.anniversaries} days={60} />
		</Page>
	);
}

/* ---------------------------------------------------------- home panel --- */

export function MilestoneWatchPanel({ watch, className }: { watch: MilestoneWatch; className?: string }) {
	if (!watch.milestones.length && !watch.chases.length) return null;
	return (
		<Section
			title="Milestone watch"
			description="Coming up for the current grid"
			action={
				<MoreLink href="/milestones">
					All<span className="max-sm:hidden"> milestones</span>
				</MoreLink>
			}
			className={className}
		>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{watch.milestones.length > 0 && (
					<Card size="sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Target className="text-muted-foreground size-4" /> Round numbers
							</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="space-y-3">
								{watch.milestones.map((m) => (
									<li key={`${subjectKey(m.subject)}:${m.stat}`} className="flex items-center gap-3 text-sm">
										<div className="min-w-0 flex-1">
											<SubjectLink s={m.subject} className="font-medium" />
											<div className="text-muted-foreground text-xs">
												{markLabel(m)} · {num(m.needed)} to go
											</div>
										</div>
										<span className="text-muted-foreground shrink-0 text-xs tabular-nums">{m.eta === 1 ? "Next race" : `~${m.eta} races`}</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				)}
				{watch.chases.length > 0 && (
					<Card size="sm">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<TrendingUp className="text-muted-foreground size-4" /> Record chases
							</CardTitle>
						</CardHeader>
						<CardContent>
							<ul className="space-y-3">
								{watch.chases.map((c) => (
									<li key={`${subjectKey(c.subject)}:${c.stat}`} className="flex items-center gap-3 text-sm">
										<div className="min-w-0 flex-1">
											<SubjectLink s={c.subject} className="font-medium" />
											<div className="text-muted-foreground text-xs">
												{c.stat === "points" ? `${needText(c)} ` : `Needs ${needText(c)} to pass `}
												{c.target.subjects[0].kind === "driver" ? c.target.subjects[0].driver.name : c.target.subjects[0].team.name}
												{c.target.subjects.length > 1 && ` and ${c.target.subjects.length - 1} more`} ({num(c.target.value)}
												{c.stat === "points" ? " pts" : ""}) · {ordinal(c.rank)} → {ordinal(c.newRank)} all-time
											</div>
										</div>
										<span className="text-muted-foreground shrink-0 text-xs tabular-nums">{c.eta === 1 ? "Next race" : `~${c.eta} races`}</span>
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				)}
			</div>
		</Section>
	);
}
