"use client";

// Fantasy: Through the Eras (/play/fantasy). Draft driver-seasons and a constructor-season
// from any era under a budget, then lock in to score them against what really happened.
// Data is a static file (public/data/fantasy.json); prices, rules, scoring, the random-team
// benchmark and the dream race come from lib/game/fantasy. Teams and best scores live in localStorage.

import { ScrollArea } from "@/components/ui/scroll-area";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, ChevronDown, ChevronRight, Dices, Lock, Pencil, Plus, Search, Share2, Shuffle, Star, Trash2, Trophy, X } from "lucide-react";
import {
	dailyChallenge,
	DREAM_DEFAULTS,
	EMPTY_TEAM,
	FREE_PLAY,
	addBlocker,
	driverIneligible,
	makePool,
	teamIneligible,
	percentile,
	randomTeamScores,
	rating,
	rulesSummary,
	scoreTeam,
	shareText,
	simulateDream,
	teamAddBlocker,
	teamCost,
	teamIssues,
	todayUtc,
	unpackFantasy,
	DNF,
	DNS,
	DSQ,
	NC,
	type Challenge,
	type DreamCars,
	type DreamResult,
	type DriverSeason,
	type FantasyFile,
	type Pool,
	type RaceScore,
	type Rules,
	type Team,
	type TeamSeason,
} from "@/lib/game/fantasy";
import { hash } from "@/lib/sim/random";
import { cn } from "@/lib/utils";
import { Flag, Hint, href, num, Page, PageHeader, Section, StatCard, TableCard } from "../f1";
import { ULink } from "../universe-link";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

/* ------------------------------------------------------------------ data --- */

let dataPromise: Promise<Pool> | undefined;
const loadPool = () =>
	(dataPromise ??= fetch("/data/fantasy.json")
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<FantasyFile>;
		})
		.then((f) => makePool(unpackFantasy(f)))
		.catch((e) => {
			dataPromise = undefined;
			throw e;
		}));

const benchmarks = new Map<string, number[]>();
/** Scores of random valid teams for a challenge, computed once per session. */
const benchmarkFor = (pool: Pool, c: Challenge) => {
	let b = benchmarks.get(c.id);
	if (!b) benchmarks.set(c.id, (b = randomTeamScores(pool, c.rules, hash("fantasy-benchmark", c.id), 1500)));
	return b;
};

const KEY = "pitwall-fantasy";
function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(`${KEY}:${key}`);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}
function write(key: string, value: unknown) {
	try {
		localStorage.setItem(`${KEY}:${key}`, JSON.stringify(value));
	} catch {}
}

type Mode = "daily" | "free";
type Saved = { team: Team; locked: boolean };
type Best = Record<string, { score: number; pct: number; team: Team; date: string }>;

const money = (n: number) => `${num(Math.round(n * 10) / 10)}M`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/* ------------------------------------------------------------------ game --- */

