"use client";

// The /play hub: every game, with today's progress read from the play log and each
// game's saved stats (see gameStore in lib/game/daily). Nothing is known until mounted.

import { useEffect, useState } from "react";
import {
	ArrowUpDown,
	CalendarSearch,
	ChartSpline,
	ChevronRight,
	CircleCheck,
	Factory,
	Flame,
	Grid3x3,
	History,
	Link2,
	MapPin,
	Milestone,
	Target,
	Trophy,
	UserSearch,
	Users,
	type LucideIcon,
} from "lucide-react";
import { currentStreak, emptyStats, playStreak, readPlayLog, type GameStats } from "@/lib/game/daily";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "../f1";
import { ULink } from "../universe-link";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Countdown, useToday } from "./kit";

type Game = { id: string; href: string; icon: LucideIcon; title: string; description: string };

const DAILY: Game[] = [
	{ id: "guess", href: "/play/guess", icon: UserSearch, title: "Guess the driver", description: "Eight guesses to find the mystery driver, with clues from nationality, career span, teams, starts, wins and titles." },
	{ id: "career", href: "/play/career", icon: Milestone, title: "Career path", description: "A driver's career, one team at a time. Every wrong guess reveals the next stop." },
	{ id: "grid", href: "/play/grid", icon: Grid3x3, title: "Grid of nine", description: "Fill a 3×3 grid with drivers who fit both the row and the column. Rarer picks score more." },
	{ id: "chain", href: "/play/chain", icon: Link2, title: "Teammate chain", description: "Link two drivers through teammates, in as few steps as you can." },
	{ id: "constructor", href: "/play/constructor", icon: Factory, title: "Guess the constructor", description: "Find the mystery team from its nationality, seasons, engines, wins and titles." },
	{ id: "circuit", href: "/play/circuit", icon: MapPin, title: "Guess the circuit", description: "Find the mystery track from its country, layout and history, with distance and direction clues." },
	{ id: "race", href: "/play/race", icon: Trophy, title: "Guess the race", description: "Name the Grand Prix from its podium. Each wrong guess reveals another clue." },
	{ id: "lap-chart", href: "/play/lap-chart", icon: ChartSpline, title: "Lap chart mystery", description: "A real lap-by-lap chart with the names hidden. Which race was it?" },
	{ id: "name-the-grid", href: "/play/name-the-grid", icon: Users, title: "Name the grid", description: "Name every driver on a starting grid before the clock runs out." },
	{ id: "predict", href: "/play/predict", icon: Target, title: "Race prediction", description: "Pick the top six of a historical race from its grid, then see how close you were." },
	{ id: "higher-lower", href: "/play/higher-lower", icon: ArrowUpDown, title: "Higher or lower", description: "More wins? More poles? Ten rounds a day, or play endless and chase your best streak." },
	{ id: "season", href: "/play/season", icon: CalendarSearch, title: "Guess the season", description: "Name the championship year from its calendar, champion and rivals. Each wrong guess reveals another clue." },
];

const MORE: (Game & { tag: string })[] = [
	{ id: "fantasy", href: "/play/fantasy", icon: History, title: "Fantasy: Through the Eras", description: "Build a team from drivers and constructors across Formula 1 history and see how it scores.", tag: "Fantasy" },
];

/** A game's best current streak across its variants (e.g. guess's Modern and All time). */
function gameStreak(id: string, today: number): number {
	let best = 0;
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(`pitwall-${id}:stats`)) continue;
		try {
			const stats: GameStats = { ...emptyStats(0), ...JSON.parse(localStorage.getItem(key) ?? "{}") };
			best = Math.max(best, currentStreak(stats, today));
		} catch {}
	}
	return best;
}

type Progress = { done: Set<string>; streaks: Map<string, number>; streak: number };

export function PlayHub() {
	const { today, rollover } = useToday();
	const [progress, setProgress] = useState<Progress | null>(null);
	useEffect(() => {
		if (today == null) return;
		const log = readPlayLog();
		setProgress({
			done: new Set(log.find(([d]) => d === today)?.[1] ?? []),
			streaks: new Map(DAILY.map((g) => [g.id, gameStreak(g.id, today)])),
			streak: playStreak(log, today),
		});
	}, [today]);
	const doneCount = progress ? DAILY.filter((g) => progress.done.has(g.id)).length : 0;

	return (
		<Page className="space-y-8">
			<PageHeader title="Play">Games built on every Formula 1 season since 1950. New daily puzzles at midnight UTC, the same for everyone.</PageHeader>

			<Card size="sm">
				<div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4">
					<Stat label="Today's puzzles" value={progress ? `${doneCount} of ${DAILY.length}` : "–"} />
					<Stat
						label="Daily streak"
						value={
							progress ? (
								<span className="inline-flex items-center gap-1.5">
									<Flame className={cn("size-5", progress.streak ? "text-orange-500" : "text-muted-foreground")} />
									{progress.streak} {progress.streak === 1 ? "day" : "days"}
								</span>
							) : (
								"–"
							)
						}
					/>
					<div className="sm:ml-auto">
						<Countdown onRollover={rollover} label="New puzzles in" />
					</div>
				</div>
			</Card>

			<section className="space-y-4">
				<h2 className="text-lg font-semibold tracking-tight sm:text-xl">Daily puzzles</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{DAILY.map((g) => {
						const done = progress?.done.has(g.id);
						const streak = progress?.streaks.get(g.id) ?? 0;
						return (
							<GameCard
								key={g.id}
								game={g}
								status={
									done ? (
										<span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
											<CircleCheck className="size-3.5" />
											Done today
										</span>
									) : (
										"Daily"
									)
								}
								footer={
									streak > 1 ? (
										<span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
											<Flame className="size-3.5 text-orange-500" />
											{streak}-day streak
										</span>
									) : null
								}
							/>
						);
					})}
				</div>
			</section>

			<section className="space-y-4">
				<h2 className="text-lg font-semibold tracking-tight sm:text-xl">More games</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{MORE.map((g) => (
						<GameCard key={g.id} game={g} status={g.tag} />
					))}
				</div>
			</section>
		</Page>
	);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="text-lg font-semibold tabular-nums">{value}</div>
		</div>
	);
}

function GameCard({ game: g, status, footer }: { game: Game; status: React.ReactNode; footer?: React.ReactNode }) {
	return (
		<ULink href={g.href} className="group focus-visible:ring-ring/30 rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3">
			<Card className="group-hover:ring-foreground/20 h-full transition-shadow">
				<CardHeader className="flex h-full flex-col items-stretch gap-3">
					<div className="flex w-full items-center justify-between gap-3">
						<span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-xl">
							<g.icon className="size-5" />
						</span>
						<span className="text-muted-foreground text-xs font-medium">{status}</span>
					</div>
					<CardTitle className="flex items-center gap-1 text-lg">
						{g.title}
						<ChevronRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
					</CardTitle>
					<CardDescription>{g.description}</CardDescription>
					{footer && <div className="mt-auto">{footer}</div>}
				</CardHeader>
			</Card>
		</ULink>
	);
}
