"use client";

// Round-number anniversaries coming up from the visitor's today. Pages are
// pre-rendered, so the list appears after mount.

import { useEffect, useState } from "react";
import { Cake, Flag as FlagIcon, Medal, Rocket, Trophy } from "lucide-react";
import { ordinal, upcomingAnniversaries, type AnniversaryEvent, type AnniversaryKind, type UpcomingAnniversary } from "@/lib/f1/anniversaries";
import { MONTHS, diarySlug } from "@/lib/f1/diary-dates";
import { cn } from "@/lib/utils";
import { DriverLink, RaceLink, Section, TeamLink, href } from "../f1";
import { ULink } from "../universe-link";
import { Card, CardContent } from "../ui/card";

function useToday() {
	const [today, setToday] = useState<string | null>(null);
	useEffect(() => {
		const d = new Date();
		setToday(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
	}, []);
	return today;
}

const ICON: Record<AnniversaryKind, typeof Trophy> = {
	"first-race": FlagIcon,
	title: Trophy,
	"team-title": Trophy,
	"first-win": Medal,
	"team-first-win": Medal,
	debut: Rocket,
	birth: Cake,
};

function When({ a }: { a: UpcomingAnniversary }) {
	const [, m, d] = a.on.split("-").map(Number);
	const label = a.inDays === 0 ? "Today" : a.inDays === 1 ? "Tomorrow" : `${d} ${MONTHS[m - 1].slice(0, 3)}`;
	return (
		<ULink href={href.diary(diarySlug(m, d))} className="hover:text-foreground underline-offset-4 hover:underline">
			{label}
			{a.inDays > 1 && <span className="text-muted-foreground"> · in {a.inDays} days</span>}
		</ULink>
	);
}

function What({ a }: { a: UpcomingAnniversary }) {
	const year = a.race?.year ?? Number(a.date.slice(0, 4));
	switch (a.kind) {
		case "first-race":
			return <>The first World Championship race</>;
		case "title":
			return (
				<>
					{a.driver && <DriverLink driver={a.driver} className="font-medium" />} clinched the {year} drivers&apos; title
				</>
			);
		case "team-title":
			return (
				<>
					{a.team && <TeamLink team={a.team} flag className="font-medium" />} clinched the {year} constructors&apos; title
				</>
			);
		case "first-win":
			return <>{a.driver && <DriverLink driver={a.driver} className="font-medium" />}&apos;s first Grand Prix win</>;
		case "team-first-win":
			return (
				<>
					{a.team && <TeamLink team={a.team} flag className="font-medium" />}&apos;s first win, with {a.driver && <DriverLink driver={a.driver} flag={false} />}
				</>
			);
		case "debut":
			return <>{a.driver && <DriverLink driver={a.driver} className="font-medium" />}&apos;s Grand Prix debut</>;
		case "birth":
			return a.died ? (
				<>{a.driver && <DriverLink driver={a.driver} className="font-medium" />} was born</>
			) : (
				<>
					{a.driver && <DriverLink driver={a.driver} className="font-medium" />} turns {a.years}
				</>
			);
	}
}

function AnniversaryItem({ a }: { a: UpcomingAnniversary }) {
	const Icon = ICON[a.kind];
	return (
		<li className="flex items-start gap-3">
			<Icon className={cn("text-muted-foreground mt-0.5 size-4 shrink-0", (a.kind === "title" || a.kind === "team-title") && "text-gold")} />
			<div className="min-w-0 space-y-0.5 text-sm">
				<div className="text-muted-foreground text-xs">
					<When a={a} /> · {a.kind === "birth" && !a.died ? "birthday" : `${ordinal(a.years)} anniversary`}
				</div>
				<div className="flex flex-wrap items-center gap-x-1">
					<What a={a} />
				</div>
				{a.race && (
					<div className="text-muted-foreground text-xs">
						<RaceLink race={a.race} year />
					</div>
				)}
			</div>
		</li>
	);
}

/** Upcoming anniversaries as a titled section; renders nothing until mounted or when there are none. */
export function UpcomingAnniversaries({
	events,
	days = 30,
	limit,
	title = "Upcoming anniversaries",
	action,
	className,
}: {
	events: AnniversaryEvent[];
	days?: number;
	limit?: number;
	title?: string;
	action?: React.ReactNode;
	className?: string;
}) {
	const today = useToday();
	if (!today) return null;
	const items = upcomingAnniversaries(events, today, days).slice(0, limit);
	if (!items.length) return null;
	return (
		<Section title={title} description={`Round-number anniversaries in the next ${days} days: titles, maiden wins, debuts and champions' birthdays.`}
			action={action && <div className="ml-auto">{action}</div>}
			className={className}
		>
			<Card size="sm">
				<CardContent>
					<ul className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
						{items.map((a) => (
							<AnniversaryItem key={`${a.kind}:${a.date}:${a.driver?.id ?? ""}:${a.team?.id ?? ""}`} a={a} />
						))}
					</ul>
				</CardContent>
			</Card>
		</Section>
	);
}
