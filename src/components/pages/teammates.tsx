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

/** Split bar for a head-to-head: the driver's share in F1 red, the other side in muted ink. */
export function DuelBar({ duel, label, className, decimals }: { duel: Duel; label: React.ReactNode; className?: string; decimals?: boolean }) {
	const total = duel.a + duel.b;
	const share = total ? duel.a / total : 0.5;
	const fmt = (n: number) => (decimals ? num(n) : n);
	return (
		<Hint label={label} className={cn("w-full", className)}>
			<span className="flex w-full items-center gap-2 text-xs tabular-nums">
				<span className={cn("w-8 text-right", duel.a > duel.b && "font-semibold")}>{fmt(duel.a)}</span>
				<span className="flex h-2 min-w-16 flex-1 gap-0.5" aria-hidden>
					{total > 0 ? (
						<>
							{duel.a > 0 && <span className="bg-f1 h-full rounded-l-full" style={{ width: `${share * 100}%` }} />}
							{duel.b > 0 && <span className="bg-muted-foreground/35 h-full flex-1 rounded-r-full" />}
						</>
					) : (
						<span className="bg-muted h-full flex-1 rounded-full" />
					)}
				</span>
				<span className={cn("w-8", duel.b > duel.a && "font-semibold")}>{fmt(duel.b)}</span>
			</span>
		</Hint>
	);
}

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
			<TableCard maxHeight={view.rows.length > 12 ? "max-h-[560px]" : undefined}>
				<TableHeader>
					<TableRow>
						<TableHead>Team-mate</TableHead>
						<TableHead>Team</TableHead>
						<TableHead className="text-right">Races</TableHead>
						<TableHead className="min-w-44">Qualifying</TableHead>
						<TableHead className="min-w-44">Race</TableHead>
						<TableHead className="text-right">Points share</TableHead>
						<TableHead className="w-8" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.driver.id}>
							<TableCell>
								<DriverLink driver={r.driver} className="font-medium" />
								<div className="text-muted-foreground text-xs">
									<YearRange from={r.firstYear} to={r.lastYear} />
								</div>
							</TableCell>
							<TableCell className="text-muted-foreground">
								<Join items={r.teams} render={(tm) => <TeamLink team={tm} />} />
							</TableCell>
							<TableCell className="text-right tabular-nums">{r.races}</TableCell>
							<TableCell>
								<DuelBar
									duel={r.quali}
									label={`Qualifying: ${view.driver.name} ${r.quali.a}, ${r.driver.name} ${r.quali.b}${r.gridDecided ? ` (${r.gridDecided} on grid position)` : ""}`}
								/>
							</TableCell>
							<TableCell>
								<DuelBar duel={r.race} label={`Finished ahead: ${view.driver.name} ${r.race.a}, ${r.driver.name} ${r.race.b}`} />
							</TableCell>
							<TableCell className="text-right tabular-nums">
								<Hint label={`${num(r.points.a)} – ${num(r.points.b)} points (incl. sprints)`}>{pct(r.points)}</Hint>
							</TableCell>
							<TableCell>
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
					))}
				</TableBody>
			</TableCard>
		</Section>
	);
}

/* --------------------------------------------------------- pairing page --- */

function DuelRow({ label, duel, note, decimals }: { label: string; duel: Duel; note?: string; decimals?: boolean }) {
	return (
		<div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
			<span className="text-muted-foreground text-sm">{label}</span>
			<DuelBar duel={duel} decimals={decimals} label={note ?? label} />
		</div>
	);
}

function Duels({ t, a, b }: { t: PairTotals; a: string; b: string }) {
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
					duel={t.quali}
					note={`${QUALI_NOTE}${t.gridDecided ? ` ${t.gridDecided} decided on grid position.` : ""}`}
				/>
				<DuelRow label="Finished ahead" duel={t.race} note={RACE_NOTE} />
				<DuelRow label="Points" duel={t.points} decimals note="Race and sprint points at the shared weekends" />
				<DuelRow label="Wins" duel={t.wins} />
				<DuelRow label="Podiums" duel={t.podiums} />
				<DuelRow label="Poles" duel={t.poles} />
			</CardContent>
		</Card>
	);
}

