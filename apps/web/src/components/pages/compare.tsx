import { GitCompareArrows, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompareEntity, CompareTotals, CompareView, Snapshot } from "@pitwall/core/f1/compare";
import { DriverLink, Flag, Hint, Page, PageHeader, RaceLink, Section, SeasonLink, TableCard, TeamLink, YearRange, href, num } from "../f1";
import { ULink } from "../universe-link";
import { buttonVariants } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { COMPARE_COLORS } from "./compare-colors";
import { ComparePicker, ProgressChart } from "./compare-client";
import { DuelBar, surname, teammatesHref } from "./teammates";

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

const shortName = (e: CompareEntity) => (e.driver ? surname(e.driver.name) : nameOf(e));

const V = "aeiouyäöüéèáíóúàëï";
/**
 * Soft hyphens at rough syllable breaks (vowel|consonant-vowel, consonant|consonant) so a long name can wrap
 * as "Schu-macher" in a narrow column; browsers' own hyphenation isn't available everywhere.
 */
function softHyphens(word: string) {
	if (word.length < 8) return word;
	const lower = word.toLowerCase();
	const isV = (i: number) => V.includes(lower[i]);
	let out = "";
	for (let i = 0; i < word.length; i++) {
		const breakHere =
			i >= 2 &&
			i <= word.length - 3 &&
			!isV(i) &&
			((isV(i - 1) && isV(i + 1)) || (!isV(i - 1) && isV(i - 2) && isV(i + 1) && !/^(ch|ck|ph|th|sh)$/.test(lower.slice(i - 1, i + 1))));
		out += (breakHere ? "\u00ad" : "") + word[i];
	}
	return out;
}

/** Table column head: full link from `sm` up; on phones the surname, underlined in the entity's colour. */
function ColumnHead({ e, i }: { e: CompareEntity; i: number }) {
	return (
		<>
			<span className="hidden max-w-full justify-end sm:inline-flex">
				<EntityHead e={e} i={i} />
			</span>
			<span className="flex justify-end sm:hidden">
				<ULink
					href={e.driver ? href.driver(e.driver.id) : href.team(e.id)}
					className="border-b-2 pb-0.5 text-right text-[11px] leading-tight font-medium whitespace-normal break-words hyphens-auto"
					style={{ borderColor: COMPARE_COLORS[i] }}
					data-card={e.driver ? `driver:${e.id}` : `team:${e.id}`}
				>
					{shortName(e).split(" ").map(softHyphens).join(" ")}
				</ULink>
			</span>
		</>
	);
}

