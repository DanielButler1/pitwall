import { ChevronRight, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Duel, DriverTeammatesView, PairSide, PairTotals, TeammatePairView } from "@/lib/f1/teammates";
import { DriverLink, Hint, Join, Page, PageHeader, RaceLink, Section, SeasonLink, TableCard, TeamLink, YearRange, num } from "../f1";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { buttonVariants } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export const teammatesHref = (a: string, b: string) => `/teammates/${a}/${b}`;

const QUALI_NOTE = "Better qualifying classification; grid position when either has none.";
const RACE_NOTE = "Both started: better classified finish; a classified finisher beats a retirement; races where neither was classified don't count.";

/**
 * Split bar for a head-to-head: the driver's share in F1 red, the other side in muted ink.
 * `numClassName` fixes the width of both number slots so bars line up across rows with differently sized numbers.
 */
export function DuelBar({
	duel,
	label,
	className,
	decimals,
	numClassName = "min-w-7 sm:min-w-8",
}: {
	duel: Duel;
	label: React.ReactNode;
	className?: string;
	decimals?: boolean;
	numClassName?: string;
}) {
	const total = duel.a + duel.b;
	const share = total ? duel.a / total : 0.5;
	const fmt = (n: number) => (decimals ? num(n) : n);
	return (
		<Hint label={label} className={cn("w-full", className)}>
			<span className="flex w-full items-center gap-1.5 text-xs sm:gap-2 tabular-nums">
				<span className={cn("shrink-0 text-right", numClassName, duel.a > duel.b && "font-semibold")}>{fmt(duel.a)}</span>
				<span className="flex h-2 min-w-6 flex-1 gap-0.5 sm:min-w-16" aria-hidden>
					{total > 0 ? (
						<>
							{duel.a > 0 && <span className="bg-f1 h-full rounded-l-full" style={{ width: `${share * 100}%` }} />}
							{duel.b > 0 && <span className="bg-muted-foreground/35 h-full flex-1 rounded-r-full" />}
						</>
					) : (
						<span className="bg-muted h-full flex-1 rounded-full" />
					)}
				</span>
				<span className={cn("shrink-0", numClassName, duel.b > duel.a && "font-semibold")}>{fmt(duel.b)}</span>
			</span>
		</Hint>
	);
}

// Tight number slots for the phone Q/R columns, where every pixel goes to the bars.
const NARROW_NUMS = "min-w-5 sm:min-w-8";

const pct = (d: Duel) => (d.a + d.b ? `${Math.round((100 * d.a) / (d.a + d.b))}%` : "–");

