"use client";

// Searchable, sortable driver and constructor indexes.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, Trophy } from "lucide-react";
import type { ConstructorsView, DriversView } from "@pitwall/core/f1/views";
import { DriverLink, Page, PageHeader, TableCard, TeamLink, YearRange, num } from "../f1";
import { Checkbox } from "../ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { TableSortButton } from "../ui/table-sort-button";

type SortKey = "lastYear" | "titles" | "wins" | "podiums" | "poles" | "starts" | "points" | "name";
type Sort = { key: SortKey; dir: "asc" | "desc" };

function useIndex<T extends { lastYear: number }>(rows: T[], name: (r: T) => string) {
	const [query, setQuery] = useState("");
	const [sort, setSort] = useState<Sort>({ key: "lastYear", dir: "desc" });
	const [currentOnly, setCurrentOnly] = useState(false);
	const maxYear = useMemo(() => Math.max(...rows.map((r) => r.lastYear)), [rows]);
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const list = rows.filter((r) => (!q || name(r).toLowerCase().includes(q)) && (!currentOnly || r.lastYear === maxYear));
		const sign = sort.dir === "desc" ? -1 : 1;
		return [...list].sort((a, b) =>
			sort.key === "name"
				? sign * name(a).localeCompare(name(b))
				: sign * (Number((a as Record<string, unknown>)[sort.key]) - Number((b as Record<string, unknown>)[sort.key])),
		);
	}, [rows, query, sort, currentOnly, maxYear, name]);
	const toggle = (key: SortKey) =>
		setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
	return { query, setQuery, sort, toggle, currentOnly, setCurrentOnly, filtered, maxYear };
}

type Index = ReturnType<typeof useIndex<{ lastYear: number }>>;

function SortHead({ k, label, t, end, className }: { k: SortKey; label: string; t: Pick<Index, "sort" | "toggle">; end?: boolean; className?: string }) {
	return (
		<TableHead className={cn(end && "text-right", className)}>
			<TableSortButton direction={t.sort.key === k ? t.sort.dir : null} onClick={() => t.toggle(k)} align={end ? "end" : "start"} className="-mx-2">
				{label}
			</TableSortButton>
		</TableHead>
	);
}

function Toolbar({ t, placeholder, count }: { t: Index; placeholder: string; count: number }) {
	return (
		<div className="flex flex-wrap items-center gap-4">
			<InputGroup className="max-w-sm">
				<InputGroupAddon>
					<Search />
				</InputGroupAddon>
				<InputGroupInput value={t.query} onChange={(e) => t.setQuery(e.target.value)} placeholder={placeholder} />
			</InputGroup>
			<label className="flex items-center gap-2 text-sm">
				<Checkbox checked={t.currentOnly} onCheckedChange={(v) => t.setCurrentOnly(Boolean(v))} />
				{t.maxYear} only
			</label>
			<span className="text-muted-foreground ml-auto text-sm tabular-nums">{count.toLocaleString()} shown</span>
		</div>
	);
}

const LIMIT = 300;

const blank = (n: number) => (n ? num(n) : "");

/** " Jr." stays with the surname when a name wraps. */
const keepSuffix = <T extends { name: string }>(d: T): T => ({ ...d, name: d.name.replace(/ (Jr\.|Sr\.)$/, "\u00a0$1") });

/** Phone line under the name: the years, plus a small trophy count standing in for the mostly-empty Titles column. */
function PhoneMeta({ from, to, titles }: { from: number; to: number; titles: number }) {
	return (
		<div className="text-muted-foreground flex items-center gap-2 text-xs sm:hidden">
			<YearRange from={from} to={to} />
			{titles > 0 && (
				<span className="text-gold inline-flex items-center gap-0.5 font-medium tabular-nums">
					<Trophy className="size-3" aria-hidden />
					{titles}
					<span className="sr-only"> {titles === 1 ? "title" : "titles"}</span>
				</span>
			)}
		</div>
	);
}

