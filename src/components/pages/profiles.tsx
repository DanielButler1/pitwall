import { CalendarDays, Flag as FlagIcon, GitCompareArrows, MapPin, Sparkles, Trophy } from "lucide-react";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { CircuitView, CircuitsView, ConstructorView, DriverView } from "@/lib/f1/views";
import { ageOn } from "@/lib/f1/stats";
import type { DriverTeammatesView } from "@/lib/f1/teammates";
import {
	CircuitLink,
	DriverLink,
	Hint,
	EngineLink,
	GrandPrixLink,
	Join,
	NationLink,
	Page,
	PageHeader,
	RaceLink,
	RealDiff,
	Section,
	SeasonLink,
	StatCard,
	TableCard,
	TeamLink,
	TyreLink,
	YearRange,
	fmtDate,
	href,
	num,
	DateLink,
	Flag,
} from "../f1";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { TeammatesSection, keepSuffix, surname } from "./teammates";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const realOf = <T extends object>(real: T | null, key: keyof T, current: unknown) => (real && real[key] !== current ? num(Number(real[key])) : undefined);

function Milestone({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2 text-sm">
			<Icon className="text-muted-foreground size-4" />
			<span className="text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}

/** `teammates` (driverTeammatesView) adds the head-to-head section; without it the page lists team-mates by races together. */
export function DriverPage({ view, teammates }: { view: DriverView; teammates?: DriverTeammatesView | null }) {
	const d = view.driver;
	const t = view.totals;
	const r = view.realTotals;
	// Simulated careers can run past today; measure age at their last race in that case.
	const today = new Date().toISOString().slice(0, 10);
	const lastRaceDate = view.lastRace?.date;
	const age = ageOn(d.dateOfBirth, d.dateOfDeath ?? (lastRaceDate && lastRaceDate > today ? lastRaceDate : today));
	const side = (!teammates && view.teammates.length > 0) || view.relatives.length > 0;
	const byYear = new Map<number, DriverView["results"]>();
	for (const res of view.results) {
		if (!byYear.has(res.race.year)) byYear.set(res.race.year, []);
		byYear.get(res.race.year)!.push(res);
	}
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<NationLink nation={view.nation} />
						{d.number && <Badge variant="secondary">#{d.number}</Badge>}
						{d.abbreviation && <Badge variant="outline">{d.abbreviation}</Badge>}
						{r && (
							<Badge variant="outline" className="border-universe/30 text-universe">
								<Sparkles /> Career altered in this universe
							</Badge>
						)}
					</>
				}
				title={d.name}
				actions={
					<ULink href={`/compare?d=${d.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
						<GitCompareArrows data-icon="inline-start" />
						Compare
					</ULink>
				}
			>
				{d.dateOfBirth && (
					<>
						Born <DateLink date={d.dateOfBirth} />
						{d.placeOfBirth && ` in ${d.placeOfBirth}`}
						{d.dateOfDeath ? (
							<>
								. Died <DateLink date={d.dateOfDeath} />, aged {age}.
							</>
						) : age != null ? (
							` (age ${age}).`
						) : (
							"."
						)}
					</>
				)}
			</PageHeader>

			<div className={cn("grid grid-cols-2 gap-4 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-4", view.lapsLed ? "xl:grid-cols-9" : "xl:grid-cols-8")}>
				<StatCard label="Titles" value={t.titles} real={realOf(r, "titles", t.titles)} />
				<StatCard label="Wins" value={t.wins} real={realOf(r, "wins", t.wins)} />
				<StatCard label="Podiums" value={t.podiums} real={realOf(r, "podiums", t.podiums)} />
				<StatCard label="Poles" value={t.poles} real={realOf(r, "poles", t.poles)} />
				<StatCard label="Fastest laps" value={t.fastestLaps} real={realOf(r, "fastestLaps", t.fastestLaps)} />
				<StatCard label="Starts" value={t.starts} real={realOf(r, "starts", t.starts)} />
				<StatCard label="Points" value={num(t.points)} real={realOf(r, "points", t.points)} />
				<StatCard label="Win rate" value={`${(t.winRate * 100).toFixed(1)}%`} />
				{view.lapsLed && <StatCard label={view.lapsLed.partial ? `Laps led since ${view.lapsLed.from}` : "Laps led"} value={num(view.lapsLed.laps)} />}
			</div>

			<div className="flex flex-wrap gap-x-8 gap-y-2">
				{view.firstRace && (
					<Milestone icon={CalendarDays} label="First race">
						<RaceLink race={view.firstRace} year className="font-medium" />
					</Milestone>
				)}
				{view.firstWin && (
					<Milestone icon={Trophy} label="First win">
						<RaceLink race={view.firstWin} year className="font-medium" />
					</Milestone>
				)}
				{view.lastRace && (
					<Milestone icon={FlagIcon} label="Last race">
						<RaceLink race={view.lastRace} year className="font-medium" />
					</Milestone>
				)}
			</div>

			<div className={cn("grid gap-12", side && "2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:gap-8")}>
				<Section
					title="Season by season"
					description={
						<>
							<span className="sm:hidden">Every race result is listed on a wider screen.</span>
							<span className="hidden sm:inline">Every result. Underlined: pole position.</span>
						</>
					}
				>
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead className="hidden sm:table-cell">Team</TableHead>
								<TableHead className="text-right">Pos</TableHead>
								<TableHead className="text-right">Pts</TableHead>
								<TableHead className="text-right">Wins</TableHead>
								<TableHead className="text-right">
									<span className="sm:hidden">Pod</span>
									<span className="hidden sm:inline">Podiums</span>
								</TableHead>
								<TableHead className="text-right max-sm:pr-4!">Poles</TableHead>
								<TableHead className="hidden sm:table-cell">Results</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.seasons.map((s) => (
								<TableRow key={s.year}>
									<TableCell className="max-sm:max-w-28">
										<SeasonLink year={s.year} className="font-semibold" />
										<div className="text-muted-foreground flex flex-col text-xs sm:hidden">
											{s.teams.map((tm) => (
												<TeamLink key={tm.id} team={tm} className="max-w-full" />
											))}
										</div>
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										<div className="flex flex-col">
											{s.teams.map((tm) => (
												<TeamLink key={tm.id} team={tm} />
											))}
										</div>
									</TableCell>
									<TableCell className="text-right whitespace-nowrap">
										<span className="inline-flex items-center gap-1">
											{s.champion && (
												<Hint label="Champion">
													<Trophy className="text-gold size-3.5" />
												</Hint>
											)}
											{s.position ?? "–"}
										</span>
										{s.realPosition != null && (
											<div className="flex justify-end [&>*]:ml-0! max-sm:[&>*>*]:px-0.5!">
												<RealDiff real={s.realPosition} />
											</div>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">{num(s.points)}</TableCell>
									<TableCell className="text-right tabular-nums">{s.wins || ""}</TableCell>
									<TableCell className="text-right tabular-nums">{s.podiums || ""}</TableCell>
									<TableCell className="text-right tabular-nums max-sm:pr-4!">{s.poles || ""}</TableCell>
									<TableCell className="hidden sm:table-cell">
										<div className="flex flex-wrap gap-0.5">
											{(byYear.get(s.year) ?? []).map((res) => (
												<ULink
													key={res.race.round}
													href={href.race(res.race)}
													title={`${res.race.name}: ${res.position}${res.points ? ` (${res.points} pts)` : ""}`}
													className={cn(
														"hover:ring-foreground/30 inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1 text-[11px] tabular-nums hover:ring-1",
														res.position === "1" && "cell-1",
														res.position === "2" && "cell-2",
														res.position === "3" && "cell-3",
														Number(res.position) > 3 && res.points > 0 && "cell-pts",
														Number(res.position) > 3 && !res.points && "cell-fin",
														!Number(res.position) && "cell-out",
														res.pole && "underline underline-offset-2",
													)}
												>
													{res.position === "DNF" ? "R" : res.position}
												</ULink>
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
				{side && (
					<div className="space-y-12">
						{view.relatives.length > 0 && (
							<Section title="Family">
								<TableCard>
									<TableBody>
										{/* The relation describes this page's driver ("Uncle of"), so it reads before the relative's name. */}
										{view.relatives.map((m) => (
											<TableRow key={m.driver.id}>
												<TableCell className="text-muted-foreground w-px whitespace-nowrap">{m.relation}</TableCell>
												<TableCell>
													<DriverLink driver={keepSuffix(m.driver)} />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</TableCard>
							</Section>
						)}
						{!teammates && view.teammates.length > 0 && (
							<Section title="Team-mates">
								<TableCard>
									<TableBody>
										{view.teammates.map((m) => (
											<TableRow key={m.driver.id}>
												<TableCell>
													<DriverLink driver={keepSuffix(m.driver)} />
												</TableCell>
												<TableCell className="text-muted-foreground text-right tabular-nums">{m.races} races</TableCell>
											</TableRow>
										))}
									</TableBody>
								</TableCard>
							</Section>
						)}
					</div>
				)}
			</div>
			{teammates && <TeammatesSection view={teammates} />}
		</Page>
	);
}

// The 1950s teams ran a dozen drivers a season; phones list the first few and count the rest.
const PHONE_DRIVERS = 4;

export function ConstructorPage({ view }: { view: ConstructorView }) {
	const t = view.totals;
	const r = view.realTotals;
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<NationLink nation={view.nation} />
						<Badge variant="secondary">
							<YearRange from={t.firstYear} to={t.lastYear} />
						</Badge>
					</>
				}
				title={view.team.name}
			>
				{view.team.fullName}
			</PageHeader>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
				<StatCard label="Titles" value={t.titles} real={realOf(r, "titles", t.titles)} />
				<StatCard label="Wins" value={t.wins} real={realOf(r, "wins", t.wins)} />
				<StatCard label="1-2 finishes" value={t.oneTwos} />
				<StatCard label="Podiums" value={t.podiums} real={realOf(r, "podiums", t.podiums)} />
				<StatCard label="Poles" value={t.poles} real={realOf(r, "poles", t.poles)} />
				<StatCard label="Fastest laps" value={t.fastestLaps} />
				<StatCard label="Races" value={t.entries} />
				<StatCard label="Points" value={num(t.points)} real={realOf(r, "points", t.points)} />
			</div>
			<div className="grid grid-cols-1 gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title="Season by season">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead className="text-right">Pos</TableHead>
								<TableHead className="text-right">Pts</TableHead>
								<TableHead className="text-right max-[379px]:hidden">Wins</TableHead>
								<TableHead className="hidden sm:table-cell">Engine</TableHead>
								<TableHead className="hidden sm:table-cell">Tyres</TableHead>
								<TableHead>Drivers</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...view.seasons].reverse().map((s) => (
								<TableRow key={s.year}>
									<TableCell className="font-semibold">
										<SeasonLink year={s.year} />
									</TableCell>
									<TableCell className="text-right">
										<span className="inline-flex items-center gap-1">
											{s.champion && (
												<Hint label="Champion">
													<Trophy className="text-gold size-3.5" />
												</Hint>
											)}
											{s.position ?? "–"}
										</span>
									</TableCell>
									{/* No constructors' championship before 1958: no position and no points to show. */}
									<TableCell className="text-right tabular-nums">{s.position == null && !s.points ? "–" : num(s.points)}</TableCell>
									<TableCell className="text-right tabular-nums max-[379px]:hidden">{s.wins || ""}</TableCell>
									<TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
										<Join items={s.engines} render={(e) => <EngineLink engine={e} />} />
									</TableCell>
									<TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
										<Join items={s.tyres} render={(ty) => <TyreLink tyre={ty} />} />
									</TableCell>
									<TableCell className="whitespace-normal">
										<div className="text-xs leading-5 sm:hidden">
											{s.drivers.slice(0, PHONE_DRIVERS).map((d, i, shown) => (
												<Fragment key={d.id}>
													{i > 0 && " "}
													<span className="whitespace-nowrap">
														<ULink href={href.driver(d.id)} className="underline-offset-4 hover:underline" data-card={`driver:${d.id}`}>
															{surname(d.name)}
														</ULink>
														{i < shown.length - 1 && ","}
													</span>
												</Fragment>
											))}
											{s.drivers.length > PHONE_DRIVERS && (
												<>
													{" "}
													<span className="text-muted-foreground whitespace-nowrap">+{s.drivers.length - PHONE_DRIVERS} more</span>
												</>
											)}
										</div>
										<div className="hidden flex-wrap gap-x-4 gap-y-1 sm:flex">
											{s.drivers.map((d) => (
												<DriverLink key={d.id} driver={d} />
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
				<div className="space-y-12">
					<Section title="Most starts for the team">
						<TableCard>
							<TableHeader>
								<TableRow>
									<TableHead>Driver</TableHead>
									<TableHead className="text-right">Starts</TableHead>
									<TableHead className="text-right">Wins</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.topDrivers.map((d) => (
									<TableRow key={d.driver.id}>
										<TableCell>
											<DriverLink driver={keepSuffix(d.driver)} />
										</TableCell>
										<TableCell className="text-right tabular-nums">{d.starts}</TableCell>
										<TableCell className="text-right tabular-nums">{d.wins || ""}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					</Section>
					{view.wins.length > 0 && (
						<Section title="Wins" action={<Badge variant="secondary">{view.wins.length}</Badge>}>
							<TableCard maxHeight="sm:max-h-[480px]">
								<TableBody>
									{view.wins.map((w) => (
										<TableRow key={`${w.race.year}-${w.race.round}-${w.driver.id}`}>
											<TableCell>
												<RaceLink race={w.race} year />
											</TableCell>
											<TableCell>
												<DriverLink driver={keepSuffix(w.driver)} flag={false} />
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
				</div>
			</div>
		</Page>
	);
}

const SHORT_COUNTRY: Record<string, string> = { "United States of America": "USA", "United Kingdom": "UK", "United Arab Emirates": "UAE" };
const shortCountry = (name: string) => SHORT_COUNTRY[name] ?? name;

export function CircuitsPage({ view }: { view: CircuitsView }) {
	return (
		<Page className="space-y-6">
			<PageHeader title="Circuits" eyebrow={`${view.rows.length} venues`}>
				Every track to host a World Championship Grand Prix.
			</PageHeader>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>Circuit</TableHead>
						<TableHead className="hidden sm:table-cell">Location</TableHead>
						<TableHead className="hidden sm:table-cell">Type</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Races</TableHead>
						<TableHead className="max-sm:text-right">Years</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((c) => (
						<TableRow key={c.id}>
							<TableCell className="max-sm:max-w-48 max-sm:py-2.5">
								<CircuitLink circuit={{ ...c, name: c.name.replace(/-/g, "\u2011") }} className="max-w-full font-medium" />
								<div className="text-muted-foreground pl-[26.6px] text-xs sm:hidden">{c.place === c.name ? shortCountry(c.nation.name) : c.place}</div>
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell">
								{c.place}
								{c.place !== c.nation.name && (
									<>
										, <NationLink nation={c.nation} flag={false} />
									</>
								)}
							</TableCell>
							<TableCell className="hidden sm:table-cell">
								<Badge variant="secondary" className="capitalize">
									{c.type.toLowerCase().replace("_", " ")}
								</Badge>
							</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{c.races}</TableCell>
							<TableCell className="text-muted-foreground whitespace-nowrap tabular-nums max-sm:text-right max-sm:text-xs">
								<YearRange from={c.firstYear} to={c.lastYear} />
								{/* Phones fold the race count under the years to leave the name room for one line. */}
								<div className="text-foreground sm:hidden">
									{c.races} race{c.races === 1 ? "" : "s"}
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Page>
	);
}

export function CircuitPage({ view }: { view: CircuitView }) {
	const c = view.circuit;
	const multiGp = view.grandsPrix.length > 1;
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<MapPin className="size-3.5" />
						<Flag code={view.nation.country} />
						<span>
							{c.place}
							{c.place !== view.nation.name && (
								<>
									, <NationLink nation={view.nation} flag={false} />
								</>
							)}
						</span>
					</>
				}
				title={c.fullName}
			/>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<StatCard label="Grands Prix" value={view.races.length} />
				<StatCard label="Length" value={`${c.length} km`} />
				<StatCard label="Turns" value={c.turns} />
				<StatCard label="Direction" value={<span className="capitalize">{c.direction.toLowerCase().replace("_", "-")}</span>} />
			</div>
			<div className="grid grid-cols-1 gap-12 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-8">
				<Section title="Races held">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>
									<span className="sm:hidden">Year</span>
									<span className="hidden sm:inline">Race</span>
								</TableHead>
								<TableHead className="hidden sm:table-cell">Date</TableHead>
								<TableHead className="hidden sm:table-cell">Pole</TableHead>
								<TableHead>Winner</TableHead>
								<TableHead className="hidden sm:table-cell sm:pr-4">Team</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.races.map((r) => (
								<TableRow key={`${r.race.year}-${r.race.round}`}>
									<TableCell>
										<RaceLink race={r.race} year className="hidden font-medium sm:inline-flex" />
										<ULink href={href.race(r.race)} className="font-medium tabular-nums underline-offset-4 hover:underline sm:hidden" data-card={`race:${r.race.year}-${r.race.round}`}>
											{r.race.year}
										</ULink>
										{multiGp && <div className="text-muted-foreground text-xs sm:hidden">{r.race.name}</div>}
									</TableCell>
									<TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
										<DateLink date={r.race.date} />
									</TableCell>
									<TableCell className="hidden sm:table-cell">{r.pole && <DriverLink driver={keepSuffix(r.pole)} />}</TableCell>
									<TableCell className="max-sm:w-full">
										{r.winner && <DriverLink driver={keepSuffix(r.winner)} className="max-w-full font-medium" />}
										{/* Phones fold the team and the pole sitter into one line under the winner. */}
										{(r.team || r.pole) && (
											<div className="text-muted-foreground flex flex-wrap gap-x-1 text-xs sm:hidden">
												{r.team && <TeamLink team={r.team} />}
												{r.pole && (
													<span className="whitespace-nowrap">
														{r.team && "· "}Pole{" "}
														<ULink href={href.driver(r.pole.id)} className="underline-offset-4 hover:underline" data-card={`driver:${r.pole.id}`}>
															{surname(r.pole.name)}
														</ULink>
													</span>
												)}
											</div>
										)}
									</TableCell>
									<TableCell className="hidden sm:table-cell sm:pr-4">{r.team && <TeamLink team={r.team} />}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
				<div className="space-y-12">
					{view.grandsPrix.length > 0 && (
						<Section title="Grands Prix held here">
							<TableCard>
								<TableBody>
									{view.grandsPrix.map((g) => (
										<TableRow key={g.gp.id}>
											<TableCell>
												<GrandPrixLink gp={g.gp} />
												<div className="text-muted-foreground text-xs">
													<YearRange from={g.firstYear} to={g.lastYear} />
												</div>
											</TableCell>
											<TableCell className="text-right font-semibold tabular-nums">{g.races}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
					<Section title="Most wins">
						<TableCard>
							<TableBody>
								{view.topDrivers.map((d) => (
									<TableRow key={d.driver.id}>
										<TableCell>
											<DriverLink driver={keepSuffix(d.driver)} />
										</TableCell>
										<TableCell className="text-right font-semibold tabular-nums">{d.wins}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					</Section>
					<Section title="Most wins by constructor">
						<TableCard>
							<TableBody>
								{view.topTeams.map((d) => (
									<TableRow key={d.team.id}>
										<TableCell>
											<TeamLink team={d.team} flag />
										</TableCell>
										<TableCell className="text-right font-semibold tabular-nums">{d.wins}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					</Section>
				</div>
			</div>
		</Page>
	);
}
