import { GitCompareArrows, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompareEntity, CompareTotals, CompareView, Snapshot } from "@/lib/f1/compare";
import { DriverLink, Hint, Page, PageHeader, RaceLink, Section, SeasonLink, TableCard, TeamLink, YearRange, num } from "../f1";
import { ULink } from "../universe-link";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { COMPARE_COLORS } from "./compare-colors";
import { ComparePicker, ProgressChart } from "./compare-client";
import { DuelBar, teammatesHref } from "./teammates";

const SUGGESTIONS: Record<"driver" | "team", [string, string][]> = {
	driver: [
		["ayrton-senna,alain-prost", "Senna vs Prost"],
		["lewis-hamilton,max-verstappen", "Hamilton vs Verstappen"],
		["michael-schumacher,lewis-hamilton", "Schumacher vs Hamilton"],
		["fernando-alonso,sebastian-vettel,kimi-raikkonen", "Alonso vs Vettel vs Räikkönen"],
	],
	team: [
		["ferrari,mclaren", "Ferrari vs McLaren"],
		["mercedes,red-bull", "Mercedes vs Red Bull"],
		["williams,lotus,brabham", "Williams vs Lotus vs Brabham"],
	],
};

const nameOf = (e: CompareEntity) => e.driver?.name ?? e.team?.name ?? e.id;

function EntityHead({ e, i }: { e: CompareEntity; i: number }) {
	return (
		<span className="inline-flex min-w-0 items-center gap-2">
			<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COMPARE_COLORS[i] }} aria-hidden />
			{e.driver ? <DriverLink driver={e.driver} className="font-medium" /> : e.team && <TeamLink team={e.team} flag className="font-medium" />}
		</span>
	);
}

type Metric = { label: string; value: (t: CompareTotals) => number | null; fmt?: (n: number) => string; lowerIsBetter?: boolean; note?: string };

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function metrics(kind: "driver" | "team"): Metric[] {
	const starts = kind === "driver" ? "Starts" : "Races";
	return [
		{ label: kind === "driver" ? "Drivers' titles" : "Constructors' titles", value: (t) => t.titles },
		{ label: "Wins", value: (t) => t.wins },
		{ label: "Podiums", value: (t) => t.podiums, note: kind === "team" ? "Every podium finish by the team's cars" : undefined },
		{ label: "Poles", value: (t) => t.poles },
		{ label: "Fastest laps", value: (t) => t.fastestLaps },
		{ label: starts, value: (t) => t.starts },
		{ label: "Points", value: (t) => t.points, fmt: num, note: "As awarded at the time, sprints included" },
		{ label: "Win rate", value: (t) => t.winRate, fmt: pct, note: `Wins per ${starts.toLowerCase().slice(0, -1)}` },
		{ label: "Podium rate", value: (t) => t.podiumRate, fmt: pct, note: kind === "team" ? "Podium finishes per race (two cars can score twice)" : undefined },
		{ label: "Seasons", value: (t) => t.seasons },
		{ label: "Best championship", value: (t) => t.bestChampionship, fmt: (n) => `P${n}`, lowerIsBetter: true },
	];
}

/** Index set of the leaders for a row (ties share it); none when everyone is level. */
function leaders(values: (number | null)[], lowerIsBetter = false) {
	const xs = values.filter((v): v is number => v != null);
	if (xs.length < 2) return new Set<number>();
	const best = lowerIsBetter ? Math.min(...xs) : Math.max(...xs);
	if (xs.every((x) => x === best)) return new Set<number>();
	return new Set(values.flatMap((v, i) => (v === best ? [i] : [])));
}

const LEAD = "bg-gold/15 font-semibold text-foreground";

