// Shared building blocks for stats pages, composed from the shadcn components.
// Server-safe (no hooks); links go through ULink so they stay inside the active universe.

import { Fragment } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CircuitRef, DriverRef, EngineRef, GrandPrixRef, NationRef, RaceRef, TeamRef, TyreRef } from "@pitwall/core/f1/views";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Table } from "./ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { ULink } from "./universe-link";

export const href = {
	season: (year: number) => `/seasons/${year}`,
	race: (r: { year: number; round: number }) => `/races/${r.year}/${r.round}`,
	driver: (id: string) => `/drivers/${id}`,
	team: (id: string) => `/constructors/${id}`,
	circuit: (id: string) => `/circuits/${id}`,
	engine: (id: string) => `/engines/${id}`,
	tyre: (id: string) => `/tyres/${id}`,
	nation: (id: string) => `/nations/${id}`,
	diary: (slug: string) => `/diary/${slug}`,
	grandPrix: (id: string) => `/grands-prix/${id}`,
};

/** Hover hint for an inline element (icon, flag, badge), using the shadcn Tooltip. */
export function Hint({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger render={<span />} className={cn("inline-flex shrink-0", className)}>
				{children}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export function Flag({ code, className, title }: { code: string | null | undefined; className?: string; title?: string | null }) {
	if (!code) return <span className={cn("inline-block w-[1.33em] shrink-0", className)} />;
	const flag = <span className={cn(`fi fi-${code.toLowerCase()} shrink-0 rounded-[2px] ring-1 ring-black/5`, className)} aria-label={title ?? undefined} />;
	return title ? <Hint label={title}>{flag}</Hint> : flag;
}

// only the name underlines on hover, not the flag or the gap beside it
const entityLink = "group/link inline-flex min-w-0 items-center gap-2";
const linkName = "truncate underline-offset-4 group-hover/link:underline max-sm:whitespace-normal";

/** "Carlos Sainz Jr." never leaves "Jr." alone on a line. */
const keepSuffix = (name: string) => name.replace(/ (Jr\.|Sr\.|II|III)$/, "\u00a0$1");

export function DriverLink({ driver, className, flag = true }: { driver: DriverRef; className?: string; flag?: boolean }) {
	return (
		<ULink href={href.driver(driver.id)} className={cn(entityLink, className)} data-card={`driver:${driver.id}`}>
			{flag && <Flag code={driver.country} />}
			<span className={linkName}>{keepSuffix(driver.name)}</span>
		</ULink>
	);
}

export function TeamLink({ team, className, flag = false }: { team: TeamRef; className?: string; flag?: boolean }) {
	return (
		<ULink href={href.team(team.id)} className={cn(entityLink, className)} data-card={`team:${team.id}`}>
			{flag && <Flag code={team.country} />}
			<span className={linkName}>{team.name}</span>
		</ULink>
	);
}

export function RaceLink({ race, className, year = false }: { race: RaceRef; className?: string; year?: boolean }) {
	return (
		<ULink href={href.race(race)} className={cn(entityLink, className)} data-card={`race:${race.year}-${race.round}`}>
			<Flag code={race.country} />
			<span className={linkName}>
				{year && `${race.year} `}
				{race.name}
			</span>
		</ULink>
	);
}

export function CircuitLink({ circuit, className }: { circuit: CircuitRef; className?: string }) {
	return (
		<ULink href={href.circuit(circuit.id)} className={cn(entityLink, className)} data-card={`circuit:${circuit.id}`}>
			<Flag code={circuit.country} />
			<span className={linkName}>{circuit.name}</span>
		</ULink>
	);
}

export function EngineLink({ engine, className, flag = false }: { engine: EngineRef; className?: string; flag?: boolean }) {
	return (
		<ULink href={href.engine(engine.id)} className={cn(entityLink, className)} data-card={`engine:${engine.id}`}>
			{flag && <Flag code={engine.country} />}
			<span className={linkName}>{engine.name}</span>
		</ULink>
	);
}

export function TyreLink({ tyre, className, flag = false }: { tyre: TyreRef; className?: string; flag?: boolean }) {
	return (
		<ULink href={href.tyre(tyre.id)} className={cn(entityLink, className)} data-card={`tyre:${tyre.id}`}>
			{flag && <Flag code={tyre.country} />}
			<span className={linkName}>{tyre.name}</span>
		</ULink>
	);
}

export function NationLink({ nation, className, flag = true }: { nation: NationRef; className?: string; flag?: boolean }) {
	return (
		<ULink href={href.nation(nation.id)} className={cn(entityLink, className)} data-card={`nation:${nation.id}`}>
			{flag && <Flag code={nation.country} />}
			<span className={linkName}>{nation.name}</span>
		</ULink>
	);
}

export function GrandPrixLink({ gp, className, flag = true }: { gp: GrandPrixRef; className?: string; flag?: boolean }) {
	return (
		<ULink href={href.grandPrix(gp.id)} className={cn(entityLink, className)} data-card={`grandPrix:${gp.id}`}>
			{flag && <Flag code={gp.country} />}
			<span className={linkName}>{gp.name}</span>
		</ULink>
	);
}

export function SeasonLink({ year, className }: { year: number; className?: string }) {
	return (
		<ULink href={href.season(year)} className={cn("tabular-nums underline-offset-4 hover:underline", className)} data-card={`season:${year}`}>
			{year}
		</ULink>
	);
}

/** "1950–1955" with both years linking to their seasons. */
export function YearRange({ from, to, className }: { from: number | null | undefined; to?: number | null; className?: string }) {
	if (!from) return null;
	if (!to || to === from) return <SeasonLink year={from} className={className} />;
	return (
		<span className={cn("whitespace-nowrap tabular-nums", className)}>
			<SeasonLink year={from} />–<SeasonLink year={to} />
		</span>
	);
}

/** Inline list of entity links with separators. */
export function Join<T>({ items, render, sep = ", " }: { items: T[]; render: (item: T) => React.ReactNode; sep?: string }) {
	return (
		<>
			{items.map((item, i) => {
				// the separator stays on the line of the item before it ("Ferrari," never leaves its comma behind)
				const last = i === items.length - 1;
				const glued = sep.trimEnd();
				return (
					<Fragment key={i}>
						<span className="whitespace-nowrap">
							{render(item)}
							{!last && glued}
						</span>
						{!last && sep.slice(glued.length)}
					</Fragment>
				);
			})}
		</>
	);
}

/** Full-width page container. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
	return <main className={cn("mx-auto w-full max-w-[1680px] space-y-10 px-4 py-6 sm:space-y-12 sm:px-6 sm:py-8 lg:px-10", className)}>{children}</main>;
}

export function PageHeader({
	eyebrow,
	title,
	children,
	actions,
}: {
	eyebrow?: React.ReactNode;
	title: React.ReactNode;
	children?: React.ReactNode;
	actions?: React.ReactNode;
}) {
	return (
		<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div className="min-w-0 space-y-1.5">
				{eyebrow && <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">{eyebrow}</div>}
				<h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
				{children && <div className="text-muted-foreground max-w-3xl text-sm">{children}</div>}
			</div>
			{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
		</header>
	);
}

export function Section({
	title,
	description,
	children,
	className,
	action,
}: {
	title: React.ReactNode;
	description?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	action?: React.ReactNode;
}) {
	return (
		<section className={cn("min-w-0 space-y-4", className)}>
			<div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
				<div className="min-w-0 space-y-0.5">
					<h2 className="text-lg leading-7 font-semibold sm:text-xl sm:leading-8">{title}</h2>
					{description && <p className="text-muted-foreground max-w-3xl text-sm">{description}</p>}
				</div>
				{action && <div className="ml-auto">{action}</div>}
			</div>
			{children}
		</section>
	);
}

/** A shadcn Table inside a Card surface. `maxHeight` (a max-h class) makes long tables scroll inside the card. */
export function TableCard({
	children,
	className,
	tableClassName,
	maxHeight,
}: {
	children: React.ReactNode;
	className?: string;
	tableClassName?: string;
	maxHeight?: string;
}) {
	const table = (
		<Table
			wrapInContainer={!maxHeight}
			className={cn(
				"max-sm:[&_td]:px-1.5 max-sm:[&_th]:px-1.5 max-sm:[&_tr>:nth-last-child(1_of_:not(.hidden))]:pr-4 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4",
				tableClassName,
			)}
		>
			{children}
		</Table>
	);
	return (
		<Card className={cn("gap-0 py-0", className)}>
			{maxHeight ? (
				<ScrollArea scrollBarOrientation="both" viewportClassName={maxHeight}>
					{table}
				</ScrollArea>
			) : (
				table
			)}
		</Card>
	);
}

/** `href` makes the whole card a link (e.g. "#results-wins" to the filtered results list). */
export function StatCard({ label, value, real, className, href: to }: { label: string; value: React.ReactNode; real?: React.ReactNode; className?: string; href?: string }) {
	const card = (
		<Card size="sm" className={cn(to && "group-hover:ring-foreground/25 h-full transition-shadow", !to && className)}>
			{/* values sit on the card's bottom edge, so a two-line label beside a one-line one doesn't stagger them */}
			<CardHeader className="flex h-full flex-col">
				<CardDescription>{label}</CardDescription>
				<CardTitle className="mt-auto text-xl font-semibold tabular-nums break-words sm:text-2xl [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal">{value}</CardTitle>
				{real != null && (
					<Badge variant="outline" className="border-universe/30 text-universe mt-1">
						<Sparkles /> Reality: {real}
					</Badge>
				)}
			</CardHeader>
		</Card>
	);
	return to ? (
		<a href={to} className={cn("group focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2", className)}>
			{card}
		</a>
	) : (
		card
	);
}

const podium: Record<number, string> = {
	1: "bg-gold/25 text-foreground",
	2: "bg-silver/30 text-foreground",
	3: "bg-bronze/25 text-foreground",
};

/** Finishing position / classification badge. */
export function Pos({ text, className }: { text: string; className?: string }) {
	const n = Number(text);
	return (
		<Badge variant={podium[n] ? "secondary" : "ghost"} className={cn("min-w-7 tabular-nums", podium[n], !podium[n] && "text-muted-foreground", className)}>
			{text}
		</Badge>
	);
}

/** "Was X in reality" marker for universe pages. */
export function RealDiff({ real }: { real: string | null | undefined }) {
	if (real == null) return null;
	return (
		<Hint label={`In reality: ${real}`} className="ml-1.5">
			<Badge variant="outline" className="border-universe/30 text-universe h-4 px-1 text-[10px]">
				real {real}
			</Badge>
		</Hint>
	);
}

/** Secondary "see more" link styled as a ghost button. */
export function MoreLink({ href: to, children }: { href: string; children: React.ReactNode }) {
	return (
		<ULink
			href={to}
			className={cn(
				buttonVariants({
					variant: "ghost",
					size: "sm",
					className: "text-muted-foreground",
				}),
			)}
		>
			{children}
			<ChevronRight data-icon="inline-end" />
		</ULink>
	);
}

/** A date, linking to that day in the diary. */
export function DateLink({ date, className }: { date: string; className?: string }) {
	const d = new Date(date + "T00:00:00Z");
	const slug = `${d.getUTCDate()}-${d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }).toLowerCase()}`;
	return (
		<ULink href={href.diary(slug)} className={cn("underline-offset-4 hover:underline", className)}>
			{fmtDate(date)}
		</ULink>
	);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "3 Sep 2023": three-letter months everywhere (en-GB formatting says "Sept"). */
export const fmtDate = (iso: string) => {
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
	return `${d} ${MON[m - 1]} ${y}`;
};

export const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 2 }));
