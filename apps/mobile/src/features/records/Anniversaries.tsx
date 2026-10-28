// Round-number anniversaries coming up from today (the website's UpcomingAnniversaries).

import { Cake, Flag as FlagIcon, Medal, Rocket, Trophy, type LucideIcon } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { ordinal, upcomingAnniversaries, type AnniversaryEvent, type AnniversaryKind, type UpcomingAnniversary } from "@pitwall/core/f1/anniversaries";
import { MONTHS, diarySlug } from "@pitwall/core/f1/diary-dates";
import { Icon, Row, Section } from "@/components/ui";
import { href } from "@/lib/links";
import { today } from "./kit";

const ICON: Record<AnniversaryKind, LucideIcon> = {
	"first-race": FlagIcon,
	title: Trophy,
	"team-title": Trophy,
	"first-win": Medal,
	"team-first-win": Medal,
	debut: Rocket,
	birth: Cake,
};

function what(a: UpcomingAnniversary): string {
	const year = a.race?.year ?? Number(a.date.slice(0, 4));
	const d = a.driver?.name ?? "";
	const t = a.team?.name ?? "";
	switch (a.kind) {
		case "first-race":
			return "The first World Championship race";
		case "title":
			return `${d} clinched the ${year} drivers' title`;
		case "team-title":
			return `${t} clinched the ${year} constructors' title`;
		case "first-win":
			return `${d}'s first Grand Prix win`;
		case "team-first-win":
			return `${t}'s first win, with ${d}`;
		case "debut":
			return `${d}'s Grand Prix debut`;
		case "birth":
			return a.died ? `${d} was born` : `${d} turns ${a.years}`;
	}
}

function when(a: UpcomingAnniversary) {
	const [, m, d] = a.on.split("-").map(Number);
	const day = a.inDays === 0 ? "Today" : a.inDays === 1 ? "Tomorrow" : `${d} ${MONTHS[m! - 1]!.slice(0, 3)} · in ${a.inDays} days`;
	return `${day} · ${a.kind === "birth" && !a.died ? "birthday" : `${ordinal(a.years)} anniversary`}`;
}

/** Where an anniversary leads: its race, else its driver or team. */
function pathOf(a: UpcomingAnniversary) {
	if (a.kind === "birth" && a.driver) return href.driver(a.driver.id);
	if (a.kind === "team-title" && a.team) return href.team(a.team.id);
	if (a.kind === "title" && a.driver) return href.driver(a.driver.id);
	if (a.race) return href.race(a.race);
	const [, m, d] = a.on.split("-").map(Number);
	return href.diary(diarySlug(m!, d!));
}

export function UpcomingAnniversaries({ events, days = 30, limit, action, onOpen }: { events: AnniversaryEvent[]; days?: number; limit?: number; action?: ReactNode; onOpen(path: string): void }) {
	const iso = today().iso;
	const items = useMemo(() => upcomingAnniversaries(events, iso, days).slice(0, limit), [events, iso, days, limit]);
	if (!items.length) return null;
	return (
		<Section title="Upcoming anniversaries" description={`Round-number anniversaries in the next ${days} days: titles, maiden wins, debuts and champions' birthdays.`} action={action}>
			{items.map((a, i) => (
				<Row
					key={`${a.kind}:${a.date}:${a.driver?.id ?? ""}:${a.team?.id ?? ""}`}
					leading={<View className="w-7 items-center"><Icon icon={ICON[a.kind]} tone={a.kind === "title" || a.kind === "team-title" ? "gold" : "muted"} size={18} /></View>}
					title={what(a)}
					numberOfLines={2}
					subtitle={a.race ? `${when(a)}\n${a.race.year} ${a.race.name}` : when(a)}
					onPress={() => onOpen(pathOf(a))}
					last={i === items.length - 1}
				/>
			))}
		</Section>
	);
}
