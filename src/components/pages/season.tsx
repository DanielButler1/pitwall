import { ChevronLeft, ChevronRight, Sparkles, Timer, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatrixCell, RaceRef, SeasonView, SeasonsView } from "@/lib/f1/views";
import type { SeasonProgression } from "@/lib/f1/progression";
import {
	CircuitLink,
	DriverLink,
	Hint,
	EngineLink,
	Flag,
	Join,
	Page,
	PageHeader,
	Pos,
	RaceLink,
	RealDiff,
	Section,
	SeasonLink,
	TableCard,
	TeamLink,
	TyreLink,
	fmtDate,
	href,
	num,
	DateLink,
} from "../f1";
import { ULink } from "../universe-link";
import { SeasonProgressionChart } from "./season-chart";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export function SeasonsPage({ view }: { view: SeasonsView }) {
	return (
		<Page>
			<PageHeader title="Seasons" eyebrow="Formula 1 World Championship">
				Every championship since 1950, with its champions and number of rounds.
			</PageHeader>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>Season</TableHead>
						<TableHead className="text-right">Rounds</TableHead>
						<TableHead>Drivers&apos; champion</TableHead>
						<TableHead>Team</TableHead>
						<TableHead className="text-right">Points</TableHead>
						<TableHead>Constructors&apos; champion</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.year} className={cn(r.modified && "bg-universe/5")}>
							<TableCell className="font-semibold">
								<span className="inline-flex items-center gap-1.5">
									<SeasonLink year={r.year} />
									{r.modified && (
										<Hint label="Changed in this universe">
											<Sparkles className="text-universe size-3.5" />
										</Hint>
									)}
								</span>
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.races}</TableCell>
							<TableCell>
								<span className="inline-flex items-center gap-2">
									{r.champion ? <DriverLink driver={r.champion} className="font-medium" /> : <span className="text-muted-foreground">Not started</span>}
									{r.inProgress && <Badge variant="secondary">Leader, in progress</Badge>}
								</span>
								{r.realChampion && (
									<Badge variant="outline" className="border-universe/30 text-universe ml-2">
										real: <DriverLink driver={r.realChampion} flag={false} />
									</Badge>
								)}
							</TableCell>
							<TableCell>{r.championTeam && <TeamLink team={r.championTeam} />}</TableCell>
							<TableCell className="text-right tabular-nums">{r.championPoints != null ? num(r.championPoints) : ""}</TableCell>
							<TableCell>{r.constructorChampion ? <TeamLink team={r.constructorChampion} /> : <span className="text-muted-foreground">–</span>}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Page>
	);
}

function cellClass(c: MatrixCell) {
	if (!c) return "";
	const n = Number(c.text);
	if (n === 1) return "cell-1";
	if (n === 2) return "cell-2";
	if (n === 3) return "cell-3";
	if (c.points > 0) return "cell-pts";
	if (n) return "cell-fin";
	if (["DNQ", "DNPQ", "DNP", "DNS"].includes(c.text)) return "cell-dnq";
	return "cell-out";
}

const shortText = (t: string) => ({ DNF: "Ret", DNPQ: "DPQ" })[t] ?? t;

const CELL_TEXT: Record<string, string> = {
	DNF: "Retired",
	DNS: "Did not start",
	DNQ: "Did not qualify",
	DNPQ: "Did not pre-qualify",
	DSQ: "Disqualified",
	NC: "Not classified",
	EX: "Excluded",
	DNP: "Did not practise",
};

const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));