function TotalsTable({ view }: { view: CompareView }) {
	const es = view.entities;
	return (
		<TableCard tableClassName="min-w-[36rem] table-fixed">
			<TableHeader>
				<TableRow>
					<TableHead className="w-44" />
					{es.map((e, i) => (
						<TableHead key={e.id} className="text-right">
							<span className="inline-flex justify-end">
								<EntityHead e={e} i={i} />
							</span>
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				<TableRow>
					<TableCell className="text-muted-foreground">Years</TableCell>
					{es.map((e) => (
						<TableCell key={e.id} className="text-right">
							<YearRange from={e.totals.firstYear} to={e.totals.lastYear} />
						</TableCell>
					))}
				</TableRow>
				{metrics(view.kind).map((m) => {
					const values = es.map((e) => m.value(e.totals));
					const lead = leaders(values, m.lowerIsBetter);
					return (
						<TableRow key={m.label}>
							<TableCell className="text-muted-foreground">{m.note ? <Hint label={m.note}>{m.label}</Hint> : m.label}</TableCell>
							{values.map((v, i) => (
								<TableCell key={es[i].id} className={cn("text-right tabular-nums", lead.has(i) && LEAD)}>
									{v == null ? "–" : m.fmt ? m.fmt(v) : num(v)}
								</TableCell>
							))}
						</TableRow>
					);
				})}
				<TableRow>
					<TableCell className="text-muted-foreground">Title years</TableCell>
					{es.map((e) => (
						<TableCell key={e.id} className="text-right whitespace-normal">
							<span className="inline-flex flex-wrap justify-end gap-x-1.5">
								{e.titleYears.length ? e.titleYears.map((y) => <SeasonLink key={y} year={y} />) : <span className="text-muted-foreground">–</span>}
							</span>
						</TableCell>
					))}
				</TableRow>
				<TableRow>
					<TableCell className="text-muted-foreground">First race</TableCell>
					{es.map((e) => (
						<TableCell key={e.id} className="text-right">
							{e.firstRace && <RaceLink race={e.firstRace} year />}
						</TableCell>
					))}
				</TableRow>
			</TableBody>
		</TableCard>
	);
}

const SNAP: { label: string; key: keyof Snapshot; fmt?: (n: number) => string }[] = [
	{ label: "Starts", key: "starts" },
	{ label: "Titles", key: "titles" },
	{ label: "Wins", key: "wins" },
	{ label: "Podiums", key: "podiums" },
	{ label: "Poles", key: "poles" },
	{ label: "Points", key: "points", fmt: num },
];

function SnapshotTable({ entities, rows, kind, skip }: { entities: CompareEntity[]; rows: Snapshot[]; kind: "driver" | "team"; skip?: keyof Snapshot }) {
	return (
		<TableCard tableClassName="min-w-[30rem] table-fixed">
			<TableHeader>
				<TableRow>
					<TableHead className="w-28" />
					{entities.map((e, i) => (
						<TableHead key={e.id} className="text-right">
							<span className="inline-flex justify-end">
								<EntityHead e={e} i={i} />
							</span>
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{SNAP.filter((s) => s.key !== skip).map((s) => {
					const values = rows.map((r) => r[s.key]);
					const lead = leaders(values);
					return (
						<TableRow key={s.key}>
							<TableCell className="text-muted-foreground">{s.key === "starts" && kind === "team" ? "Races" : s.label}</TableCell>
							{values.map((v, i) => (
								<TableCell key={entities[i].id} className={cn("text-right tabular-nums", lead.has(i) && LEAD)}>
									{s.fmt ? s.fmt(v) : v}
								</TableCell>
							))}
						</TableRow>
					);
				})}
			</TableBody>
		</TableCard>
	);
}

function HeadToHead({ view }: { view: CompareView }) {
	const byId = new Map(view.entities.map((e) => [e.id, e]));
	return (
		<TableCard>
			<TableHeader>
				<TableRow>
					<TableHead>Pairing</TableHead>
					<TableHead className="text-right">{view.kind === "driver" ? "Races together" : "Races against"}</TableHead>
					<TableHead className="min-w-56">Finished ahead</TableHead>
					{view.kind === "driver" && <TableHead className="text-right">As team-mates</TableHead>}
				</TableRow>
			</TableHeader>
			<TableBody>
				{view.h2h.map((h) => {
					const a = byId.get(h.a)!;
					const b = byId.get(h.b)!;
					return (
						<TableRow key={`${h.a}-${h.b}`}>
							<TableCell className="whitespace-nowrap">
								{nameOf(a)} <span className="text-muted-foreground">vs</span> {nameOf(b)}
							</TableCell>
							<TableCell className="text-right tabular-nums">{h.races}</TableCell>
							<TableCell>
								<DuelBar duel={{ a: h.aAhead, b: h.bAhead }} label={`${nameOf(a)} ahead ${h.aAhead}, ${nameOf(b)} ahead ${h.bAhead}`} />
							</TableCell>
							{view.kind === "driver" && (
								<TableCell className="text-right tabular-nums">
									{h.teammateRaces ? (
										<ULink href={teammatesHref(h.a, h.b)} className="underline-offset-4 hover:underline">
											{h.teammateRaces} races
										</ULink>
									) : (
										<span className="text-muted-foreground">–</span>
									)}
								</TableCell>
							)}
						</TableRow>
					);
				})}
			</TableBody>
		</TableCard>
	);
}

function BestSeasons({ entities }: { entities: CompareEntity[] }) {
	return (
		<div className={cn("grid gap-4 sm:grid-cols-2", entities.length > 2 && "xl:grid-cols-4")}>
			{entities.map((e, i) => (
				<Card key={e.id} size="sm">
					<CardHeader>
						<CardTitle className="text-sm">
							<EntityHead e={e} i={i} />
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1.5">
						{e.bestSeasons.map((s) => (
							<div key={s.year} className="flex items-center gap-3 text-sm">
								<SeasonLink year={s.year} className="font-medium" />
								<span className="inline-flex w-10 items-center gap-1 tabular-nums">
									{s.position === 1 && <Trophy className="text-gold size-3.5" />}
									{s.position ? `P${s.position}` : "–"}
								</span>
								<span className="text-muted-foreground tabular-nums">
									{s.wins} win{s.wins === 1 ? "" : "s"} · {num(s.points)} pts
								</span>
								{s.teams.length > 0 && (
									<span className="text-muted-foreground ml-auto truncate">
										<TeamLink team={s.teams[0]} />
									</span>
								)}
							</div>
						))}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export function ComparePage({ view }: { view: CompareView }) {
	const { kind, entities: es } = view;
	const picked = es.map((e) => ({ id: e.id, name: nameOf(e), country: e.driver?.country ?? e.team?.country ?? null }));
	const param = kind === "driver" ? "d" : "t";
	const tab = (k: "driver" | "team", label: string) => (
		<ULink href={k === "driver" ? "/compare" : "/compare?t="} className={buttonVariants({ variant: kind === k ? "secondary" : "ghost", size: "sm" })} aria-current={kind === k ? "page" : undefined}>
			{label}
		</ULink>
	);
	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<GitCompareArrows className="size-3.5" /> Compare
					</>
				}
				title={es.length >= 2 ? es.map(nameOf).join(" vs ") : kind === "driver" ? "Compare drivers" : "Compare constructors"}
				actions={
					<div className="flex gap-1">
						{tab("driver", "Drivers")}
						{tab("team", "Constructors")}
					</div>
				}
			>
				Pick two to four {kind === "driver" ? "drivers" : "constructors"} to put their careers side by side.
				{view.unknown.length > 0 && <> Not found: {view.unknown.join(", ")}.</>}
			</PageHeader>

			<ComparePicker kind={kind} picked={picked} />

			{es.length < 2 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">{kind === "driver" ? <GitCompareArrows /> : <Users />}</EmptyMedia>
						<EmptyTitle>{es.length ? `Add another ${kind === "driver" ? "driver" : "constructor"}` : `Choose ${kind === "driver" ? "drivers" : "constructors"} to compare`}</EmptyTitle>
						<EmptyDescription>Or start from one of these:</EmptyDescription>
					</EmptyHeader>
					<EmptyContent className="flex-row flex-wrap justify-center">
						{SUGGESTIONS[kind].map(([ids, label]) => (
							<ULink key={ids} href={`/compare?${param}=${ids}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
								{label}
							</ULink>
						))}
					</EmptyContent>
				</Empty>
			) : (
				<>
					<Section title="Career" description="Leader in each row highlighted.">
						<TotalsTable view={view} />
					</Section>

					<div className={cn("grid gap-12 xl:gap-8", view.sameAge && "xl:grid-cols-2")}>
						{view.sameAge && (
							<Section title="At the same age" description={`Everyone at ${view.sameAge.label}, the youngest age any of them reached at their last start. Titles count once the season had ended.`}>
								<SnapshotTable entities={es} rows={view.sameAge.rows} kind={kind} />
							</Section>
						)}
						{view.afterStarts && (
							<Section
								title={`After ${view.afterStarts.n} ${kind === "driver" ? "starts" : "races"}`}
								description={`Everyone over their first ${view.afterStarts.n} ${kind === "driver" ? "starts" : "races"}, the shortest career here.`}
							>
								<SnapshotTable entities={es} rows={view.afterStarts.rows} kind={kind} skip="starts" />
							</Section>
						)}
					</div>

					<Section title="Progression">
						<Card>
							<CardContent>
								<ProgressChart entities={es} kind={kind} />
							</CardContent>
						</Card>
					</Section>

					{view.h2h.length > 0 && (
						<Section
							title="Head-to-head"
							description={
								kind === "driver"
									? "Races both started. Better classified finish counts; a classified finisher beats a retirement; races where neither was classified don't count."
									: "Races both entered, by each team's best-placed car."
							}
						>
							<HeadToHead view={view} />
						</Section>
					)}

					<Section title="Best seasons" description="By championship position, then wins.">
						<BestSeasons entities={es} />
					</Section>
				</>
			)}
		</Page>
	);
}
