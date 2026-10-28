// Race facts (@pitwall/core/f1/race-facts) as sentences: "Did you know" on a race's page, and what's at
// stake at the next race. The sentence's names link like everywhere else, without flags so it reads as text.

import { CalendarHeart, CloudRain, Crown, Flame, Gauge, Gavel, Hash, History, Medal, Sparkles, TrafficCone, Trophy, Users } from "lucide-react";
import type { FactEntry, FactKind, RaceFact } from "@pitwall/core/f1/race-facts";
import type { Cell } from "@pitwall/core/f1/records";
import { cn } from "@/lib/utils";
import { CircuitLink, DateLink, DriverLink, EngineLink, GrandPrixLink, NationLink, RaceLink, SeasonLink, Section, TeamLink, TyreLink } from "./f1";
import { Card, CardContent } from "./ui/card";

const ICON: Partial<Record<FactKind, typeof Sparkles>> = {
	title: Crown,
	lead: Crown,
	record: Medal,
	ranking: Medal,
	nth: Hash,
	streak: Flame,
	"streak-end": Flame,
	first: Trophy,
	since: History,
	drought: History,
	weather: CloudRain,
	neutral: TrafficCone,
	tyres: Gauge,
	birthday: CalendarHeart,
	family: Users,
	teammate: Users,
	rival: Users,
	stewards: Gavel,
};

function Part({ cell }: { cell: Cell }) {
	switch (cell.t) {
		case "text":
			return <>{cell.text}</>;
		case "driver":
			return <DriverLink driver={cell.ref} flag={false} className="font-medium" />;
		case "team":
			return <TeamLink team={cell.ref} className="font-medium" />;
		case "engine":
			return <EngineLink engine={cell.ref} className="font-medium" />;
		case "tyre":
			return <TyreLink tyre={cell.ref} />;
		case "nation":
			return <NationLink nation={cell.ref} flag={false} />;
		case "gp":
			return <GrandPrixLink gp={cell.ref} flag={false} />;
		case "race":
			return <RaceLink race={cell.ref} year />;
		case "circuit":
			return <CircuitLink circuit={cell.ref} />;
		case "season":
			return <SeasonLink year={cell.year} />;
		case "date":
			return <DateLink date={cell.iso} />;
		case "number":
			return <>#{cell.number}</>;
	}
}

/** One fact as a sentence. */
export function FactSentence({ cells, className }: { cells: Cell[]; className?: string }) {
	return (
		<span className={cn("[&_a]:inline [&_a_*]:inline", className)}>
			{cells.map((c, i) => (
				<Part key={i} cell={c} />
			))}
		</span>
	);
}

/** A list of facts, each with an icon for its kind. */
export function FactList({ facts, className }: { facts: RaceFact[]; className?: string }) {
	return (
		<ul className={cn("divide-border divide-y", className)}>
			{facts.map((f) => {
				const Icon = ICON[f.kind] ?? Sparkles;
				return (
					<li key={f.key} className="flex gap-3 py-2.5 text-sm leading-relaxed first:pt-0 last:pb-0">
						<Icon className="text-primary mt-1 size-4 shrink-0" aria-hidden />
						<FactSentence cells={f.cells} />
					</li>
				);
			})}
		</ul>
	);
}

/** Facts from several races, each with the race it's from. */
export function FactEntryList({ entries, className }: { entries: FactEntry[]; className?: string }) {
	return (
		<ul className={cn("divide-border divide-y", className)}>
			{entries.map((e) => {
				const Icon = ICON[e.fact.kind] ?? Sparkles;
				return (
					<li key={`${e.raceId}:${e.fact.key}`} className="flex gap-3 py-2.5 text-sm leading-relaxed first:pt-0 last:pb-0">
						<Icon className="text-primary mt-1 size-4 shrink-0" aria-hidden />
						<div className="min-w-0">
							<FactSentence cells={e.fact.cells} />
							{e.race.t === "race" && (
								<div className="text-muted-foreground mt-0.5 text-xs">
									<RaceLink race={e.race.ref} year className="text-muted-foreground hover:text-foreground" />
								</div>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * "Did you know?" on a season, driver, team, Grand Prix or circuit page: the best facts from its races,
 * and what's at stake at the next race when it's involved. Nothing when there's neither.
 */
export function FactsSection({ entries, upcoming, description }: { entries?: FactEntry[] | null; upcoming?: RaceFact[] | null; description?: string }) {
	if (!entries?.length && !upcoming?.length) return null;
	return (
		<Section title="Did you know?" description={description}>
			<Card size="sm">
				<CardContent className="space-y-5">
					{upcoming && upcoming.length > 0 && (
						<div className="space-y-2">
							<div className="text-muted-foreground text-xs font-medium">At the next race</div>
							<FactList facts={upcoming} />
						</div>
					)}
					{entries && entries.length > 0 && <FactEntryList entries={entries} className="md:columns-2 md:gap-8 md:divide-y-0 md:[&>li]:break-inside-avoid md:[&>li]:py-1.5" />}
				</CardContent>
			</Card>
		</Section>
	);
}