/** Driver page section: every team-mate with qualifying and race head-to-heads. */
export function TeammatesSection({ view }: { view: DriverTeammatesView }) {
	if (!view.rows.length) return null;
	const t = view.totals;
	return (
		<Section
			title="Team-mates"
			description={
				<>
					Head-to-heads in races driven for the same team. {view.driver.name} on the left. Qualifying: {QUALI_NOTE.toLowerCase()} Race: {RACE_NOTE.toLowerCase()}
				</>
			}
			action={
				<div className="text-muted-foreground hidden gap-4 text-sm sm:flex">
					<span>
						Qualifying <span className="text-foreground font-medium tabular-nums">{pct(t.quali)}</span>
					</span>
					<span>
						Races <span className="text-foreground font-medium tabular-nums">{pct(t.race)}</span>
					</span>
				</div>
			}
		>
			<TableCard maxHeight={view.rows.length > 12 ? "sm:max-h-[560px]" : undefined}>
				<TableHeader>
					<TableRow>
						<TableHead>Team-mate</TableHead>
						<TableHead className="hidden sm:table-cell">Team</TableHead>
						<TableHead className="hidden text-right sm:table-cell">Races</TableHead>
						<TableHead className="hidden min-w-44 sm:table-cell">Qualifying</TableHead>
						<TableHead className="hidden min-w-44 sm:table-cell">Race</TableHead>
						<TableHead className="w-full sm:hidden">Quali / race</TableHead>
						<TableHead className="text-right">
							<span className="sm:hidden">Pts</span>
							<span className="hidden sm:inline">Points share</span>
						</TableHead>
						<TableHead className="w-8" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => {
						const quali = (
							<DuelBar
								duel={r.quali}
								label={`Qualifying: ${view.driver.name} ${r.quali.a}, ${r.driver.name} ${r.quali.b}${r.gridDecided ? ` (${r.gridDecided} on grid position)` : ""}`}
								numClassName={NARROW_NUMS}
							/>
						);
						const race = <DuelBar duel={r.race} numClassName={NARROW_NUMS} label={`Finished ahead: ${view.driver.name} ${r.race.a}, ${r.driver.name} ${r.race.b}`} />;
						return (
							<TableRow key={r.driver.id}>
								<TableCell className="max-sm:max-w-28 max-sm:[&_.fi]:hidden!">
									<DriverLink driver={keepSuffix(r.driver)} className="max-w-full font-medium" />
									<div className="text-muted-foreground text-xs whitespace-nowrap">
										<YearRange from={r.firstYear} to={r.lastYear} />
										<span className="sm:hidden"> · {r.races}</span>
									</div>
								</TableCell>
								<TableCell className="text-muted-foreground hidden sm:table-cell">
									<Join items={r.teams} render={(tm) => <TeamLink team={tm} />} />
								</TableCell>
								<TableCell className="hidden text-right tabular-nums sm:table-cell">{r.races}</TableCell>
								<TableCell className="hidden sm:table-cell">{quali}</TableCell>
								<TableCell className="hidden sm:table-cell">{race}</TableCell>
								<TableCell className="sm:hidden">
									<div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1 gap-y-1.5">
										<span className="text-muted-foreground text-[10px]">Q</span>
										{quali}
										<span className="text-muted-foreground text-[10px]">R</span>
										{race}
									</div>
								</TableCell>
								<TableCell className="text-right tabular-nums max-sm:pl-2!">
									<Hint label={`${num(r.points.a)} – ${num(r.points.b)} points (incl. sprints)`}>{pct(r.points)}</Hint>
								</TableCell>
								<TableCell className="max-sm:pl-0">
									<Hint label="Full head-to-head">
										<ULink
											href={teammatesHref(view.driver.id, r.driver.id)}
											className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
											aria-label={`Head-to-head with ${r.driver.name}`}
										>
											<ChevronRight />
										</ULink>
									</Hint>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</TableCard>
		</Section>
	);
}

/* --------------------------------------------------------- pairing page --- */

function DuelRow({ label, duel, note, decimals, numClassName }: { label: string; duel: Duel; note?: string; decimals?: boolean; numClassName: string }) {
	return (
		<div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
			<span className="text-muted-foreground text-sm">{label}</span>
			<DuelBar duel={duel} decimals={decimals} label={note ?? label} numClassName={numClassName} />
		</div>
	);
}

function Duels({ t, a, b }: { t: PairTotals; a: string; b: string }) {
	// One number width for every row, sized to the longest figure (usually points), so all bars start and end together.
	const figures = [t.quali, t.race, t.wins, t.podiums, t.poles].flatMap((d) => [String(d.a), String(d.b)]);
	const longest = Math.max(...figures.concat(num(t.points.a), num(t.points.b)).map((s) => s.length));
	const w = longest <= 2 ? "w-6" : longest <= 3 ? "w-7" : longest <= 5 ? "w-10" : "w-12";
	return (
		<Card>
			<CardContent className="space-y-3">
				<div className="text-muted-foreground grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-xs sm:grid-cols-[9rem_minmax(0,1fr)]">
					<span />
					<span className="flex justify-between">
						<span className="text-foreground font-medium">{a}</span>
						<span className="text-foreground font-medium">{b}</span>
					</span>
				</div>
				<DuelRow
					label="Qualifying"
					numClassName={w}
					duel={t.quali}
					note={`${QUALI_NOTE}${t.gridDecided ? ` ${t.gridDecided} decided on grid position.` : ""}`}
				/>
				<DuelRow label="Finished ahead" duel={t.race} note={RACE_NOTE} numClassName={w} />
				<DuelRow label="Points" duel={t.points} decimals note="Race and sprint points at the shared weekends" numClassName={w} />
				<DuelRow label="Wins" duel={t.wins} numClassName={w} />
				<DuelRow label="Podiums" duel={t.podiums} numClassName={w} />
				<DuelRow label="Poles" duel={t.poles} numClassName={w} />
			</CardContent>
		</Card>
	);
}

function Cell({ s, won }: { s: PairSide; won: boolean }) {
	return <span className={cn("tabular-nums", won ? "text-foreground font-semibold" : "text-muted-foreground")}>{s.text}</span>;
}

/** Glues a " Jr."/" Sr." suffix to the surname with a no-break space, so a wrapping name never leaves "Jr." alone on a line. */
export const keepSuffix = <T extends { name: string }>(d: T): T => ({ ...d, name: d.name.replace(/ (Jr\.|Sr\.)$/, "\u00a0$1") });

/** Last name for tight phone layouts: "Carlos Sainz Jr." -> "Sainz", "Elio de Angelis" -> "de Angelis". */
export function surname(name: string) {
	const words = name.replace(/ (Jr\.|Sr\.)$/, "").split(" ");
	let i = words.length - 1;
	while (i > 1 && /^(de|da|di|del|der|van|von|la|le|dos)$/.test(words[i - 1])) i--;
	return words.slice(i).join(" ");
}

// Phones: the few long Grand Prix names, shortened so a race fits on one line beside its year.
const PHONE_RACE: Record<string, string> = {
	"United States": "USA",
	"United States West": "USA West",
	"70th Anniversary": "70th Anniv.",
	"Barcelona-Catalunya": "Barcelona",
	"Emilia Romagna": "Imola",
	"Caesars Palace": "Caesars P.",
};
export const phoneRaceName = (name: string) => PHONE_RACE[name] ?? name.replace(/ Grand Prix$/, " GP");

const qualiText = (s: PairSide, basis: "qualifying" | "grid" | null) => {
	const v = basis === "grid" ? s.grid : (s.qualifying ?? s.grid);
	return v != null ? `${basis === "grid" ? "G" : "Q"}${v}` : "–";
};

export function TeammatePairPage({ view }: { view: TeammatePairView }) {
	const { a, b, totals: t } = view;
	const multiTeam = view.teams.length > 1;
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<Users className="size-3.5" /> Team-mates
						<Join items={view.teams} render={(tm) => <TeamLink team={tm} />} sep=" · " />
						<Badge variant="secondary">
							<YearRange from={view.firstYear} to={view.lastYear} />
						</Badge>
						{view.realTotals && (
							<Badge variant="outline" className="border-universe/30 text-universe">
								<Sparkles /> Altered in this universe
							</Badge>
						)}
					</>
				}
				title={
					<span className="flex flex-wrap items-baseline gap-x-3">
						<DriverLink driver={keepSuffix(a)} flag={false} />
						<span className="text-muted-foreground text-xl font-normal">vs</span>
						<DriverLink driver={keepSuffix(b)} flag={false} />
					</span>
				}
				actions={
					<>
						<ULink href={teammatesHref(b.id, a.id)} className={buttonVariants({ variant: "outline", size: "sm" })}>
							Swap sides
						</ULink>
						<ULink href={`/compare?d=${a.id},${b.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
							Compare careers
						</ULink>
					</>
				}
			>
				{t.races} race{t.races === 1 ? "" : "s"} together. {QUALI_NOTE} Race: {RACE_NOTE.toLowerCase()}
				{view.realTotals && (
					<>
						{" "}
						In reality: {view.realTotals.races} races, qualifying {view.realTotals.quali.a}–{view.realTotals.quali.b}, races {view.realTotals.race.a}–{view.realTotals.race.b}.
					</>
				)}
			</PageHeader>

			<div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:gap-8">
				<Section title="Head-to-head">
					<Duels t={t} a={a.name} b={b.name} />
				</Section>
				<Section title="Season by season">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								{multiTeam && <TableHead className="hidden sm:table-cell">Team</TableHead>}
								<TableHead className="hidden text-right sm:table-cell">Races</TableHead>
								<TableHead className="hidden min-w-40 sm:table-cell">Qualifying</TableHead>
								<TableHead className="hidden min-w-40 sm:table-cell">Race</TableHead>
								<TableHead className="w-full sm:hidden">Quali / race</TableHead>
								<TableHead className="text-right max-sm:pr-4!">
									<span className="sm:hidden">Pts</span>
									<span className="hidden sm:inline">Points</span>
								</TableHead>
								<TableHead className="hidden text-right sm:table-cell">Wins</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.seasons.map((s) => {
								const quali = <DuelBar duel={s.quali} numClassName={NARROW_NUMS} label={`Qualifying ${s.year}: ${a.name} ${s.quali.a}, ${b.name} ${s.quali.b}`} />;
								const race = <DuelBar duel={s.race} numClassName={NARROW_NUMS} label={`Finished ahead ${s.year}: ${a.name} ${s.race.a}, ${b.name} ${s.race.b}`} />;
								return (
									<TableRow key={s.year}>
										<TableCell>
											<SeasonLink year={s.year} className="font-semibold" />
											<div className="text-muted-foreground text-xs whitespace-nowrap sm:hidden">
												{s.races} race{s.races === 1 ? "" : "s"}
											</div>
										</TableCell>
										{multiTeam && (
											<TableCell className="text-muted-foreground hidden sm:table-cell">
												<Join items={s.teams} render={(tm) => <TeamLink team={tm} />} />
											</TableCell>
										)}
										<TableCell className="hidden text-right tabular-nums sm:table-cell">{s.races}</TableCell>
										<TableCell className="hidden sm:table-cell">{quali}</TableCell>
										<TableCell className="hidden sm:table-cell">{race}</TableCell>
										<TableCell className="sm:hidden">
											<div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1 gap-y-1.5">
												<span className="text-muted-foreground text-[10px]">Q</span>
												{quali}
												<span className="text-muted-foreground text-[10px]">R</span>
												{race}
											</div>
										</TableCell>
										<TableCell className="text-right whitespace-nowrap tabular-nums max-sm:pr-4!">
											{num(s.points.a)} – {num(s.points.b)}
											<div className="text-muted-foreground text-xs sm:hidden">
												{s.wins.a} – {s.wins.b} wins
											</div>
										</TableCell>
										<TableCell className="hidden text-right whitespace-nowrap tabular-nums sm:table-cell">
											{s.wins.a} – {s.wins.b}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</TableCard>
				</Section>
			</div>

			<Section title="Race by race" description="Bold: ahead in that duel. Q: qualifying position; G (italic): decided on grid position.">
				<TableCard>
					<TableHeader>
						<TableRow>
							<TableHead>Race</TableHead>
							{multiTeam && <TableHead className="hidden sm:table-cell">Team</TableHead>}
							<TableHead className="hidden text-right sm:table-cell">Qual.</TableHead>
							<TableHead className="text-right whitespace-nowrap">
								<span className="sm:hidden">{surname(a.name)}</span>
								<span className="hidden sm:inline">{a.name}</span>
							</TableHead>
							<TableHead className="hidden text-right sm:table-cell">Qual.</TableHead>
							<TableHead className="text-right whitespace-nowrap">
								<span className="sm:hidden">{surname(b.name)}</span>
								<span className="hidden sm:inline">{b.name}</span>
							</TableHead>
							<TableHead className="text-right">
								<span className="sm:hidden">Pts</span>
								<span className="hidden sm:inline">Points</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{[...view.races].reverse().map((r) => {
							const q = (side: "a" | "b") => (
								<span className={cn("tabular-nums", r.quali === side ? "font-semibold" : "text-muted-foreground", r.qualiBasis === "grid" && "italic")}>
									{qualiText(r[side], r.qualiBasis)}
								</span>
							);
							return (
								<TableRow key={`${r.race.year}-${r.race.round}`}>
									<TableCell className="max-sm:whitespace-nowrap">
										<RaceLink race={r.race} year className="hidden sm:inline-flex" />
										<RaceLink race={{ ...r.race, name: phoneRaceName(r.race.name) }} className="max-w-full sm:hidden" />
										<div className="text-muted-foreground pl-[26.6px] text-xs tabular-nums sm:hidden">
											{r.race.year}
											{multiTeam && <> · {r.team.name}</>}
										</div>
									</TableCell>
									{multiTeam && (
										<TableCell className="text-muted-foreground hidden sm:table-cell">
											<TeamLink team={r.team} />
										</TableCell>
									)}
									<TableCell className="hidden text-right sm:table-cell">{q("a")}</TableCell>
									<TableCell className="text-right">
										<Cell s={r.a} won={r.finish === "a"} />
										<div className="text-xs sm:hidden">{q("a")}</div>
									</TableCell>
									<TableCell className="hidden text-right sm:table-cell">{q("b")}</TableCell>
									<TableCell className="text-right">
										<Cell s={r.b} won={r.finish === "b"} />
										<div className="text-xs sm:hidden">{q("b")}</div>
									</TableCell>
									<TableCell className="text-right whitespace-nowrap tabular-nums max-sm:text-xs">
										{num(r.a.points)} – {num(r.b.points)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</TableCard>
			</Section>
		</Page>
	);
}
