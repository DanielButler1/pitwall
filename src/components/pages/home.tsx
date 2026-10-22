import { CalendarDays, ChevronRight, FlaskConical, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { HomeView } from "@/lib/f1/views";
import type { MilestoneWatch } from "@/lib/f1/milestones";
import { CircuitLink, DateLink, DriverLink, Join, MoreLink, Page, PageHeader, Pos, RaceLink, Section, StatCard, TableCard, TeamLink, fmtDate, href, num } from "../f1";
import { ULink } from "../universe-link";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { TableBody, TableCell, TableRow } from "../ui/table";
import { MilestoneWatchPanel } from "./milestones";

export function HomePage({ view, universeName, milestones }: { view: HomeView; universeName?: string; milestones?: MilestoneWatch | null }) {
	return (
		<Page>
			<PageHeader
				eyebrow={universeName ? "Alternate universe" : `Formula 1 World Championship · 1950–${view.lastYear}`}
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
						Browse the record books, or use the Lab to change results and see how history would have turned out.
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
				<Section
					title={`${view.lastYear} standings`}
					description={view.inProgress ? `After ${view.completedRounds} of ${view.totalRounds} rounds` : "Final standings"}
					action={<MoreLink href={href.season(view.lastYear)}>Full season</MoreLink>}>
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
				</Section>

				{view.latestRace && (
					<Section title="Latest race" action={<MoreLink href={href.race(view.latestRace.race)}>Full result</MoreLink>}>
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">
									<RaceLink race={view.latestRace.race} year />
								</CardTitle>
								<CardDescription>
									<span className="inline-flex flex-wrap items-center gap-x-1.5">
										<CircuitLink circuit={view.latestRace.circuit} />
										<span>
											· <DateLink date={view.latestRace.race.date} />
										</span>
									</span>
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{view.latestRace.podium.map((p, i) => (
									<div key={p.driver.id} className="flex items-center gap-3">
										<Pos text={String(i + 1)} />
										<div className="min-w-0 flex-1">
											<DriverLink driver={p.driver} className="font-medium" />
											<div className="text-muted-foreground text-xs">
												<TeamLink team={p.team} />
											</div>
										</div>
										<span className="text-muted-foreground text-sm tabular-nums">{p.time}</span>
									</div>
								))}
							</CardContent>
							{view.nextRace && (
								<CardFooter className="border-t">
									<ULink href={href.race(view.nextRace.race)} className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm">
										<CalendarDays className="size-4 shrink-0" />
										<span>
											Next: <span className="text-foreground font-medium">{view.nextRace.race.year} {view.nextRace.race.name}</span>, round{" "}
											{view.nextRace.round} of {view.nextRace.of}, {fmtDate(view.nextRace.race.date)}
										</span>
									</ULink>
								</CardFooter>
							)}
						</Card>
					</Section>
				)}

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
			</div>

			{milestones && <MilestoneWatchPanel watch={milestones} />}
		</Page>
	);
}