type Metric = { label: string; short?: string; value: (t: CompareTotals) => number | null; fmt?: (n: number) => string; lowerIsBetter?: boolean; note?: string };

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function metrics(kind: "driver" | "team"): Metric[] {
	const starts = kind === "driver" ? "Starts" : "Races";
	return [
		{ label: kind === "driver" ? "Drivers' titles" : "Constructors' titles", short: "Titles", value: (t) => t.titles },
		{ label: "Wins", value: (t) => t.wins },
		{ label: "Podiums", value: (t) => t.podiums, note: kind === "team" ? "Every podium finish by the team's cars" : undefined },
		{ label: "Poles", value: (t) => t.poles },
		{ label: "Fastest laps", short: "Fast laps", value: (t) => t.fastestLaps },
		{ label: starts, value: (t) => t.starts },
		{ label: "Points", value: (t) => t.points, fmt: num, note: "As awarded at the time, sprints included" },
		{ label: "Win rate", value: (t) => t.winRate, fmt: pct, note: `Wins per ${starts.toLowerCase().slice(0, -1)}` },
		{ label: "Podium rate", short: "Pod. rate", value: (t) => t.podiumRate, fmt: pct, note: kind === "team" ? "Podium finishes per race (two cars can score twice)" : undefined },
		{ label: "Seasons", value: (t) => t.seasons },
		{ label: "Best championship", short: "Best pos.", value: (t) => t.bestChampionship, fmt: (n) => `P${n}`, lowerIsBetter: true },
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

/** Row label: the short form on phones, kept to one line. */
function RowLabel({ label, short }: { label: string; short?: string }) {
	if (!short) return <span className="max-sm:whitespace-nowrap">{label}</span>;
	return (
		<>
			<span className="whitespace-nowrap sm:hidden">{short}</span>
			<span className="hidden sm:inline">{label}</span>
		</>
	);
}

// Phones list up to three title years; longer lists show the first two and count the rest.
const phoneTitles = (years: number[]) => (years.length <= 3 ? years.length : 2);

// Phones: narrow label column and small values so up to four columns fit without scrolling.
const COMPACT = cn(
	"table-fixed max-sm:text-xs max-sm:[&_td]:px-1! max-sm:[&_th]:px-1!",
	"max-sm:[&_td:first-child]:pl-3! max-sm:[&_th:first-child]:pl-3! max-sm:[&_td:last-child]:pr-3! max-sm:[&_th:last-child]:pr-3!",
);

function TotalsTable({ view }: { view: CompareView }) {
	const es = view.entities;
	return (
		<TableCard tableClassName={cn(COMPACT, "sm:min-w-[36rem]")}>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[4.5rem] sm:w-44" />
					{es.map((e, i) => (
						<TableHead key={e.id} className="text-right">
							<ColumnHead e={e} i={i} />
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				<TableRow>
					<TableCell className="text-muted-foreground">Years</TableCell>
					{es.map((e) => (
						<TableCell key={e.id} className="text-right tabular-nums">
							<YearRange from={e.totals.firstYear} to={e.totals.lastYear} className="hidden sm:inline" />
							{e.totals.firstYear && (
								<span className={cn("whitespace-nowrap sm:hidden", es.length > 3 && "text-[11px]")}>
									<SeasonLink year={e.totals.firstYear} />
									{e.totals.lastYear && e.totals.lastYear !== e.totals.firstYear && (
										<>
											–
											{/* Four columns leave no room for a full range on a phone: "1991–12". */}
											<ULink
												href={href.season(e.totals.lastYear)}
												className="underline-offset-4 hover:underline"
												data-card={`season:${e.totals.lastYear}`}
											>
												{es.length > 3 ? String(e.totals.lastYear).slice(2) : e.totals.lastYear}
											</ULink>
										</>
									)}
								</span>
							)}
						</TableCell>
					))}
				</TableRow>
				{metrics(view.kind).map((m) => {
					const values = es.map((e) => m.value(e.totals));
					const lead = leaders(values, m.lowerIsBetter);
					const label = <RowLabel label={m.label} short={m.short} />;
return (
						<TableRow key={m.label}>
							<TableCell className="text-muted-foreground">{m.note ? <Hint label={m.note}>{label}</Hint> : label}</TableCell>
							{values.map((v, i) => (
								<TableCell key={es[i].id} className={cn("text-right tabular-nums", lead.has(i) && LEAD)}>
									{v == null ? "–" : m.fmt ? m.fmt(v) : num(v)}
								</TableCell>
							))}
						</TableRow>
					);
				})}
				<TableRow>
					<TableCell className="text-muted-foreground">
						<RowLabel label="Title years" short="Title yrs" />
					</TableCell>
					{es.map((e) => (
						<TableCell key={e.id} className="text-right whitespace-normal">
							{e.titleYears.length ? (
								<>
									<span className="hidden flex-wrap justify-end gap-x-1.5 sm:inline-flex">
										{e.titleYears.map((y) => (
											<SeasonLink key={y} year={y} />
										))}
									</span>
									<span className="inline-flex flex-wrap justify-end gap-x-1 text-[11px] leading-4 sm:hidden">
										{e.titleYears.slice(0, phoneTitles(e.titleYears)).map((y) => (
											<SeasonLink key={y} year={y} />
										))}
										{e.titleYears.length > phoneTitles(e.titleYears) && (
											<Hint label={e.titleYears.slice(phoneTitles(e.titleYears)).join(", ")}>
												<span className="text-muted-foreground">+{e.titleYears.length - phoneTitles(e.titleYears)}</span>
											</Hint>
										)}
									</span>
								</>
							) : (
								<span className="text-muted-foreground">–</span>
							)}
						</TableCell>
					))}
				</TableRow>
				<TableRow>
					<TableCell className="text-muted-foreground">
						<RowLabel label="First race" short="Debut" />
					</TableCell>
					{es.map((e) => (
						<TableCell key={e.id} className="text-right">
							{e.firstRace && (
								<>
									<RaceLink race={e.firstRace} year className="hidden sm:inline-flex" />
									<ULink
										href={href.race(e.firstRace)}
										className="group/link inline-flex flex-wrap items-center justify-end gap-x-1.5 sm:hidden"
										data-card={`race:${e.firstRace.year}-${e.firstRace.round}`}
										aria-label={`${e.firstRace.year} ${e.firstRace.name}`}
									>
										<Flag code={e.firstRace.country} />
										<span className="tabular-nums underline-offset-4 group-hover/link:underline">{e.firstRace.year}</span>
									</ULink>
								</>
							)}
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
		<TableCard tableClassName={cn(COMPACT, "sm:min-w-[30rem]")}>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[4.5rem] sm:w-28" />
					{entities.map((e, i) => (
						<TableHead key={e.id} className="text-right">
							<ColumnHead e={e} i={i} />
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
							<TableCell className="text-muted-foreground whitespace-nowrap">{s.key === "starts" && kind === "team" ? "Races" : s.label}</TableCell>
							{values.map((v, i) => (
								<TableCell key={entities[i].id} className={cn("text-right tabular-nums", lead.has(i) && LEAD)}>
									{(s.fmt ?? num)(v)}
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
	const together = view.kind === "driver" ? "Races together" : "Races against";
	const pairs = view.h2h.map((h) => ({ h, a: byId.get(h.a)!, b: byId.get(h.b)! }));
	const teammates = (h: CompareView["h2h"][number], suffix = "") =>
		h.teammateRaces ? (
			<ULink href={teammatesHref(h.a, h.b)} className="underline-offset-4 hover:underline">
				{num(h.teammateRaces)} races{suffix}
			</ULink>
		) : null;
	return (
		<>
			<Card className="gap-0 divide-y py-0 sm:hidden">
				{pairs.map(({ h, a, b }) => (
					<div key={`${h.a}-${h.b}`} className="space-y-2 px-4 py-3">
						<div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-baseline text-sm font-medium">
							<span className="truncate">{shortName(a)}</span>
							<span className="text-muted-foreground text-center text-xs font-normal">vs</span>
							<span className="truncate text-right">{shortName(b)}</span>
						</div>
						<DuelBar duel={{ a: h.aAhead, b: h.bAhead }} label={`${nameOf(a)} ahead ${h.aAhead}, ${nameOf(b)} ahead ${h.bAhead}`} />
						<div className="text-muted-foreground flex justify-between gap-2 text-xs tabular-nums">
							<span>
								{num(h.races)} {together.toLowerCase()}
							</span>
							{view.kind === "driver" && teammates(h, " as team-mates")}
						</div>
					</div>
				))}
			</Card>
			<TableCard className="hidden sm:flex">
				<TableHeader>
					<TableRow>
						<TableHead>Pairing</TableHead>
						<TableHead className="text-right">{together}</TableHead>
						<TableHead className="min-w-56">Finished ahead</TableHead>
						{view.kind === "driver" && <TableHead className="text-right">As team-mates</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{pairs.map(({ h, a, b }) => (
						<TableRow key={`${h.a}-${h.b}`}>
							<TableCell className="whitespace-nowrap">
								{nameOf(a)} <span className="text-muted-foreground">vs</span> {nameOf(b)}
							</TableCell>
							<TableCell className="text-right tabular-nums">{num(h.races)}</TableCell>
							<TableCell>
								<DuelBar duel={{ a: h.aAhead, b: h.bAhead }} label={`${nameOf(a)} ahead ${h.aAhead}, ${nameOf(b)} ahead ${h.bAhead}`} />
							</TableCell>
							{view.kind === "driver" && <TableCell className="text-right tabular-nums">{teammates(h) ?? <span className="text-muted-foreground">–</span>}</TableCell>}
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</>
	);
}

function BestSeasons({ entities }: { entities: CompareEntity[] }) {
	return (
		<div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", entities.length > 2 && "xl:grid-cols-4")}>
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
								title={`After ${num(view.afterStarts.n)} ${kind === "driver" ? "starts" : "races"}`}
								description={`Everyone over their first ${num(view.afterStarts.n)} ${kind === "driver" ? "starts" : "races"}, the shortest career here.`}
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