export function FantasyGame() {
	const [pool, setPool] = useState<Pool | null>(null);
	const [error, setError] = useState(false);
	const [today, setToday] = useState<string | null>(null);
	const [mode, setModeState] = useState<Mode>("daily");
	const [saved, setSaved] = useState<Saved>({ team: EMPTY_TEAM, locked: false });
	const [best, setBest] = useState<Best>({});

	const load = useCallback(() => {
		setError(false);
		loadPool()
			.then(setPool)
			.catch(() => setError(true));
	}, []);

	useEffect(() => {
		load();
		setToday(todayUtc());
		setModeState(read<Mode>("mode", "daily") === "free" ? "free" : "daily");
		setBest(read<Best>("best", {}));
	}, [load]);

	const challenge: Challenge | null = useMemo(() => {
		if (!pool || !today) return null;
		if (mode === "daily") return dailyChallenge(pool.data, today);
		return { id: "free", title: "Free play", description: "Any era, any team: the standard 100M budget.", rules: FREE_PLAY };
	}, [pool, today, mode]);

	const saveKey = challenge ? (mode === "daily" ? challenge.id : "free") : null;
	useEffect(() => {
		if (!saveKey || !pool) return;
		const s = read<Saved>(`team:${saveKey}`, { team: EMPTY_TEAM, locked: false });
		// drop picks the current data no longer has
		const team: Team = {
			drivers: (s.team?.drivers ?? []).filter((id) => pool.ds.has(id)),
			constructor: s.team?.constructor && pool.cs.has(s.team.constructor) ? s.team.constructor : null,
			captain: s.team?.captain && pool.ds.has(s.team.captain) ? s.team.captain : null,
		};
		setSaved({ team, locked: !!s.locked && !teamIssues(pool, team, challenge!.rules).length });
	}, [saveKey, pool]);

	const update = (next: Saved) => {
		setSaved(next);
		if (saveKey) write(`team:${saveKey}`, next);
	};
	const setTeam = (team: Team) => update({ team, locked: false });
	const setMode = (m: Mode) => {
		setModeState(m);
		write("mode", m);
	};

	const benchmark = useMemo(() => (pool && challenge && saved.locked ? benchmarkFor(pool, challenge) : null), [pool, challenge, saved.locked]);

	const lockIn = () => {
		if (!pool || !challenge) return;
		update({ ...saved, locked: true });
		const result = scoreTeam(pool, saved.team);
		const pct = percentile(benchmarkFor(pool, challenge), result.total);
		const prev = best[challenge.id];
		if (!prev || result.total > prev.score) {
			const next = { ...best, [challenge.id]: { score: result.total, pct, team: saved.team, date: today ?? "" } };
			setBest(next);
			write("best", next);
			if (prev) toast.success(`New best for ${challenge.title}: ${num(result.total)} pts`);
		}
		requestAnimationFrame(() => document.getElementById("fantasy-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
	};

	return (
		<Page>
			<PageHeader
				eyebrow={
					<>
						<ULink href="/play" className="underline-offset-4 hover:underline">
							Play
						</ULink>
						<ChevronRight className="size-3.5" />
						<span>Fantasy</span>
					</>
				}
				title="Fantasy: Through the Eras"
				actions={
					<ToggleGroup variant="outline" spacing={0} value={mode} onValueChange={(v: string) => v && setMode(v as Mode)}>
						<ToggleGroupItem value="daily">
							<CalendarDays /> Daily challenge
						</ToggleGroupItem>
						<ToggleGroupItem value="free">
							<Shuffle /> Free play
						</ToggleGroupItem>
					</ToggleGroup>
				}
			>
				Draft five driver-seasons and a constructor-season from any year since 1950. Every pick is scored by replaying its real season with one points table for
				every era, averaged per race, so a seven-race 1950s season and a 24-race modern one count the same.
			</PageHeader>

			{error ? (
				<Card>
					<CardContent className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground">The fantasy data couldn&apos;t be loaded.</span>
						<Button variant="outline" onClick={load}>
							Try again
						</Button>
					</CardContent>
				</Card>
			) : !pool || !challenge ? (
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
					<Skeleton className="h-[640px] rounded-3xl" />
					<Skeleton className="h-[480px] rounded-3xl" />
				</div>
			) : (
				<>
					<ChallengeCard challenge={challenge} pool={pool} mode={mode} best={best[challenge.id]} />
					<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
						<div className="min-w-0 lg:order-1">
							{saved.locked ? (
								<Results pool={pool} challenge={challenge} team={saved.team} benchmark={benchmark} />
							) : (
								<Picker pool={pool} rules={challenge.rules} team={saved.team} onChange={setTeam} />
							)}
						</div>
						<div className="lg:sticky lg:top-20 lg:order-2">
							<TeamSheet
								pool={pool}
								rules={challenge.rules}
								team={saved.team}
								locked={saved.locked}
								daily={mode === "daily"}
								onChange={setTeam}
								onLock={lockIn}
								onEdit={() => update({ ...saved, locked: false })}
							/>
						</div>
					</div>
					{saved.locked && <DreamRace pool={pool} team={saved.team} seedKey={challenge.id} />}
					<Scoring />
				</>
			)}
		</Page>
	);
}

function ChallengeCard({ challenge, pool, mode, best }: { challenge: Challenge; pool: Pool; mode: Mode; best?: Best[string] }) {
	const daily = challenge as Challenge & { number?: number; date?: string };
	return (
		<Card size="sm">
			<CardHeader className="gap-2 md:grid-cols-[1fr_auto]">
				<div className="space-y-1.5">
					<CardDescription>{mode === "daily" ? `Daily challenge #${daily.number} · ${daily.date}` : "Free play"}</CardDescription>
					<CardTitle className="text-xl font-semibold">{challenge.title}</CardTitle>
					<p className="text-muted-foreground text-sm">{challenge.description}</p>
					<div className="flex flex-wrap gap-1.5 pt-1">
						{rulesSummary(pool.data, challenge.rules).map((r) => (
							<Badge key={r} variant="secondary">
								{r}
							</Badge>
						))}
					</div>
				</div>
				{best && (
					<div className="flex items-center gap-3 self-center rounded-2xl border px-4 py-2.5">
						<Trophy className="text-gold size-5" />
						<div>
							<div className="text-muted-foreground text-xs">Your best</div>
							<div className="font-semibold tabular-nums">
								{num(best.score)} pts <span className="text-muted-foreground font-normal">· {rating(best.pct).label}</span>
							</div>
						</div>
					</div>
				)}
			</CardHeader>
		</Card>
	);
}

/* ---------------------------------------------------------------- picker --- */

type Sort = "price" | "price-asc" | "year" | "year-asc" | "name";
const SORTS: { value: Sort; label: string }[] = [
	{ value: "price", label: "Price, high to low" },
	{ value: "price-asc", label: "Price, low to high" },
	{ value: "year", label: "Newest first" },
	{ value: "year-asc", label: "Oldest first" },
	{ value: "name", label: "Name" },
];
const PAGE = 50;

function Choice<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; label: string }) {
	return (
		<Select items={options} value={value} onValueChange={(v) => onChange(v as T)}>
			<SelectTrigger className={cn("w-full", className)} aria-label={label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Picker({ pool, rules, team, onChange }: { pool: Pool; rules: Rules; team: Team; onChange: (t: Team) => void }) {
	const { data } = pool;
	const [tab, setTab] = useState<"drivers" | "teams">("drivers");
	const [q, setQ] = useState("");
	const [decade, setDecade] = useState("all");
	const [teamFilter, setTeamFilter] = useState("all");
	const [nation, setNation] = useState("all");
	const [sort, setSort] = useState<Sort>("price");
	const [onlyPickable, setOnlyPickable] = useState(false);
	const [limit, setLimit] = useState(PAGE);
	const search = useRef<HTMLInputElement>(null);

	useEffect(() => setLimit(PAGE), [tab, q, decade, teamFilter, nation, sort, onlyPickable]);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
				e.preventDefault();
				search.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const decades = useMemo(() => {
		const out = [{ value: "all", label: "All decades" }];
		for (let d = Math.floor(data.from / 10) * 10; d <= data.to; d += 10) out.push({ value: String(d), label: `${d}s` });
		return out;
	}, [data]);
	const teamOptions = useMemo(() => {
		const count = new Map<string, number>();
		for (const s of data.cs) count.set(s.t, (count.get(s.t) ?? 0) + 1);
		return [{ value: "all", label: "All teams" }, ...[...count].sort((a, b) => b[1] - a[1] || data.teams[a[0]][0].localeCompare(data.teams[b[0]][0])).map(([id]) => ({ value: id, label: data.teams[id][0] }))];
	}, [data]);
	const nationOptions = useMemo(() => {
		const count = new Map<string, number>();
		for (const s of data.ds) count.set(data.drivers[s.d][1], (count.get(data.drivers[s.d][1]) ?? 0) + 1);
		return [{ value: "all", label: "All nations" }, ...[...count].sort((a, b) => b[1] - a[1]).map(([id]) => ({ value: id, label: data.nations[id]?.[0] ?? id }))];
	}, [data]);

	const terms = fold(q).split(/\s+/).filter(Boolean);
	const matchYear = (y: number) => (decade === "all" || Math.floor(y / 10) * 10 === Number(decade));

	const drivers = useMemo(() => {
		if (tab !== "drivers") return [];
		const list = data.ds.filter((s) => {
			if (!matchYear(s.y) || driverIneligible(s, rules)) return false;
			if (teamFilter !== "all" && !s.t.includes(teamFilter)) return false;
			if (nation !== "all" && data.drivers[s.d][1] !== nation) return false;
			if (terms.length) {
				const hay = fold(`${data.drivers[s.d][0]} ${s.y} ${s.t.map((t) => data.teams[t][0]).join(" ")}`);
				if (!terms.every((t) => hay.includes(t))) return false;
			}
			if (onlyPickable && !team.drivers.includes(s.id) && addBlocker(pool, team, rules, s)) return false;
			return true;
		});
		return sortSeasons(list, sort, (s) => data.drivers[s.d][0]);
	}, [tab, data, decade, teamFilter, nation, q, sort, onlyPickable, team, rules, pool]);

	const teams = useMemo(() => {
		if (tab !== "teams") return [];
		const list = data.cs.filter((s) => {
			if (!matchYear(s.y) || teamIneligible(s, rules)) return false;
			if (teamFilter !== "all" && s.t !== teamFilter) return false;
			if (nation !== "all" && data.teams[s.t][1] !== nation) return false;
			if (terms.length) {
				const hay = fold(`${data.teams[s.t][0]} ${s.y} ${s.ds.map((d) => data.drivers[d]?.[0]).join(" ")}`);
				if (!terms.every((t) => hay.includes(t))) return false;
			}
			if (onlyPickable && team.constructor !== s.id && teamAddBlocker(pool, team, rules, s)) return false;
			return true;
		});
		return sortSeasons(list, sort, (s) => data.teams[s.t][0]);
	}, [tab, data, decade, teamFilter, nation, q, sort, onlyPickable, team, rules, pool]);

	const toggleDriver = (s: DriverSeason) => {
		if (team.drivers.includes(s.id)) onChange({ ...team, drivers: team.drivers.filter((id) => id !== s.id), captain: team.captain === s.id ? null : team.captain });
		else if (!addBlocker(pool, team, rules, s)) onChange({ ...team, drivers: [...team.drivers, s.id] });
	};
	const toggleTeam = (s: TeamSeason) => {
		if (team.constructor === s.id) onChange({ ...team, constructor: null });
		else if (!teamAddBlocker(pool, team, rules, s)) onChange({ ...team, constructor: s.id });
	};
	const count = tab === "drivers" ? drivers.length : teams.length;

	return (
		<Card className="gap-0 py-0">
			<Tabs value={tab} onValueChange={(v) => setTab(v as "drivers" | "teams")} className="gap-0">
				<div className="space-y-3 border-b p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<TabsList>
							<TabsTrigger value="drivers">
								Drivers <span className="text-muted-foreground tabular-nums">{team.drivers.length}/{rules.drivers}</span>
							</TabsTrigger>
							<TabsTrigger value="teams">
								Constructor <span className="text-muted-foreground tabular-nums">{team.constructor ? 1 : 0}/1</span>
							</TabsTrigger>
						</TabsList>
						<div className="flex items-center gap-2">
							<Switch id="fantasy-pickable" checked={onlyPickable} onCheckedChange={setOnlyPickable} />
							<Label htmlFor="fantasy-pickable" className="text-muted-foreground text-sm font-normal">
								Only what I can pick
							</Label>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
						<div className="relative col-span-2 md:col-span-4 2xl:col-span-1">
							<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
							<Input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "drivers" ? "Driver, team or year" : "Team, driver or year"} className="pr-9 pl-8" aria-label="Search" />
							{q ? (
								<button type="button" onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2" aria-label="Clear search">
									<X className="size-4" />
								</button>
							) : (
								<Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
							)}
						</div>
						<Choice label="Decade" value={decade} onChange={setDecade} options={decades} />
						<Choice label="Team" value={teamFilter} onChange={setTeamFilter} options={teamOptions} />
						<Choice label="Nation" value={nation} onChange={setNation} options={nationOptions} />
						<Choice label="Sort" value={sort} onChange={setSort} options={SORTS} />
					</div>
				</div>
				<TabsContent value="drivers">
					<ul className="divide-y" aria-label="Driver-seasons">
						{drivers.slice(0, limit).map((s) => (
							<DriverRow key={s.id} pool={pool} s={s} picked={team.drivers.includes(s.id)} blocker={team.drivers.includes(s.id) ? null : addBlocker(pool, team, rules, s)} onToggle={() => toggleDriver(s)} />
						))}
					</ul>
				</TabsContent>
				<TabsContent value="teams">
					<ul className="divide-y" aria-label="Constructor-seasons">
						{teams.slice(0, limit).map((s) => (
							<TeamRow key={s.id} pool={pool} s={s} picked={team.constructor === s.id} blocker={team.constructor === s.id ? null : teamAddBlocker(pool, team, rules, s)} onToggle={() => toggleTeam(s)} />
						))}
					</ul>
				</TabsContent>
				<div className="text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
					<span className="tabular-nums">
						{count ? `${num(Math.min(limit, count))} of ${num(count)}` : "Nothing matches these filters"}
					</span>
					{count > limit && (
						<Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
							Show more
						</Button>
					)}
				</div>
			</Tabs>
		</Card>
	);
}

function sortSeasons<T extends { y: number; p: number; id: string }>(list: T[], sort: Sort, name: (s: T) => string): T[] {
	const cmp: Record<Sort, (a: T, b: T) => number> = {
		price: (a, b) => b.p - a.p || b.y - a.y,
		"price-asc": (a, b) => a.p - b.p || b.y - a.y,
		year: (a, b) => b.y - a.y || b.p - a.p,
		"year-asc": (a, b) => a.y - b.y || b.p - a.p,
		name: (a, b) => name(a).localeCompare(name(b)) || a.y - b.y,
	};
	return [...list].sort(cmp[sort]);
}

function PickButton({ picked, blocker, onToggle, label }: { picked: boolean; blocker: string | null; onToggle: () => void; label: string }) {
	const button = (
		<Button
			variant={picked ? "secondary" : "outline"}
			size="sm"
			className="w-[4.75rem]"
			disabled={!picked && !!blocker}
			onClick={onToggle}
			aria-pressed={picked}
			aria-label={picked ? `Remove ${label}` : blocker ? `${label}: ${blocker}` : `Add ${label}`}
		>
			{picked ? <Check /> : <Plus />}
			{picked ? "Picked" : "Add"}
		</Button>
	);
	return blocker && !picked ? <Hint label={blocker}>{button}</Hint> : button;
}

const statLine = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

function DriverRow({ pool, s, picked, blocker, onToggle }: { pool: Pool; s: DriverSeason; picked: boolean; blocker: string | null; onToggle: () => void }) {
	const { data } = pool;
	const [name, nation] = data.drivers[s.d];
	const label = `${name} ${s.y}`;
	return (
		<li className={cn("flex items-center gap-3 px-4 py-2.5", picked && "bg-primary/5")}>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
					<Flag code={data.nations[nation]?.[1]} title={data.nations[nation]?.[0]} />
					<ULink href={href.driver(s.d)} className="truncate font-medium underline-offset-4 hover:underline" data-card={`driver:${s.d}`}>
						{name}
					</ULink>
					<span className="text-muted-foreground tabular-nums">{s.y}</span>
					{s.cp === 1 && (
						<Badge variant="secondary" className="bg-gold/25 h-4 px-1.5 text-[10px]">
							Champion
						</Badge>
					)}
					<span className="text-muted-foreground truncate text-xs">{s.t.map((t) => data.teams[t]?.[0]).join(", ")}</span>
				</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{statLine([s.cp ? `${ordinal(s.cp)} in the championship` : "Unclassified", `${num(s.pts)} pts`, `${s.st} starts`, s.w > 0 && `${s.w} win${s.w === 1 ? "" : "s"}`, s.pod > 0 && `${s.pod} podium${s.pod === 1 ? "" : "s"}`, s.pl > 0 && `${s.pl} pole${s.pl === 1 ? "" : "s"}`])}
				</div>
				<FormLine pool={pool} year={s.y} finishes={new Map(s.r.map((r) => [r[0], r[1]]))} />
			</div>
			<div className="w-14 text-right font-semibold tabular-nums">{money(s.p)}</div>
			<PickButton picked={picked} blocker={blocker} onToggle={onToggle} label={label} />
		</li>
	);
}

function TeamRow({ pool, s, picked, blocker, onToggle }: { pool: Pool; s: TeamSeason; picked: boolean; blocker: string | null; onToggle: () => void }) {
	const { data } = pool;
	const [name, nation] = data.teams[s.t];
	const best = (a: number, b: number) => (a >= 1 && (b < 1 || a < b) ? a : b >= 1 ? b : a);
	return (
		<li className={cn("flex items-center gap-3 px-4 py-2.5", picked && "bg-primary/5")}>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
					<Flag code={data.nations[nation]?.[1]} title={data.nations[nation]?.[0]} />
					<ULink href={href.team(s.t)} className="truncate font-medium underline-offset-4 hover:underline" data-card={`team:${s.t}`}>
						{name}
					</ULink>
					<span className="text-muted-foreground tabular-nums">{s.y}</span>
					{s.cp === 1 && s.y >= 1958 && (
						<Badge variant="secondary" className="bg-gold/25 h-4 px-1.5 text-[10px]">
							Champion
						</Badge>
					)}
					<span className="text-muted-foreground truncate text-xs">{s.ds.map((d) => data.drivers[d]?.[0]).join(", ")}</span>
				</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{statLine([s.cp ? `${ordinal(s.cp)} among constructors` : "Unranked", `${num(s.pts)} pts`, `${s.st} races`, s.w > 0 && `${s.w} win${s.w === 1 ? "" : "s"}`, s.pod > 0 && `${s.pod} podium${s.pod === 1 ? "" : "s"}`])}
				</div>
				<FormLine pool={pool} year={s.y} finishes={new Map(s.r.map((r) => [r[0], best(r[1], r[2])]))} />
			</div>
			<div className="w-14 text-right font-semibold tabular-nums">{money(s.p)}</div>
			<PickButton picked={picked} blocker={blocker} onToggle={onToggle} label={`${name} ${s.y}`} />
		</li>
	);
}

const finishText = (f: number | undefined) => (f == null ? "–" : f >= 1 ? String(f) : f === DNF ? "R" : f === DSQ ? "DQ" : f === NC ? "NC" : f === DNS ? "NS" : "–");
const finishTone = (f: number | undefined) =>
	f == null
		? "text-muted-foreground/50"
		: f === 1
			? "bg-gold/30 text-foreground"
			: f === 2
				? "bg-silver/35 text-foreground"
				: f === 3
					? "bg-bronze/30 text-foreground"
					: f >= 4 && f <= 10
						? "bg-muted text-foreground"
						: f === DNF || f === DSQ
							? "bg-destructive/10 text-destructive"
							: "text-muted-foreground";

/** One chip per round of the season: finishing position, R = retired, NS = didn't start, – = not entered. */
function FormLine({ pool, year, finishes }: { pool: Pool; year: number; finishes: Map<number, number> }) {
	const rounds = pool.data.races[year] ?? [];
	return (
		<div className="flex flex-wrap gap-0.5" aria-label={`Form: ${rounds.map(([r]) => finishText(finishes.get(r))).join(", ")}`}>
			{rounds.map(([round]) => {
				const f = finishes.get(round);
				return (
					<span key={round} className={cn("inline-flex h-4 min-w-5 items-center justify-center rounded-[4px] px-0.5 text-[10px] leading-none font-medium tabular-nums", finishTone(f))}>
						{finishText(f)}
					</span>
				);
			})}
		</div>
	);
}

/* ------------------------------------------------------------ team sheet --- */

function TeamSheet({
	pool,
	rules,
	team,
	locked,
	daily,
	onChange,
	onLock,
	onEdit,
}: {
	pool: Pool;
	rules: Rules;
	team: Team;
	locked: boolean;
	daily: boolean;
	onChange: (t: Team) => void;
	onLock: () => void;
	onEdit: () => void;
}) {
	const { data } = pool;
	const cost = teamCost(pool, team);
	const left = rules.budget - cost;
	const issues = teamIssues(pool, team, rules);
	const pct = Math.min(100, (cost / rules.budget) * 100);
	const picks = team.drivers.map((id) => pool.ds.get(id)!).filter(Boolean);
	const c = team.constructor ? pool.cs.get(team.constructor) : null;
	const slots = Array.from({ length: rules.drivers }, (_, i) => picks[i] ?? null);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2 text-base font-semibold">
					Your team
					{!locked && (team.drivers.length > 0 || team.constructor) && (
						<Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange(EMPTY_TEAM)}>
							<Trash2 /> Clear
						</Button>
					)}
				</CardTitle>
				<div className="space-y-1.5 pt-1">
					<div className="flex items-baseline justify-between text-sm tabular-nums">
						<span>
							<span className="font-semibold">{money(cost)}</span> <span className="text-muted-foreground">of {money(rules.budget)}</span>
						</span>
						<span className={cn("font-medium", left < 0 ? "text-destructive" : "text-muted-foreground")}>{left < 0 ? `${money(-left)} over` : `${money(left)} left`}</span>
					</div>
					<div
						className="bg-muted h-2 overflow-hidden rounded-full"
						role="meter"
						aria-label="Budget spent"
						aria-valuemin={0}
						aria-valuemax={rules.budget}
						aria-valuenow={cost}
					>
						<div className={cn("h-full rounded-full transition-[width]", left < 0 ? "bg-destructive" : pct > 90 ? "bg-gold" : "bg-primary")} style={{ width: `${pct}%` }} />
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<ul className="space-y-1.5" aria-label="Drivers">
					{slots.map((s, i) =>
						s ? (
							<li key={s.id} className="bg-muted/50 flex items-center gap-2 rounded-xl px-2.5 py-1.5">
								<Flag code={data.nations[data.drivers[s.d][1]]?.[1]} title={data.nations[data.drivers[s.d][1]]?.[0]} />
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium">
										{data.drivers[s.d][0]} <span className="text-muted-foreground tabular-nums">{s.y}</span>
									</div>
									<div className="text-muted-foreground truncate text-xs">{data.teams[s.t[0]]?.[0]}</div>
								</div>
								<span className="text-sm tabular-nums">{money(s.p)}</span>
								<Hint label={team.captain === s.id ? "Captain: scores double" : "Make captain (double points)"}>
									<Button
										variant="ghost"
										size="icon-xs"
										disabled={locked}
										aria-pressed={team.captain === s.id}
										aria-label={`${team.captain === s.id ? "Remove captaincy from" : "Make captain:"} ${data.drivers[s.d][0]}`}
										onClick={() => onChange({ ...team, captain: team.captain === s.id ? null : s.id })}
									>
										<Star className={cn(team.captain === s.id ? "fill-gold text-gold" : "text-muted-foreground")} />
									</Button>
								</Hint>
								{!locked && (
									<Button variant="ghost" size="icon-xs" aria-label={`Remove ${data.drivers[s.d][0]} ${s.y}`} onClick={() => onChange({ ...team, drivers: team.drivers.filter((id) => id !== s.id), captain: team.captain === s.id ? null : team.captain })}>
										<X />
									</Button>
								)}
							</li>
						) : (
							<li key={`empty-${i}`} className="text-muted-foreground flex h-[46px] items-center gap-2 rounded-xl border border-dashed px-3 text-sm">
								Driver {i + 1}
							</li>
						),
					)}
				</ul>
				<div>
					<div className="text-muted-foreground mb-1.5 text-xs font-medium">Constructor</div>
					{c ? (
						<div className="bg-muted/50 flex items-center gap-2 rounded-xl px-2.5 py-1.5">
							<Flag code={data.nations[data.teams[c.t][1]]?.[1]} title={data.nations[data.teams[c.t][1]]?.[0]} />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">
									{data.teams[c.t][0]} <span className="text-muted-foreground tabular-nums">{c.y}</span>
								</div>
								<div className="text-muted-foreground truncate text-xs">{c.ds.map((d) => data.drivers[d]?.[0]).join(", ")}</div>
							</div>
							<span className="text-sm tabular-nums">{money(c.p)}</span>
							{!locked && (
								<Button variant="ghost" size="icon-xs" aria-label={`Remove ${data.teams[c.t][0]} ${c.y}`} onClick={() => onChange({ ...team, constructor: null })}>
									<X />
								</Button>
							)}
						</div>
					) : (
						<div className="text-muted-foreground flex h-[46px] items-center rounded-xl border border-dashed px-3 text-sm">Constructor</div>
					)}
				</div>
				{locked ? (
					daily ? (
						<p className="text-muted-foreground flex items-center gap-2 text-sm">
							<Lock className="size-4" /> Locked in for today. A new challenge starts at midnight UTC.
						</p>
					) : (
						<Button variant="outline" className="w-full" onClick={onEdit}>
							<Pencil /> Edit team
						</Button>
					)
				) : (
					<div className="space-y-3">
						{issues.length > 0 && (
							<ul className="text-muted-foreground space-y-0.5 text-sm">
								{issues.map((i) => (
									<li key={i}>{i}</li>
								))}
							</ul>
						)}
						{!issues.length && !team.captain && <p className="text-muted-foreground text-sm">Tip: star a captain to double their score.</p>}
						<Button className="w-full" size="lg" disabled={issues.length > 0} onClick={onLock}>
							<Lock /> Lock in and score
						</Button>
						{daily && <p className="text-muted-foreground text-xs">Daily teams can&apos;t be changed once locked in.</p>}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/* --------------------------------------------------------------- results --- */

function Results({ pool, challenge, team, benchmark }: { pool: Pool; challenge: Challenge; team: Team; benchmark: number[] | null }) {
	const { data } = pool;
	const result = useMemo(() => scoreTeam(pool, team), [pool, team]);
	const pct = benchmark ? percentile(benchmark, result.total) : null;
	const [open, setOpen] = useState<string | null>(null);

	const share = async () => {
		const text = shareText(pool, team, result, pct ?? 0, challenge.title + ((challenge as { date?: string }).date ? ` (${(challenge as { date?: string }).date})` : ""));
		try {
			await navigator.clipboard.writeText(text);
			toast.success("Result copied to the clipboard");
		} catch {
			toast.error("Couldn't copy to the clipboard");
		}
	};

	const rows: { id: string; label: React.ReactNode; sub: string; price: number; points: number; captain: boolean; races: RaceScore[]; rounds: number; year: number; season: number; driver: boolean }[] = [
		...result.drivers.map((d) => ({
			id: d.season.id,
			label: (
				<span className="inline-flex min-w-0 items-center gap-2">
					<Flag code={data.nations[data.drivers[d.season.d][1]]?.[1]} />
					<span className="truncate font-medium">{data.drivers[d.season.d][0]}</span>
					<span className="text-muted-foreground tabular-nums">{d.season.y}</span>
				</span>
			),
			sub: data.teams[d.season.t[0]]?.[0] ?? "",
			price: d.season.p,
			points: d.points,
			captain: d.captain,
			races: d.score.races,
			rounds: d.score.rounds,
			year: d.season.y,
			season: d.score.total,
			driver: true,
		})),
		...(result.constructor
			? [
					{
						id: result.constructor.season.id,
						label: (
							<span className="inline-flex min-w-0 items-center gap-2">
								<Flag code={data.nations[data.teams[result.constructor.season.t][1]]?.[1]} />
								<span className="truncate font-medium">{data.teams[result.constructor.season.t][0]}</span>
								<span className="text-muted-foreground tabular-nums">{result.constructor.season.y}</span>
							</span>
						),
						sub: "Constructor",
						price: result.constructor.season.p,
						points: result.constructor.score.total,
						captain: false,
						races: result.constructor.score.races,
						rounds: result.constructor.score.rounds,
						year: result.constructor.season.y,
						season: result.constructor.score.total,
						driver: false,
					},
				]
			: []),
	];

	return (
		<div id="fantasy-results" className="scroll-mt-20 space-y-6">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard label="Total" value={`${num(result.total)} pts`} />
				<StatCard label="Rating" value={pct == null ? "…" : rating(pct).label} />
				<StatCard label="Beats random teams" value={pct == null ? "…" : `${num(Math.round(pct))}%`} />
				<StatCard label="Spent" value={money(teamCost(pool, team))} />
			</div>
			{benchmark && benchmark.length > 0 && <Distribution sorted={benchmark} score={result.total} />}
			<Section
				title="Breakdown"
				description="Season score = average points per race × 20 (rounds the pick missed count as zero). Open a pick for its races."
				action={
					<Button variant="outline" size="sm" onClick={share}>
						<Share2 /> Share
					</Button>
				}
			>
				<TableCard>
					<TableHeader>
						<TableRow>
							<TableHead>Pick</TableHead>
							<TableHead className="text-right">Price</TableHead>
							<TableHead className="text-right">Per race</TableHead>
							<TableHead className="text-right">Season</TableHead>
							<TableHead className="text-right">Points</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<Fragment key={r.id}>
								<TableRow className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
									<TableCell className="max-w-0 w-full">
										<button
											type="button"
											className="flex w-full min-w-0 items-center gap-2 text-left"
											aria-expanded={open === r.id}
											onClick={(e) => {
												e.stopPropagation();
												setOpen(open === r.id ? null : r.id);
											}}
										>
											<ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open !== r.id && "-rotate-90")} />
											<span className="min-w-0">
												{r.label}
												<span className="text-muted-foreground block truncate text-xs">{r.sub}</span>
											</span>
											{r.captain && (
												<Badge variant="secondary" className="bg-gold/25 shrink-0">
													<Star className="fill-current" /> Captain ×2
												</Badge>
											)}
										</button>
									</TableCell>
									<TableCell className="text-right tabular-nums">{money(r.price)}</TableCell>
									<TableCell className="text-muted-foreground text-right tabular-nums">{num(Math.round((r.races.reduce((a, x) => a + x.total, 0) / r.rounds) * 10) / 10)}</TableCell>
									<TableCell className="text-right tabular-nums">{num(r.season)}</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">{num(r.points)}</TableCell>
								</TableRow>
								{open === r.id && (
									<TableRow className="hover:bg-transparent">
										<TableCell colSpan={5} className="bg-muted/30 p-0">
											<RaceBreakdown pool={pool} year={r.year} races={r.races} driver={r.driver} />
										</TableCell>
									</TableRow>
								)}
							</Fragment>
						))}
						<TableRow className="hover:bg-transparent">
							<TableCell className="font-medium">Total</TableCell>
							<TableCell className="text-right tabular-nums">{money(teamCost(pool, team))}</TableCell>
							<TableCell />
							<TableCell />
							<TableCell className="text-right font-semibold tabular-nums">{num(result.total)}</TableCell>
						</TableRow>
					</TableBody>
				</TableCard>
			</Section>
		</div>
	);
}