/** A round's column heading; the hover card sums up the race. */
function RoundHeader({ round: r }: { round: SeasonView["races"][number] }) {
	return (
		<HoverCard>
			<HoverCardTrigger delay={150} render={<ULink href={href.race(r.race)} />} className="hover:text-foreground inline-flex flex-col items-center gap-0.5">
				<Flag code={r.race.country} className="text-[10px]" />
				<span className="text-[10px] tabular-nums">{r.race.round}</span>
			</HoverCardTrigger>
			<HoverCardContent side="top" className="w-72 space-y-2.5 rounded-xl p-3 text-left font-normal">
				<div>
					<div className="flex items-center gap-2 font-medium">
						<Flag code={r.race.country} />
						<span className="truncate">
							{r.race.year} {r.race.name}
						</span>
					</div>
					<div className="text-muted-foreground mt-0.5 text-xs">
						Round {r.race.round} · <DateLink date={r.race.date} /> · {r.circuit.name}
					</div>
				</div>
				<dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
					{r.winner && (
						<>
							<dt className="text-muted-foreground flex items-center gap-1.5">
								<Trophy className="text-gold size-3.5" /> Winner
							</dt>
							<dd className="min-w-0">
								<DriverLink driver={r.winner} />
							</dd>
						</>
					)}
					{r.pole && (
						<>
							<dt className="text-muted-foreground">Pole</dt>
							<dd className="min-w-0">
								<DriverLink driver={r.pole} />
							</dd>
						</>
					)}
					{r.fastestLap && (
						<>
							<dt className="text-muted-foreground flex items-center gap-1.5">
								<Timer className="size-3.5" /> Fastest lap
							</dt>
							<dd className="min-w-0">
								<DriverLink driver={r.fastestLap} />
							</dd>
						</>
					)}
				</dl>
			</HoverCardContent>
		</HoverCard>
	);
}

/** One championship-grid cell; the round and result show in a hover card. */
function GridCell({ cell, race }: { cell: MatrixCell; race: RaceRef }) {
	const className = cn(
		"px-0.5 text-center text-xs tabular-nums",
		cellClass(cell),
		cell?.pole && "underline decoration-2 underline-offset-2",
		cell?.fastestLap && "italic",
	);
	if (!cell) return <TableCell className={className} />;
	const n = Number(cell.text);
	return (
		<TableCell className={cn(className, "p-0")}>
			<HoverCard>
				<HoverCardTrigger delay={150} render={<ULink href={href.race(race)} />} className="block px-0.5 py-1.5">
					{shortText(cell.text)}
				</HoverCardTrigger>
				<HoverCardContent side="top" className="w-64 space-y-2 rounded-xl p-3 not-italic no-underline">
					<div className="flex items-center gap-2 font-medium">
						<Flag code={race.country} />
						<span className="truncate">
							{race.year} {race.name}
						</span>
					</div>
					<div className="text-muted-foreground text-xs">
						Round {race.round} · <DateLink date={race.date} />
					</div>
					<div className="flex items-center gap-2">
						<Pos text={n ? String(n) : shortText(cell.text)} />
						<span>{n ? `Finished ${ordinal(n)}` : (CELL_TEXT[cell.text] ?? cell.text)}</span>
						{cell.points > 0 && <span className="ml-auto font-semibold tabular-nums">{num(cell.points)} pts</span>}
					</div>
					{(cell.pole || cell.fastestLap) && (
						<div className="flex gap-1.5">
							{cell.pole && <Badge variant="secondary">Pole position</Badge>}
							{cell.fastestLap && (
								<Badge variant="secondary">
									<Timer /> Fastest lap
								</Badge>
							)}
						</div>
					)}
				</HoverCardContent>
			</HoverCard>
		</TableCell>
	);
}

