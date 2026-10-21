// Grands Prix, engine and tyre suppliers, and nations: index + profile pages.
// Server-safe; every entity reference links through ULink so universes stay inside themselves.

import { Flag as FlagIcon, Globe, Trophy } from "lucide-react";
import type { GrandPrixView, GrandsPrixView, NationView, NationsView, SupplierRef, SupplierView, SuppliersView } from "@/lib/f1/views";
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
	RaceLink,
	Section,
	SeasonLink,
	StatCard,
	TableCard,
	TeamLink,
	TyreLink,
	YearRange,
	fmtDate,
	num,
	Hint,
	DateLink,
} from "../f1";
import { Badge } from "../ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const blank = (n: number | null | undefined) => (n ? num(n) : "");
const realOf = <T extends object>(real: T | null, key: keyof T, current: unknown) => (real && real[key] !== current ? num(Number(real[key])) : undefined);

function Ranked<T>({ rows, render, value, empty }: { rows: T[]; render: (row: T) => React.ReactNode; value: (row: T) => React.ReactNode; empty?: string }) {
	if (!rows.length) return <p className="text-muted-foreground text-sm">{empty ?? "None yet."}</p>;
	return (
		<TableCard>
			<TableBody>
				{rows.map((row, i) => (
					<TableRow key={i}>
						<TableCell className="text-muted-foreground w-8 tabular-nums">{i + 1}</TableCell>
						<TableCell className="max-w-0 w-full">{render(row)}</TableCell>
						<TableCell className="text-right font-semibold tabular-nums">{value(row)}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</TableCard>
	);
}

/* ----------------------------------------------------------- grands prix --- */

export function GrandsPrixPage({ view }: { view: GrandsPrixView }) {
	return (
		<Page className="space-y-6">
			<PageHeader title="Grands Prix" eyebrow={`${view.rows.length} events`}>
				Every World Championship Grand Prix, how often it has been held and who has won it most.
			</PageHeader>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>Grand Prix</TableHead>
						<TableHead>Country</TableHead>
						<TableHead className="text-right">Races</TableHead>
						<TableHead>Years</TableHead>
						<TableHead className="text-right">Circuits</TableHead>
						<TableHead>Most wins</TableHead>
						<TableHead>Last winner</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.gp.id}>
							<TableCell>
								<GrandPrixLink gp={r.gp} className="font-medium" />
							</TableCell>
							<TableCell className="text-muted-foreground">
								<NationLink nation={r.nation} flag={false} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.races || <Badge variant="secondary">Upcoming</Badge>}</TableCell>
							<TableCell className="text-muted-foreground">
								<YearRange from={r.firstYear} to={r.lastYear} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.circuits)}</TableCell>
							<TableCell>
								{r.topDriver && (
									<span className="inline-flex items-center gap-2">
										<DriverLink driver={r.topDriver.driver} />
										<Badge variant="secondary" className="tabular-nums">
											{r.topDriver.wins}
										</Badge>
									</span>
								)}
							</TableCell>
							<TableCell>{r.lastWinner && <DriverLink driver={r.lastWinner} />}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Page>
	);
}