function Cell({ s, won }: { s: PairSide; won: boolean }) {
	return <span className={cn("tabular-nums", won ? "text-foreground font-semibold" : "text-muted-foreground")}>{s.text}</span>;
}

const qualiText = (s: PairSide, basis: "qualifying" | "grid" | null) => {
	const v = basis === "grid" ? s.grid : (s.qualifying ?? s.grid);
	return v != null ? `${basis === "grid" ? "G" : "Q"}${v}` : "–";
};

export function TeammatePairPage({ view }: { view: TeammatePairView }) {
	const { a, b, totals: t } = view;
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
						<DriverLink driver={a} flag={false} />
						<span className="text-muted-foreground text-xl font-normal">vs</span>
						<DriverLink driver={b} flag={false} />
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

			<div className="grid gap-12 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:gap-8">
				<Section title="Head-to-head">
					<Duels t={t} a={a.name} b={b.name} />
				</Section>
				<Section title="Season by season">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Season</TableHead>
								<TableHead>Team</TableHead>
								<TableHead className="text-right">Races</TableHead>
								<TableHead className="min-w-40">Qualifying</TableHead>
								<TableHead className="min-w-40">Race</TableHead>
								<TableHead className="text-right">Points</TableHead>
								<TableHead className="text-right">Wins</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{view.seasons.map((s) => (
								<TableRow key={s.year}>
									<TableCell className="font-semibold">
										<SeasonLink year={s.year} />
									</TableCell>
									<TableCell className="text-muted-foreground">
										<Join items={s.teams} render={(tm) => <TeamLink team={tm} />} />
									</TableCell>
									<TableCell className="text-right tabular-nums">{s.races}</TableCell>
									<TableCell>
										<DuelBar duel={s.quali} label={`Qualifying ${s.year}: ${a.name} ${s.quali.a}, ${b.name} ${s.quali.b}`} />
									</TableCell>
									<TableCell>
										<DuelBar duel={s.race} label={`Finished ahead ${s.year}: ${a.name} ${s.race.a}, ${b.name} ${s.race.b}`} />
									</TableCell>
									<TableCell className="text-right whitespace-nowrap tabular-nums">
										{num(s.points.a)} – {num(s.points.b)}
									</TableCell>
									<TableCell className="text-right whitespace-nowrap tabular-nums">
										{s.wins.a} – {s.wins.b}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</Section>
			</div>

			<Section title="Race by race" description="Bold: ahead in that duel. Q: qualifying position; G (italic): decided on grid position.">
				<TableCard>
					<TableHeader>
						<TableRow>
							<TableHead>Race</TableHead>
							<TableHead>Team</TableHead>
							<TableHead className="text-right">Qual.</TableHead>
							<TableHead className="text-right">{a.name}</TableHead>
							<TableHead className="text-right">Qual.</TableHead>
							<TableHead className="text-right">{b.name}</TableHead>
							<TableHead className="text-right">Points</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{[...view.races].reverse().map((r) => (
							<TableRow key={`${r.race.year}-${r.race.round}`}>
								<TableCell>
									<RaceLink race={r.race} year />
								</TableCell>
								<TableCell className="text-muted-foreground">
									<TeamLink team={r.team} />
								</TableCell>
								<TableCell className="text-right">
									<span className={cn("tabular-nums", r.quali === "a" ? "font-semibold" : "text-muted-foreground", r.qualiBasis === "grid" && "italic")}>
										{qualiText(r.a, r.qualiBasis)}
									</span>
								</TableCell>
								<TableCell className="text-right">
									<Cell s={r.a} won={r.finish === "a"} />
								</TableCell>
								<TableCell className="text-right">
									<span className={cn("tabular-nums", r.quali === "b" ? "font-semibold" : "text-muted-foreground", r.qualiBasis === "grid" && "italic")}>
										{qualiText(r.b, r.qualiBasis)}
									</span>
								</TableCell>
								<TableCell className="text-right">
									<Cell s={r.b} won={r.finish === "b"} />
								</TableCell>
								<TableCell className="text-right whitespace-nowrap tabular-nums">
									{num(r.a.points)} – {num(r.b.points)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</TableCard>
			</Section>
		</Page>
	);
}