export function DriversPage({ view }: { view: DriversView }) {
	const t = useIndex(view.rows, (r) => r.driver.name);
	return (
		<Page className="space-y-6">
			<PageHeader title="Drivers" eyebrow={`${view.rows.length} World Championship drivers`}>
				Everyone who has entered a World Championship Grand Prix.
			</PageHeader>
			<Toolbar t={t as unknown as Index} placeholder="Search drivers" count={t.filtered.length} />
			<TableCard>
				<TableHeader>
					<TableRow>
						<SortHead k="name" label="Driver" t={t} className="max-sm:w-full" />
						<SortHead k="lastYear" label="Years" t={t} className="hidden sm:table-cell" />
						<SortHead k="titles" label="Titles" t={t} end className="hidden sm:table-cell" />
						<SortHead k="starts" label="Starts" t={t} end />
						<SortHead k="wins" label="Wins" t={t} end className="max-sm:pr-4!" />
						<SortHead k="podiums" label="Podiums" t={t} end className="hidden sm:table-cell" />
						<SortHead k="poles" label="Poles" t={t} end className="hidden sm:table-cell" />
						<SortHead k="points" label="Points" t={t} end className="hidden sm:table-cell" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{t.filtered.slice(0, LIMIT).map((r) => (
						<TableRow key={r.driver.id}>
							<TableCell>
								<DriverLink driver={keepSuffix(r.driver)} className="font-medium" />
								<PhoneMeta from={r.firstYear} to={r.lastYear} titles={r.titles} />
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell tabular-nums">
								<YearRange from={r.firstYear} to={r.lastYear} />
							</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.titles)}</TableCell>
							<TableCell className="text-right tabular-nums">{r.starts}</TableCell>
							<TableCell className="text-right tabular-nums max-sm:pr-4!">{blank(r.wins)}</TableCell>
							<TableCell className="hidden sm:table-cell text-right tabular-nums">{blank(r.podiums)}</TableCell>
							<TableCell className="hidden sm:table-cell text-right tabular-nums">{blank(r.poles)}</TableCell>
							<TableCell className="hidden sm:table-cell text-right tabular-nums">{blank(r.points)}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
			{t.filtered.length > LIMIT && <p className="text-muted-foreground text-sm">Showing the first {LIMIT}. Search to narrow down.</p>}
		</Page>
	);
}

export function ConstructorsPage({ view }: { view: ConstructorsView }) {
	const t = useIndex(view.rows, (r) => r.team.name);
	return (
		<Page className="space-y-6">
			<PageHeader title="Constructors" eyebrow={`${view.rows.length} constructors`}>
				Every chassis constructor to enter a World Championship race.
			</PageHeader>
			<Toolbar t={t as unknown as Index} placeholder="Search constructors" count={t.filtered.length} />
			<TableCard>
				<TableHeader>
					<TableRow>
						<SortHead k="name" label="Constructor" t={t} className="max-sm:w-full" />
						<SortHead k="lastYear" label="Years" t={t} className="hidden sm:table-cell" />
						<SortHead k="titles" label="Titles" t={t} end className="hidden sm:table-cell" />
						<SortHead k="starts" label="Races" t={t} end />
						<SortHead k="wins" label="Wins" t={t} end className="max-sm:pr-4!" />
						<SortHead k="podiums" label="Podiums" t={t} end className="hidden sm:table-cell" />
						<SortHead k="poles" label="Poles" t={t} end className="hidden sm:table-cell" />
						<SortHead k="points" label="Points" t={t} end className="hidden sm:table-cell" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{t.filtered.slice(0, LIMIT).map((r) => (
						<TableRow key={r.team.id}>
							<TableCell className="max-sm:max-w-48">
								<TeamLink team={r.team} flag className="max-w-full font-medium" />
								<PhoneMeta from={r.firstYear} to={r.lastYear} titles={r.titles} />
							</TableCell>
							<TableCell className="text-muted-foreground hidden sm:table-cell tabular-nums">
								<YearRange from={r.firstYear} to={r.lastYear} />
							</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">{blank(r.titles)}</TableCell>
							<TableCell className="text-right tabular-nums">{r.starts}</TableCell>
							<TableCell className="text-right tabular-nums max-sm:pr-4!">{blank(r.wins)}</TableCell>
							<TableCell className="hidden sm:table-cell text-right tabular-nums">{blank(r.podiums)}</TableCell>
							<TableCell className="hidden sm:table-cell text-right tabular-nums">{blank(r.poles)}</TableCell>
							<TableCell className="hidden sm:table-cell text-right tabular-nums">{blank(r.points)}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</TableCard>
		</Page>
	);
}
