"use client";

// Records: the catalogue (/records) and one category (/records/...).
// Rendered the same way for reality and for any universe.

import { Fragment, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, ChevronsDown, Search, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Cell, RecordMeta, RecordPageView, RecordRow } from "@/lib/f1/records";
import type { RecordCategoryView, RecordsIndexView } from "@/lib/f1/records";
import {
	CircuitLink,
	DriverLink,
	EngineLink,
	GrandPrixLink,
	MoreLink,
	NationLink,
	Page,
	PageHeader,
	RaceLink,
	RealDiff,
	SeasonLink,
	Section,
	TableCard,
	TeamLink,
	TyreLink,
	DateLink,
} from "../f1";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { ULink } from "../universe-link";

export const recordHref = (id: string) => `/records/${id}`;

/* ------------------------------------------------------------------ cells --- */

function CellView({ cell, strong }: { cell: Cell; strong?: boolean }) {
	const cls = strong ? "font-medium" : undefined;
	switch (cell.t) {
		case "driver":
			return <DriverLink driver={cell.ref} className={cls} />;
		case "team":
			return <TeamLink team={cell.ref} flag className={cls} />;
		case "engine":
			return <EngineLink engine={cell.ref} flag className={cls} />;
		case "tyre":
			return <TyreLink tyre={cell.ref} className={cls} />;
		case "nation":
			return <NationLink nation={cell.ref} className={cls} />;
		case "gp":
			return <GrandPrixLink gp={cell.ref} className={cls} />;
		case "race":
			return <RaceLink race={cell.ref} year className={cls} />;
		case "circuit":
			return <CircuitLink circuit={cell.ref} className={cls} />;
		case "season":
			return <SeasonLink year={cell.year} className={cls} />;
		case "date":
			return <DateLink date={cell.iso} className={cn("text-muted-foreground hover:text-foreground", cls)} />;
		case "number":
			return (
				<Badge variant="outline" className="tabular-nums">
					#{cell.number}
				</Badge>
			);
		case "text":
			return cell.text ? <span className="text-muted-foreground">{cell.text}</span> : null;
	}
}

function Cells({ cells, strong, className }: { cells: Cell[]; strong?: boolean; className?: string }) {
	return (
		<div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
			{/* the spaces are ignored by the flex layout but let the phone detail line wrap as text */}
			{cells.map((c, i) => (
				<Fragment key={i}>
					{i > 0 && " "}
					<CellView cell={c} strong={strong} />
				</Fragment>
			))}
		</div>
	);
}

/** Hover card explaining a data note (limited coverage). */
function NoteCard({ icon, title, note, trigger, className }: { icon: React.ReactNode; title: string; note: string; trigger: React.ReactNode; className?: string }) {
	return (
		<HoverCard>
			<HoverCardTrigger delay={150} render={<span />} className={cn("inline-flex shrink-0 cursor-help", className)} aria-label={`${title}: ${note}`}>
				{trigger}
			</HoverCardTrigger>
			<HoverCardContent side="top" className="w-80 space-y-1.5 rounded-xl p-3">
				<div className="flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground">
					{icon}
					{title}
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">{note}</p>
			</HoverCardContent>
		</HoverCard>
	);
}

/** "Since 1996"-style badge for categories with limited data coverage; the hover card explains why. */
function CoverageBadge({ coverage, className }: { coverage: NonNullable<RecordMeta["coverage"]>; className?: string }) {
	return (
		<NoteCard
			icon={<CalendarRange />}
			title={`Data coverage: ${coverage.label}`}
			note={coverage.note}
			className={className}
			trigger={
				<Badge variant="outline" className="text-muted-foreground h-4 px-1.5 text-[10px] font-normal">
					{coverage.label}
				</Badge>
			}
		/>
	);
}

/* ------------------------------------------------------------------ index --- */

function CategoryLink({ meta, showFamily }: { meta: RecordMeta; showFamily?: boolean }) {
	const label = showFamily ? `${meta.family}: ${meta.title}` : meta.title;
	return (
		<li className="flex items-center gap-1.5 py-0.5 text-sm max-sm:min-h-10 max-sm:py-0">
			<ULink href={recordHref(meta.id)} className="min-w-0 underline-offset-4 hover:underline max-sm:flex-1 max-sm:py-2.5 sm:truncate">
				{label}
			</ULink>
			{meta.coverage && <CoverageBadge coverage={meta.coverage} />}
		</li>
	);
}

/** Phones can't hover the coverage badges, so their notes are written out under the list there. */
function CoverageNotes({ records }: { records: RecordMeta[] }) {
	const notes = [...new Map(records.flatMap((r) => (r.coverage ? [[r.coverage.label, r.coverage] as const] : []))).values()];
	if (!notes.length) return null;
	return (
		<div className="text-muted-foreground mt-2 space-y-1.5 border-t pt-2.5 text-xs leading-relaxed sm:hidden">
			{notes.map((c) => (
				<p key={c.label}>
					<span className="text-foreground font-medium">{c.label}:</span> {c.note}
				</p>
			))}
		</div>
	);
}

