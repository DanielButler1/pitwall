"use client";

// The home page's strip of daily games, ticking off those already played today
// (from the play log, so only after mounting).

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { readPlayLog } from "@/lib/game/daily";
import { cn } from "@/lib/utils";
import { MoreLink, Section } from "../f1";
import { ULink } from "../universe-link";
import { DAILY } from "./games";
import { Countdown, useToday } from "./kit";

export function HomeGames() {
	const { today, rollover } = useToday();
	const [done, setDone] = useState<Set<string> | null>(null);
	useEffect(() => {
		if (today != null) setDone(new Set(readPlayLog().find(([d]) => d === today)?.[1] ?? []));
	}, [today]);
	const count = done ? DAILY.filter((g) => done.has(g.id)).length : 0;

	return (
		<Section
			title="Today's puzzles"
			description={
				<>
					{DAILY.length} daily games, the same for everyone{done && count > 0 && <> · {count} of {DAILY.length} played</>}
				</>
			}
			action={<MoreLink href="/play">All games</MoreLink>}
		>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
				{DAILY.map((g) => {
					const played = done?.has(g.id);
					return (
						<ULink
							key={g.id}
							href={g.href}
							className="bg-card ring-foreground/10 hover:ring-foreground/25 focus-visible:ring-ring flex min-w-0 items-center gap-2.5 rounded-2xl p-2.5 text-sm font-medium ring-1 transition-shadow outline-none focus-visible:ring-2"
						>
							<span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", played ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary")}>
								{played ? <CircleCheck className="size-4" /> : <g.icon className="size-4" />}
							</span>
							<span className="min-w-0 leading-tight">{g.title}</span>
						</ULink>
					);
				})}
			</div>
			<div className="[&>div]:justify-start">
				<Countdown onRollover={rollover} label="New puzzles in" />
			</div>
		</Section>
	);
}
