"use client";

// The /play hub: every game, with today's progress read from the play log and each
// game's saved stats (see gameStore in lib/game/daily). Nothing is known until mounted.

import { useEffect, useState } from "react";
import { ChevronRight, CircleCheck, Flame } from "lucide-react";
import { currentStreak, emptyStats, playStreak, readPlayLog, type GameStats } from "@pitwall/core/game/daily";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "../f1";
import { ULink } from "../universe-link";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { DAILY, MORE, type Game } from "./games";
import { Countdown, useToday } from "./kit";

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