export function GrandPrixPage({ view }: { view: GrandPrixView }) {
	const t = view.totals;
	const top = view.topDrivers[0];
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<NationLink nation={view.nation} />
						{t.firstYear && (
							<Badge variant="secondary">
								<YearRange from={t.firstYear} to={t.lastYear} />
							</Badge>
						)}
					</>
				}
				title={
					<span className="flex items-center gap-3">
						<Flag code={view.gp.country} className="text-2xl" />
						{view.gp.name}
					</span>
				}
			>
				{t.races
					? `Held ${t.races} time${t.races === 1 ? "" : "s"} at ${t.circuits} circuit${t.circuits === 1 ? "" : "s"}, won by ${t.winners} different driver${t.winners === 1 ? "" : "s"}.`
					: "Not held yet."}
			</PageHeader>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
				<StatCard label="Races" value={t.races} />
				<StatCard label="First held" value={t.firstYear ? <SeasonLink year={t.firstYear} /> : "–"} />
				<StatCard label="Circuits" value={t.circuits} />
				<StatCard label="Different winners" value={t.winners} />
				<StatCard label={top ? `Most wins (${top.wins})` : "Most wins"} value={top ? <DriverLink driver={top.driver} /> : "–"} />
			</div>

			<div className="grid gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title="Every edition">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead>Race</TableHead>
								<TableHead>Date</TableHead>
								<TableHead>Circuit</TableHead>
								<TableHead>Pole</TableHead>
								<TableHead>Winner</TableHead>
								<TableHead>Team</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.editions.map((e) => (
								<TableRow key={`${e.race.year}-${e.race.round}`} className={e.completed ? undefined : "text-muted-foreground"}>
									<TableCell className="font-semibold">
										<SeasonLink year={e.race.year} />
									</TableCell>
									<TableCell>
										<RaceLink race={e.race} className="font-medium" />
										{!e.completed && (
											<Badge variant="secondary" className="ml-2">
												Upcoming
											</Badge>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground whitespace-nowrap"><DateLink date={e.race.date} /></TableCell>
									<TableCell>
										<CircuitLink circuit={e.circuit} />
									</TableCell>
									<TableCell>{e.pole && <DriverLink driver={e.pole} flag={false} />}</TableCell>
									<TableCell>{e.winner && <DriverLink driver={e.winner} className="font-medium" />}</TableCell>
									<TableCell>{e.team && <TeamLink team={e.team} />}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
				<div className="space-y-12">
					<Section title="Most wins">
						<Ranked rows={view.topDrivers} render={(r) => <DriverLink driver={r.driver} />} value={(r) => r.wins} />
					</Section>
					<Section title="Most wins by constructor">
						<Ranked rows={view.topTeams} render={(r) => <TeamLink team={r.team} flag />} value={(r) => r.wins} />
					</Section>
					<Section title="Most wins by engine">
						<Ranked rows={view.topEngines} render={(r) => <EngineLink engine={r.engine} flag />} value={(r) => r.wins} />
					</Section>
					<Section title="Circuits used">
						<TableCard>
							<TableBody>
								{view.circuits.map((c) => (
									<TableRow key={c.circuit.id}>
										<TableCell className="max-w-0 w-full">
											<CircuitLink circuit={c.circuit} />
											<div className="text-muted-foreground text-xs">
												<YearRange from={c.firstYear} to={c.lastYear} />
											</div>
										</TableCell>
										<TableCell className="text-right font-semibold tabular-nums">{c.races}</TableCell>
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

/* ------------------------------------------------------ engines & tyres --- */

const SUPPLIER = {
	engine: {
		title: "Engines",
		one: "Engine",
		intro: "Every engine manufacturer to power a World Championship car.",
	},
	tyre: {
		title: "Tyres",
		one: "Tyre supplier",
		intro: "Every tyre supplier in World Championship history.",
	},
} as const;

function SupplierLink({ kind, supplier, className, flag }: { kind: SupplierView["kind"]; supplier: SupplierRef; className?: string; flag?: boolean }) {
	return kind === "engine" ? (
		<EngineLink engine={supplier} className={className} flag={flag} />
	) : (
		<TyreLink tyre={supplier} className={className} flag={flag} />
	);
}

export function SuppliersPage({ view }: { view: SuppliersView }) {
	const s = SUPPLIER[view.kind];
	return (
		<Page className="space-y-6">
			<PageHeader title={s.title} eyebrow={`${view.rows.length} ${view.kind === "engine" ? "manufacturers" : "suppliers"}`}>
				{s.intro} Titles are credited to the engine and tyres of the champion&apos;s car.
			</PageHeader>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>{s.one}</TableHead>
						<TableHead>Country</TableHead>
						<TableHead>Years</TableHead>
						<TableHead className="text-right">Races</TableHead>
						<TableHead className="text-right">Wins</TableHead>
						<TableHead className="text-right">Poles</TableHead>
						<TableHead className="text-right">Podiums</TableHead>
						<TableHead className="text-right">Drivers&apos; titles</TableHead>
						<TableHead className="text-right">Constructors&apos; titles</TableHead>
						<TableHead className="text-right">Teams</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.supplier.id}>
							<TableCell>
								<SupplierLink kind={view.kind} supplier={r.supplier} flag className="font-medium" />
							</TableCell>
							<TableCell className="text-muted-foreground">
								<NationLink nation={r.nation} flag={false} />
							</TableCell>
							<TableCell className="text-muted-foreground">
								<YearRange from={r.firstYear} to={r.lastYear} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.races}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.wins)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.poles)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.podiums)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.driversTitles)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.constructorsTitles)}</TableCell>
							<TableCell className="text-right tabular-nums">{r.teams}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Page>
	);
}