function FamilyCard({ family, records }: { family: string; records: RecordMeta[] }) {
	// a family whose every category shares one coverage (e.g. laps led) shows it once in the header
	const shared = records.every((r) => r.coverage?.label && r.coverage.label === records[0].coverage?.label) ? records[0].coverage : undefined;
	return (
		<Card size="sm" className="break-inside-avoid">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 font-semibold">
					{family}
					{shared && <CoverageBadge coverage={shared} />}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="max-sm:divide-y">
					{records.map((m) => (
						<CategoryLink key={m.id} meta={shared ? { ...m, coverage: undefined } : m} />
					))}
				</ul>
				<CoverageNotes records={records} />
			</CardContent>
		</Card>
	);
}

function HighlightCard({ view }: { view: RecordPageView }) {
	return (
		<Section title={view.meta.family} description={view.meta.entity === "constructor" ? "Constructors" : "Drivers"} action={<MoreLink href={recordHref(view.meta.id)}>All</MoreLink>}>
			<TableCard>
				<TableBody>
					{view.rows.map((r) => (
						<TableRow key={r.key}>
							<TableCell className="text-muted-foreground w-10 tabular-nums">{r.rank}</TableCell>
							<TableCell>
								<Cells cells={r.subject} strong />
							</TableCell>
							<TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
								{r.date ? <DateLink date={r.date} /> : r.display}
								<RealDiff real={r.real} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Section>
	);
}

export function RecordsPage({ view }: { view: RecordsIndexView }) {
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const matches = useMemo(() => {
		if (!q) return [];
		const words = q.split(/\s+/);
		return view.sections.map((s) => ({
			...s,
			records: s.families
				.flatMap((f) => f.records)
				.filter((m) => {
					const text = `${s.label} ${m.family} ${m.title} ${m.description}`.toLowerCase();
					return words.every((w) => text.includes(w));
				}),
		}));
	}, [q, view.sections]);
	const found = matches.reduce((n, s) => n + s.records.length, 0);

	return (
		<Page>
			<PageHeader title="Records" eyebrow="Formula 1 World Championship · since 1950">
				Hundreds of records for drivers, constructors, engines, nations and Grands Prix, computed from every World Championship result (F1DB), with laps led and
				other lap-by-lap records from Jolpica since 1996.
			</PageHeader>

			<div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-4">
				{view.highlights.map((h) => (
					<HighlightCard key={h.meta.id} view={h} />
				))}
			</div>

			<Section
				title="All categories"
				description={
					<>
						Badges mark records whose data starts later than 1950
						<span className="hidden sm:inline">; hover them for details</span>
						<span className="sm:hidden">, explained under each list</span>.
					</>
				}
			>
				<InputGroup className="max-w-md">
					<InputGroupAddon>
						<Search />
					</InputGroupAddon>
					<InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. youngest, Monaco" />
					{q && <InputGroupAddon align="inline-end">{found} found</InputGroupAddon>}
				</InputGroup>

				{q ? (
					found ? (
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
							{matches
								.filter((s) => s.records.length)
								.map((s) => (
									<Card key={s.entity} size="sm">
										<CardHeader>
											<CardTitle className="font-semibold">{s.label}</CardTitle>
										</CardHeader>
										<CardContent>
											<ul className="max-sm:divide-y">
												{s.records.map((m) => (
													<CategoryLink key={m.id} meta={m} showFamily />
												))}
											</ul>
											<CoverageNotes records={s.records} />
										</CardContent>
									</Card>
								))}
						</div>
					) : (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Search />
								</EmptyMedia>
								<EmptyTitle>No records match "{query}"</EmptyTitle>
							</EmptyHeader>
						</Empty>
					)
				) : (
					<Tabs defaultValue={view.sections[0]?.entity} className="gap-6">
						<TabsList
							variant="line"
							className="max-sm:h-10 max-sm:w-full max-sm:justify-start max-sm:overflow-x-auto max-sm:pb-2.5 max-sm:pr-10 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)] max-sm:[scrollbar-width:none] max-sm:[&>*]:flex-none sm:flex-wrap"
						>
							{view.sections.map((s) => (
								<TabsTrigger key={s.entity} value={s.entity}>
									{s.label}
								</TabsTrigger>
							))}
						</TabsList>
						{view.sections.map((s) => (
							<TabsContent key={s.entity} value={s.entity} className="columns-1 gap-6 space-y-6 md:columns-2 xl:columns-3 2xl:columns-4">
								{s.families.map((f) => (
									<FamilyCard key={f.family} family={f.family} records={f.records} />
								))}
							</TabsContent>
						))}
					</Tabs>
				)}
			</Section>
		</Page>
	);
}

/* --------------------------------------------------------------- category --- */

const PAGE = 50;
/** Sibling-category chips shown on phones before "Show all". */
const SIBLINGS = 8;

export function RecordCategoryPage({ view }: { view: RecordCategoryView }) {
	const [shown, setShown] = useState(PAGE);
	const [allSiblings, setAllSiblings] = useState(false);
	const { meta } = view;
	const rows: (RecordRow & { real?: string | null })[] = view.rows.slice(0, shown);
	const hasDetail = view.rows.some((r) => r.detail?.length);

	return (
		<Page className="space-y-8">
			<PageHeader
				eyebrow={
					<>
						<ULink href="/records" className="hover:text-foreground underline-offset-4 hover:underline">
							Records
						</ULink>
						<ChevronRight className="size-3.5" />
						<span>{view.entityLabel}</span>
						<ChevronRight className="size-3.5" />
						<span>{meta.family}</span>
					</>
				}
				title={`${meta.family}: ${meta.title}`}
				actions={
					<ULink href="/records" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
						<ChevronLeft data-icon="inline-start" />
						All records
					</ULink>
				}
			>
				{meta.description}
			</PageHeader>

			{meta.coverage && (
				<div className="bg-muted/40 flex max-w-4xl gap-3 rounded-xl border px-4 py-3 text-sm">
					<CalendarRange className="text-muted-foreground mt-0.5 size-4 shrink-0" />
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2 font-medium">
							Data coverage
							<Badge variant="outline">{meta.coverage.label}</Badge>
						</div>
						<p className="text-muted-foreground">{meta.coverage.note}</p>
						{!!view.excludedRaces && (
							<p className="text-universe flex items-start gap-1.5">
								<Sparkles className="mt-0.5 size-3.5 shrink-0" />
								{view.excludedRaces} race{view.excludedRaces === 1 ? "" : "s"} this universe changed {view.excludedRaces === 1 ? "is" : "are"} left out: their real lap data no longer matches the results.
							</p>
						)}
					</div>
				</div>
			)}

			{rows.length === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Trophy />
						</EmptyMedia>
						<EmptyTitle>No one holds this record yet</EmptyTitle>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="space-y-4">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12 max-sm:w-8">#</TableHead>
								<TableHead>{meta.columns.subject}</TableHead>
								<TableHead className="text-right">{meta.columns.value}</TableHead>
								{hasDetail && <TableHead className="hidden sm:table-cell">{meta.columns.detail ?? ""}</TableHead>}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((r) => (
								<TableRow key={r.key}>
									<TableCell className="text-muted-foreground tabular-nums">{r.rank}</TableCell>
									<TableCell className="max-sm:whitespace-normal">
										<Cells cells={r.subject} strong />
										{r.detail && <Cells cells={r.detail} className="mt-1 block text-xs leading-5 text-pretty [word-spacing:0.15em] sm:hidden" />}
									</TableCell>
									<TableCell className={cn("text-right font-semibold whitespace-nowrap tabular-nums", r.date && "max-sm:text-xs max-sm:font-medium")}>
										{r.date ? <DateLink date={r.date} /> : r.display}
										<RealDiff real={r.real} />
									</TableCell>
									{hasDetail && (
										<TableCell className="hidden max-w-[48rem] text-sm whitespace-normal sm:table-cell">
											{r.detail && <Cells cells={r.detail} />}
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</TableCard>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<span className="text-muted-foreground text-sm tabular-nums">
							<span className="hidden sm:inline">Showing </span>
							{rows.length} of {view.total.toLocaleString("en-GB")}
							{view.total > view.rows.length && ` (top ${view.rows.length} listed)`}
						</span>
						{shown < view.rows.length && (
							<div className="flex items-center gap-2">
								<Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
									<ChevronsDown data-icon="inline-start" />
									Show {Math.min(PAGE, view.rows.length - shown)} more
								</Button>
								<Button variant="outline" size="sm" onClick={() => setShown(view.rows.length)}>
									Show all
								</Button>
							</div>
						)}
					</div>
				</div>
			)}

			{view.siblings.length > 1 && (
				<Section title={`More ${meta.family.toLowerCase()} records`}>
					<div className="flex flex-wrap gap-2">
						{view.siblings.map((s, i) =>
							s.id === meta.id ? (
								<Badge key={s.id} variant="secondary" className="h-7 px-3 text-sm">
									{s.title}
								</Badge>
							) : (
								<ULink
									key={s.id}
									href={recordHref(s.id)}
									className={cn(buttonVariants({ variant: "outline", size: "sm" }), !allSiblings && i >= SIBLINGS && "max-sm:hidden")}
								>
									{s.title}
								</ULink>
							),
						)}
						{!allSiblings && view.siblings.some((s, i) => i >= SIBLINGS && s.id !== meta.id) && (
							<Button variant="ghost" size="sm" className="text-muted-foreground sm:hidden" onClick={() => setAllSiblings(true)}>
								<ChevronsDown data-icon="inline-start" />
								Show all {view.siblings.length}
							</Button>
						)}
					</div>
				</Section>
			)}
		</Page>
	);
}