function RaceBreakdown({ pool, year, races, driver }: { pool: Pool; year: number; races: RaceScore[]; driver: boolean }) {
	const byRound = new Map(races.map((r) => [r.round, r]));
	const seasonRounds = pool.data.races[year] ?? [];
	const cell = (n: number) => <span className={cn("tabular-nums", n > 0 ? "" : n < 0 ? "text-destructive" : "text-muted-foreground/50")}>{n === 0 ? "·" : n > 0 ? `+${n}` : n}</span>;
	return (
		<ScrollArea scrollBarOrientation="horizontal" viewportClassName="px-4 py-2">
			<table className="w-full text-xs">
				<thead className="text-muted-foreground">
					<tr className="[&>th]:px-1.5 [&>th]:py-1 [&>th]:text-right [&>th]:font-medium [&>th:first-child]:text-left">
						<th>Race</th>
						<th>Finish</th>
						{driver && <th>Gained</th>}
						<th>Pole</th>
						<th>Fastest lap</th>
						{driver && <th>Teammate</th>}
						<th>Penalty</th>
						<th>Total</th>
					</tr>
				</thead>
				<tbody>
					{seasonRounds.map(([round, name, cc]) => {
						const r = byRound.get(round);
						return (
							<tr key={round} className="border-border/50 border-t [&>td]:px-1.5 [&>td]:py-1 [&>td]:text-right [&>td:first-child]:text-left">
								<td>
									<ULink href={href.race({ year, round })} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline" data-card={`race:${year}-${round}`}>
										<Flag code={cc} />
										{name}
									</ULink>
								</td>
								{r ? (
									<>
										<td>{cell(r.finish)}</td>
										{driver && <td>{cell(r.gained)}</td>}
										<td>{cell(r.pole)}</td>
										<td>{cell(r.fastestLap)}</td>
										{driver && <td>{cell(r.teammate)}</td>}
										<td>{cell(r.penalty)}</td>
										<td className="font-semibold">{cell(r.total)}</td>
									</>
								) : (
									<td colSpan={driver ? 7 : 5} className="text-muted-foreground">
										Not entered
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</ScrollArea>
	);
}

/** Where the score sits among the random valid teams. */
function Distribution({ sorted, score }: { sorted: number[]; score: number }) {
	const bins = 30;
	const lo = sorted[0];
	const hi = Math.max(sorted[sorted.length - 1], score);
	const width = (hi - lo) / bins || 1;
	const counts = Array.from({ length: bins }, () => 0);
	for (const v of sorted) counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
	const max = Math.max(...counts);
	const at = Math.min(bins - 1, Math.max(0, Math.floor((score - lo) / width)));
	return (
		<Card size="sm">
			<CardHeader>
				<CardDescription>Your score against {num(sorted.length)} random valid teams under the same rules</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex h-20 items-end gap-px" role="img" aria-label={`Your score of ${num(score)} beats ${num(Math.round(percentile(sorted, score)))}% of random teams`}>
					{counts.map((c, i) => (
						<div key={i} className={cn("flex-1 rounded-t-[2px]", i === at ? "bg-primary" : i < at ? "bg-primary/25" : "bg-muted")} style={{ height: `${Math.max(2, (c / max) * 100)}%` }} />
					))}
				</div>
				<div className="text-muted-foreground mt-1.5 flex justify-between text-xs tabular-nums">
					<span>{num(lo)}</span>
					<span>median {num(sorted[Math.floor(sorted.length / 2)])}</span>
					<span>{num(hi)}</span>
				</div>
			</CardContent>
		</Card>
	);
}

/* ------------------------------------------------------------ dream race --- */

function DreamRace({ pool, team, seedKey }: { pool: Pool; team: Team; seedKey: string }) {
	const { data } = pool;
	const [cars, setCars] = useState<DreamCars>("own");
	const [period, setPeriod] = useState(false);
	const [seed, setSeed] = useState(() => hash("dream", seedKey));
	const [result, setResult] = useState<DreamResult | null>(null);
	useEffect(() => setResult(null), [team, cars, period, seed]);
	const run = () => setResult(simulateDream(pool, team, { ...DREAM_DEFAULTS, seed, cars, periodReliability: period }));
	const name = (id: string) => {
		const s = pool.ds.get(id)!;
		return `${data.drivers[s.d][0]} ${s.y}`;
	};

	return (
		<Section
			title="Dream championship"
			description="Your five drivers against the highest-rated seasons of 15 other drivers, over eight races in the simulator. Ratings measure each driver and car against their own season's field, so this pits how dominant each season was, not raw lap times."
		>
			<Card size="sm">
				<CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
					<ToggleGroup variant="outline" size="sm" spacing={0} value={cars} onValueChange={(v: string) => v && setCars(v as DreamCars)} aria-label="Cars">
						<ToggleGroupItem value="own">Their own cars</ToggleGroupItem>
						<ToggleGroupItem value="constructor" disabled={!team.constructor}>
							Your constructor&apos;s car
						</ToggleGroupItem>
						<ToggleGroupItem value="equal">Equal cars</ToggleGroupItem>
					</ToggleGroup>
					<div className="flex items-center gap-2">
						<Switch id="fantasy-reliability" checked={period} onCheckedChange={setPeriod} />
						<Label htmlFor="fantasy-reliability" className="text-sm font-normal">
							Period reliability
						</Label>
					</div>
					<div className="ml-auto flex gap-2">
						{result && (
							<Button variant="outline" size="sm" onClick={() => setSeed((s) => hash(s, "reroll"))}>
								<Dices /> Re-roll
							</Button>
						)}
						<Button size="sm" onClick={run}>
							{result ? "Run again" : "Start the championship"}
						</Button>
					</div>
				</CardContent>
			</Card>
			{result && (
				<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">Pos</TableHead>
								<TableHead>Driver</TableHead>
								<TableHead>Races</TableHead>
								<TableHead className="text-right">Wins</TableHead>
								<TableHead className="text-right">Pts</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{result.standings.map((s, i) => (
								<TableRow key={s.id} className={cn(s.mine && "bg-primary/5")}>
									<TableCell className="tabular-nums">{i + 1}</TableCell>
									<TableCell className="max-w-0 w-full">
										<span className="flex min-w-0 items-center gap-2">
											<Flag code={data.nations[data.drivers[s.season.d][1]]?.[1]} />
											<span className={cn("truncate", s.mine && "font-semibold")}>{data.drivers[s.season.d][0]}</span>
											<span className="text-muted-foreground tabular-nums">{s.season.y}</span>
											{s.mine && (
												<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
													Yours
												</Badge>
											)}
										</span>
									</TableCell>
									<TableCell>
										<div className="flex gap-0.5">
											{s.finishes.map((f, k) => (
												<span key={k} className={cn("inline-flex h-4 min-w-5 items-center justify-center rounded-[4px] px-0.5 text-[10px] font-medium tabular-nums", finishTone(f || DNF))}>
													{f || "R"}
												</span>
											))}
										</div>
									</TableCell>
									<TableCell className="text-right tabular-nums">{s.wins || ""}</TableCell>
									<TableCell className="text-right font-semibold tabular-nums">{s.points}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
					<TableCard>
						<TableHeader>
							<TableRow>
								<TableHead>Race</TableHead>
								<TableHead>Winner</TableHead>
								<TableHead>Podium</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{result.races.map((r) => (
								<TableRow key={r.name}>
									<TableCell>
										<span className="inline-flex items-center gap-1.5">
											<Flag code={r.country} />
											{r.name}
										</span>
									</TableCell>
									<TableCell className={cn(pool.ds.get(r.order[0]) && team.drivers.includes(r.order[0]) && "font-semibold")}>{r.order[0] ? name(r.order[0]) : "–"}</TableCell>
									<TableCell className="text-muted-foreground text-xs">{r.order.slice(1, 3).map(name).join(", ")}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</TableCard>
				</div>
			)}
		</Section>
	);
}

/* --------------------------------------------------------------- scoring --- */

function Scoring() {
	const rows: [string, string][] = [
		["Finish", "25-18-15-12-10-8-6-4-2-1 for the top ten, in every era"],
		["Pole position", "+5"],
		["Fastest lap", "+3"],
		["Best car of the team", "+3, when the team ran more than one car"],
		["Places gained from the grid", "+1 each (up to +10), −1 each lost (down to −5), finishers only"],
		["Retirement / disqualification", "−10 / −15"],
		["Constructor", "its two best cars' finishing points and retirements, plus pole and fastest lap"],
		["Season", "average per race × 20; missed rounds count as zero. The Indianapolis 500 and sprints aren't scored"],
		["Captain", "scores double"],
	];
	return (
		<Section title="How scoring works" description="Prices come from where a season finished in the championship, its share of the leader's points, wins and podiums, not from fantasy points, so some seasons are bargains.">
			<Card size="sm">
				<CardContent>
					<dl className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
						{rows.map(([k, v]) => (
							<div key={k} className="flex gap-3">
								<dt className="w-48 shrink-0 font-medium">{k}</dt>
								<dd className="text-muted-foreground">{v}</dd>
							</div>
						))}
					</dl>
				</CardContent>
			</Card>
		</Section>
	);
}