export function SupplierPage({ view }: { view: SupplierView }) {
	const t = view.totals;
	const r = view.realTotals;
	const s = SUPPLIER[view.kind];
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						{s.one}
						<span>·</span>
						<NationLink nation={view.nation} />
						{t.firstYear && (
							<Badge variant="secondary">
								<YearRange from={t.firstYear} to={t.lastYear} />
							</Badge>
						)}
					</>
				}
				title={view.supplier.name}
			>
				Supplied {t.teams} team{t.teams === 1 ? "" : "s"} and {t.drivers} driver
				{t.drivers === 1 ? "" : "s"} over {t.seasons} season
				{t.seasons === 1 ? "" : "s"}.
			</PageHeader>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
				<StatCard label="Drivers' titles" value={t.driversTitles} real={realOf(r, "driversTitles", t.driversTitles)} />
				<StatCard label="Constructors' titles" value={t.constructorsTitles} real={realOf(r, "constructorsTitles", t.constructorsTitles)} />
				<StatCard label="Wins" value={t.wins} real={realOf(r, "wins", t.wins)} />
				<StatCard label="Poles" value={t.poles} real={realOf(r, "poles", t.poles)} />
				<StatCard label="Podiums" value={t.podiums} real={realOf(r, "podiums", t.podiums)} />
				<StatCard label="Fastest laps" value={t.fastestLaps} real={realOf(r, "fastestLaps", t.fastestLaps)} />
				<StatCard label="Races" value={t.races} />
				<StatCard label="Teams" value={t.teams} />
			</div>

			<div className="grid gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title="Season by season" description="Teams supplied each season. Champions listed when they won with this supplier.">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead>Teams</TableHead>
								<TableHead className="text-right">Races</TableHead>
								<TableHead className="text-right">Wins</TableHead>
								<TableHead className="text-right">Poles</TableHead>
								<TableHead className="text-right">Podiums</TableHead>
								<TableHead>Champions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.seasons.map((x) => (
								<TableRow key={x.year}>
									<TableCell className="font-semibold">
										<SeasonLink year={x.year} />
									</TableCell>
									<TableCell className="max-w-96 whitespace-normal">
										<Join items={x.teams} render={(tm) => <TeamLink team={tm} />} />
									</TableCell>
									<TableCell className="text-right tabular-nums">{x.races}</TableCell>
									<TableCell className="text-right tabular-nums">{blank(x.wins)}</TableCell>
									<TableCell className="text-right tabular-nums">{blank(x.poles)}</TableCell>
									<TableCell className="text-right tabular-nums">{blank(x.podiums)}</TableCell>
									<TableCell>
										<div className="flex flex-col gap-0.5">
											{x.driversChampion && (
												<span className="inline-flex items-center gap-1.5">
													<Hint label="Drivers' champion">
														<Trophy className="text-gold size-3.5" />
													</Hint>
													<DriverLink driver={x.driversChampion} />
												</span>
											)}
											{x.constructorsChampion && (
												<span className="inline-flex items-center gap-1.5">
													<Hint label="Constructors' champion">
														<Trophy className="text-silver size-3.5" />
													</Hint>
													<TeamLink team={x.constructorsChampion} flag />
												</span>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>

				<div className="space-y-12">
					{view.titles.length > 0 && (
						<Section title="Championships" action={<Badge variant="secondary">{view.titles.length}</Badge>}>
							<TableCard maxHeight="max-h-[480px]">
								<TableBody>
									{view.titles.map((x) => (
										<TableRow key={`${x.year}-${x.kind}`}>
											<TableCell className="font-semibold">
												<SeasonLink year={x.year} />
											</TableCell>
											<TableCell>
												<Badge variant="outline">{x.kind === "drivers" ? "Drivers" : "Constructors"}</Badge>
											</TableCell>
											<TableCell className="max-w-0 w-full">{x.driver ? <DriverLink driver={x.driver} /> : <TeamLink team={x.team} flag />}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
					<Section title="Teams supplied">
						<TableCard>
							<TableHeader>
								<TableRow>
									<TableHead>Team</TableHead>
									<TableHead className="text-right">Races</TableHead>
									<TableHead className="text-right">Wins</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.topTeams.map((x) => (
									<TableRow key={x.team.id}>
										<TableCell>
											<TeamLink team={x.team} flag />
											<div className="text-muted-foreground text-xs">
												<YearRange from={x.firstYear} to={x.lastYear} />
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums">{x.races}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(x.wins)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					</Section>
					<Section title="Most successful drivers">
						<TableCard>
							<TableHeader>
								<TableRow>
									<TableHead>Driver</TableHead>
									<TableHead className="text-right">Starts</TableHead>
									<TableHead className="text-right">Wins</TableHead>
									<TableHead className="text-right">Podiums</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.topDrivers.map((x) => (
									<TableRow key={x.driver.id}>
										<TableCell>
											<DriverLink driver={x.driver} />
										</TableCell>
										<TableCell className="text-right tabular-nums">{x.starts}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(x.wins)}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(x.podiums)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					</Section>
					{view.wins.length > 0 && (
						<Section title="Wins" action={<Badge variant="secondary">{view.wins.length}</Badge>}>
							<TableCard maxHeight="max-h-[480px]">
								<TableBody>
									{view.wins.map((w) => (
										<TableRow key={`${w.race.year}-${w.race.round}`}>
											<TableCell>
												<RaceLink race={w.race} year />
											</TableCell>
											<TableCell>
												<DriverLink driver={w.driver} flag={false} />
												<div className="text-muted-foreground text-xs">
													<TeamLink team={w.team} />
												</div>
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

/* --------------------------------------------------------------- nations --- */

export function NationsPage({ view }: { view: NationsView }) {
	return (
		<Page className="space-y-6">
			<PageHeader title="Nations" eyebrow={`${view.rows.length} countries`}>
				Every country with a World Championship driver, constructor, engine or Grand Prix, ranked by drivers&apos; titles.
			</PageHeader>
			<TableCard>
				<TableHeader>
					<TableRow>
						<TableHead>Nation</TableHead>
						<TableHead className="text-right">Drivers</TableHead>
						<TableHead className="text-right">Champions</TableHead>
						<TableHead className="text-right">Titles</TableHead>
						<TableHead className="text-right">Winners</TableHead>
						<TableHead className="text-right">Wins</TableHead>
						<TableHead className="text-right">Constructors</TableHead>
						<TableHead className="text-right">Constructor wins</TableHead>
						<TableHead className="text-right">Engines</TableHead>
						<TableHead className="text-right">Races hosted</TableHead>
						<TableHead className="text-right">Circuits</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.nation.id}>
							<TableCell>
								<NationLink nation={r.nation} className="font-medium" />
							</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.drivers)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.champions)}</TableCell>
							<TableCell className="text-right font-semibold tabular-nums">{blank(r.titles)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.winners)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.wins)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.constructors)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.constructorWins)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.engines)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.racesHosted)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.circuits)}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Page>
	);
}

export function NationPage({ view }: { view: NationView }) {
	const t = view.totals;
	const n = view.nation;
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<Globe className="size-3.5" />
						Nation
						{n.demonym && <Badge variant="secondary">{n.demonym}</Badge>}
					</>
				}
				title={
					<span className="flex items-center gap-3">
						<Flag code={n.country} className="text-2xl" />
						{n.name}
					</span>
				}
			/>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
				<StatCard label="Drivers" value={t.drivers} />
				<StatCard label="Champions" value={t.champions} />
				<StatCard label="Drivers' titles" value={t.titles} />
				<StatCard label="Race wins" value={t.wins} />
				<StatCard label="Podiums" value={t.podiums} />
				<StatCard label="Constructors" value={t.constructors} />
				<StatCard label="Constructor wins" value={t.constructorWins} />
				<StatCard label="Races hosted" value={t.racesHosted} />
			</div>

			<div className="grid gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title={`${n.demonym ?? n.name} drivers`} description="Career totals, most successful first.">
					{view.drivers.length ? (
						<TableCard maxHeight="max-h-[720px]">
							<TableHeader>
								<TableRow>
									<TableHead>Driver</TableHead>
									<TableHead>Years</TableHead>
									<TableHead className="text-right">Titles</TableHead>
									<TableHead className="text-right">Starts</TableHead>
									<TableHead className="text-right">Wins</TableHead>
									<TableHead className="text-right">Podiums</TableHead>
									<TableHead className="text-right">Poles</TableHead>
									<TableHead className="text-right">Points</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.drivers.map((d) => (
									<TableRow key={d.driver.id}>
										<TableCell>
											<DriverLink driver={d.driver} className="font-medium" />
										</TableCell>
										<TableCell className="text-muted-foreground">
											<YearRange from={d.firstYear} to={d.lastYear} />
										</TableCell>
										<TableCell className="text-right tabular-nums">{blank(d.titles)}</TableCell>
										<TableCell className="text-right tabular-nums">{d.starts}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(d.wins)}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(d.podiums)}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(d.poles)}</TableCell>
										<TableCell className="text-right tabular-nums">{blank(d.points)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</TableCard>
					) : (
						<Empty className="border">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FlagIcon />
								</EmptyMedia>
								<EmptyTitle>No World Championship drivers</EmptyTitle>
								<EmptyDescription>No driver of this nationality has entered a Grand Prix.</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</Section>

				<div className="space-y-12">
					{view.champions.length > 0 && (
						<Section title="World Champions" action={<Badge variant="secondary">{view.champions.length}</Badge>}>
							<TableCard>
								<TableBody>
									{view.champions.map((c) => (
										<TableRow key={c.year}>
											<TableCell className="font-semibold">
												<SeasonLink year={c.year} />
											</TableCell>
											<TableCell className="max-w-0 w-full">
												<DriverLink driver={c.driver} flag={false} />
												<div className="text-muted-foreground text-xs">
													<TeamLink team={c.team} />
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
					{view.grandsPrix.length > 0 && (
						<Section title="Grands Prix hosted">
							<TableCard>
								<TableBody>
									{view.grandsPrix.map((g) => (
										<TableRow key={g.gp.id}>
											<TableCell className="max-w-0 w-full">
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
					{view.circuits.length > 0 && (
						<Section title="Circuits">
							<TableCard>
								<TableBody>
									{view.circuits.map((c) => (
										<TableRow key={c.circuit.id}>
											<TableCell className="max-w-0 w-full">
												<CircuitLink circuit={c.circuit} />
												<div className="text-muted-foreground text-xs">
													{c.circuit.place} · <YearRange from={c.firstYear} to={c.lastYear} />
												</div>
											</TableCell>
											<TableCell className="text-right font-semibold tabular-nums">{c.races}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
				</div>
			</div>

			{(view.constructors.length > 0 || view.engines.length > 0 || view.tyres.length > 0) && (
				<div className="grid gap-12 xl:grid-cols-2 xl:gap-8">
					{view.constructors.length > 0 && (
						<Section title="Constructors">
							<TableCard maxHeight="max-h-[560px]">
								<TableHeader>
									<TableRow>
										<TableHead>Constructor</TableHead>
										<TableHead>Years</TableHead>
										<TableHead className="text-right">Races</TableHead>
										<TableHead className="text-right">Wins</TableHead>
										<TableHead className="text-right">Titles</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{view.constructors.map((c) => (
										<TableRow key={c.team.id}>
											<TableCell>
												<TeamLink team={c.team} className="font-medium" />
											</TableCell>
											<TableCell className="text-muted-foreground">
												<YearRange from={c.firstYear} to={c.lastYear} />
											</TableCell>
											<TableCell className="text-right tabular-nums">{c.races}</TableCell>
											<TableCell className="text-right tabular-nums">{blank(c.wins)}</TableCell>
											<TableCell className="text-right tabular-nums">{blank(c.titles)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
					{(view.engines.length > 0 || view.tyres.length > 0) && (
						<Section title="Engines and tyres">
							<TableCard maxHeight="max-h-[560px]">
								<TableHeader>
									<TableRow>
										<TableHead>Supplier</TableHead>
										<TableHead>Years</TableHead>
										<TableHead className="text-right">Races</TableHead>
										<TableHead className="text-right">Wins</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{view.engines.map((e) => (
										<TableRow key={`e-${e.engine.id}`}>
											<TableCell>
												<EngineLink engine={e.engine} className="font-medium" />
												<Badge variant="outline" className="ml-2">
													Engine
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground">
												<YearRange from={e.firstYear} to={e.lastYear} />
											</TableCell>
											<TableCell className="text-right tabular-nums">{e.races}</TableCell>
											<TableCell className="text-right tabular-nums">{blank(e.wins)}</TableCell>
										</TableRow>
									))}
									{view.tyres.map((e) => (
										<TableRow key={`t-${e.tyre.id}`}>
											<TableCell>
												<TyreLink tyre={e.tyre} className="font-medium" />
												<Badge variant="outline" className="ml-2">
													Tyres
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground">
												<YearRange from={e.firstYear} to={e.lastYear} />
											</TableCell>
											<TableCell className="text-right tabular-nums">{e.races}</TableCell>
											<TableCell className="text-right tabular-nums">{blank(e.wins)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
						</Section>
					)}
				</div>
			)}
		</Page>
	);
}
