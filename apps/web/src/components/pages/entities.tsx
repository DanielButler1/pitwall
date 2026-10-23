// Grands Prix, engine and tyre suppliers, and nations: index + profile pages.
// Server-safe; every entity reference links through ULink so universes stay inside themselves.

import { Fragment } from "react";
import { ChevronsDown, Flag as FlagIcon, Globe, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrandPrixView, GrandsPrixView, NationView, NationsView, SupplierRef, SupplierView, SuppliersView } from "@pitwall/core/f1/views";
import {
	CircuitLink,
	DriverLink,
	EngineLink,
	Flag,
	GrandPrixLink,
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
import { buttonVariants } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const blank = (n: number | null | undefined) => (n ? num(n) : "");

/** Like Join, but each separator stays with the item before it so a comma never wraps onto its own line. */
function List<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
	return items.map((item, i) => (
		<Fragment key={i}>
			{i > 0 && " "}
			<span className="whitespace-nowrap">
				{render(item)}
				{i < items.length - 1 && ","}
			</span>
		</Fragment>
	));
}
/** Name cells may wrap on phones so the numbers beside them stay in view. */
const wrapName = "max-sm:whitespace-normal max-sm:[&_.truncate]:whitespace-normal";
/** Long nation driver lists stop here on phones until "Show all" (a CSS checkbox toggle, so the page stays server-rendered). */
const PHONE_ROWS = 20;
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
			{/* the narrowest phones need slightly smaller text to fit GP, races and the winner without scrolling */}
			<TableCard tableClassName="max-[379px]:text-[13px]">
				<TableHeader>
					<TableRow>
						<TableHead>Grand Prix</TableHead>
						<TableHead className="hidden sm:table-cell">Country</TableHead>
						<TableHead className="text-right">Races</TableHead>
						<TableHead className="hidden sm:table-cell">Years</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Circuits</TableHead>
						<TableHead>Most wins</TableHead>
						<TableHead className="hidden sm:table-cell">Last winner</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.gp.id}>
							<TableCell>
								<GrandPrixLink gp={r.gp} className="font-medium max-sm:hidden" />
								<GrandPrixLink gp={{ ...r.gp, name: r.shortName.replace(/ GP$/, "") }} className="font-medium sm:hidden" />
								<div className="text-muted-foreground text-xs sm:hidden">
									<YearRange from={r.firstYear} to={r.lastYear} />
								</div>
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell">
								<NationLink nation={r.nation} flag={false} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.races || <Badge variant="secondary">Upcoming</Badge>}</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell">
								<YearRange from={r.firstYear} to={r.lastYear} />
							</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.circuits)}</TableCell>
							<TableCell>
								{r.topDriver && (
									<span className="inline-flex items-center gap-2 max-sm:flex max-sm:justify-between">
										<DriverLink driver={r.topDriver.driver} className="max-sm:[&_.fi]:hidden!" />
										<Badge variant="secondary" className="tabular-nums">
											{r.topDriver.wins}
										</Badge>
									</span>
								)}
							</TableCell>
							<TableCell className="hidden sm:table-cell">{r.lastWinner && <DriverLink driver={r.lastWinner} />}</TableCell>
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

			<div className="grid grid-cols-2 gap-4 max-md:[&>*:last-child:nth-child(odd)]:col-span-2 md:grid-cols-3 xl:grid-cols-5">
				<StatCard label="Races" value={t.races} />
				<StatCard label="First held" value={t.firstYear ? <SeasonLink year={t.firstYear} /> : "–"} />
				<StatCard label="Circuits" value={t.circuits} />
				<StatCard label="Different winners" value={t.winners} />
				<StatCard label={top ? `Most wins (${top.wins})` : "Most wins"} value={top ? <DriverLink driver={top.driver} /> : "–"} />
			</div>

			<div className="grid grid-cols-1 gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title="Every edition">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead className="hidden sm:table-cell">Race</TableHead>
								<TableHead className="hidden sm:table-cell">Date</TableHead>
								<TableHead className="hidden sm:table-cell">Circuit</TableHead>
								<TableHead className="hidden sm:table-cell">Pole</TableHead>
								<TableHead>Winner</TableHead>
								<TableHead className="hidden sm:table-cell">Team</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.editions.map((e) => (
								<TableRow key={`${e.race.year}-${e.race.round}`} className={e.completed ? undefined : "text-muted-foreground"}>
									<TableCell className="font-semibold">
										<SeasonLink year={e.race.year} />
										<div className="text-muted-foreground text-xs font-normal whitespace-normal sm:hidden">
											<CircuitLink circuit={e.circuit} className="[&_.fi]:hidden!" />
										</div>
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										<RaceLink race={e.race} className="font-medium" />
										{!e.completed && (
											<Badge variant="secondary" className="ml-2">
												Upcoming
											</Badge>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
										<DateLink date={e.race.date} />
									</TableCell>
									<TableCell className="hidden sm:table-cell">
										<CircuitLink circuit={e.circuit} />
									</TableCell>
									<TableCell className="hidden sm:table-cell">{e.pole && <DriverLink driver={e.pole} flag={false} />}</TableCell>
									<TableCell>
										{e.winner && <DriverLink driver={e.winner} className="font-medium" />}
										{e.team && (
											<div className="text-muted-foreground text-xs sm:hidden">
												<TeamLink team={e.team} />
											</div>
										)}
										{!e.completed && (
											<Badge variant="secondary" className="sm:hidden">
												Upcoming
											</Badge>
										)}
									</TableCell>
									<TableCell className="hidden sm:table-cell">{e.team && <TeamLink team={e.team} />}</TableCell>
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

/** Champion names stay on one line beside their flag, running on under the (top-aligned) Wins number on phones. */
const oneLine = "max-sm:[&_.truncate]:overflow-visible max-sm:[&_.truncate]:whitespace-nowrap";

function SupplierChampions({ season: x, className }: { season: SupplierView["seasons"][number]; className?: string }) {
	if (!x.driversChampion && !x.constructorsChampion) return null;
	return (
		<div className={cn("flex flex-col gap-0.5", className)}>
			{x.driversChampion && (
				<span className="flex min-w-0 items-center gap-1.5">
					<Hint label="Drivers' champion">
						<Trophy className="text-gold size-3.5" />
					</Hint>
					<DriverLink driver={x.driversChampion} className={oneLine} />
				</span>
			)}
			{x.constructorsChampion && (
				<span className="flex min-w-0 items-center gap-1.5">
					<Hint label="Constructors' champion">
						<Trophy className="text-silver size-3.5" />
					</Hint>
					<TeamLink team={x.constructorsChampion} flag className={oneLine} />
				</span>
			)}
		</div>
	);
}

export function SuppliersPage({ view }: { view: SuppliersView }) {
	const s = SUPPLIER[view.kind];
	return (
		<Page className="space-y-6">
			<PageHeader title={s.title} eyebrow={`${view.rows.length} ${view.kind === "engine" ? "manufacturers" : "suppliers"}`}>
				{s.intro} Titles are credited to the engine and tyres of the champion&apos;s car.
			</PageHeader>
			{/* five number columns must fit the narrowest phones: tighter text and padding below 380px */}
			<TableCard tableClassName="max-[379px]:text-[13px] max-[379px]:[&_td:not(:first-child)]:px-1 max-[379px]:[&_th:not(:first-child)]:px-1 max-[379px]:[&_a]:gap-1.5">
				<TableHeader>
					<TableRow>
						<TableHead>{s.one}</TableHead>
						<TableHead className="hidden sm:table-cell">Country</TableHead>
						<TableHead className="hidden sm:table-cell">Years</TableHead>
						<TableHead className="text-right">Races</TableHead>
						<TableHead className="text-right">Wins</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Poles</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Podiums</TableHead>
						<TableHead className="text-right">
							<Hint label="Drivers' titles" className="sm:hidden">
								WDC
							</Hint>
							<span className="hidden sm:inline">Drivers&apos; titles</span>
						</TableHead>
						<TableHead className="text-right max-[379px]:pr-3!">
							<Hint label="Constructors' titles" className="sm:hidden">
								WCC
							</Hint>
							<span className="hidden sm:inline">Constructors&apos; titles</span>
						</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Teams</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.supplier.id}>
							<TableCell className={wrapName}>
								<SupplierLink kind={view.kind} supplier={r.supplier} flag className="font-medium" />
								<div className="text-muted-foreground text-xs sm:hidden">
									<YearRange from={r.firstYear} to={r.lastYear} />
								</div>
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell">
								<NationLink nation={r.nation} flag={false} />
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell">
								<YearRange from={r.firstYear} to={r.lastYear} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.races}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.wins)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.poles)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.podiums)}</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.driversTitles)}</TableCell>
							<TableCell className="text-right tabular-nums max-[379px]:pr-3!">{blank(r.constructorsTitles)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{r.teams}</TableCell>
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

			<div className="grid grid-cols-1 gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title="Season by season" description="Teams supplied each season. Champions listed when they won with this supplier.">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead>Teams</TableHead>
								<TableHead className="hidden text-right sm:table-cell">Races</TableHead>
								<TableHead className="text-right">Wins</TableHead>
								<TableHead className="hidden text-right sm:table-cell">Poles</TableHead>
								<TableHead className="hidden text-right sm:table-cell">Podiums</TableHead>
								<TableHead className="hidden sm:table-cell">Champions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.seasons.map((x) => (
								<TableRow key={x.year}>
									<TableCell className="align-top font-semibold sm:align-middle">
										<SeasonLink year={x.year} />
									</TableCell>
									<TableCell className="whitespace-normal max-sm:w-full max-sm:max-w-0 sm:max-w-96">
										<div className="text-muted-foreground text-xs sm:text-foreground sm:text-sm">
											<List items={x.teams} render={(tm) => <TeamLink team={tm} />} />
										</div>
										<SupplierChampions season={x} className="mt-1 sm:hidden" />
									</TableCell>
									<TableCell className="hidden text-right tabular-nums sm:table-cell">{x.races}</TableCell>
									<TableCell className="text-right align-top tabular-nums sm:align-middle">{blank(x.wins)}</TableCell>
									<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(x.poles)}</TableCell>
									<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(x.podiums)}</TableCell>
									<TableCell className="hidden sm:table-cell">
										<SupplierChampions season={x} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>

				<div className="space-y-12">
					{view.titles.length > 0 && (
						<Section title="Championships" action={<Badge variant="secondary">{view.titles.length}</Badge>}>
							<TableCard maxHeight="sm:max-h-[480px]">
								<TableBody>
									{view.titles.map((x) => (
										<TableRow key={`${x.year}-${x.kind}`}>
											<TableCell className="font-semibold">
												<SeasonLink year={x.year} />
											</TableCell>
											<TableCell>
												<Badge variant="outline" className="hidden sm:inline-flex">
													{x.kind === "drivers" ? "Drivers" : "Constructors"}
												</Badge>
												<Hint label={x.kind === "drivers" ? "Drivers' championship" : "Constructors' championship"} className="sm:hidden">
													<Badge variant="outline">{x.kind === "drivers" ? "WDC" : "WCC"}</Badge>
												</Hint>
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
							{/* hundreds of rows for the big suppliers: a scroll box even on phones beats a page 25,000px long */}
							<TableCard maxHeight="max-h-[480px]">
								<TableBody>
									{view.wins.map((w, i) => (
										<TableRow key={`${w.race.year}-${w.race.round}-${i}`}>
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
						<TableHead className="hidden text-right sm:table-cell">Champions</TableHead>
						<TableHead className="text-right">Titles</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Winners</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Wins</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Constructors</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Constructor wins</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Engines</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Races hosted</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Circuits</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.nation.id}>
							<TableCell>
								<NationLink nation={r.nation} className="font-medium" />
							</TableCell>
							<TableCell className="text-right tabular-nums">{blank(r.drivers)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.champions)}</TableCell>
							<TableCell className="text-right font-semibold tabular-nums">{blank(r.titles)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.winners)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.wins)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.constructors)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.constructorWins)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.engines)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.racesHosted)}</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.circuits)}</TableCell>
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

			<div className="grid grid-cols-1 gap-12 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-8">
				<Section title={`${n.demonym ?? n.name} drivers`} description="Career totals, most successful first.">
					{view.drivers.length ? (
						<div className="group/more space-y-3">
							<TableCard maxHeight="sm:max-h-[720px]">
								<TableHeader>
									<TableRow>
										<TableHead>Driver</TableHead>
										<TableHead className="hidden sm:table-cell">Years</TableHead>
										<TableHead className="text-right">Titles</TableHead>
										<TableHead className="text-right">Starts</TableHead>
										<TableHead className="text-right">Wins</TableHead>
										<TableHead className="hidden text-right sm:table-cell">Podiums</TableHead>
										<TableHead className="hidden text-right sm:table-cell">Poles</TableHead>
										<TableHead className="hidden text-right sm:table-cell">Points</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{view.drivers.map((d, i) => (
										<TableRow key={d.driver.id} className={cn(i >= PHONE_ROWS && "max-sm:hidden max-sm:group-has-checked/more:table-row", i === PHONE_ROWS - 1 && "max-sm:border-b-0 max-sm:group-has-checked/more:border-b")}>
											<TableCell className={wrapName}>
												<DriverLink driver={d.driver} className="font-medium" />
												<div className="text-muted-foreground text-xs sm:hidden">
													<YearRange from={d.firstYear} to={d.lastYear} />
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground hidden sm:table-cell">
												<YearRange from={d.firstYear} to={d.lastYear} />
											</TableCell>
											<TableCell className="text-right tabular-nums">{blank(d.titles)}</TableCell>
											<TableCell className="text-right tabular-nums">{d.starts}</TableCell>
											<TableCell className="text-right tabular-nums">{blank(d.wins)}</TableCell>
											<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(d.podiums)}</TableCell>
											<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(d.poles)}</TableCell>
											<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(d.points)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</TableCard>
							{view.drivers.length > PHONE_ROWS && (
								<label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "has-focus-visible:ring-ring/30 has-focus-visible:ring-3 group-has-checked/more:hidden sm:hidden")}>
									<input type="checkbox" className="sr-only" />
									<ChevronsDown data-icon="inline-start" />
									Show all {view.drivers.length}
								</label>
							)}
						</div>
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
				<div className="grid grid-cols-1 gap-12 xl:grid-cols-2 xl:gap-8">
					{view.constructors.length > 0 && (
						<Section title="Constructors">
							<TableCard maxHeight="sm:max-h-[560px]">
								<TableHeader>
									<TableRow>
										<TableHead>Constructor</TableHead>
										<TableHead className="hidden sm:table-cell">Years</TableHead>
										<TableHead className="text-right">Races</TableHead>
										<TableHead className="text-right">Wins</TableHead>
										<TableHead className="text-right">Titles</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{view.constructors.map((c) => (
										<TableRow key={c.team.id}>
											<TableCell className={wrapName}>
												<TeamLink team={c.team} className="font-medium" />
												<div className="text-muted-foreground text-xs sm:hidden">
													<YearRange from={c.firstYear} to={c.lastYear} />
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground hidden sm:table-cell">
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
							<TableCard maxHeight="sm:max-h-[560px]">
								<TableHeader>
									<TableRow>
										<TableHead>Supplier</TableHead>
										<TableHead className="hidden sm:table-cell">Years</TableHead>
										<TableHead className="text-right">Races</TableHead>
										<TableHead className="text-right">Wins</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{view.engines.map((e) => (
										<TableRow key={`e-${e.engine.id}`}>
											<TableCell className={wrapName}>
												<div className="flex items-center gap-2">
													<EngineLink engine={e.engine} className="font-medium" />
													<Badge variant="outline">Engine</Badge>
												</div>
												<div className="text-muted-foreground text-xs sm:hidden">
													<YearRange from={e.firstYear} to={e.lastYear} />
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground hidden sm:table-cell">
												<YearRange from={e.firstYear} to={e.lastYear} />
											</TableCell>
											<TableCell className="text-right tabular-nums">{e.races}</TableCell>
											<TableCell className="text-right tabular-nums">{blank(e.wins)}</TableCell>
										</TableRow>
									))}
									{view.tyres.map((e) => (
										<TableRow key={`t-${e.tyre.id}`}>
											<TableCell className={wrapName}>
												<div className="flex items-center gap-2">
													<TyreLink tyre={e.tyre} className="font-medium" />
													<Badge variant="outline">Tyres</Badge>
												</div>
												<div className="text-muted-foreground text-xs sm:hidden">
													<YearRange from={e.firstYear} to={e.lastYear} />
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground hidden sm:table-cell">
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