export function SeasonPage({ view, progression }: { view: SeasonView; progression?: SeasonProgression | null }) {
	const done = view.races.filter((r) => r.completed);
	// Mid-season, show the current leaders in place of champions.
	const champion = view.driverStandings.find((d) => d.champion) ?? (view.inProgress ? view.driverStandings[0] : undefined);
	const cChampion = view.constructorStandings.find((c) => c.champion) ?? (view.inProgress ? view.constructorStandings[0] : undefined);
	const title = view.inProgress ? "leader" : "champion";
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						Formula 1 World Championship
						{view.modified && (
							<Badge variant="outline" className="border-universe/30 text-universe">
								<Sparkles /> {view.simulated ? "Simulated" : "Altered"} · {view.pointsSystem}
							</Badge>
						)}
					</>
				}
				title={`${view.year} season`}
				actions={
					<>
						{view.prevYear && (
							<ULink href={href.season(view.prevYear)} className={cn(buttonVariants({ variant: "outline" }))}>
								<ChevronLeft data-icon="inline-start" />
								{view.prevYear}
							</ULink>
						)}
						{view.nextYear && (
							<ULink href={href.season(view.nextYear)} className={cn(buttonVariants({ variant: "outline" }))}>
								{view.nextYear}
								<ChevronRight data-icon="inline-end" />
							</ULink>
						)}
					</>
				}
			>
				{view.races.length} rounds
				{done.length < view.races.length && `, ${done.length} completed`}.{view.inProgress && " Standings are provisional until the final round."}
				{view.tyres.length > 0 && (
					<span className="mt-1 block">
						Tyres: <Join items={view.tyres} render={(t) => <TyreLink tyre={t} className="text-foreground" />} />
					</span>
				)}
			</PageHeader>

			{(champion || cChampion) && (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{champion && (
						<Card size="sm">
							<CardHeader>
								<CardDescription className="flex items-center gap-1.5">
									<Trophy className="text-gold size-3.5" /> Drivers&apos; {title}
								</CardDescription>
								<CardTitle className="text-xl font-semibold">
									<DriverLink driver={champion.driver} />
								</CardTitle>
								<CardDescription>
									{num(champion.points)} points · {champion.wins} wins · <Join items={champion.teams} sep=" / " render={(t) => <TeamLink team={t} />} />
								</CardDescription>
							</CardHeader>
						</Card>
					)}
					{cChampion && (
						<Card size="sm">
							<CardHeader>
								<CardDescription className="flex items-center gap-1.5">
									<Trophy className="text-gold size-3.5" /> Constructors&apos; {title}
								</CardDescription>
								<CardTitle className="text-xl font-semibold">
									<TeamLink team={cChampion.team} flag />
								</CardTitle>
								<CardDescription>
									{num(cChampion.points)} points · {cChampion.wins} wins
									{cChampion.engine && (
										<>
											{" · "}
											<EngineLink engine={cChampion.engine} />
										</>
									)}
								</CardDescription>
							</CardHeader>
						</Card>
					)}
				</div>
			)}

			{view.completed && (
				<Section
					title="Drivers' championship"
					description={`${view.inProgress ? `After ${done.length} of ${view.races.length} rounds. ` : ""}Each round's result. Underlined: pole position. Italic: fastest lap. Hover a cell for details.`}
				>
					<TableCard tableClassName="[&_td]:py-1.5">
						<TableHeader>
							<TableRow>
								<TableHead className="w-12">Pos</TableHead>
								<TableHead>Driver</TableHead>
								<TableHead className="text-right">Pts</TableHead>
								<TableHead className="text-right">Wins</TableHead>
								{done.map((r) => (
									<TableHead key={r.race.round} className="px-0.5 text-center">
										<RoundHeader round={r} />
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.driverStandings.map((d) => (
								<TableRow key={d.driver.id}>
									<TableCell className="whitespace-nowrap">
										<Pos text={d.position} />
										<RealDiff real={d.realPosition !== d.position ? d.realPosition : null} />
									</TableCell>
									<TableCell className="max-w-64">
										<div className="flex items-center gap-1.5">
											<DriverLink driver={d.driver} className="font-medium" />
											{d.champion && (
												<Hint label="Drivers' champion">
													<Trophy className="text-gold size-3.5" />
												</Hint>
											)}
										</div>
										<div className="text-muted-foreground truncate text-xs">
											<Join items={d.teams} sep=" / " render={(t) => <TeamLink team={t} />} />
										</div>
									</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">{num(d.points)}</TableCell>
									<TableCell className="text-right tabular-nums">{d.wins || ""}</TableCell>
									{d.cells.map((c, i) => (
										<GridCell key={i} cell={c} race={done[i].race} />
									))}
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
			)}

			{progression && progression.rounds.length > 1 && (
				<Section
					title="Championship progression"
					description={`The title fight round by round, for the top ten drivers${progression.constructors ? " and constructors" : ""}.`}
				>
					<Card>
						<CardContent>
							<SeasonProgressionChart progression={progression} />
						</CardContent>
					</Card>
				</Section>
			)}

			<div className="grid gap-12 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] 2xl:gap-8">
				{view.completed && view.constructorStandings.length > 0 && (
					<Section title="Constructors' championship">
						<TableCard>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">Pos</TableHead>
									<TableHead>Constructor</TableHead>
									<TableHead>Engine</TableHead>
									<TableHead className="text-right">Wins</TableHead>
									<TableHead className="text-right">Pts</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.constructorStandings.map((c) => (
									<TableRow key={c.team.id + (c.engine?.id ?? "")}>
										<TableCell className="whitespace-nowrap">
											<Pos text={c.position} />
											<RealDiff real={c.realPosition !== c.position ? c.realPosition : null} />
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-1.5">
												<TeamLink team={c.team} flag className="font-medium" />
												{c.champion && (
													<Hint label="Constructors' champion">
														<Trophy className="text-gold size-3.5" />
													</Hint>
												)}
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">{c.engine && <EngineLink engine={c.engine} />}</TableCell>
										<TableCell className="text-right tabular-nums">{c.wins || ""}</TableCell>
										<TableCell className="text-right font-semibold tabular-nums">{num(c.points)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					</Section>
				)}

				<Section title="Calendar" className={cn(!(view.completed && view.constructorStandings.length) && "2xl:col-span-2")}>
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">Rd</TableHead>
								<TableHead>Grand Prix</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Circuit</TableHead>
								<TableHead>Pole</TableHead>
								<TableHead>Winner</TableHead>
								<TableHead>Fastest lap</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.races.map((r) => (
								<TableRow key={r.race.round} className={cn(!r.completed && "text-muted-foreground")}>
									<TableCell className="tabular-nums">{r.race.round}</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<RaceLink race={r.race} className="font-medium" />
											{r.sprint && <Badge variant="secondary">Sprint</Badge>}
										</div>
									</TableCell>
									<TableCell className="whitespace-nowrap">
										<DateLink date={r.race.date} />
									</TableCell>
									<TableCell>
										<CircuitLink circuit={r.circuit} />
									</TableCell>
									<TableCell>{r.pole && <DriverLink driver={r.pole} flag={false} />}</TableCell>
									<TableCell>
										{r.winner && <DriverLink driver={r.winner} className="font-medium" />}
										{r.winnerTeam && (
											<div className="text-muted-foreground text-xs">
												<TeamLink team={r.winnerTeam} />
											</div>
										)}
									</TableCell>
									<TableCell>
										{r.fastestLap && (
											<span className="inline-flex items-center gap-1.5">
												<Timer className="text-muted-foreground size-3.5" />
												<DriverLink driver={r.fastestLap} flag={false} />
											</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
			</div>

			{view.entrants.length > 0 && (
				<Section title="Entry list">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{view.entrants.map((e) => (
							<Card key={e.team.id} size="sm">
								<CardHeader>
									<CardTitle>
										<TeamLink team={e.team} flag />
									</CardTitle>
									<CardDescription>{e.engine && <EngineLink engine={e.engine} />}</CardDescription>
								</CardHeader>
								<CardContent className="space-y-1.5">
									{e.drivers.map((d) => (
										<div key={d.id}>
											<DriverLink driver={d} />
										</div>
									))}
								</CardContent>
							</Card>
						))}
					</div>
				</Section>
			)}
		</Page>
	);
}
