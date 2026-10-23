// The diary (/diary): one month's calendar at a time, shaded by how many races each date has hosted,
// with today ringed. Tap a date to open it; press and hold for a summary. Below: the busiest race
// days and upcoming anniversaries.

import { Cake, CalendarDays, ChevronLeft, ChevronRight, Flag as FlagIcon, Flower2, Medal, Rocket, Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { MONTHS, allDiaryDays, diaryIndexView, diaryKey, diarySlug, type DiaryDaySummary } from "@pitwall/core/f1/diary";
import { DetailScreen, Flag, Page } from "@/components/f1";
import { Button, Chip, ChipRow, Icon, IconButton, Row, Section, Text } from "@/components/ui";
import { useView } from "@/data/dataset";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { href, useOpen } from "@/lib/links";
import { UpcomingAnniversaries } from "./Anniversaries";
import { today } from "./kit";

const CELL = { width: "14.2857%", padding: 2 } as const;

const SUMMARY = [
	{ key: "races", icon: FlagIcon, one: "race", many: "races" },
	{ key: "titles", icon: Trophy, one: "title decided", many: "titles decided" },
	{ key: "births", icon: Cake, one: "driver born", many: "drivers born" },
	{ key: "deaths", icon: Flower2, one: "driver died", many: "drivers died" },
	{ key: "debuts", icon: Rocket, one: "debut", many: "debuts" },
	{ key: "firstWins", icon: Medal, one: "first win", many: "first wins" },
] as const;

export function DiaryIndexScreen() {
	const view = useView((db) => diaryIndexView(db), []);
	const open = useOpen();
	const now = today();
	const [month, setMonth] = useState(now.month);
	const [picked, setPicked] = useState<{ month: number; day: number }>({ month: now.month, day: now.day });
	const maxRaces = useMemo(() => Math.max(1, ...Object.values(view.days).map((d) => d.races)), [view.days]);
	const days = useMemo(() => allDiaryDays().filter((d) => d.month === month), [month]);
	const step = (by: number) => setMonth((m) => ((m - 1 + by + 12) % 12) + 1);
	const summary = view.days[diaryKey(picked.month, picked.day)];

	return (
		<DetailScreen title="Diary" subtitle="On this day">
			<Page>
				<Text variant="muted" className="px-4 pt-1">
					Pick any date to see the Grands Prix held on it, the drivers born and lost, debuts, maiden wins and championships decided. Darker days have hosted more races.
				</Text>
				<Button
					label={`Today, ${now.day} ${MONTHS[now.month - 1]}`}
					icon={CalendarDays}
					className="mx-4 mt-4"
					onPress={() => open(href.diary(diarySlug(now.month, now.day)))}
				/>

				<View className="mt-6 flex-row items-center gap-2 px-2">
					<IconButton icon={ChevronLeft} label="Previous month" onPress={() => step(-1)} />
					<Text variant="heading" className="flex-1 text-center">{MONTHS[month - 1]}</Text>
					<IconButton icon={ChevronRight} label="Next month" onPress={() => step(1)} />
				</View>
				<View className="mt-2 flex-row flex-wrap px-3">
					{days.map((d) => {
						const c = view.days[diaryKey(d.month, d.day)];
						const races = c?.races ?? 0;
						const isToday = d.month === now.month && d.day === now.day;
						const isPicked = d.month === picked.month && d.day === picked.day;
						return (
							<View key={d.day} style={CELL}>
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`${d.day} ${MONTHS[d.month - 1]}: ${races} ${races === 1 ? "race" : "races"}${isToday ? ", today" : ""}`}
									accessibilityHint="Opens the date. Press and hold for a summary."
									onPress={() => open(href.diary(diarySlug(d.month, d.day)))}
									onLongPress={() => {
										haptic("longPress");
										setPicked(d);
									}}
									className={cn("h-11 items-center justify-center overflow-hidden rounded-md", !races && "bg-muted/50", isToday ? "border-2 border-foreground" : isPicked ? "border-2 border-primary" : null)}
								>
									{races ? <View className="absolute inset-0 bg-primary" style={{ opacity: 0.12 + (0.6 * races) / maxRaces }} /> : null}
									<Text variant="small" className={cn("tabular-nums", races ? "text-foreground" : "text-muted-foreground", isToday && "font-bold")}>{d.day}</Text>
								</Pressable>
							</View>
						);
					})}
				</View>
				<Text variant="caption" className="px-4 pt-2">Press and hold a date for a summary.</Text>

				<DaySummary month={picked.month} day={picked.day} summary={summary} onOpen={() => open(href.diary(diarySlug(picked.month, picked.day)))} />

				<Section title="Busiest race days">
					<ChipRow className="mt-1">
						{view.busiest.map((b) => (
							<Chip key={b.slug} label={`${b.label} · ${b.races}`} onPress={() => open(href.diary(b.slug))} />
						))}
					</ChipRow>
				</Section>

				<UpcomingAnniversaries events={view.anniversaries} days={30} limit={6} onOpen={open} />
				<Section>
					<Row title="Milestone watch" subtitle="Round numbers and record chases for the current grid" onPress={() => open("/milestones")} last />
				</Section>
			</Page>
		</DetailScreen>
	);
}

function DaySummary({ month, day, summary, onOpen }: { month: number; day: number; summary: DiaryDaySummary | undefined; onOpen(): void }) {
	const rows = SUMMARY.filter((r) => (summary?.[r.key] ?? 0) > 0);
	return (
		<Section title={`${day} ${MONTHS[month - 1]}`} action={<Button label="Open" variant="outline" size="sm" onPress={onOpen} />}>
			{rows.length ? (
				<View className="flex-row flex-wrap gap-x-4 gap-y-2 px-4 pt-1">
					{rows.map(({ key, icon, one, many }) => {
						const n = summary![key];
						return (
							<View key={key} className="flex-row items-center gap-1.5">
								<Icon icon={icon} tone="muted" size={15} />
								<Text variant="label" className="tabular-nums">{n}</Text>
								<Text variant="muted">{n === 1 ? one : many}</Text>
							</View>
						);
					})}
				</View>
			) : (
				<Text variant="muted" className="px-4">Nothing has happened on this date yet.</Text>
			)}
			{summary?.latest ? (
				<View className="mt-2 flex-row items-center gap-1.5 px-4">
					<Text variant="caption">Latest:</Text>
					<Flag code={summary.latest.country} />
					<Text variant="caption" className="text-foreground" numberOfLines={1}>{`${summary.latest.year} ${summary.latest.name}`}</Text>
				</View>
			) : null}
		</Section>
	);
}
